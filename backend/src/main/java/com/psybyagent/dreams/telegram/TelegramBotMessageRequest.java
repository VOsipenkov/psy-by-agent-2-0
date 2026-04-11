package com.psybyagent.dreams.telegram;

public record TelegramBotMessageRequest(
    Long chatId,
    String text,
    String telegramUsername,
    String firstName,
    String languageCode
) {
}
