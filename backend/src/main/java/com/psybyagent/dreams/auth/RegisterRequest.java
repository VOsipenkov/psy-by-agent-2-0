package com.psybyagent.dreams.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
    @NotBlank(message = "Логин обязателен")
    @Size(min = 3, max = 40, message = "Логин должен быть длиной от 3 до 40 символов")
    String username,

    @NotBlank(message = "Пароль обязателен")
    @Size(min = 3, max = 100, message = "Пароль должен быть длиной от 3 до 100 символов")
    String password,

    @Email(message = "Укажите корректный email")
    @Size(max = 160, message = "Email должен быть не длиннее 160 символов")
    String email
) {
}
