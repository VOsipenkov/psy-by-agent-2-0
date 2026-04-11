package com.psybyagent.dreams.telegram;

import java.util.List;
import java.util.UUID;

public record TelegramBotReplyResponse(
    String message,
    boolean linked,
    boolean linkRequired,
    String dreamTitle,
    String stage,
    List<String> emotionOptions,
    List<String> selectedEmotions,
    List<String> keywords,
    List<String> selectedKeywords,
    UUID conversationId
) {
}
