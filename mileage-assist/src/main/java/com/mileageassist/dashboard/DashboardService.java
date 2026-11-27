package com.mileageassist.dashboard;

import com.mileageassist.dashboard.RateRepository.Rate;
import com.mileageassist.entries.Entry;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Turns trips + reimbursement rates into weekly figures.
 * Weeks run Monday to Sunday. Averages use full weeks only (the current week is still in
 * progress), counted from the first week you logged a trip, so a new account isn't
 * dragged down by empty weeks before it existed.
 */
public final class DashboardService {
    private DashboardService() {}

    static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2);

    public record Week(LocalDate start, LocalDate end, BigDecimal miles, BigDecimal amount, int trips, boolean partial) {}
    public record Slice(String name, BigDecimal miles, BigDecimal amount, int trips, double share, BigDecimal avgWeekly) {}
    public record Summary(BigDecimal amount, BigDecimal miles, int trips) {}

    public record Dashboard(
            BigDecimal currentRate, List<Rate> rates,
            List<Week> weeks, int weeksCounted, boolean avgIsThisWeekSoFar,
            Summary avgWeekly, Summary thisWeek, Double changeVsAvg,
            Summary rangeTotal, BigDecimal avgPerTrip, BigDecimal avgMilesPerTrip,
            List<Slice> byProgram, List<Slice> byWeekday, List<Slice> topClients) {}

    /** The rate in force on a date; trips before the first rate use the earliest rate. */
    static BigDecimal rateOn(List<Rate> rates, LocalDate date) {
        BigDecimal r = null;
        for (Rate rate : rates) {
            if (!rate.effectiveDate().isAfter(date)) r = rate.rate();
        }
        return r != null ? r : rates.isEmpty() ? BigDecimal.ZERO : rates.get(0).rate();
    }

    static BigDecimal amount(Entry e, List<Rate> rates) {
        return e.miles().multiply(rateOn(rates, e.date())).setScale(2, RoundingMode.HALF_UP);
    }

    public static Dashboard build(List<Entry> all, List<Rate> rates, LocalDate today, int weeksBack) {
        LocalDate thisMonday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate rangeStart = thisMonday.minusWeeks(weeksBack - 1L);
        LocalDate rangeEnd = thisMonday.plusDays(6);

        List<Entry> trips = all.stream()
                .filter(e -> !e.date().isBefore(rangeStart) && !e.date().isAfter(rangeEnd)).toList();

        // Weekly buckets
        Map<LocalDate, List<Entry>> byWeek = trips.stream().collect(Collectors.groupingBy(
                e -> e.date().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))));
        List<Week> weeks = new ArrayList<>();
        for (LocalDate w = rangeStart; !w.isAfter(thisMonday); w = w.plusWeeks(1)) {
            List<Entry> list = byWeek.getOrDefault(w, List.of());
            weeks.add(new Week(w, w.plusDays(6), sumMiles(list), sumAmount(list, rates), list.size(), w.equals(thisMonday)));
        }

        // Which weeks count toward the average
        LocalDate firstTripWeek = all.stream().map(Entry::date).min(Comparator.naturalOrder())
                .map(d -> d.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))).orElse(thisMonday);
        LocalDate avgFrom = firstTripWeek.isAfter(rangeStart) ? firstTripWeek : rangeStart;
        List<Week> counted = weeks.stream().filter(w -> !w.start().isBefore(avgFrom) && !w.partial()).toList();
        boolean soFar = counted.isEmpty();
        if (soFar) counted = weeks.stream().filter(Week::partial).toList();
        int n = Math.max(1, counted.size());
        BigDecimal div = BigDecimal.valueOf(n);

        Summary avg = new Summary(
                counted.stream().map(Week::amount).reduce(ZERO, BigDecimal::add).divide(div, 2, RoundingMode.HALF_UP),
                counted.stream().map(Week::miles).reduce(BigDecimal.ZERO, BigDecimal::add).divide(div, 1, RoundingMode.HALF_UP),
                (int) Math.round(counted.stream().mapToInt(Week::trips).sum() / (double) n));
        Week cur = weeks.get(weeks.size() - 1);
        Summary thisWeek = new Summary(cur.amount(), cur.miles(), cur.trips());
        Double change = avg.amount().signum() == 0 ? null
                : cur.amount().subtract(avg.amount()).doubleValue() / avg.amount().doubleValue();

        BigDecimal total = sumAmount(trips, rates);
        Summary rangeTotal = new Summary(total, sumMiles(trips), trips.size());
        BigDecimal perTrip = trips.isEmpty() ? ZERO : total.divide(BigDecimal.valueOf(trips.size()), 2, RoundingMode.HALF_UP);
        BigDecimal milesPerTrip = trips.isEmpty() ? BigDecimal.ZERO
                : rangeTotal.miles().divide(BigDecimal.valueOf(trips.size()), 1, RoundingMode.HALF_UP);

        // Average weekly reimbursement per program, over the same weeks as the overall average.
        Set<LocalDate> countedStarts = counted.stream().map(Week::start).collect(Collectors.toSet());
        List<Entry> avgTrips = trips.stream().filter(e -> countedStarts.contains(
                e.date().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)))).toList();
        BigDecimal avgTotal = sumAmount(avgTrips, rates);
        List<Slice> byProgram = slices(avgTrips, rates, e -> e.program().isBlank() ? "(No program)" : e.program(),
                avgTotal, div, Integer.MAX_VALUE);

        // Share of reimbursement by day of week (Mon..Sun), over the whole range
        Map<DayOfWeek, List<Entry>> dow = trips.stream().collect(Collectors.groupingBy(e -> e.date().getDayOfWeek()));
        List<Slice> byWeekday = new ArrayList<>();
        for (DayOfWeek d : DayOfWeek.values()) {
            List<Entry> list = dow.getOrDefault(d, List.of());
            BigDecimal amt = sumAmount(list, rates);
            byWeekday.add(new Slice(d.getDisplayName(java.time.format.TextStyle.SHORT, Locale.US), sumMiles(list), amt,
                    list.size(), share(amt, total), null));
        }

        List<Slice> clients = slices(trips, rates, Entry::endLocation, total, div, 6);

        BigDecimal current = rates.isEmpty() ? null : rateOn(rates, today);
        return new Dashboard(current, rates, weeks, counted.size(), soFar, avg, thisWeek, change, rangeTotal, perTrip,
                milesPerTrip, byProgram, byWeekday, clients);
    }

    /** Groups by name (case-insensitive), largest first; beyond `limit` folds into "Other". */
    private static List<Slice> slices(List<Entry> trips, List<Rate> rates, java.util.function.Function<Entry, String> name,
                                      BigDecimal total, BigDecimal weeks, int limit) {
        Map<String, List<Entry>> groups = new LinkedHashMap<>();
        Map<String, String> display = new HashMap<>();
        for (Entry e : trips) {
            String n = name.apply(e).trim();
            String key = n.toLowerCase(Locale.ROOT);
            display.putIfAbsent(key, n);
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(e);
        }
        List<Slice> out = new ArrayList<>();
        groups.forEach((k, list) -> {
            BigDecimal amt = sumAmount(list, rates);
            out.add(new Slice(display.get(k), sumMiles(list), amt, list.size(), share(amt, total),
                    amt.divide(weeks, 2, RoundingMode.HALF_UP)));
        });
        out.sort(Comparator.comparing(Slice::amount).reversed().thenComparing(Slice::name));
        if (out.size() <= limit) return out;
        List<Slice> top = new ArrayList<>(out.subList(0, limit - 1));
        List<Slice> rest = out.subList(limit - 1, out.size());
        BigDecimal amt = rest.stream().map(Slice::amount).reduce(ZERO, BigDecimal::add);
        top.add(new Slice("Other (" + rest.size() + ")", rest.stream().map(Slice::miles).reduce(BigDecimal.ZERO, BigDecimal::add),
                amt, rest.stream().mapToInt(Slice::trips).sum(), share(amt, total), amt.divide(weeks, 2, RoundingMode.HALF_UP)));
        return top;
    }

    private static double share(BigDecimal part, BigDecimal total) {
        return total.signum() == 0 ? 0 : part.doubleValue() / total.doubleValue();
    }

    private static BigDecimal sumMiles(List<Entry> list) {
        return list.stream().map(Entry::miles).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static BigDecimal sumAmount(List<Entry> list, List<Rate> rates) {
        return list.stream().map(e -> amount(e, rates)).reduce(ZERO, BigDecimal::add);
    }
}
