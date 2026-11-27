package com.mileageassist;

import static org.assertj.core.api.Assertions.assertThat;

import com.mileageassist.dashboard.DashboardService;
import com.mileageassist.dashboard.RateRepository.Rate;
import com.mileageassist.entries.Entry;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class DashboardTests {
    static Entry trip(long id, String date, String program, String client, int miles) {
        return new Entry(id, LocalDate.parse(date), "JE", "Office", client, program,
                BigDecimal.valueOf(1000), BigDecimal.valueOf(1000 + miles));
    }

    // Wednesday 2026-11-25; weeks start Mon 11-02, 11-09, 11-16, 11-23 (current)
    static final LocalDate TODAY = LocalDate.parse("2026-11-25");

    @Test
    void averagesFullWeeksAndAppliesRateByEffectiveDate() {
        var rates = List.of(new Rate(LocalDate.parse("2026-01-01"), new BigDecimal("0.50")),
                new Rate(LocalDate.parse("2026-11-16"), new BigDecimal("1.00")));
        var trips = List.of(
                trip(1, "2026-11-03", "Senior Care", "Smith", 100),  // $50 at old rate
                trip(2, "2026-11-10", "Youth", "Jones", 40),         // $20
                trip(3, "2026-11-17", "Senior Care", "Smith", 30),   // $30 at new rate
                trip(4, "2026-11-24", "Youth", "Jones", 10));        // $10 this week (partial)
        var d = DashboardService.build(trips, rates, TODAY, 4);

        assertThat(d.weeks()).hasSize(4);
        assertThat(d.weeks().get(3).partial()).isTrue();
        assertThat(d.weeksCounted()).isEqualTo(3);
        assertThat(d.avgWeekly().amount()).isEqualByComparingTo("33.33"); // (50+20+30)/3
        assertThat(d.thisWeek().amount()).isEqualByComparingTo("10.00");
        assertThat(d.changeVsAvg()).isCloseTo(-0.7, org.assertj.core.data.Offset.offset(0.01));
        assertThat(d.rangeTotal().amount()).isEqualByComparingTo("110.00");
        assertThat(d.currentRate()).isEqualByComparingTo("1.00");

        var senior = d.byProgram().get(0);
        assertThat(senior.name()).isEqualTo("Senior Care");
        assertThat(senior.avgWeekly()).isEqualByComparingTo("26.67"); // 80 / 3 weeks
        assertThat(senior.share()).isCloseTo(0.8, org.assertj.core.data.Offset.offset(0.001));
        assertThat(d.byWeekday().get(1).name()).isEqualTo("Tue");
    }

    @Test
    void newAccountsAverageOnlyFromTheirFirstWeek() {
        var rates = List.of(new Rate(LocalDate.parse("2026-01-01"), new BigDecimal("0.70")));
        var d = DashboardService.build(List.of(trip(1, "2026-11-24", "P", "C", 10)), rates, TODAY, 12);
        assertThat(d.avgIsThisWeekSoFar()).isTrue();
        assertThat(d.avgWeekly().amount()).isEqualByComparingTo("7.00");
    }

    @Test
    void foldsSmallClientsIntoOther() {
        var rates = List.of(new Rate(LocalDate.parse("2026-01-01"), BigDecimal.ONE));
        var trips = new java.util.ArrayList<Entry>();
        for (int i = 0; i < 9; i++) trips.add(trip(i, "2026-11-1" + (i % 9), "P", "Client " + i, 10 + i));
        var d = DashboardService.build(trips, rates, TODAY, 4);
        assertThat(d.topClients()).hasSize(6);
        assertThat(d.topClients().get(5).name()).isEqualTo("Other (4)");
    }
}
