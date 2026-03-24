package com.psybyagent.dreams.dream;

import com.psybyagent.dreams.common.AuditableEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "dream_conversations")
public class DreamConversation extends AuditableEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserAccount userAccount;

    @Column(nullable = false, length = 120)
    private String title = "Новый сон";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private DreamStage stage = DreamStage.NEW;

    @Column(columnDefinition = "TEXT")
    private String interpretation;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "dream_keywords", joinColumns = @JoinColumn(name = "conversation_id"))
    @Column(name = "keyword", nullable = false, length = 64)
    @OrderColumn(name = "position_index")
    private List<String> keywords = new ArrayList<>();

    @OneToMany(mappedBy = "conversation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC")
    private List<DreamMessage> messages = new ArrayList<>();

    public void addMessage(DreamMessage message) {
        message.setConversation(this);
        messages.add(message);
        touch();
    }
}
