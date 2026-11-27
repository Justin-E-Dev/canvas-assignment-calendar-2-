package com.mileageassist.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.webauthn.management.JdbcPublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.JdbcUserCredentialRepository;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String CSP = String.join("; ",
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "frame-ancestors 'none'",
            "form-action 'self'");

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            @Value("${ma.webauthn.rp-id}") String rpId,
                                            @Value("${ma.webauthn.allowed-origins}") Set<String> origins) throws Exception {
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null);

        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login.html", "/css/**", "/img/**", "/js/auth.js", "/js/webauthn.js",
                        "/js/common.js", "/manifest.webmanifest", "/favicon.ico", "/error").permitAll()
                .requestMatchers("/api/auth/signup", "/api/auth/csrf").permitAll()
                .requestMatchers("/webauthn/authenticate/options", "/login/webauthn").permitAll()
                .anyRequest().authenticated())
            .csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(csrfHandler))
            .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
            .formLogin(form -> form
                .loginPage("/login.html")
                .loginProcessingUrl("/login")
                .usernameParameter("email")
                .passwordParameter("password")
                .successHandler((req, res, a) -> json(res, HttpStatus.OK, "{\"ok\":true}"))
                .failureHandler((req, res, ex) -> json(res, HttpStatus.UNAUTHORIZED,
                        ex instanceof LockedException
                                ? "{\"error\":\"Too many failed attempts. Try again in 15 minutes.\"}"
                                : "{\"error\":\"Incorrect email or password.\"}"))
                .permitAll())
            .webAuthn(webAuthn -> webAuthn
                .rpName("Mileage Assist")
                .rpId(rpId)
                .allowedOrigins(origins)
                .disableDefaultRegistrationPage(true))
            .logout(logout -> logout
                .logoutUrl("/logout")
                .deleteCookies("MASESSION")
                .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.OK)))
            .exceptionHandling(ex -> ex
                .defaultAuthenticationEntryPointFor(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
                        new AntPathRequestMatcher("/api/**"))
                .defaultAuthenticationEntryPointFor(new LoginUrlAuthenticationEntryPoint("/login.html"),
                        new AntPathRequestMatcher("/**")))
            .sessionManagement(s -> s.sessionFixation(f -> f.changeSessionId()).maximumSessions(5))
            .headers(h -> h
                .contentSecurityPolicy(csp -> csp.policyDirectives(CSP))
                .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                .frameOptions(f -> f.deny())
                .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000)));
        return http.build();
    }

    private static void json(HttpServletResponse res, HttpStatus status, String body) throws IOException {
        res.setStatus(status.value());
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        res.getWriter().write(body);
    }

    /** Argon2id: memory-hard password hashing (OWASP recommended). */
    @Bean
    PasswordEncoder passwordEncoder() {
        return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    PublicKeyCredentialUserEntityRepository userEntityRepository(DataSource dataSource) {
        return new JdbcPublicKeyCredentialUserEntityRepository(new JdbcTemplate(dataSource));
    }

    @Bean
    UserCredentialRepository userCredentialRepository(DataSource dataSource) {
        return new JdbcUserCredentialRepository(new JdbcTemplate(dataSource));
    }

    /** Makes sure the XSRF-TOKEN cookie is always issued so the static pages can read it. */
    static final class CsrfCookieFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
            if (token != null) {
                token.getToken();
            }
            chain.doFilter(request, response);
        }
    }
}
