package com.mileageassist.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.security.Principal;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.webauthn.management.PublicKeyCredentialUserEntityRepository;
import org.springframework.security.web.webauthn.management.UserCredentialRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {

    public record SignupRequest(
            @NotBlank @Email @Size(max = 100) String email,
            @NotBlank @Size(max = 80) String firstName,
            @NotBlank @Size(min = 12, max = 128) String password) {}

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AppUserDetailsService userDetails;
    private final SecurityContextRepository contextRepository;
    private final PublicKeyCredentialUserEntityRepository userEntities;
    private final UserCredentialRepository credentials;

    public AuthController(UserRepository users, PasswordEncoder encoder, AppUserDetailsService userDetails,
                          SecurityContextRepository contextRepository,
                          PublicKeyCredentialUserEntityRepository userEntities,
                          UserCredentialRepository credentials) {
        this.users = users;
        this.encoder = encoder;
        this.userDetails = userDetails;
        this.contextRepository = contextRepository;
        this.userEntities = userEntities;
        this.credentials = credentials;
    }

    /** Touching the token makes Spring issue the XSRF-TOKEN cookie. */
    @GetMapping("/auth/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("headerName", token.getHeaderName());
    }

    @PostMapping("/auth/signup")
    public ResponseEntity<?> signup(@Valid @RequestBody SignupRequest body,
                                    HttpServletRequest request, HttpServletResponse response) {
        if (users.exists(body.email())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "An account with that email already exists."));
        }
        users.create(body.email(), body.firstName(), encoder.encode(body.password()));

        // Sign the new user in straight away.
        UserDetails details = userDetails.loadUserByUsername(body.email());
        var auth = UsernamePasswordAuthenticationToken.authenticated(details, null, details.getAuthorities());
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(auth);
        SecurityContextHolder.setContext(ctx);
        contextRepository.saveContext(ctx, request, response);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/me")
    public Map<String, Object> me(Principal principal) {
        AppUser u = users.findByEmail(principal.getName()).orElseThrow();
        var entity = userEntities.findByUsername(u.email());
        int passkeys = entity == null ? 0 : credentials.findByUserId(entity.getId()).size();
        return Map.of("email", u.email(), "firstName", u.firstName(), "passkeys", passkeys);
    }
}
