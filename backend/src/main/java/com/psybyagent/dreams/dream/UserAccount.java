package com.psybyagent.dreams.dream;

import com.psybyagent.dreams.common.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "users")
public class UserAccount extends AuditableEntity {

    @Column(nullable = false, unique = true, length = 40)
    private String username;

    @Column(length = 160)
    private String email;

    @Column(length = 100)
    private String passwordHash;

    @Column(unique = true)
    private Long telegramChatId;

    @Column(length = 100)
    private String telegramUsername;

    @Column(length = 20)
    private String telegramLinkCode;

    private Instant telegramLinkCodeExpiresAt;

    private Instant telegramLinkedAt;

    private UUID telegramActiveConversationId;

    private UUID telegramEmotionSelectionConversationId;

    @Column(columnDefinition = "text")
    private String telegramSelectedEmotions;

    private UUID telegramKeywordSelectionConversationId;

    @Column(columnDefinition = "text")
    private String telegramSelectedKeywords;

    @Column(length = 8)
    private String telegramLanguage;

    @Column(nullable = false)
    private boolean telegramAutoCreated;
}
