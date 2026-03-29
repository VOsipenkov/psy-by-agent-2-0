package com.psybyagent.dreams.dream;

import com.psybyagent.dreams.ai.DreamAiResult;
import com.psybyagent.dreams.ai.DreamAiService;
import com.psybyagent.dreams.common.NotFoundException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class DreamConversationService {

    private static final Pattern TOKEN_SPLIT_PATTERN = Pattern.compile("[^\\p{L}\\p{N}-]+");
    private static final Set<String> STOP_WORDS = Set.of(
        "и", "в", "во", "на", "не", "но", "что", "это", "этот", "эта", "эти", "меня", "мне",
        "была", "были", "было", "будто", "как", "когда", "потом", "после", "уже", "очень",
        "там", "тут", "свой", "своего", "своей", "свою", "свои", "того", "если", "или",
        "для", "под", "над", "при", "про", "which", "with", "from", "into", "that",
        "this", "were", "when", "where", "about", "have", "felt", "during"
    );

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

        return toDetail(dreamConversationRepository.saveAndFlush(conversation));
    }

    @Transactional(readOnly = true)
    public DreamConversationDetailResponse getConversation(UUID userId, UUID dreamId) {
        return toDetail(getConversationEntity(userId, dreamId));
    }

    @Transactional
    public DreamConversationDetailResponse addUserMessage(UUID userId, UUID dreamId, SendMessageRequest request) {
        DreamConversation conversation = getConversationEntity(userId, dreamId);
        String language = normalizeLanguage(request.language());
        String content = request.content().trim();

        conversation.addMessage(DreamMessage.user(content));

        DreamConversation updatedConversation = switch (conversation.getStage()) {
            case NEW -> handleDreamDescriptionStep(conversation, language);
            case CLARIFYING, COLLECTING_EMOTIONS -> handleEmotionStep(conversation, language);
            case SELECTING_KEYWORDS -> handleKeywordSelectionStep(conversation, language, content);
            case INTERPRETED -> handleInterpretationRefresh(conversation, language);
        };

        return toDetail(updatedConversation);
    }

    @Transactional
    public void deleteConversation(UUID userId, UUID dreamId) {
        DreamConversation conversation = getConversationEntity(userId, dreamId);
        dreamConversationRepository.delete(conversation);
    }

    private DreamConversation handleDreamDescriptionStep(DreamConversation conversation, String language) {
        List<String> keywordCandidates = buildKeywordCandidates(extractPrimaryDreamDescription(conversation), language);

        conversation.setStage(DreamStage.COLLECTING_EMOTIONS);
        conversation.setInterpretation(null);
        conversation.getKeywords().clear();
        conversation.getKeywords().addAll(keywordCandidates);
        conversation.addMessage(DreamMessage.assistant(emotionPrompt(language)));
        return conversation;
    }

    private DreamConversation handleEmotionStep(DreamConversation conversation, String language) {
        if (conversation.getKeywords().isEmpty()) {
            conversation.getKeywords().addAll(buildKeywordCandidates(extractPrimaryDreamDescription(conversation), language));
        }

        conversation.setStage(DreamStage.SELECTING_KEYWORDS);
        conversation.addMessage(DreamMessage.assistant(keywordSelectionPrompt(language)));
        return conversation;
    }

    private DreamConversation handleKeywordSelectionStep(DreamConversation conversation, String language, String content) {
        List<String> selectedKeywords = parseSelectedKeywords(content, conversation.getKeywords());
        if (selectedKeywords.isEmpty()) {
            conversation.addMessage(DreamMessage.assistant(keywordSelectionRetryPrompt(language)));
            return conversation;
        }

        List<DreamConversation> recentDreams = findRecentDreamsForAnalysis(conversation);
        DreamAiResult aiResult = dreamAiService.generateReply(conversation, recentDreams, language);

        if (aiResult.stage() == DreamStage.INTERPRETED) {
            conversation.setStage(DreamStage.INTERPRETED);
            conversation.setInterpretation(aiResult.interpretation());
            conversation.setTitle(aiResult.title());
            conversation.getKeywords().clear();
            conversation.getKeywords().addAll(aiResult.keywords().isEmpty() ? selectedKeywords : aiResult.keywords());
        } else {
            conversation.setStage(DreamStage.SELECTING_KEYWORDS);
        }

        conversation.addMessage(DreamMessage.assistant(aiResult.assistantMessage()));
        return conversation;
    }

    private DreamConversation handleInterpretationRefresh(DreamConversation conversation, String language) {
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
        return conversation;
    }

    private List<DreamConversation> findRecentDreamsForAnalysis(DreamConversation conversation) {
        Instant recentThreshold = Instant.now().minus(7, ChronoUnit.DAYS);

        return dreamConversationRepository.findTop5ByUserAccountIdAndIdNotAndUpdatedAtAfterOrderByUpdatedAtDesc(
            conversation.getUserAccount().getId(),
            conversation.getId(),
            recentThreshold
        );
    }

    private List<String> buildKeywordCandidates(String dreamText, String language) {
        String normalizedLanguage = normalizeLanguage(language);
        String lowered = firstNonBlank(dreamText).toLowerCase(Locale.ROOT);
        LinkedHashSet<String> candidates = new LinkedHashSet<>();

        addCandidateIfMatches(candidates, lowered, keywordLabel("school", normalizedLanguage),
            "школ", "урок", "учител", "класс", "литератур", "математ", "school", "teacher", "lesson", "class");
        addCandidateIfMatches(candidates, lowered, keywordLabel("teacher", normalizedLanguage), "учител", "teacher");
        addCandidateIfMatches(candidates, lowered, keywordLabel("father", normalizedLanguage), "отец", "отца", "отцом", "пап", "father", "dad");
        addCandidateIfMatches(candidates, lowered, keywordLabel("former partner", normalizedLanguage),
            "бывш", "девушк", "partner", "former partner", "ex");
        addCandidateIfMatches(candidates, lowered, keywordLabel("shame", normalizedLanguage), "стыд", "неловк", "shame", "ashamed");
        addCandidateIfMatches(candidates, lowered, keywordLabel("sadness", normalizedLanguage), "груст", "печал", "sad", "grief");
        addCandidateIfMatches(candidates, lowered, keywordLabel("deception", normalizedLanguage),
            "обман", "заман", "ловуш", "ложн", "trap", "deception", "false", "fake");
        addCandidateIfMatches(candidates, lowered, keywordLabel("recognition", normalizedLanguage), "узна", "recogn", "familiar");
        addCandidateIfMatches(candidates, lowered, keywordLabel("home", normalizedLanguage),
            "дом", "квартир", "комнат", "home", "house", "apartment");
        addCandidateIfMatches(candidates, lowered, keywordLabel("fear", normalizedLanguage),
            "страх", "опас", "угроз", "тревог", "fear", "danger", "threat");
        addCandidateIfMatches(candidates, lowered, keywordLabel("friend", normalizedLanguage), "подруг", "friend");
        addCandidateIfMatches(candidates, lowered, keywordLabel("police", normalizedLanguage), "полици", "police");
        addCandidateIfMatches(candidates, lowered, keywordLabel("boundaries", normalizedLanguage), "границ", "boundar");
        addCandidateIfMatches(candidates, lowered, keywordLabel("identity", normalizedLanguage), "похож", "сход", "identity", "resemblance");
        addCandidateIfMatches(candidates, lowered, keywordLabel("trust", normalizedLanguage), "довер", "недовер", "сомне", "trust", "mistrust", "doubt");
        addCandidateIfMatches(candidates, lowered, keywordLabel("protection", normalizedLanguage), "защит", "помощ", "звон", "help", "protect", "call");

        for (String token : TOKEN_SPLIT_PATTERN.split(lowered)) {
            if (!StringUtils.hasText(token) || token.length() < 4 || STOP_WORDS.contains(token)) {
                continue;
            }

            candidates.add(normalizeKeywordCandidate(token, normalizedLanguage));
            if (candidates.size() >= 12) {
                break;
            }
        }

        if (candidates.size() < 6) {
            if ("en".equals(normalizedLanguage)) {
                candidates.addAll(List.of("dream", "emotion", "memory", "relationship", "safety", "boundary"));
            } else {
                candidates.addAll(List.of("сон", "эмоции", "память", "отношения", "безопасность", "границы"));
            }
        }

        return candidates.stream()
            .filter(StringUtils::hasText)
            .limit(12)
            .toList();
    }

    private List<String> parseSelectedKeywords(String rawSelection, List<String> availableKeywords) {
        String lowered = firstNonBlank(rawSelection).toLowerCase(Locale.ROOT);
        LinkedHashSet<String> selectedKeywords = new LinkedHashSet<>();

        for (String fragment : rawSelection.split("[,;\\n]+")) {
            String candidate = fragment.trim();
            if (!StringUtils.hasText(candidate)) {
                continue;
            }

            availableKeywords.stream()
                .filter(available -> available.equalsIgnoreCase(candidate))
                .findFirst()
                .ifPresent(selectedKeywords::add);
        }

        if (selectedKeywords.isEmpty()) {
            availableKeywords.stream()
                .filter(keyword -> lowered.contains(keyword.toLowerCase(Locale.ROOT)))
                .forEach(selectedKeywords::add);
        }

        return selectedKeywords.stream().limit(6).toList();
    }

    private void addCandidateIfMatches(LinkedHashSet<String> candidates, String text, String label, String... fragments) {
        for (String fragment : fragments) {
            if (text.contains(fragment)) {
                candidates.add(label);
                return;
            }
        }
    }

    private String normalizeKeywordCandidate(String token, String language) {
        if (startsWithAny(token, "школ")) {
            return keywordLabel("school", language);
        }
        if (startsWithAny(token, "учител")) {
            return keywordLabel("teacher", language);
        }
        if (startsWithAny(token, "отец", "отца", "отцом", "пап")) {
            return keywordLabel("father", language);
        }
        if (startsWithAny(token, "бывш")) {
            return keywordLabel("former partner", language);
        }
        if (startsWithAny(token, "стыд", "неловк")) {
            return keywordLabel("shame", language);
        }
        if (startsWithAny(token, "груст", "печал")) {
            return keywordLabel("sadness", language);
        }
        if (startsWithAny(token, "обман", "заман", "ловуш", "ложн")) {
            return keywordLabel("deception", language);
        }
        if (startsWithAny(token, "узна")) {
            return keywordLabel("recognition", language);
        }
        if (startsWithAny(token, "дом", "квартир", "комнат")) {
            return keywordLabel("home", language);
        }
        if (startsWithAny(token, "страх", "опас", "угроз", "тревог")) {
            return keywordLabel("fear", language);
        }
        if (startsWithAny(token, "подруг")) {
            return keywordLabel("friend", language);
        }
        if (startsWithAny(token, "полици")) {
            return keywordLabel("police", language);
        }
        if (startsWithAny(token, "границ")) {
            return keywordLabel("boundaries", language);
        }
        if (startsWithAny(token, "похож", "сход")) {
            return keywordLabel("identity", language);
        }
        if (startsWithAny(token, "довер", "недовер", "сомне")) {
            return keywordLabel("trust", language);
        }
        if (startsWithAny(token, "защит", "помощ", "звон")) {
            return keywordLabel("protection", language);
        }
        return token;
    }

    private String keywordLabel(String englishLabel, String language) {
        if ("en".equals(language)) {
            return englishLabel;
        }

        return switch (englishLabel) {
            case "school" -> "школа";
            case "teacher" -> "учитель";
            case "father" -> "отец";
            case "former partner" -> "бывшая партнерша";
            case "shame" -> "стыд";
            case "sadness" -> "грусть";
            case "deception" -> "обман";
            case "recognition" -> "узнавание";
            case "home" -> "дом";
            case "fear" -> "страх";
            case "friend" -> "подруга";
            case "police" -> "полиция";
            case "boundaries" -> "границы";
            case "identity" -> "идентичность";
            case "trust" -> "доверие";
            case "protection" -> "защита";
            default -> englishLabel;
        };
    }

    private String welcomeMessage(String language) {
        return "en".equals(language)
            ? "What did you dream about? Describe your dream in as much detail as you can."
            : "Что вам приснилось? Опишите свой сон как можно подробнее.";
    }

    private String emotionPrompt(String language) {
        return "en".equals(language)
            ? "What emotions did you feel during the dream? For example: fear, shame, anxiety, relief, confusion, curiosity."
            : "Какие чувства вы испытывали во время сна? Например: страх, стыд, тревогу, облегчение, растерянность, интерес.";
    }

    private String keywordSelectionPrompt(String language) {
        return "en".equals(language)
            ? "I highlighted the key words and objects from the dream. Choose the relevant ones with the buttons below and send them as a comma-separated list."
            : "Я выделил ключевые слова и предметы сна. Выберите подходящие кнопками ниже и отправьте их списком через запятую.";
    }

    private String keywordSelectionRetryPrompt(String language) {
        return "en".equals(language)
            ? "I could not recognize the selected keywords yet. Click the buttons below or type the chosen words separated by commas."
            : "Я пока не смог распознать выбранные ключевые слова. Нажмите на кнопки ниже или впишите выбранные слова через запятую.";
    }

    private String defaultTitle(String language) {
        return "en".equals(language) ? "New dream" : "Новый сон";
    }

    private String normalizeLanguage(String language) {
        return "en".equalsIgnoreCase(language) ? "en" : "ru";
    }

    private String extractPrimaryDreamDescription(DreamConversation conversation) {
        return conversation.getMessages().stream()
            .filter(message -> message.getRole() == ChatRole.USER)
            .map(DreamMessage::getContent)
            .findFirst()
            .orElse("");
    }

    private boolean startsWithAny(String token, String... prefixes) {
        for (String prefix : prefixes) {
            if (token.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    private String firstNonBlank(String value) {
        return StringUtils.hasText(value) ? value : "";
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
