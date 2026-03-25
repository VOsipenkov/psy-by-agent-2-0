package com.psybyagent.dreams.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
    @NotBlank(message = "Логин обязателен")
    @Size(min = 3, max = 40, message = "Логин должен быть длиной от 3 до 40 символов")
    String username,

    @NotBlank(message = "Пароль обязателен")
    @Size(min = 3, max = 100, message = "Пароль должен быть длиной от 3 до 100 символов")
    String password
) {
}
