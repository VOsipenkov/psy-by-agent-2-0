package com.psybyagent.dreams.dream;

import java.time.Instant;
import java.util.UUID;

public record DreamMessageResponse(
    UUID id,
    String role,
    String content,
    Instant createdAt
) {
}
