package com.psybyagent.dreams.dream;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record DreamConversationSummaryResponse(
    UUID id,
    String title,
    String stage,
    List<String> keywords,
    Instant updatedAt
) {
}
