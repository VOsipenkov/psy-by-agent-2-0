package com.psybyagent.dreams.telegram;

public record TelegramBotChatRequest(
    Long chatId,
    String telegramUsername,
    String firstName,
    String languageCode
) {
}
