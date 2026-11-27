package com.mileageassist.export;

import com.mileageassist.entries.Entry;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;

/**
 * Fills a user's own Excel form with trips. It finds the row of column headings
 * (Date, Start Location, Odometer Start, ...), writes one trip per row underneath,
 * keeps the form's formatting and formulas, and adds extra copies of the sheet
 * (tabs) when there are more trips than the form has room for.
 */
public final class TemplateFiller {

    public enum Field {
        DATE("Date"), INITIALS("Initials"), START("Start Location"), END("End Location"), PROGRAM("Program"),
        ODO_START("Odometer Start"), ODO_END("Odometer End"), MILES("Miles");

        public final String label;

        Field(String label) {
            this.label = label;
        }
    }

    /** Where things are in the template. */
    public record Layout(int sheetIndex, int headerRow, Map<Field, Integer> columns, Integer capacity) {
        public List<String> columnLabels() {
            return columns.keySet().stream().map(f -> f.label).toList();
        }
    }

    /** Extra values for {{placeholders}} and labelled cells. */
    public record Context(String firstName, int sheetNumber, int sheetCount, String groupLabel) {}

    public static final class TemplateException extends RuntimeException {
        public TemplateException(String message) {
            super(message);
        }
    }

    private static final Map<String, Field> EXACT = new HashMap<>();

    static {
        put(Field.DATE, "date", "tripdate", "dateoftravel", "traveldate", "day");
        put(Field.INITIALS, "initials", "init", "staffinitials", "employeeinitials", "driverinitials");
        put(Field.START, "startlocation", "from", "origin", "startingpoint", "startingaddress", "startaddress",
                "startinglocation", "departure", "departurelocation", "fromlocation", "fromaddress");
        put(Field.END, "endlocation", "to", "destination", "client", "clientname", "endaddress",
                "endinglocation", "tolocation", "toaddress", "arrival", "clientaddress");
        put(Field.PROGRAM, "program", "programname", "programtype");
        put(Field.ODO_START, "odometerstart", "startodometer", "beginningodometer", "odostart", "startingodometer",
                "startingmileage", "beginningmileage", "startmileage", "odometerbegin", "odometerbeginning",
                "beginodometer", "beginningreading", "startreading");
        put(Field.ODO_END, "odometerend", "endodometer", "endingodometer", "odoend", "endingmileage",
                "endmileage", "odometerending", "endingreading", "endreading");
        put(Field.MILES, "miles", "totalmiles", "mileage", "distance", "tripmiles", "milesdriven", "totalmileage",
                "milestraveled", "milestravelled", "numberofmiles");
    }

    private static void put(Field f, String... keys) {
        for (String k : keys) EXACT.put(k, f);
    }

    private static final Pattern TOKEN = Pattern.compile("\\{\\{\\s*([A-Za-z ]+?)\\s*}}");
    private static final DateTimeFormatter US_DATE = DateTimeFormatter.ofPattern("M/d/yyyy");

    private TemplateFiller() {}

    static String norm(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    /** Works out which column holds which field; bare "start"/"end" headings are resolved afterwards. */
    static Field match(String n) {
        if (n.isEmpty() || n.length() > 40) return null;
        Field f = EXACT.get(n);
        if (f != null) return f;
        boolean odo = n.contains("odometer") || n.contains("odo") || n.contains("reading");
        if (odo && (n.contains("start") || n.contains("begin"))) return Field.ODO_START;
        if (odo && (n.contains("end") || n.contains("finish"))) return Field.ODO_END;
        if (n.contains("date")) return Field.DATE;
        if (n.contains("initial")) return Field.INITIALS;
        if (n.contains("program")) return Field.PROGRAM;
        if (n.contains("destination") || n.startsWith("client") || n.startsWith("to")
                && (n.contains("location") || n.contains("address"))) return Field.END;
        if (n.contains("origin") || n.startsWith("from") || n.startsWith("start")
                && (n.contains("location") || n.contains("address") || n.contains("point"))) return Field.START;
        if (n.contains("miles") || n.contains("distance")) return Field.MILES;
        return null;
    }

    public static Workbook open(byte[] bytes) {
        try {
            return WorkbookFactory.create(new ByteArrayInputStream(bytes));
        } catch (Exception | Error e) {
            throw new TemplateException("That file couldn't be opened as an Excel spreadsheet (.xlsx or .xls).");
        }
    }

    public static Layout analyze(Workbook wb) {
        DataFormatter fmt = new DataFormatter();
        Layout best = null;
        int bestScore = 1;
        for (int s = 0; s < Math.min(wb.getNumberOfSheets(), 10); s++) {
            Sheet sheet = wb.getSheetAt(s);
            for (int r = sheet.getFirstRowNum(); r <= Math.min(sheet.getLastRowNum(), 80); r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;
                Map<Field, Integer> cols = new EnumMap<>(Field.class);
                List<Integer> bareStart = new ArrayList<>();
                List<Integer> bareEnd = new ArrayList<>();
                for (Cell c : row) {
                    if (c.getCellType() != CellType.STRING) continue;
                    String n = norm(fmt.formatCellValue(c));
                    if (Set.of("start", "begin", "beginning", "starting").contains(n)) bareStart.add(c.getColumnIndex());
                    else if (Set.of("end", "ending", "finish").contains(n)) bareEnd.add(c.getColumnIndex());
                    else {
                        Field f = match(n);
                        if (f != null) cols.putIfAbsent(f, c.getColumnIndex());
                    }
                }
                for (int col : bareStart) {
                    cols.putIfAbsent(cols.containsKey(Field.ODO_START) ? Field.START : Field.ODO_START, col);
                }
                for (int col : bareEnd) {
                    cols.putIfAbsent(cols.containsKey(Field.ODO_END) ? Field.END : Field.ODO_END, col);
                }
                if (cols.size() > bestScore) {
                    bestScore = cols.size();
                    best = new Layout(s, r, cols, capacity(sheet, r));
                }
            }
        }
        if (best == null) {
            throw new TemplateException("Couldn't find column headings in that file. Make sure it has a row of "
                    + "headings such as Date, Start Location, End Location, Program, Odometer Start, Odometer End.");
        }
        return best;
    }

    /** Rows available between the headings and a "Total" row, if the form has one. */
    private static Integer capacity(Sheet sheet, int headerRow) {
        DataFormatter fmt = new DataFormatter();
        for (int r = headerRow + 1; r <= Math.min(sheet.getLastRowNum(), headerRow + 500); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            for (Cell c : row) {
                boolean total = c.getCellType() == CellType.STRING && norm(fmt.formatCellValue(c)).startsWith("total");
                boolean sum = c.getCellType() == CellType.FORMULA
                        && c.getCellFormula().toUpperCase(Locale.ROOT).contains("SUM(");
                if (total || sum) {
                    int cap = r - headerRow - 1;
                    return cap > 0 ? cap : null;
                }
            }
        }
        return null;
    }

    public record Output(byte[] bytes, String extension, String mediaType) {}

    public static Output fill(byte[] template, List<Entry> entries, Context ctx) {
        try (Workbook wb = open(template)) {
            Layout layout = analyze(wb);
            int cap = layout.capacity() != null ? layout.capacity() : Math.max(entries.size(), 1);
            int pages = Math.max(1, (entries.size() + cap - 1) / cap);

            // Extra tabs for overflow, cloned from the untouched form.
            List<Sheet> sheets = new ArrayList<>();
            Sheet base = wb.getSheetAt(layout.sheetIndex());
            sheets.add(base);
            String baseName = base.getSheetName();
            for (int p = 2; p <= pages; p++) {
                Sheet copy = wb.cloneSheet(layout.sheetIndex());
                String suffix = " (" + p + ")";
                String name = baseName.length() + suffix.length() > 31
                        ? baseName.substring(0, 31 - suffix.length()) + suffix : baseName + suffix;
                if (!copy.getSheetName().equals(name)) wb.setSheetName(wb.getSheetIndex(copy), uniqueName(wb, name));
                wb.setSheetOrder(copy.getSheetName(), layout.sheetIndex() + p - 1);
                sheets.add(copy);
            }

            Map<Short, CellStyle> dateStyles = new HashMap<>();
            for (int p = 0; p < pages; p++) {
                List<Entry> chunk = entries.subList(p * cap, Math.min(entries.size(), (p + 1) * cap));
                Sheet sheet = sheets.get(p);
                for (int i = 0; i < chunk.size(); i++) {
                    writeRow(wb, sheet, layout, layout.headerRow() + 1 + i, chunk.get(i), dateStyles);
                }
                fillLabels(sheet, layout, chunk, ctx, p + 1, pages);
            }
            wb.setForceFormulaRecalculation(true);
            var out = new ByteArrayOutputStream();
            wb.write(out);
            boolean xls = wb instanceof HSSFWorkbook;
            return new Output(out.toByteArray(), xls ? "xls" : "xlsx", xls ? "application/vnd.ms-excel"
                    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        } catch (IOException e) {
            throw new TemplateException("The template couldn't be filled in.");
        }
    }

    private static String uniqueName(Workbook wb, String name) {
        String n = name;
        for (int i = 2; wb.getSheet(n) != null; i++) n = name.substring(0, Math.min(name.length(), 27)) + "~" + i;
        return n;
    }

    private static void writeRow(Workbook wb, Sheet sheet, Layout layout, int r, Entry e,
                                 Map<Short, CellStyle> dateStyles) {
        Row row = sheet.getRow(r);
        if (row == null) row = sheet.createRow(r);
        Row styleRow = sheet.getRow(layout.headerRow() + 1);
        for (var col : layout.columns().entrySet()) {
            int ci = col.getValue();
            Cell cell = row.getCell(ci);
            if (cell == null) {
                cell = row.createCell(ci);
                Cell model = styleRow == null ? null : styleRow.getCell(ci);
                if (model != null) cell.setCellStyle(model.getCellStyle());
            }
            if (cell.getCellType() == CellType.FORMULA) continue; // keep the form's own calculations
            cell.setBlank(); // fully clears old content, including "inline" text, but keeps the formatting
            switch (col.getKey()) {
                case DATE -> {
                    cell.setCellValue(e.date());
                    CellStyle st = cell.getCellStyle();
                    if (!DateUtil.isADateFormat(st.getDataFormat(), st.getDataFormatString())) {
                        cell.setCellStyle(dateStyles.computeIfAbsent(st.getIndex(), k -> {
                            CellStyle ds = wb.createCellStyle();
                            ds.cloneStyleFrom(st);
                            ds.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("m/d/yyyy"));
                            return ds;
                        }));
                    }
                }
                case INITIALS -> cell.setCellValue(e.initials());
                case START -> cell.setCellValue(e.startLocation());
                case END -> cell.setCellValue(e.endLocation());
                case PROGRAM -> cell.setCellValue(e.program());
                case ODO_START -> cell.setCellValue(e.odometerStart().doubleValue());
                case ODO_END -> cell.setCellValue(e.odometerEnd().doubleValue());
                case MILES -> cell.setCellValue(e.miles().doubleValue());
            }
        }
    }

    private static String common(List<Entry> rows, java.util.function.Function<Entry, String> f) {
        Set<String> vals = new LinkedHashSet<>();
        rows.forEach(r -> vals.add(f.apply(r)));
        return vals.size() == 1 ? vals.iterator().next() : String.join(", ", vals);
    }

    /** Replaces {{placeholders}} anywhere, and fills "Program:"-style labels above the headings. */
    private static void fillLabels(Sheet sheet, Layout layout, List<Entry> rows, Context ctx, int tab, int tabs) {
        Map<String, Object> values = new HashMap<>();
        String program = rows.isEmpty() ? "" : common(rows, Entry::program);
        String initials = rows.isEmpty() ? "" : common(rows, Entry::initials);
        double miles = rows.stream().mapToDouble(r -> r.miles().doubleValue()).sum();
        LocalDate first = rows.stream().map(Entry::date).min(Comparator.naturalOrder()).orElse(null);
        LocalDate last = rows.stream().map(Entry::date).max(Comparator.naturalOrder()).orElse(null);
        int sheetNo = ctx.sheetCount() > 1 || tabs == 1 ? ctx.sheetNumber() : tab;
        values.put("program", program);
        values.put("initials", initials);
        values.put("name", ctx.firstName());
        values.put("firstname", ctx.firstName());
        values.put("totalmiles", miles);
        values.put("startdate", first == null ? "" : first.format(US_DATE));
        values.put("enddate", last == null ? "" : last.format(US_DATE));
        values.put("month", first == null ? "" : first.getMonth().getDisplayName(java.time.format.TextStyle.FULL,
                Locale.US) + " " + first.getYear());
        values.put("today", LocalDate.now().format(US_DATE));
        values.put("sheet", tabs > 1 ? sheetNo + "." + tab : String.valueOf(sheetNo));
        values.put("sheets", String.valueOf(ctx.sheetCount()));
        values.put("group", ctx.groupLabel() == null ? "" : ctx.groupLabel());

        DataFormatter fmt = new DataFormatter();
        List<Row> rowsSnapshot = new ArrayList<>();
        sheet.forEach(rowsSnapshot::add);
        for (Row row : rowsSnapshot) {
            List<Cell> cells = new ArrayList<>();
            row.forEach(cells::add);
            for (Cell c : cells) {
                if (c.getCellType() != CellType.STRING) continue;
                String text = c.getStringCellValue();
                if (text.contains("{{")) {
                    Matcher m = TOKEN.matcher(text);
                    if (m.matches() && values.get(norm(m.group(1))) instanceof Double d) {
                        c.setBlank();
                        c.setCellValue(d);
                        continue;
                    }
                    StringBuilder sb = new StringBuilder();
                    m.reset();
                    while (m.find()) {
                        Object v = values.get(norm(m.group(1)));
                        String rep = v == null ? m.group() : v instanceof Double d ? String.format("%.1f", d) : v.toString();
                        m.appendReplacement(sb, Matcher.quoteReplacement(rep));
                    }
                    m.appendTail(sb);
                    c.setBlank();
                    c.setCellValue(sb.toString());
                } else if (row.getRowNum() < layout.headerRow()) {
                    String n = norm(fmt.formatCellValue(c));
                    String fillWith = switch (n) {
                        case "program", "programname", "programtype" -> program;
                        case "initials", "staffinitials", "employeeinitials" -> initials;
                        default -> null;
                    };
                    if (fillWith == null || fillWith.isEmpty()) continue;
                    Cell next = row.getCell(c.getColumnIndex() + 1);
                    if (next == null) next = row.createCell(c.getColumnIndex() + 1);
                    if (next.getCellType() == CellType.BLANK
                            || next.getCellType() == CellType.STRING && next.getStringCellValue().isBlank()) {
                        next.setBlank();
                        next.setCellValue(fillWith);
                    }
                }
            }
        }
    }
}
