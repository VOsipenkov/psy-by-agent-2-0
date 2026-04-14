package com.psybyagent.dreams.dream;

import com.fasterxml.jackson.annotation.JsonIgnore;
import org.springframework.util.StringUtils;

public record RecommendationDetails(
    String trigger,
    String microAction,
    String journalPrompt
) {
    @JsonIgnore
    public boolean isEmpty() {
        return !StringUtils.hasText(trigger)
            && !StringUtils.hasText(microAction)
            && !StringUtils.hasText(journalPrompt);
    }
}
