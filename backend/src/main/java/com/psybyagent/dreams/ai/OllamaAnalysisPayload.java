package com.psybyagent.dreams.ai;

import com.psybyagent.dreams.dream.RecommendationDetails;
import java.util.List;

public record OllamaAnalysisPayload(
    String stage,
    String assistantMessage,
    String title,
    List<String> keywords,
    String interpretation,
    RecommendationDetails recommendation
) {
}
