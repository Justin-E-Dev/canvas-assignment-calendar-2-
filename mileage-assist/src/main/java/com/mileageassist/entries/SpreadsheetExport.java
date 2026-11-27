package com.mileageassist.entries;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Builds CSV and native Excel (.xlsx) files without any third-party service. */
public final class SpreadsheetExport {
    static final String[] HEADERS = {"Date", "Initials", "Start Location", "End Location",
            "Odometer Start", "Odometer End", "Miles"};

    private SpreadsheetExport() {}

    public static byte[] csv(List<Entry> entries) {
        StringBuilder sb = new StringBuilder("﻿"); // BOM so Excel reads UTF-8 correctly
        sb.append(String.join(",", HEADERS)).append("\r\n");
        for (Entry e : entries) {
            sb.append(e.date()).append(',')
              .append(csvCell(e.initials())).append(',')
              .append(csvCell(e.startLocation())).append(',')
              .append(csvCell(e.endLocation())).append(',')
              .append(e.odometerStart().toPlainString()).append(',')
              .append(e.odometerEnd().toPlainString()).append(',')
              .append(e.miles().toPlainString()).append("\r\n");
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    /** Quotes the value and neutralises spreadsheet formula injection (=, +, -, @, tab, CR). */
    static String csvCell(String v) {
        String s = v == null ? "" : v;
        if (!s.isEmpty() && "=+-@\t\r".indexOf(s.charAt(0)) >= 0) {
            s = "'" + s;
        }
        return '"' + s.replace("\"", "\"\"") + '"';
    }

    public static byte[] xlsx(List<Entry> entries) {
        StringBuilder rows = new StringBuilder();
        rows.append("<row r=\"1\">");
        for (String h : HEADERS) rows.append(str(h, 1));
        rows.append("</row>");
        int r = 2;
        for (Entry e : entries) {
            rows.append("<row r=\"").append(r++).append("\">")
                .append(str(e.date().toString(), 0))
                .append(str(e.initials(), 0))
                .append(str(e.startLocation(), 0))
                .append(str(e.endLocation(), 0))
                .append(num(e.odometerStart()))
                .append(num(e.odometerEnd()))
                .append(num(e.miles()))
                .append("</row>");
        }
        String sheet = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
                + "<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" state=\"frozen\"/></sheetView></sheetViews>"
                + "<cols><col min=\"1\" max=\"2\" width=\"12\" customWidth=\"1\"/><col min=\"3\" max=\"4\" width=\"30\" customWidth=\"1\"/>"
                + "<col min=\"5\" max=\"7\" width=\"15\" customWidth=\"1\"/></cols>"
                + "<sheetData>" + rows + "</sheetData></worksheet>";

        try (var bytes = new ByteArrayOutputStream(); var zip = new ZipOutputStream(bytes)) {
            put(zip, "[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                    + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                    + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                    + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                    + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
                    + "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
                    + "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>"
                    + "</Types>");
            put(zip, "_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                    + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                    + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>"
                    + "</Relationships>");
            put(zip, "xl/workbook.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                    + "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\""
                    + " xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">"
                    + "<sheets><sheet name=\"Mileage\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
            put(zip, "xl/_rels/workbook.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                    + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                    + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>"
                    + "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>"
                    + "</Relationships>");
            put(zip, "xl/styles.xml", "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                    + "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
                    + "<fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font>"
                    + "<font><b/><sz val=\"11\"/><color rgb=\"FFFFFFFF\"/><name val=\"Calibri\"/></font></fonts>"
                    + "<fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill>"
                    + "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF2E7D32\"/></patternFill></fill></fills>"
                    + "<borders count=\"1\"><border/></borders>"
                    + "<cellStyleXfs count=\"1\"><xf/></cellStyleXfs>"
                    + "<cellXfs count=\"2\"><xf xfId=\"0\"/><xf xfId=\"0\" fontId=\"1\" fillId=\"2\" applyFont=\"1\" applyFill=\"1\"/></cellXfs>"
                    + "</styleSheet>");
            put(zip, "xl/worksheets/sheet1.xml", sheet);
            zip.finish();
            return bytes.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static String str(String v, int style) {
        return "<c t=\"inlineStr\"" + (style > 0 ? " s=\"" + style + "\"" : "") + "><is><t xml:space=\"preserve\">"
                + xml(v) + "</t></is></c>";
    }

    private static String num(BigDecimal v) {
        return "<c><v>" + v.toPlainString() + "</v></c>";
    }

    static String xml(String v) {
        if (v == null) return "";
        StringBuilder sb = new StringBuilder(v.length());
        for (char c : v.toCharArray()) {
            switch (c) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                default -> {
                    if (c >= 0x20 || c == '\t' || c == '\n' || c == '\r') sb.append(c);
                }
            }
        }
        return sb.toString();
    }
}
