package com.psybyagent.dreams.ai;

public record OllamaGenerateRequest(
    String model,
    String prompt,
    boolean stream,
    String format,
    boolean think
) {
}
