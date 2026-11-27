package com.mileageassist.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.event.EventListener;
import org.springframework.security.authentication.event.AuthenticationFailureBadCredentialsEvent;
import org.springframework.security.authentication.event.AuthenticationSuccessEvent;
import org.springframework.stereotype.Service;

/** Locks an email for 15 minutes after 5 failed password attempts (brute-force protection). */
@Service
public class LoginAttemptService {
    private static final int MAX_ATTEMPTS = 5;
    private static final Duration LOCK = Duration.ofMinutes(15);

    private record Attempts(int count, Instant since) {}

    private final ConcurrentHashMap<String, Attempts> attempts = new ConcurrentHashMap<>();

    @EventListener
    public void onFailure(AuthenticationFailureBadCredentialsEvent e) {
        String key = UserRepository.normalize(String.valueOf(e.getAuthentication().getPrincipal()));
        attempts.compute(key, (k, a) -> a == null || expired(a) ? new Attempts(1, Instant.now())
                : new Attempts(a.count() + 1, a.since()));
    }

    @EventListener
    public void onSuccess(AuthenticationSuccessEvent e) {
        attempts.remove(UserRepository.normalize(e.getAuthentication().getName()));
    }

    public boolean isLocked(String email) {
        Attempts a = attempts.get(UserRepository.normalize(email));
        if (a == null) return false;
        if (expired(a)) {
            attempts.remove(UserRepository.normalize(email));
            return false;
        }
        return a.count() >= MAX_ATTEMPTS;
    }

    private static boolean expired(Attempts a) {
        return a.since().plus(LOCK).isBefore(Instant.now());
    }
}
