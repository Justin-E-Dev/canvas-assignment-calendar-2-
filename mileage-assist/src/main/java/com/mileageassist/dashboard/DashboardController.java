package com.mileageassist.dashboard;

import com.mileageassist.auth.UserRepository;
import com.mileageassist.entries.EntryRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class DashboardController {

    public record RateInput(@NotNull @DecimalMin(value = "0.0", inclusive = false) @DecimalMax("10.0")
                            @Digits(integer = 2, fraction = 4) BigDecimal rate, LocalDate effectiveDate) {}

    private final RateRepository rates;
    private final EntryRepository entries;
    private final UserRepository users;

    public DashboardController(RateRepository rates, EntryRepository entries, UserRepository users) {
        this.rates = rates;
        this.entries = entries;
        this.users = users;
    }

    private long uid(Principal p) {
        return users.findByEmail(p.getName()).orElseThrow().id();
    }

    @GetMapping("/rates")
    public List<RateRepository.Rate> list(Principal p) {
        return rates.findAll(uid(p));
    }

    @PostMapping("/rates")
    public List<RateRepository.Rate> save(@Valid @RequestBody RateInput in, Principal p) {
        long id = uid(p);
        rates.save(id, in.effectiveDate() != null ? in.effectiveDate() : LocalDate.now(), in.rate());
        return rates.findAll(id);
    }

    @DeleteMapping("/rates/{date}")
    public ResponseEntity<List<RateRepository.Rate>> delete(@PathVariable LocalDate date, Principal p) {
        long id = uid(p);
        if (!rates.delete(id, date)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(rates.findAll(id));
    }

    /** `today` comes from the browser so weeks line up with the user's own calendar day. */
    @GetMapping("/dashboard")
    public DashboardService.Dashboard dashboard(@RequestParam(defaultValue = "12") int weeks,
                                                @RequestParam(required = false) LocalDate today, Principal p) {
        long id = uid(p);
        int w = Math.max(2, Math.min(weeks, 104));
        LocalDate now = LocalDate.now();
        LocalDate day = today != null && !today.isBefore(now.minusDays(1)) && !today.isAfter(now.plusDays(1)) ? today : now;
        return DashboardService.build(entries.findAll(id), rates.findAll(id), day, w);
    }

    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> invalid() {
        return ResponseEntity.badRequest().body(Map.of("error", "Enter a rate between $0.01 and $10.00 per mile."));
    }
}
