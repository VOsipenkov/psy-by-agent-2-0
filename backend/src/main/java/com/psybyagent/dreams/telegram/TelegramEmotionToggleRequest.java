package com.psybyagent.dreams.telegram;

import java.util.UUID;

public record TelegramEmotionToggleRequest(
    Long chatId,
    UUID conversationId,
    Integer emotionIndex,
    String telegramUsername,
    String firstName,
    String languageCode
) {
}
