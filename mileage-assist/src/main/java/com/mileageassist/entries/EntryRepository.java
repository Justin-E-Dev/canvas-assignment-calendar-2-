package com.mileageassist.entries;

import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Every query is scoped to the signed-in user's id. */
@Repository
public class EntryRepository {
    private static final RowMapper<Entry> MAPPER = (rs, i) -> new Entry(
            rs.getLong("id"), rs.getObject("entry_date", LocalDate.class), rs.getString("initials"),
            rs.getString("start_location"), rs.getString("end_location"), rs.getString("program"),
            rs.getBigDecimal("odometer_start"), rs.getBigDecimal("odometer_end"));

    private final JdbcTemplate jdbc;

    public EntryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Entry> findAll(long userId) {
        return jdbc.query("select * from mileage_entries where user_id = ? order by entry_date desc, id desc",
                MAPPER, userId);
    }

    public Entry find(long userId, long id) {
        return jdbc.query("select * from mileage_entries where user_id = ? and id = ?", MAPPER, userId, id)
                .stream().findFirst().orElse(null);
    }

    @Transactional
    public long insert(long userId, EntryInput in, LocalDate date) {
        var kh = new org.springframework.jdbc.support.GeneratedKeyHolder();
        jdbc.update(con -> {
            var ps = con.prepareStatement("insert into mileage_entries (user_id, entry_date, initials, start_location,"
                    + " end_location, program, odometer_start, odometer_end) values (?, ?, ?, ?, ?, ?, ?, ?)", new String[] {"id"});
            ps.setLong(1, userId);
            ps.setObject(2, date);
            ps.setString(3, in.normalizedInitials());
            ps.setString(4, in.startLocation().trim());
            ps.setString(5, in.endLocation().trim());
            ps.setString(6, in.normalizedProgram());
            ps.setBigDecimal(7, in.odometerStart());
            ps.setBigDecimal(8, in.odometerEnd());
            return ps;
        }, kh);
        rememberInitials(userId, in.normalizedInitials());
        rememberProgram(userId, in.normalizedProgram());
        return kh.getKey().longValue();
    }

    @Transactional
    public boolean update(long userId, long id, EntryInput in, LocalDate date) {
        int n = jdbc.update("update mileage_entries set entry_date = ?, initials = ?, start_location = ?,"
                        + " end_location = ?, program = ?, odometer_start = ?, odometer_end = ? where id = ? and user_id = ?",
                date, in.normalizedInitials(), in.startLocation().trim(), in.endLocation().trim(), in.normalizedProgram(),
                in.odometerStart(), in.odometerEnd(), id, userId);
        if (n > 0) {
            rememberInitials(userId, in.normalizedInitials());
            rememberProgram(userId, in.normalizedProgram());
        }
        return n > 0;
    }

    public boolean delete(long userId, long id) {
        return jdbc.update("delete from mileage_entries where id = ? and user_id = ?", id, userId) > 0;
    }

    public List<String> initials(long userId) {
        return jdbc.queryForList("select initials from user_initials where user_id = ? order by initials",
                String.class, userId);
    }

    public void forgetInitials(long userId, String initials) {
        jdbc.update("delete from user_initials where user_id = ? and initials = ?", userId, initials);
    }

    public List<String> programs(long userId) {
        return jdbc.queryForList("select program from user_programs where user_id = ? order by lower(program)",
                String.class, userId);
    }

    /** Client (end location) -> the program it was most recently logged under. */
    public java.util.Map<String, String> clientPrograms(long userId) {
        var map = new java.util.LinkedHashMap<String, String>();
        jdbc.query("select end_location, program from mileage_entries where user_id = ? and program <> ''"
                        + " order by entry_date, id",
                rs -> { map.put(rs.getString(1), rs.getString(2)); }, userId);
        return map;
    }

    public void forgetProgram(long userId, String program) {
        jdbc.update("delete from user_programs where user_id = ? and program = ?", userId, program);
    }

    private void rememberProgram(long userId, String program) {
        if (program.isEmpty()) return;
        jdbc.update("merge into user_programs (user_id, program) key (user_id, program) values (?, ?)",
                userId, program);
    }

    private void rememberInitials(long userId, String initials) {
        jdbc.update("merge into user_initials (user_id, initials) key (user_id, initials) values (?, ?)",
                userId, initials);
    }
}
