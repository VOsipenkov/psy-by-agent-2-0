package com.psybyagent.dreams.telegram;

import java.time.Instant;

public record TelegramLinkStatusResponse(
    boolean available,
    boolean linked,
    String botUsername,
    String botLink,
    String telegramUsername,
    String linkCode,
    Instant linkCodeExpiresAt,
    String startLink
) {
}
