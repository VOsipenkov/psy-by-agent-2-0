package com.psybyagent.dreams.auth;

import com.psybyagent.dreams.dream.UserAccount;
import com.psybyagent.dreams.dream.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserAccountRepository userAccountRepository;

    @Transactional
    public LoginResponse login(LoginRequest request) {
        String username = request.username().trim();

        UserAccount userAccount = userAccountRepository.findByUsernameIgnoreCase(username)
            .orElseGet(() -> {
                UserAccount created = new UserAccount();
                created.setUsername(username);
                return userAccountRepository.save(created);
            });

        return new LoginResponse(userAccount.getId(), userAccount.getUsername());
    }
}
