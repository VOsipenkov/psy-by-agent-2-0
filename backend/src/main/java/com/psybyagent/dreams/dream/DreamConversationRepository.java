package com.psybyagent.dreams.dream;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DreamConversationRepository extends JpaRepository<DreamConversation, UUID> {

    List<DreamConversation> findByUserAccountIdOrderByUpdatedAtDesc(UUID userId);

    Optional<DreamConversation> findByIdAndUserAccountId(UUID id, UUID userId);
}
