package com.psybyagent.dreams.dream;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DreamConversationRepository extends JpaRepository<DreamConversation, UUID> {

    List<DreamConversation> findByUserAccountIdOrderByUpdatedAtDesc(UUID userId);

    List<DreamConversation> findTop5ByUserAccountIdAndIdNotAndUpdatedAtAfterOrderByUpdatedAtDesc(
        UUID userId,
        UUID id,
        Instant updatedAt
    );

    Optional<DreamConversation> findByIdAndUserAccountId(UUID id, UUID userId);
}
