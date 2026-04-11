package com.psybyagent.dreams.telegram;

import java.util.UUID;

public record TelegramKeywordActionRequest(
    Long chatId,
    UUID conversationId,
    String telegramUsername,
    String firstName,
    String languageCode
) {
}
