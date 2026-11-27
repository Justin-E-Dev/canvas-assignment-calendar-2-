package com.mileageassist.auth;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AppUserDetailsService implements UserDetailsService {
    private final UserRepository users;
    private final LoginAttemptService attempts;

    public AppUserDetailsService(UserRepository users, LoginAttemptService attempts) {
        this.users = users;
        this.attempts = attempts;
    }

    @Override
    public UserDetails loadUserByUsername(String email) {
        AppUser u = users.findByEmail(email).orElseThrow(() -> new UsernameNotFoundException("not found"));
        return User.withUsername(u.email())
                .password(u.passwordHash())
                .roles("USER")
                .accountLocked(attempts.isLocked(u.email()))
                .build();
    }
}
