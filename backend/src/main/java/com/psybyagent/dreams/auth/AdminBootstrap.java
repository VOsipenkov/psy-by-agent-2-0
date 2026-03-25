package com.psybyagent.dreams.auth;

import com.psybyagent.dreams.dream.UserAccount;
import com.psybyagent.dreams.dream.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class AdminBootstrap implements ApplicationRunner {

    private final UserAccountRepository userAccountRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        UserAccount admin = userAccountRepository.findByUsernameIgnoreCase("admin")
            .orElseGet(UserAccount::new);

        admin.setUsername("admin");

        if (admin.getPasswordHash() == null || !passwordEncoder.matches("admin", admin.getPasswordHash())) {
            admin.setPasswordHash(passwordEncoder.encode("admin"));
        }

        userAccountRepository.save(admin);
    }
}
