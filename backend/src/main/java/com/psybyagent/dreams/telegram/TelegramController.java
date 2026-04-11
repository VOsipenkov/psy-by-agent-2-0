package com.psybyagent.dreams.telegram;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/{userId}/telegram")
@RequiredArgsConstructor
public class TelegramController {

    private final TelegramLinkService telegramLinkService;

    @GetMapping
    public ResponseEntity<TelegramLinkStatusResponse> status(@PathVariable UUID userId) {
        return ResponseEntity.ok(telegramLinkService.getStatus(userId));
    }

    @PostMapping("/link-code")
    public ResponseEntity<TelegramLinkCodeResponse> issueLinkCode(@PathVariable UUID userId) {
        return ResponseEntity.ok(telegramLinkService.issueLinkCode(userId));
    }
}
