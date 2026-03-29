package com.psybyagent.dreams.dream;

import com.psybyagent.dreams.ai.DreamAiResult;
import com.psybyagent.dreams.ai.DreamAiService;
import com.psybyagent.dreams.common.NotFoundException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DreamConversationService {

    private final UserAccountRepository userAccountRepository;
    private final DreamConversationRepository dreamConversationRepository;
    private final DreamAiService dreamAiService;

    @Transactional(readOnly = true)
    public List<DreamConversationSummaryResponse> listForUser(UUID userId) {
        ensureUserExists(userId);

        return dreamConversationRepository.findByUserAccountIdOrderByUpdatedAtDesc(userId)
            .stream()
            .map(this::toSummary)
            .toList();
    }

    @Transactional
    public DreamConversationDetailResponse createConversation(UUID userId, CreateConversationRequest request) {
        UserAccount userAccount = ensureUserExists(userId);
        String language = normalizeLanguage(request == null ? null : request.language());

        DreamConversation conversation = new DreamConversation();
        conversation.setUserAccount(userAccount);
        conversation.setTitle(defaultTitle(language));
        conversation.setStage(DreamStage.NEW);
        conversation.addMessage(DreamMessage.assistant(welcomeMessage(language)));

        DreamConversation saved = dreamConversationRepository.saveAndFlush(conversation);
        return toDetail(saved);
    }

    @Transactional(readOnly = true)
    public DreamConversationDetailResponse getConversation(UUID userId, UUID dreamId) {
        return toDetail(getConversationEntity(userId, dreamId));
    }

    @Transactional
    public DreamConversationDetailResponse addUserMessage(UUID userId, UUID dreamId, SendMessageRequest request) {
        DreamConversation conversation = getConversationEntity(userId, dreamId);
        String language = normalizeLanguage(request.language());
        conversation.addMessage(DreamMessage.user(request.content().trim()));
        conversation.setStage(conversation.getStage() == DreamStage.NEW ? DreamStage.CLARIFYING : conversation.getStage());
        conversation = dreamConversationRepository.saveAndFlush(conversation);

        List<DreamConversation> recentDreams = findRecentDreamsForAnalysis(conversation);
        DreamAiResult aiResult = dreamAiService.generateReply(conversation, recentDreams, language);

        if (aiResult.stage() == DreamStage.INTERPRETED) {
            conversation.setStage(DreamStage.INTERPRETED);
            conversation.setInterpretation(aiResult.interpretation());
            conversation.setTitle(aiResult.title());
            conversation.getKeywords().clear();
            conversation.getKeywords().addAll(aiResult.keywords());
        } else {
            conversation.setStage(DreamStage.CLARIFYING);
        }

        conversation.addMessage(DreamMessage.assistant(aiResult.assistantMessage()));
        DreamConversation saved = dreamConversationRepository.saveAndFlush(conversation);
        return toDetail(saved);
    }

    private String normalizeLanguage(String language) {
        return "en".equalsIgnoreCase(language) ? "en" : "ru";
    }

    private String welcomeMessage(String language) {
        return "en".equals(language)
            ? "Describe your dream in as much detail as you can. I will ask a couple of focused questions, identify the key motifs, and offer an interpretation."
            : "Опишите свой сон как можно подробнее. Я задам пару уточняющих вопросов, выделю ключевые символы и предложу интерпретацию.";
    }

    private String defaultTitle(String language) {
        return "en".equals(language) ? "New dream" : "Новый сон";
    }

    private List<DreamConversation> findRecentDreamsForAnalysis(DreamConversation conversation) {
        Instant recentThreshold = Instant.now().minus(7, ChronoUnit.DAYS);

        return dreamConversationRepository.findTop5ByUserAccountIdAndIdNotAndUpdatedAtAfterOrderByUpdatedAtDesc(
            conversation.getUserAccount().getId(),
            conversation.getId(),
            recentThreshold
        );
    }

    @Transactional
    public void deleteConversation(UUID userId, UUID dreamId) {
        DreamConversation conversation = getConversationEntity(userId, dreamId);
        dreamConversationRepository.delete(conversation);
    }

    private UserAccount ensureUserExists(UUID userId) {
        return userAccountRepository.findById(userId)
            .orElseThrow(() -> new NotFoundException("Пользователь не найден"));
    }

    private DreamConversation getConversationEntity(UUID userId, UUID dreamId) {
        return dreamConversationRepository.findByIdAndUserAccountId(dreamId, userId)
            .orElseThrow(() -> new NotFoundException("Сон не найден"));
    }

    private DreamConversationSummaryResponse toSummary(DreamConversation conversation) {
        return new DreamConversationSummaryResponse(
            conversation.getId(),
            conversation.getTitle(),
            conversation.getStage().name(),
            List.copyOf(conversation.getKeywords()),
            conversation.getUpdatedAt()
        );
    }

    private DreamConversationDetailResponse toDetail(DreamConversation conversation) {
        List<DreamMessageResponse> messages = conversation.getMessages().stream()
            .sorted(Comparator.comparing(DreamMessage::getCreatedAt))
            .map(message -> new DreamMessageResponse(
                message.getId(),
                message.getRole().name(),
                message.getContent(),
                message.getCreatedAt()
            ))
            .toList();

        return new DreamConversationDetailResponse(
            conversation.getId(),
            conversation.getTitle(),
            conversation.getStage().name(),
            conversation.getInterpretation(),
            List.copyOf(conversation.getKeywords()),
            messages,
            conversation.getUpdatedAt()
        );
    }
}

