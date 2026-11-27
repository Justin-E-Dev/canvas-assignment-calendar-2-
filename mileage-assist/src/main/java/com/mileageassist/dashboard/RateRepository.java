package com.mileageassist.dashboard;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RateRepository {
    public record Rate(LocalDate effectiveDate, BigDecimal rate) {}

    private final JdbcTemplate jdbc;

    public RateRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Oldest first. */
    public List<Rate> findAll(long userId) {
        return jdbc.query("select effective_date, rate from user_rates where user_id = ? order by effective_date",
                (rs, i) -> new Rate(rs.getObject(1, LocalDate.class), rs.getBigDecimal(2)), userId);
    }

    public void save(long userId, LocalDate effective, BigDecimal rate) {
        jdbc.update("merge into user_rates (user_id, effective_date, rate) key (user_id, effective_date) values (?, ?, ?)",
                userId, effective, rate);
    }

    public boolean delete(long userId, LocalDate effective) {
        return jdbc.update("delete from user_rates where user_id = ? and effective_date = ?", userId, effective) > 0;
    }
}
