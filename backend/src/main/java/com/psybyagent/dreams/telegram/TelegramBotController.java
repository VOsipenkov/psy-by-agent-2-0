package com.psybyagent.dreams.telegram;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/internal/telegram")
@RequiredArgsConstructor
public class TelegramBotController {

    private static final String SECRET_HEADER = "X-Telegram-Bot-Secret";

    private final TelegramLinkService telegramLinkService;

    @PostMapping("/link")
    public ResponseEntity<TelegramBotReplyResponse> link(
        @RequestHeader(name = SECRET_HEADER, required = false) String secret,
        @RequestBody TelegramBotLinkRequest request
    ) {
        telegramLinkService.ensureBotSecret(secret);
        return ResponseEntity.ok(telegramLinkService.linkChat(request));
    }

    @PostMapping("/message")
    public ResponseEntity<TelegramBotReplyResponse> message(
        @RequestHeader(name = SECRET_HEADER, required = false) String secret,
        @RequestBody TelegramBotMessageRequest request
    ) {
        telegramLinkService.ensureBotSecret(secret);
        return ResponseEntity.ok(telegramLinkService.handleMessage(request));
    }

    @PostMapping("/new-dream")
    public ResponseEntity<TelegramBotReplyResponse> newDream(
        @RequestHeader(name = SECRET_HEADER, required = false) String secret,
        @RequestBody TelegramBotChatRequest request
    ) {
        telegramLinkService.ensureBotSecret(secret);
        return ResponseEntity.ok(telegramLinkService.startNewDream(request));
    }

    @PostMapping("/unlink")
    public ResponseEntity<TelegramBotReplyResponse> unlink(
        @RequestHeader(name = SECRET_HEADER, required = false) String secret,
        @RequestBody TelegramBotChatRequest request
    ) {
        telegramLinkService.ensureBotSecret(secret);
        return ResponseEntity.ok(telegramLinkService.unlinkChat(request));
    }

    @PostMapping("/emotion-selection/toggle")
    public ResponseEntity<TelegramBotReplyResponse> toggleEmotionSelection(
        @RequestHeader(name = SECRET_HEADER, required = false) String secret,
        @RequestBody TelegramEmotionToggleRequest request
    ) {
        telegramLinkService.ensureBotSecret(secret);
        return ResponseEntity.ok(telegramLinkService.toggleEmotionSelection(request));
    }

    @PostMapping("/emotion-selection/submit")
    public ResponseEntity<TelegramBotReplyResponse> submitEmotionSelection(
        @RequestHeader(name = SECRET_HEADER, required = false) String secret,
        @RequestBody TelegramKeywordActionRequest request
    ) {
        telegramLinkService.ensureBotSecret(secret);
        return ResponseEntity.ok(telegramLinkService.submitEmotionSelection(request));
    }

    @PostMapping("/emotion-selection/reset")
    public ResponseEntity<TelegramBotReplyResponse> resetEmotionSelection(
        @RequestHeader(name = SECRET_HEADER, required = false) String secret,
        @RequestBody TelegramKeywordActionRequest request
    ) {
        telegramLinkService.ensureBotSecret(secret);
        return ResponseEntity.ok(telegramLinkService.resetEmotionSelection(request));
    }

    @PostMapping("/keyword-selection/toggle")
    public ResponseEntity<TelegramBotReplyResponse> toggleKeywordSelection(
        @RequestHeader(name = SECRET_HEADER, required = false) String secret,
        @RequestBody TelegramKeywordToggleRequest request
    ) {
        telegramLinkService.ensureBotSecret(secret);
        return ResponseEntity.ok(telegramLinkService.toggleKeywordSelection(request));
    }

    @PostMapping("/keyword-selection/submit")
    public ResponseEntity<TelegramBotReplyResponse> submitKeywordSelection(
        @RequestHeader(name = SECRET_HEADER, required = false) String secret,
        @RequestBody TelegramKeywordActionRequest request
    ) {
        telegramLinkService.ensureBotSecret(secret);
        return ResponseEntity.ok(telegramLinkService.submitKeywordSelection(request));
    }

    @PostMapping("/keyword-selection/reset")
    public ResponseEntity<TelegramBotReplyResponse> resetKeywordSelection(
        @RequestHeader(name = SECRET_HEADER, required = false) String secret,
        @RequestBody TelegramKeywordActionRequest request
    ) {
        telegramLinkService.ensureBotSecret(secret);
        return ResponseEntity.ok(telegramLinkService.resetKeywordSelection(request));
    }
}
