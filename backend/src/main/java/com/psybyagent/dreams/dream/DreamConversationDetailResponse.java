package com.psybyagent.dreams.dream;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record DreamConversationDetailResponse(
    UUID id,
    String title,
    String stage,
    String interpretation,
    String recommendation,
    RecommendationDetails recommendationDetails,
    List<String> keywords,
    List<DreamMessageResponse> messages,
    Instant updatedAt
) {
}
