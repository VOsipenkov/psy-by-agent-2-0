package com.psybyagent.dreams.dream;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserAccountRepository extends JpaRepository<UserAccount, java.util.UUID> {

    Optional<UserAccount> findByUsernameIgnoreCase(String username);

    Optional<UserAccount> findByTelegramChatId(Long telegramChatId);

    Optional<UserAccount> findByTelegramLinkCodeIgnoreCase(String telegramLinkCode);

    @Modifying(flushAutomatically = true)
    @Query("""
        update UserAccount user
        set user.telegramChatId = null,
            user.telegramUsername = null,
            user.telegramLinkCode = null,
            user.telegramLinkCodeExpiresAt = null,
            user.telegramLinkedAt = null,
            user.telegramActiveConversationId = null,
            user.telegramEmotionSelectionConversationId = null,
            user.telegramSelectedEmotions = null,
            user.telegramKeywordSelectionConversationId = null,
            user.telegramSelectedKeywords = null,
            user.telegramLanguage = null
        where user.id = :userId
        """)
    int clearTelegramBindingById(@Param("userId") UUID userId);
}
