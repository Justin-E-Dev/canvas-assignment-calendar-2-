package com.mileageassist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.mileageassist.auth.UserRepository;
import com.mileageassist.entries.SpreadsheetExport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:test;DB_CLOSE_DELAY=-1", "spring.datasource.password="})
@AutoConfigureMockMvc
class MileageAssistTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;

    private static final String TRIP = """
        {"initials":"je","startLocation":"=HYPERLINK(\\"x\\")","endLocation":"B","program":" Senior  Care ",
         "odometerStart":100,"odometerEnd":112.5}""";

    @BeforeEach
    void seed() {
        for (String e : new String[] {"a@test.com", "b@test.com"}) {
            if (!users.exists(e)) users.create(e, "Tester", encoder.encode("long-enough-password"));
        }
    }

    @Test
    void passwordsAreStoredAsArgon2Hashes() {
        assertThat(users.findByEmail("a@test.com").orElseThrow().passwordHash()).startsWith("$argon2id$");
    }

    @Test
    void apiRequiresLogin() throws Exception {
        mvc.perform(get("/api/entries")).andExpect(status().isUnauthorized());
        mvc.perform(get("/")).andExpect(status().is3xxRedirection());
    }

    @Test
    void writesRequireCsrfToken() throws Exception {
        mvc.perform(post("/api/entries").with(user("a@test.com"))
                .contentType(MediaType.APPLICATION_JSON).content(TRIP)).andExpect(status().isForbidden());
    }

    @Test
    void usersCannotSeeOrEditEachOthersTrips() throws Exception {
        String body = mvc.perform(post("/api/entries").with(user("a@test.com")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(TRIP))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.miles").value(12.5))
                .andExpect(jsonPath("$.initials").value("JE"))
                .andReturn().getResponse().getContentAsString();
        String id = body.replaceAll(".*\"id\":(\\d+).*", "$1");

        mvc.perform(get("/api/entries").with(user("b@test.com"))).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(delete("/api/entries/" + id).with(user("b@test.com")).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(get("/api/initials").with(user("a@test.com"))).andExpect(jsonPath("$[0]").value("JE"));
        mvc.perform(get("/api/programs").with(user("a@test.com")))
                .andExpect(jsonPath("$.programs[0]").value("Senior Care"))
                .andExpect(jsonPath("$.clients.B").value("Senior Care"));
        mvc.perform(get("/api/programs").with(user("b@test.com"))).andExpect(jsonPath("$.programs.length()").value(0));
    }

    @Test
    void rejectsOdometerEndBelowStart() throws Exception {
        mvc.perform(post("/api/entries").with(user("a@test.com")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"initials\":\"JE\",\"startLocation\":\"A\",\"endLocation\":\"B\",\"odometerStart\":10,\"odometerEnd\":5}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void csvNeutralisesFormulas() {
        var e = new com.mileageassist.entries.Entry(1, java.time.LocalDate.of(2026, 1, 2), "JE", "=cmd()", "@x", "+prog",
                java.math.BigDecimal.ONE, java.math.BigDecimal.TEN);
        String csv = new String(SpreadsheetExport.csv(java.util.List.of(e)), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(csv).contains("\"'=cmd()\"").contains("\"'@x\"").contains("\"'+prog\"").contains(",9");
    }
}
