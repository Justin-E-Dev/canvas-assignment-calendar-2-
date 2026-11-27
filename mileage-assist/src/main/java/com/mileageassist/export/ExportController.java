package com.mileageassist.export;

import com.mileageassist.auth.AppUser;
import com.mileageassist.auth.UserRepository;
import com.mileageassist.entries.Entry;
import com.mileageassist.entries.EntryRepository;
import com.mileageassist.entries.SpreadsheetExport;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.Principal;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.apache.poi.ss.usermodel.Workbook;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class ExportController {

    /** One spreadsheet: the trips (in order) and a label such as "Senior Care 1 of 2". */
    public record Part(@NotNull @Size(max = 20000) List<Long> ids, @Size(max = 120) String label,
                       Integer number, Integer total, @Size(max = 120) String group) {}

    public record ZipRequest(@Size(max = 10) String format, @NotNull @Size(min = 1, max = 500) List<@Valid Part> parts) {}

    private record FileOut(byte[] bytes, String ext, String mediaType) {}

    private final EntryRepository entries;
    private final UserRepository users;
    private final TemplateRepository templates;

    public ExportController(EntryRepository entries, UserRepository users, TemplateRepository templates) {
        this.entries = entries;
        this.users = users;
        this.templates = templates;
    }

    private AppUser me(Principal p) {
        return users.findByEmail(p.getName()).orElseThrow();
    }

    // ---------- Template ----------

    @GetMapping("/template")
    public ResponseEntity<?> template(Principal p) {
        var t = templates.find(me(p).id());
        if (t == null) return ResponseEntity.noContent().build();
        try (Workbook wb = TemplateFiller.open(t.content())) {
            return ResponseEntity.ok(describe(t.fileName(), TemplateFiller.analyze(wb)));
        } catch (IOException | TemplateFiller.TemplateException e) {
            return ResponseEntity.ok(Map.of("fileName", t.fileName(), "error", "This template can no longer be read."));
        }
    }

    @PostMapping("/template")
    public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file, Principal p) throws IOException {
        String name = Optional.ofNullable(file.getOriginalFilename()).orElse("template.xlsx")
                .replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (name.length() > 200) name = name.substring(name.length() - 200);
        String lower = name.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".xlsm")) {
            return error("Please upload an Excel file (.xlsx or .xls).");
        }
        byte[] bytes = file.getBytes();
        try (Workbook wb = TemplateFiller.open(bytes)) {
            var layout = TemplateFiller.analyze(wb);
            templates.save(me(p).id(), name, bytes);
            return ResponseEntity.ok(describe(name, layout));
        } catch (TemplateFiller.TemplateException e) {
            return error(e.getMessage());
        }
    }

    @DeleteMapping("/template")
    public ResponseEntity<Void> removeTemplate(Principal p) {
        templates.delete(me(p).id());
        return ResponseEntity.noContent().build();
    }

    private static Map<String, Object> describe(String name, TemplateFiller.Layout layout) {
        var m = new LinkedHashMap<String, Object>();
        m.put("fileName", name);
        m.put("columns", layout.columnLabels());
        m.put("capacity", layout.capacity());
        m.put("headerRow", layout.headerRow() + 1);
        return m;
    }

    // ---------- Exports ----------

    @GetMapping("/export/csv")
    public ResponseEntity<byte[]> csvAll(Principal p) {
        AppUser u = me(p);
        return download(new FileOut(SpreadsheetExport.csv(entries.findAll(u.id())), "csv", "text/csv; charset=UTF-8"),
                "mileage-" + LocalDate.now());
    }

    @GetMapping("/export/xlsx")
    public ResponseEntity<byte[]> xlsxAll(Principal p) {
        AppUser u = me(p);
        return download(excel(u, entries.findAll(u.id()), new TemplateFiller.Context(u.firstName(), 1, 1, null)),
                "mileage-" + LocalDate.now());
    }

    @PostMapping("/export/part")
    public ResponseEntity<byte[]> part(@RequestParam(defaultValue = "xlsx") String format,
                                       @Valid @RequestBody Part part, Principal p) {
        AppUser u = me(p);
        FileOut f = render(u, format, part);
        return download(f, fileName(part));
    }

    @PostMapping("/export/zip")
    public ResponseEntity<byte[]> zip(@Valid @RequestBody ZipRequest req, Principal p) throws IOException {
        AppUser u = me(p);
        String format = "csv".equals(req.format()) ? "csv" : "xlsx";
        var bytes = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(bytes)) {
            Set<String> used = new HashSet<>();
            for (Part part : req.parts()) {
                FileOut f = render(u, format, part);
                String base = fileName(part);
                String name = base + "." + f.ext();
                for (int i = 2; !used.add(name); i++) name = base + "-" + i + "." + f.ext();
                zip.putNextEntry(new ZipEntry(name));
                zip.write(f.bytes());
                zip.closeEntry();
            }
        }
        return download(new FileOut(bytes.toByteArray(), "zip", "application/zip"),
                "mileage-spreadsheets-" + LocalDate.now());
    }

    private FileOut render(AppUser u, String format, Part part) {
        List<Entry> rows = pick(u.id(), part.ids());
        if ("csv".equals(format)) return new FileOut(SpreadsheetExport.csv(rows), "csv", "text/csv; charset=UTF-8");
        int n = part.number() == null ? 1 : part.number();
        int total = part.total() == null ? 1 : part.total();
        return excel(u, rows, new TemplateFiller.Context(u.firstName(), n, total, part.group()));
    }

    private FileOut excel(AppUser u, List<Entry> rows, TemplateFiller.Context ctx) {
        var t = templates.find(u.id());
        if (t == null) {
            return new FileOut(SpreadsheetExport.xlsx(rows), "xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        var out = TemplateFiller.fill(t.content(), rows, ctx);
        return new FileOut(out.bytes(), out.extension(), out.mediaType());
    }

    /** Only the signed-in user's trips, in the order requested. */
    private List<Entry> pick(long userId, List<Long> ids) {
        Map<Long, Entry> mine = entries.findAll(userId).stream()
                .collect(Collectors.toMap(Entry::id, Function.identity()));
        List<Entry> out = new ArrayList<>();
        new LinkedHashSet<>(ids).forEach(id -> {
            Entry e = mine.get(id);
            if (e != null) out.add(e);
        });
        return out;
    }

    private static String fileName(Part part) {
        String label = part.label() == null || part.label().isBlank() ? "mileage" : part.label();
        String safe = label.replaceAll("[^A-Za-z0-9 _-]", "").trim().replaceAll("\\s+", "-");
        if (safe.isEmpty()) safe = "mileage";
        return safe.length() > 80 ? safe.substring(0, 80) : safe;
    }

    private static ResponseEntity<byte[]> download(FileOut f, String baseName) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.mediaType()))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(baseName + "." + f.ext()).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(f.bytes());
    }

    private static ResponseEntity<Map<String, String>> error(String msg) {
        return ResponseEntity.badRequest().body(Map.of("error", msg));
    }

    @ExceptionHandler(TemplateFiller.TemplateException.class)
    public ResponseEntity<Map<String, String>> templateError(TemplateFiller.TemplateException e) {
        return error(e.getMessage());
    }
}
