package com.psybyagent.dreams.telegram;

public record TelegramBotLinkRequest(
    Long chatId,
    String code,
    String telegramUsername,
    String firstName,
    String languageCode
) {
}
