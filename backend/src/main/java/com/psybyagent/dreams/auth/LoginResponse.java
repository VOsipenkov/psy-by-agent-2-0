package com.psybyagent.dreams.auth;

import java.util.UUID;

public record LoginResponse(
    UUID id,
    String username,
    String email
) {
}
