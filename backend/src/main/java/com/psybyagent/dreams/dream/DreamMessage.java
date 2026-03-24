package com.psybyagent.dreams.dream;

import com.psybyagent.dreams.common.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "dream_messages")
public class DreamMessage extends AuditableEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id", nullable = false)
    private DreamConversation conversation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ChatRole role;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    public static DreamMessage assistant(String content) {
        DreamMessage message = new DreamMessage();
        message.setRole(ChatRole.ASSISTANT);
        message.setContent(content);
        return message;
    }

    public static DreamMessage user(String content) {
        DreamMessage message = new DreamMessage();
        message.setRole(ChatRole.USER);
        message.setContent(content);
        return message;
    }
}
