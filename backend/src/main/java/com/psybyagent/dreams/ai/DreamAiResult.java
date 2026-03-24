package com.psybyagent.dreams.ai;

import com.psybyagent.dreams.dream.DreamStage;
import java.util.List;

public record DreamAiResult(
    DreamStage stage,
    String assistantMessage,
    String title,
    List<String> keywords,
    String interpretation
) {
}
