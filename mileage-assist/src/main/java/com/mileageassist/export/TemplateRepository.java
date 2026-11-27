package com.mileageassist.export;

import java.time.LocalDateTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TemplateRepository {
    public record StoredTemplate(String fileName, byte[] content, LocalDateTime uploadedAt) {}

    private final JdbcTemplate jdbc;

    public TemplateRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public StoredTemplate find(long userId) {
        return jdbc.query("select file_name, content, uploaded_at from user_templates where user_id = ?",
                (rs, i) -> new StoredTemplate(rs.getString(1), rs.getBytes(2),
                        rs.getObject(3, LocalDateTime.class)), userId).stream().findFirst().orElse(null);
    }

    public void save(long userId, String fileName, byte[] content) {
        jdbc.update("merge into user_templates (user_id, file_name, content, uploaded_at) key (user_id)"
                + " values (?, ?, ?, current_timestamp)", userId, fileName, content);
    }

    public void delete(long userId) {
        jdbc.update("delete from user_templates where user_id = ?", userId);
    }
}
