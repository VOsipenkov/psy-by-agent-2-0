package com.psybyagent.dreams.dream;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserAccountRepository extends JpaRepository<UserAccount, java.util.UUID> {

    Optional<UserAccount> findByUsernameIgnoreCase(String username);
}
