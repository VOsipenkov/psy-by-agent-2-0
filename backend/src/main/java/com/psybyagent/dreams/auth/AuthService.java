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
        String username = request.username().trim();
        String password = request.password().trim();

        UserAccount userAccount = userAccountRepository.findByUsernameIgnoreCase(username)
            .map(existing -> loginExistingUser(existing, password))
            .orElseGet(() -> registerUser(username, password));

        return new LoginResponse(userAccount.getId(), userAccount.getUsername());
    }

    private UserAccount loginExistingUser(UserAccount userAccount, String password) {
        if (userAccount.getPasswordHash() == null || userAccount.getPasswordHash().isBlank()) {
            userAccount.setPasswordHash(passwordEncoder.encode(password));
            return userAccountRepository.save(userAccount);
        }

        if (!passwordEncoder.matches(password, userAccount.getPasswordHash())) {
            throw new IllegalArgumentException("Неверный логин или пароль");
        }

        return userAccount;
    }

    private UserAccount registerUser(String username, String password) {
        UserAccount created = new UserAccount();
        created.setUsername(username);
        created.setPasswordHash(passwordEncoder.encode(password));
        return userAccountRepository.save(created);
    }
}
