package com.psybyagent.dreams.ai;

import java.util.List;

public record OllamaAnalysisPayload(
    String stage,
    String assistantMessage,
    String title,
    List<String> keywords,
    String interpretation,
    String recommendation
) {
}
