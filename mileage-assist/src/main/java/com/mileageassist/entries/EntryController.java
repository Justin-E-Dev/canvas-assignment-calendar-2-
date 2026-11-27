package com.mileageassist.entries;

import com.mileageassist.auth.UserRepository;
import jakarta.validation.Valid;
import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class EntryController {
    private final EntryRepository entries;
    private final UserRepository users;

    public EntryController(EntryRepository entries, UserRepository users) {
        this.entries = entries;
        this.users = users;
    }

    private long userId(Principal p) {
        return users.findByEmail(p.getName()).orElseThrow().id();
    }

    @GetMapping("/entries")
    public List<Entry> list(Principal p) {
        return entries.findAll(userId(p));
    }

    @PostMapping("/entries")
    public ResponseEntity<?> create(@Valid @RequestBody EntryInput in, Principal p) {
        if (in.odometerEnd().compareTo(in.odometerStart()) < 0) return odometerError();
        long uid = userId(p);
        LocalDate date = in.date() != null ? in.date() : LocalDate.now();
        long id = entries.insert(uid, in, date);
        return ResponseEntity.status(HttpStatus.CREATED).body(entries.find(uid, id));
    }

    @PutMapping("/entries/{id}")
    public ResponseEntity<?> update(@PathVariable long id, @Valid @RequestBody EntryInput in, Principal p) {
        if (in.odometerEnd().compareTo(in.odometerStart()) < 0) return odometerError();
        if (in.date() == null) return ResponseEntity.badRequest().body(Map.of("error", "Date is required."));
        long uid = userId(p);
        if (!entries.update(uid, id, in, in.date())) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(entries.find(uid, id));
    }

    @DeleteMapping("/entries/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id, Principal p) {
        return entries.delete(userId(p), id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @GetMapping("/initials")
    public List<String> initials(Principal p) {
        return entries.initials(userId(p));
    }

    @DeleteMapping("/initials/{value}")
    public ResponseEntity<Void> forgetInitials(@PathVariable String value, Principal p) {
        entries.forgetInitials(userId(p), value);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/programs")
    public Map<String, Object> programs(Principal p) {
        long uid = userId(p);
        return Map.of("programs", entries.programs(uid), "clients", entries.clientPrograms(uid));
    }

    @DeleteMapping("/programs/{value}")
    public ResponseEntity<Void> forgetProgram(@PathVariable String value, Principal p) {
        entries.forgetProgram(userId(p), value);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/export/csv")
    public ResponseEntity<byte[]> csv(Principal p) {
        return download(SpreadsheetExport.csv(entries.findAll(userId(p))), "csv",
                MediaType.parseMediaType("text/csv; charset=UTF-8"));
    }

    @GetMapping("/export/xlsx")
    public ResponseEntity<byte[]> xlsx(Principal p) {
        return download(SpreadsheetExport.xlsx(entries.findAll(userId(p))), "xlsx",
                MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    }

    private static ResponseEntity<byte[]> download(byte[] body, String ext, MediaType type) {
        return ResponseEntity.ok()
                .contentType(type)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("mileage-" + LocalDate.now() + "." + ext).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(body);
    }

    private static ResponseEntity<?> odometerError() {
        return ResponseEntity.badRequest().body(Map.of("error", "Odometer end must be greater than or equal to odometer start."));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> invalid(MethodArgumentNotValidException ex) {
        var fe = ex.getBindingResult().getFieldError();
        String field = fe == null ? "input" : fe.getField();
        return ResponseEntity.badRequest().body(Map.of("error", "Please check the " + field + " field."));
    }
}
