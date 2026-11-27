package com.mileageassist.entries;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

public record EntryInput(
        LocalDate date,
        @NotBlank @Size(max = 10) @Pattern(regexp = "[A-Za-z .\\-]+", message = "letters only") String initials,
        @NotBlank @Size(max = 200) String startLocation,
        @NotBlank @Size(max = 200) String endLocation,
        @NotNull @DecimalMin("0") @DecimalMax("99999999") BigDecimal odometerStart,
        @NotNull @DecimalMin("0") @DecimalMax("99999999") BigDecimal odometerEnd) {

    public String normalizedInitials() {
        return initials.trim().toUpperCase(java.util.Locale.ROOT);
    }
}
