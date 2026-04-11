package com.psybyagent.dreams.telegram;

import java.time.Instant;

public record TelegramLinkCodeResponse(
    boolean available,
    String botUsername,
    String botLink,
    String code,
    Instant expiresAt,
    String startLink
) {
}
