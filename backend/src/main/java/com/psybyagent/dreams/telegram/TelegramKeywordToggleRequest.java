package com.psybyagent.dreams.telegram;

import java.util.UUID;

public record TelegramKeywordToggleRequest(
    Long chatId,
    UUID conversationId,
    Integer keywordIndex,
    String telegramUsername,
    String firstName,
    String languageCode
) {
}
