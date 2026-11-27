package com.mileageassist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.mileageassist.auth.UserRepository;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:tpl;DB_CLOSE_DELAY=-1", "spring.datasource.password="})
@AutoConfigureMockMvc
class TemplateTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;

    /** A typical agency form: title, "Program:" label, headings on row 4, 12 rows, then a Total row. */
    static byte[] form() throws Exception {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet s = wb.createSheet("Mileage Log");
            s.createRow(0).createCell(0).setCellValue("Monthly Mileage Reimbursement");
            Row r1 = s.createRow(1);
            r1.createCell(0).setCellValue("Program:");
            r1.createCell(3).setCellValue("Employee: {{name}}");
            Row h = s.createRow(3);
            String[] heads = {"Date", "From", "To", "Program", "Beginning Odometer", "Ending Odometer", "Miles"};
            for (int i = 0; i < heads.length; i++) h.createCell(i).setCellValue(heads[i]);
            for (int r = 4; r < 16; r++) s.createRow(r).createCell(6).setCellFormula("F" + (r + 1) + "-E" + (r + 1));
            Row t = s.createRow(16);
            t.createCell(5).setCellValue("Total");
            t.createCell(6).setCellFormula("SUM(G5:G16)");
            var out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        }
    }

    @Test
    void fillsUploadedTemplateAndOverflowsIntoNewTabs() throws Exception {
        if (!users.exists("t@test.com")) users.create("t@test.com", "Pat", encoder.encode("long-enough-password"));
        var me = user("t@test.com");

        mvc.perform(multipart("/api/template").file(new MockMultipartFile("file", "Agency Form.xlsx",
                        "application/octet-stream", form())).with(me).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.capacity").value(12))
                .andExpect(jsonPath("$.columns.length()").value(7));

        List<Long> ids = new ArrayList<>();
        for (int i = 0; i < 14; i++) {
            String body = mvc.perform(post("/api/entries").with(me).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"date\":\"2026-11-%02d\",\"initials\":\"PJ\",\"startLocation\":\"Office\",\"endLocation\":\"Client %d\",\"program\":\"Senior Care\",\"odometerStart\":%d,\"odometerEnd\":%d}"
                            .formatted(i + 1, i, 1000 + i * 10, 1005 + i * 10)))
                    .andReturn().getResponse().getContentAsString();
            ids.add(Long.parseLong(body.replaceAll(".*\"id\":(\\d+).*", "$1")));
        }
        ids.add(999999L); // not this user's trip: must be ignored

        byte[] xlsx = mvc.perform(post("/api/export/part?format=xlsx").with(me).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":" + ids + ",\"label\":\"Senior Care 1 of 1\",\"number\":1,\"total\":1}"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("Senior-Care-1-of-1.xlsx")))
                .andReturn().getResponse().getContentAsByteArray();

        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(xlsx))) {
            assertThat(wb.getNumberOfSheets()).isEqualTo(2); // 14 trips, room for 12 per sheet
            Sheet s1 = wb.getSheetAt(0);
            assertThat(s1.getRow(1).getCell(1).getStringCellValue()).isEqualTo("Senior Care");
            assertThat(s1.getRow(1).getCell(3).getStringCellValue()).isEqualTo("Employee: Pat");
            Row first = s1.getRow(4);
            assertThat(first.getCell(0).getLocalDateTimeCellValue().toLocalDate()).hasToString("2026-11-01");
            assertThat(first.getCell(1).getStringCellValue()).isEqualTo("Office");
            assertThat(first.getCell(2).getStringCellValue()).isEqualTo("Client 0");
            assertThat(first.getCell(4).getNumericCellValue()).isEqualTo(1000);
            assertThat(first.getCell(6).getCellType()).isEqualTo(CellType.FORMULA); // form's own formula kept
            assertThat(s1.getRow(16).getCell(6).getCellFormula()).isEqualTo("SUM(G5:G16)");
            Sheet s2 = wb.getSheetAt(1);
            assertThat(s2.getSheetName()).isEqualTo("Mileage Log (2)");
            assertThat(s2.getRow(4).getCell(2).getStringCellValue()).isEqualTo("Client 12");
            assertThat(s2.getRow(5).getCell(2).getStringCellValue()).isEqualTo("Client 13");
            assertThat(s2.getRow(6).getCell(2)).isNull();
        }

        mvc.perform(post("/api/export/zip").with(me).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"format\":\"csv\",\"parts\":[{\"ids\":[" + ids.get(0) + "],\"label\":\"A\"},{\"ids\":[" + ids.get(1) + "],\"label\":\"B\"}]}"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/zip"));
    }

    @Test
    void replacesPlaceholdersStoredAsInlineText() throws Exception {
        // Files made by tools other than Excel often store text "inline" rather than in a shared table.
        byte[] inline;
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(form()))) {
            var cell = (org.apache.poi.xssf.usermodel.XSSFCell) wb.getSheetAt(0).getRow(1).getCell(3);
            cell.getCTCell().setT(org.openxmlformats.schemas.spreadsheetml.x2006.main.STCellType.INLINE_STR);
            cell.getCTCell().unsetV();
            cell.getCTCell().addNewIs().setT("Employee: {{name}}");
            var out = new ByteArrayOutputStream();
            wb.write(out);
            inline = out.toByteArray();
        }
        var e = new com.mileageassist.entries.Entry(1, java.time.LocalDate.of(2026, 1, 2), "JE", "A", "B", "P",
                java.math.BigDecimal.ONE, java.math.BigDecimal.TEN);
        var out = com.mileageassist.export.TemplateFiller.fill(inline, List.of(e),
                new com.mileageassist.export.TemplateFiller.Context("Pat", 1, 1, null));
        var xml = new String(new java.util.zip.ZipInputStream(new ByteArrayInputStream(out.bytes())) {{
            for (var z = getNextEntry(); z != null && !z.getName().equals("xl/worksheets/sheet1.xml"); z = getNextEntry()) { }
        }}.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(xml).doesNotContain("{{name}}");
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(out.bytes()))) {
            assertThat(wb.getSheetAt(0).getRow(1).getCell(3).getStringCellValue()).isEqualTo("Employee: Pat");
        }
    }

    @Test
    void rejectsFilesWithoutHeadings() throws Exception {
        if (!users.exists("u@test.com")) users.create("u@test.com", "U", encoder.encode("long-enough-password"));
        mvc.perform(multipart("/api/template").file(new MockMultipartFile("file", "notes.xlsx", "application/octet-stream",
                        "not a spreadsheet".getBytes())).with(user("u@test.com")).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }
}
