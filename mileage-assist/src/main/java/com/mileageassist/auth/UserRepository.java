package com.mileageassist.auth;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    private static final RowMapper<AppUser> MAPPER = (rs, i) -> new AppUser(
            rs.getLong("id"), rs.getString("email"), rs.getString("first_name"), rs.getString("password_hash"));

    private final JdbcTemplate jdbc;

    public UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<AppUser> findByEmail(String email) {
        return jdbc.query("select * from app_users where email = ?", MAPPER, normalize(email)).stream().findFirst();
    }

    public boolean exists(String email) {
        Integer n = jdbc.queryForObject("select count(*) from app_users where email = ?", Integer.class, normalize(email));
        return n != null && n > 0;
    }

    public void create(String email, String firstName, String passwordHash) {
        jdbc.update("insert into app_users (email, first_name, password_hash) values (?, ?, ?)",
                normalize(email), firstName.trim(), passwordHash);
    }

    public static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
