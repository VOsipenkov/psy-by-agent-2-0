package com.psybyagent.dreams.auth;

import com.psybyagent.dreams.dream.UserAccount;
import com.psybyagent.dreams.dream.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserAccountRepository userAccountRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public LoginResponse login(LoginRequest request) {
        String username = normalizeUsername(request.username());
        String password = request.password().trim();

        UserAccount userAccount = userAccountRepository.findByUsernameIgnoreCase(username)
            .map(existing -> loginExistingUser(existing, password))
            .orElseThrow(() -> new IllegalArgumentException("ѕользователь с таким логином не найден"));

        return toLoginResponse(userAccount);
    }

    @Transactional
    public LoginResponse register(RegisterRequest request) {
        String username = normalizeUsername(request.username());
        String password = request.password().trim();
        String email = normalizeEmail(request.email());

        if (userAccountRepository.findByUsernameIgnoreCase(username).isPresent()) {
            throw new IllegalArgumentException("ѕользователь с таким логином уже существует");
        }

        UserAccount userAccount = registerUser(username, password, email);
        return toLoginResponse(userAccount);
    }

    private UserAccount loginExistingUser(UserAccount userAccount, String password) {
        if (userAccount.getPasswordHash() == null || userAccount.getPasswordHash().isBlank()) {
            userAccount.setPasswordHash(passwordEncoder.encode(password));
            return userAccountRepository.save(userAccount);
        }

        if (!passwordEncoder.matches(password, userAccount.getPasswordHash())) {
            throw new IllegalArgumentException("Ќеверный логин или пароль");
        }

        return userAccount;
    }

    private UserAccount registerUser(String username, String password, String email) {
        UserAccount created = new UserAccount();
        created.setUsername(username);
        created.setEmail(email);
        created.setPasswordHash(passwordEncoder.encode(password));
        return userAccountRepository.save(created);
    }

    private String normalizeUsername(String rawUsername) {
        return rawUsername == null ? "" : rawUsername.trim();
    }

    private String normalizeEmail(String rawEmail) {
        if (rawEmail == null) {
            return null;
        }

        String normalizedEmail = rawEmail.trim().toLowerCase();
        return normalizedEmail.isEmpty() ? null : normalizedEmail;
    }

    private LoginResponse toLoginResponse(UserAccount userAccount) {
        return new LoginResponse(userAccount.getId(), userAccount.getUsername(), userAccount.getEmail());
    }
}
