package com.psybyagent.dreams.dream;

import java.util.ArrayList;
import java.util.List;
import org.springframework.util.StringUtils;

public final class RecommendationTextFormatter {

    private RecommendationTextFormatter() {
    }

    public static String toPlainText(RecommendationDetails recommendation) {
        if (recommendation == null || recommendation.isEmpty()) {
            return null;
        }

        List<String> parts = new ArrayList<>();
        addIfPresent(parts, recommendation.trigger());
        addIfPresent(parts, recommendation.microAction());
        addIfPresent(parts, recommendation.journalPrompt());
        return parts.isEmpty() ? null : String.join(" ", parts);
    }

    private static void addIfPresent(List<String> parts, String value) {
        if (StringUtils.hasText(value)) {
            parts.add(value.trim());
        }
    }
}
