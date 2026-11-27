package com.mileageassist.auth;

public record AppUser(long id, String email, String firstName, String passwordHash) {}
