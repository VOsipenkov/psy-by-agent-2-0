package com.psybyagent.dreams.dream;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendMessageRequest(
    @NotBlank(message = "Сообщение не должно быть пустым")
    @Size(max = 4000, message = "Сообщение слишком длинное")
    String content,

    String language
) {
}
