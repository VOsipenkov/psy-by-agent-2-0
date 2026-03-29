package com.psybyagent.dreams.dream;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/{userId}/dreams")
@RequiredArgsConstructor
public class DreamConversationController {

    private final DreamConversationService dreamConversationService;

    @GetMapping
    public ResponseEntity<List<DreamConversationSummaryResponse>> list(@PathVariable UUID userId) {
        return ResponseEntity.ok(dreamConversationService.listForUser(userId));
    }

    @PostMapping
    public ResponseEntity<DreamConversationDetailResponse> create(
        @PathVariable UUID userId,
        @RequestBody(required = false) CreateConversationRequest request
    ) {
        return ResponseEntity.ok(dreamConversationService.createConversation(userId, request));
    }

    @GetMapping("/{dreamId}")
    public ResponseEntity<DreamConversationDetailResponse> get(
        @PathVariable UUID userId,
        @PathVariable UUID dreamId
    ) {
        return ResponseEntity.ok(dreamConversationService.getConversation(userId, dreamId));
    }

    @PostMapping("/{dreamId}/messages")
    public ResponseEntity<DreamConversationDetailResponse> addMessage(
        @PathVariable UUID userId,
        @PathVariable UUID dreamId,
        @Valid @RequestBody SendMessageRequest request
    ) {
        return ResponseEntity.ok(dreamConversationService.addUserMessage(userId, dreamId, request));
    }

    @DeleteMapping("/{dreamId}")
    public ResponseEntity<Void> delete(@PathVariable UUID userId, @PathVariable UUID dreamId) {
        dreamConversationService.deleteConversation(userId, dreamId);
        return ResponseEntity.noContent().build();
    }
}
