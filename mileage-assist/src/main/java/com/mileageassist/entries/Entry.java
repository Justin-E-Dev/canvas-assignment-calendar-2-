package com.mileageassist.entries;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.time.LocalDate;

public record Entry(long id, LocalDate date, String initials, String startLocation, String endLocation, String program,
                    BigDecimal odometerStart, BigDecimal odometerEnd) {
    @JsonProperty("miles")
    public BigDecimal miles() {
        return odometerEnd.subtract(odometerStart);
    }
}
