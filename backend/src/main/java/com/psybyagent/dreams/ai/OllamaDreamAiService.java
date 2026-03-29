package com.psybyagent.dreams.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.psybyagent.dreams.config.OllamaProperties;
import com.psybyagent.dreams.dream.ChatRole;
import com.psybyagent.dreams.dream.DreamConversation;
import com.psybyagent.dreams.dream.DreamMessage;
import com.psybyagent.dreams.dream.DreamStage;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Slf4j
@Service
@RequiredArgsConstructor
public class OllamaDreamAiService implements DreamAiService {

    private static final Pattern TOKEN_SPLIT_PATTERN = Pattern.compile("[^\\p{L}\\p{N}]+");
    private static final Set<String> STOP_WORDS = Set.of(
        "и", "в", "во", "на", "но", "что", "как", "мне", "меня", "был", "была", "были",
        "это", "этот", "она", "они", "его", "ее", "мы", "вы", "ты", "я", "сон", "сна",
        "потом", "когда", "где", "или", "под", "над", "из", "за", "для", "очень",
        "the", "with", "from", "into", "that", "this", "were", "when", "where", "about",
        "after", "before", "there", "their", "have", "felt", "dream"
    );
    private static final Set<String> TITLE_FILLER_WORDS = Set.of(
        "такие", "такой", "такая", "такое", "эти", "этот", "эта", "это",
        "какие", "какой", "какая", "какое", "так", "просто", "such", "this", "that", "just"
    );
    private static final Set<String> TITLE_GENERIC_WORDS = Set.of(
        "человек", "люди", "людьми", "женщина", "мужчина", "кто-то", "ктото",
        "person", "people", "woman", "man", "someone"
    );
    private static final Set<String> GENERIC_SYMBOL_MARKERS = Set.of(
        "вода", "море", "река", "двер", "поезд", "лес", "город",
        "water", "sea", "river", "door", "train", "forest", "city"
    );
    private static final List<ThemeDefinition> THEME_DEFINITIONS = List.of(
        new ThemeDefinition("deception_false_identity", "обман", "deception", 6, List.of(
            "обман", "обманы", "заман", "ловуш", "не та", "не тот", "не она", "не он",
            "подмен", "ложн", "притвор", "самозван",
            "deception", "deceiv", "trap", "impostor", "false", "fake", "not her", "not him"
        )),
        new ThemeDefinition("school_authority", "школа", "school", 5, List.of(
            "школ", "урок", "класс", "учител", "литератур", "математ", "экзам", "оцен",
            "school", "teacher", "class", "lesson", "exam", "authority", "evaluation"
        )),
        new ThemeDefinition("family_identity", "отец", "father", 5, List.of(
            "отец", "отца", "отцом", "пап", "родител", "семь", "развод", "бывш",
            "father", "dad", "parent", "family", "divorce", "ex-partner", "former partner",
            "identity", "resemblance"
        )),
        new ThemeDefinition("protection_help", "защита", "protection", 4, List.of(
            "полици", "подруг", "помощ", "звон", "вызвал", "вызвала", "спас", "защит", "контрол",
            "police", "friend", "help", "call", "protect", "support", "control", "agency"
        )),
        new ThemeDefinition("shame_grief", "стыд", "shame", 3, List.of(
            "стыд", "стыдно", "грусть", "груст", "вина", "неловк",
            "shame", "ashamed", "grief", "sad", "sadness", "guilt", "embarrass"
        )),
        new ThemeDefinition("trust_mistrust", "недоверие", "mistrust", 3, List.of(
            "довер", "недовер", "подозр", "сомне", "верить",
            "trust", "mistrust", "suspicion", "doubt", "uncertain"
        )),
        new ThemeDefinition("home_boundaries", "дом", "home", 1, List.of(
            "дом", "дома", "домой", "квартир", "комнат", "пространств", "границ",
            "private space", "home", "house", "apartment", "room", "boundary", "boundaries"
        )),
        new ThemeDefinition("fear_threat", "страх", "fear", 1, List.of(
            "страх", "страш", "опас", "угроз", "тревог", "боюсь",
            "panic", "fear", "afraid", "danger", "threat", "unsafe", "anxiety"
        ))
    );

    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(20))
        .build();

    private final ObjectMapper objectMapper;
    private final OllamaProperties ollamaProperties;
    private final DreamInterpretationRagService dreamInterpretationRagService;

    @Override
    public DreamAiResult generateReply(DreamConversation conversation, List<DreamConversation> recentDreams, String language) {
        List<DreamConversation> recentDreamContext = recentDreams == null ? List.of() : recentDreams;
        String normalizedLanguage = normalizeLanguage(language);
        List<DreamConversation> relevantRecentDreams = selectRelevantRecentDreams(conversation, recentDreamContext, normalizedLanguage);

        try {
            String prompt = buildPrompt(conversation, relevantRecentDreams, normalizedLanguage);
            String requestBody = objectMapper.writeValueAsString(
                new OllamaGenerateRequest(ollamaProperties.getModel(), prompt, false, "json")
            );

            HttpRequest request = HttpRequest.newBuilder()
                .uri(buildGenerateUri())
                .timeout(Duration.ofMinutes(3))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                .build();

            HttpResponse<String> response = httpClient.send(
                request,
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );

            if (response.statusCode() >= 400 || !StringUtils.hasText(response.body())) {
                return fallback(conversation, relevantRecentDreams, normalizedLanguage);
            }

            String responseText = extractResponseText(response.body());
            if (!StringUtils.hasText(responseText)) {
                return fallback(conversation, relevantRecentDreams, normalizedLanguage);
            }

            OllamaAnalysisPayload payload = objectMapper.readValue(normalizeJson(responseText), OllamaAnalysisPayload.class);
            return toResult(payload, conversation, relevantRecentDreams, normalizedLanguage);
        } catch (Exception exception) {
            log.warn("Falling back to local dream analysis because Ollama call failed: {}", exception.getMessage());
            return fallback(conversation, relevantRecentDreams, normalizedLanguage);
        }
    }

    private DreamAiResult toResult(
        OllamaAnalysisPayload payload,
        DreamConversation conversation,
        List<DreamConversation> recentDreams,
        String language
    ) {
        DreamStage stage = "INTERPRETED".equalsIgnoreCase(payload.stage()) ? DreamStage.INTERPRETED : DreamStage.CLARIFYING;

        if (stage == DreamStage.INTERPRETED) {
            List<String> keywords = sanitizeKeywords(payload.keywords(), conversation, language);
            String interpretationSource = StringUtils.hasText(payload.interpretation())
                ? payload.interpretation().trim()
                : payload.assistantMessage();
            if (!StringUtils.hasText(interpretationSource)) {
                return fallback(conversation, recentDreams, language);
            }

            String interpretation = sanitizeOutputText(interpretationSource.trim());
            String assistantMessage = sanitizeOutputText(StringUtils.hasText(payload.assistantMessage())
                ? payload.assistantMessage().trim()
                : interpretation);
            String title = chooseTitle(payload.title(), keywords, conversation, language);

            if (shouldUseFallback(payload, title, keywords, assistantMessage, interpretation, conversation, language)) {
                return fallback(conversation, recentDreams, language);
            }

            interpretation = mergeRecurringInsight(interpretation, buildRecurringDreamsInsight(keywords, recentDreams, language), language);
            return new DreamAiResult(stage, assistantMessage, title, keywords, interpretation);
        }

        if (countUserMessages(conversation) >= 3 || hasEnoughDetailForInterpretation(conversation)) {
            return fallback(conversation, recentDreams, language);
        }

        String assistantMessage = sanitizeOutputText(StringUtils.hasText(payload.assistantMessage())
            ? payload.assistantMessage().trim()
            : clarifyingQuestion(language));

        return new DreamAiResult(
            DreamStage.CLARIFYING,
            assistantMessage,
            conversation.getTitle(),
            List.copyOf(conversation.getKeywords()),
            conversation.getInterpretation()
        );
    }

    private DreamAiResult fallback(DreamConversation conversation, List<DreamConversation> recentDreams, String language) {
        String narrative = extractUserNarrativeVerbatim(conversation);
        List<String> keywords = extractKeywords(narrative, language);
        String title = chooseTitle(null, keywords, conversation, language);
        String interpretation = fallbackInterpretation(conversation, keywords, language);
        interpretation = mergeRecurringInsight(interpretation, buildRecurringDreamsInsight(keywords, recentDreams, language), language);
        return new DreamAiResult(DreamStage.INTERPRETED, interpretation, title, keywords, interpretation);
    }

    private String buildPrompt(DreamConversation conversation, List<DreamConversation> recentDreams, String language) {
        String ragContext = dreamInterpretationRagService.buildContext(conversation, language);
        String recentDreamsContext = buildRecentDreamsContext(conversation, recentDreams, language);
        String therapistLanguage = isEnglish(language) ? "English" : "Russian";
        String targetLanguage = isEnglish(language) ? "English" : "Russian";
        String currentNarrative = trimExcerpt(extractUserNarrativeVerbatim(conversation), 2_000);
        String currentMotifs = formatDetectedMotifs(conversation, language);

        StringBuilder builder = new StringBuilder();
        builder.append("""
            You are a %s-speaking psychotherapist who interprets dreams with care and precision.
            Your job is not generic conversation and not a dream-dictionary summary.
            Read the current dream as an emotional story first.

            Grounding rules:
            - The CURRENT dream is the primary evidence.
            - Recent dreams are secondary background. Use them only if the same motifs clearly repeat.
            - Never import symbols, places, or keywords from recent dreams if they are absent from the current dream.
            - Keywords must come from the current dream itself.
            - If the current dream already contains concrete people, setting, emotional shift, threat, and ending, interpret it directly and do not ask a follow-up question.

            Interpretation priorities:
            1. Identify the central conflict, emotional turning point, and ending.
            2. If the dream is driven by family, authority, shame, deception, mistaken identity, safety threat, or protection, prioritize these themes over generic symbol reading.
            3. Use symbols to support the plot, not replace the plot.
            4. Link the dream to feelings, boundaries, trust, vulnerability, identity, and present-life relationships.
            5. If the dream contains a teacher, parent, former partner, home, fear, friend, or police, treat them as meaningful relational signals, not random decoration.

            Output rules:
            - Write only in %s.
            - Do not diagnose psychiatric disorders and do not give medical conclusions.
            - Do not mention books, authors, schools, dream dictionaries, Jung, Freud, Gestalt, or any source.
            - Present meanings as careful hypotheses, not as absolute truth.
            - Return valid JSON only, without markdown and without text outside JSON.

            Internal checklist:
            - What scene places the dreamer into a more vulnerable role?
            - Who has power, who seems familiar, and who becomes false, dangerous, or intrusive?
            - Where do shame, grief, fear, mistrust, or relief rise?
            - What moment marks a boundary violation or safety threat?
            - How does the dreamer try to restore agency, support, or control?

            If there is enough detail, interpretation should:
            - begin with the main emotional conflict;
            - explain the shift from familiarity to danger if it exists;
            - connect the dream to relationships, identity, boundaries, trust, and safety;
            - end with a careful waking-life hypothesis.

            If details are insufficient, return stage=CLARIFYING and ask exactly one precise question.

            Response schema:
            {
              "stage": "CLARIFYING" | "INTERPRETED",
              "assistantMessage": "string",
              "title": "1-2 words",
              "keywords": ["keyword1", "keyword2", "keyword3"],
              "interpretation": "string"
            }

            Field rules:
            - title: 1-2 meaningful words capturing the emotional core.
            - keywords: 2-3 key motifs from the current dream itself.
            - assistantMessage: a brief lead-in or one focused follow-up question.
            - interpretation: the full dream reading.
            """.formatted(therapistLanguage, targetLanguage));
        builder.append("\nCurrent dream motifs detected:\n").append(currentMotifs).append("\n\n");
        builder.append("Current dream narrative (primary evidence):\n").append(currentNarrative).append("\n\n");
        builder.append("Retrieved knowledge context:\n").append(ragContext).append("\n\n");
        builder.append("Recent dreams from the last 7 days (secondary background only if clearly related):\n")
            .append(recentDreamsContext)
            .append("\n\n");
        builder.append("Chat history:\n");

        conversation.getMessages().stream()
            .sorted(Comparator.comparing(DreamMessage::getCreatedAt))
            .forEach(message -> builder.append(message.getRole().name()).append(": ").append(message.getContent()).append('\n'));

        return builder.toString();
    }

    private String buildRecentDreamsContext(DreamConversation conversation, List<DreamConversation> recentDreams, String language) {
        if (recentDreams == null || recentDreams.isEmpty()) {
            return isEnglish(language)
                ? "No clearly related recent dreams. Do not borrow motifs from other dreams."
                : "Явно связанных недавних снов не найдено. Не подмешивайте мотивы из других снов.";
        }

        StringBuilder builder = new StringBuilder();
        builder.append(buildRecurringDreamsObservation(conversation, recentDreams, language)).append('\n');

        for (DreamConversation recentDream : recentDreams) {
            builder.append("- Title: ").append(formatDreamTitle(recentDream, language)).append('\n');
            builder.append("  Stage: ").append(recentDream.getStage().name()).append('\n');
            builder.append("  UpdatedAt: ").append(recentDream.getUpdatedAt()).append('\n');

            List<String> keywords = keywordsForAnalysis(recentDream, language);
            if (!keywords.isEmpty()) {
                builder.append("  Keywords: ").append(String.join(", ", keywords)).append('\n');
            }

            String summary = summarizeConversation(recentDream);
            if (StringUtils.hasText(summary)) {
                builder.append("  Dream summary: ").append(summary).append('\n');
            }

            if (StringUtils.hasText(recentDream.getInterpretation())) {
                builder.append("  Interpretation summary: ").append(trimExcerpt(recentDream.getInterpretation(), 220)).append('\n');
            }
        }

        return builder.toString().trim();
    }

    private URI buildGenerateUri() {
        String baseUrl = ollamaProperties.getBaseUrl();
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        return URI.create(baseUrl + "/api/generate");
    }

    private String extractResponseText(String rawBody) {
        try {
            OllamaGenerateResponse response = objectMapper.readValue(rawBody, OllamaGenerateResponse.class);
            if (response != null && StringUtils.hasText(response.response())) {
                return response.response();
            }
        } catch (Exception exception) {
            log.debug("Could not deserialize Ollama response envelope directly, using raw body");
        }
        return rawBody;
    }

    private String normalizeJson(String rawResponse) {
        String trimmed = rawResponse.trim();
        if (trimmed.startsWith("```")) {
            trimmed = trimmed.replace("```json", "").replace("```", "").trim();
        }
        return trimmed;
    }

    private List<String> sanitizeKeywords(List<String> rawKeywords, DreamConversation conversation, String language) {
        List<String> thematicKeywords = extractKeywords(extractUserNarrativeVerbatim(conversation), language);
        if (rawKeywords == null || rawKeywords.isEmpty()) {
            return thematicKeywords;
        }

        String narrative = extractUserNarrative(conversation);
        List<String> keywords = rawKeywords.stream()
            .filter(StringUtils::hasText)
            .map(String::trim)
            .map(keyword -> keyword.toLowerCase(Locale.ROOT))
            .filter(keyword -> !Set.of("сон", "символ", "образ", "чувство", "dream", "symbol", "emotion").contains(keyword))
            .filter(keyword -> isKeywordGrounded(keyword, narrative, thematicKeywords))
            .distinct()
            .limit(3)
            .toList();

        return keywords.size() >= 2 ? keywords : thematicKeywords;
    }

    private List<String> extractKeywords(String text, String language) {
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        List<DetectedTheme> themes = detectThemes(text);

        for (DetectedTheme theme : themes) {
            if (unique.size() >= 3) {
                break;
            }
            unique.add(theme.label(language));
        }

        if (unique.size() < 3) {
            List<String> tokens = new ArrayList<>();
            for (String token : TOKEN_SPLIT_PATTERN.split(text.toLowerCase(Locale.ROOT))) {
                if (!StringUtils.hasText(token) || token.length() < 4 || STOP_WORDS.contains(token)) {
                    continue;
                }
                tokens.add(token);
            }

            tokens.stream()
                .sorted(Comparator.comparingInt(String::length).reversed())
                .filter(token -> !TITLE_FILLER_WORDS.contains(token))
                .forEach(token -> {
                    if (unique.size() < 3) {
                        unique.add(token);
                    }
                });
        }

        if (unique.isEmpty()) {
            unique.add(isEnglish(language) ? "dream" : "сон");
            unique.add(isEnglish(language) ? "emotion" : "эмоция");
        }
        return List.copyOf(unique);
    }

    private List<String> keywordsForAnalysis(DreamConversation conversation, String language) {
        List<String> keywords = conversation.getKeywords().isEmpty()
            ? extractKeywords(firstNonBlank(extractUserNarrativeVerbatim(conversation), conversation.getInterpretation()), language)
            : sanitizeKeywords(conversation.getKeywords(), conversation, language);
        return keywords.stream().filter(keyword -> !Set.of("сон", "символ", "dream", "symbol").contains(keyword)).toList();
    }

    private String buildRecurringDreamsObservation(DreamConversation conversation, List<DreamConversation> recentDreams, String language) {
        List<String> currentKeywords = keywordsForAnalysis(conversation, language);
        if (currentKeywords.isEmpty()) {
            return isEnglish(language)
                ? "Overlap scan: no clear motifs detected in the current dream yet."
                : "Проверка перекличек: в текущем сне пока не выделились явные мотивы.";
        }

        List<String> matches = new ArrayList<>();
        for (DreamConversation recentDream : recentDreams) {
            List<String> sharedKeywords = findSharedKeywords(currentKeywords, recentDream, language);
            if (!sharedKeywords.isEmpty()) {
                matches.add("%s [%s]".formatted(formatDreamTitle(recentDream, language), String.join(", ", sharedKeywords)));
            }
        }

        if (matches.isEmpty()) {
            return isEnglish(language)
                ? "Overlap scan: no clearly related recent dreams."
                : "Проверка перекличек: явно связанных недавних снов не найдено.";
        }

        return isEnglish(language)
            ? "Overlap scan: only the following recent dreams share strong motifs -> %s. Mention continuity only if it truly fits the current dream."
                .formatted(String.join("; ", matches))
            : "Проверка перекличек: только следующие недавние сны действительно разделяют сильные мотивы -> %s. Упоминайте повтор только если он правда подходит текущему сну."
                .formatted(String.join("; ", matches));
    }

    private String buildRecurringDreamsInsight(List<String> currentKeywords, List<DreamConversation> recentDreams, String language) {
        if (recentDreams == null || recentDreams.isEmpty() || currentKeywords == null || currentKeywords.isEmpty()) {
            return null;
        }

        LinkedHashSet<String> recurringKeywords = new LinkedHashSet<>();
        LinkedHashSet<String> relatedDreams = new LinkedHashSet<>();
        for (DreamConversation recentDream : recentDreams) {
            List<String> sharedKeywords = findSharedKeywords(currentKeywords, recentDream, language);
            if (!sharedKeywords.isEmpty()) {
                recurringKeywords.addAll(sharedKeywords);
                relatedDreams.add(formatDreamTitle(recentDream, language));
            }
        }

        if (recurringKeywords.isEmpty()) {
            return null;
        }
        return isEnglish(language)
            ? "Similar motifs have also appeared in recent dreams from the past week (%s): %s. This may suggest a recurring inner theme that the psyche is returning to."
                .formatted(String.join(", ", relatedDreams), String.join(", ", recurringKeywords))
            : "Похожие мотивы уже появлялись и в недавних снах за последнюю неделю (%s): %s. Это может указывать на повторяющуюся внутреннюю тему, к которой психика снова возвращается."
                .formatted(String.join(", ", relatedDreams), String.join(", ", recurringKeywords));
    }

    private List<String> findSharedKeywords(List<String> currentKeywords, DreamConversation recentDream, String language) {
        List<String> recentKeywords = keywordsForAnalysis(recentDream, language);
        LinkedHashSet<String> sharedKeywords = new LinkedHashSet<>();
        for (String currentKeyword : currentKeywords) {
            String normalizedCurrentKeyword = currentKeyword.toLowerCase(Locale.ROOT);
            for (String recentKeyword : recentKeywords) {
                if (normalizedCurrentKeyword.equals(recentKeyword.toLowerCase(Locale.ROOT))) {
                    sharedKeywords.add(normalizedCurrentKeyword);
                }
            }
        }
        return List.copyOf(sharedKeywords);
    }

    private List<DreamConversation> selectRelevantRecentDreams(
        DreamConversation conversation,
        List<DreamConversation> recentDreams,
        String language
    ) {
        if (recentDreams == null || recentDreams.isEmpty()) {
            return List.of();
        }

        List<DetectedTheme> currentThemes = detectThemes(firstNonBlank(extractUserNarrativeVerbatim(conversation), conversation.getInterpretation()));
        List<String> currentKeywords = keywordsForAnalysis(conversation, language);
        if (currentThemes.isEmpty() && currentKeywords.isEmpty()) {
            return List.of();
        }

        List<RelatedDream> relatedDreams = new ArrayList<>();
        for (DreamConversation recentDream : recentDreams) {
            List<DetectedTheme> recentThemes = detectThemes(firstNonBlank(extractUserNarrativeVerbatim(recentDream), recentDream.getInterpretation()));
            List<String> sharedKeywords = findSharedKeywords(currentKeywords, recentDream, language);
            int sharedThemePriority = sharedThemePriority(currentThemes, recentThemes);
            int score = sharedThemePriority + sharedKeywords.size() * 2;

            if (score >= 6 || (sharedThemePriority >= 5 && !sharedKeywords.isEmpty())) {
                relatedDreams.add(new RelatedDream(recentDream, score));
            }
        }

        return relatedDreams.stream()
            .sorted(Comparator.comparingInt(RelatedDream::score).reversed()
                .thenComparing(relatedDream -> relatedDream.conversation().getUpdatedAt(), Comparator.reverseOrder()))
            .limit(3)
            .map(RelatedDream::conversation)
            .toList();
    }

    private int sharedThemePriority(List<DetectedTheme> leftThemes, List<DetectedTheme> rightThemes) {
        int total = 0;
        for (DetectedTheme leftTheme : leftThemes) {
            for (DetectedTheme rightTheme : rightThemes) {
                if (leftTheme.id().equals(rightTheme.id())) {
                    total += leftTheme.priority();
                    break;
                }
            }
        }
        return total;
    }

    private String mergeRecurringInsight(String interpretation, String recurringInsight, String language) {
        if (!StringUtils.hasText(recurringInsight)) {
            return interpretation;
        }
        if (!StringUtils.hasText(interpretation)) {
            return recurringInsight;
        }

        String normalized = interpretation.toLowerCase(Locale.ROOT);
        if (normalized.contains("повторя") || normalized.contains("переклика") || normalized.contains("recurr") || normalized.contains("returns to")) {
            return interpretation;
        }
        return interpretation + " " + recurringInsight;
    }

    private String summarizeConversation(DreamConversation conversation) {
        return trimExcerpt(extractUserNarrativeVerbatim(conversation), 220);
    }

    private String trimExcerpt(String text, int maxLength) {
        if (!StringUtils.hasText(text)) {
            return "";
        }
        String normalizedText = text.replaceAll("\\s+", " ").trim();
        return normalizedText.length() <= maxLength ? normalizedText : normalizedText.substring(0, maxLength - 3).trim() + "...";
    }

    private String formatDreamTitle(DreamConversation conversation, String language) {
        if (StringUtils.hasText(conversation.getTitle()) && !isPlaceholderTitle(conversation.getTitle())) {
            return conversation.getTitle().trim();
        }

        List<String> keywords = keywordsForAnalysis(conversation, language);
        if (!keywords.isEmpty()) {
            return inferTitleFromConversation(conversation, keywords, language);
        }
        return isEnglish(language) ? "Recent dream" : "Недавний сон";
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return "";
    }

    private String buildTitleFromKeywords(List<String> keywords, String language) {
        List<String> titleWords = keywords.stream()
            .filter(StringUtils::hasText)
            .map(String::trim)
            .map(keyword -> keyword.toLowerCase(Locale.ROOT))
            .filter(keyword -> !isWeakTitleWord(keyword))
            .limit(2)
            .toList();

        if (titleWords.isEmpty()) {
            return isEnglish(language) ? "New dream" : "Новый сон";
        }

        String joined = String.join(" ", titleWords);
        return Character.toUpperCase(joined.charAt(0)) + joined.substring(1);
    }

    private String chooseTitle(String suggestedTitle, List<String> keywords, DreamConversation conversation, String language) {
        String smartTitle = inferTitleFromConversation(conversation, keywords, language);
        if (!StringUtils.hasText(suggestedTitle)) {
            return smartTitle;
        }
        String normalizedSuggested = normalizeTitle(suggestedTitle);
        return isWeakTitle(normalizedSuggested, keywords) ? smartTitle : normalizedSuggested;
    }

    private String inferTitleFromConversation(DreamConversation conversation, List<String> keywords, String language) {
        String narrative = extractUserNarrative(conversation);
        List<DetectedTheme> themes = detectThemes(narrative);

        if (hasTheme(themes, "deception_false_identity") && hasTheme(themes, "fear_threat")) {
            return isEnglish(language) ? "False Recognition" : "Ложное узнавание";
        }
        if (hasTheme(themes, "school_authority") && hasTheme(themes, "shame_grief")) {
            return isEnglish(language) ? "School Shame" : "Школьный стыд";
        }
        if (hasTheme(themes, "family_identity") && hasTheme(themes, "school_authority")) {
            return isEnglish(language) ? "Father's Trace" : "Отцовский след";
        }
        if (hasTheme(themes, "home_boundaries") && hasTheme(themes, "deception_false_identity")) {
            return isEnglish(language) ? "Unsafe House" : "Чужой дом";
        }
        if (hasTheme(themes, "protection_help") && hasTheme(themes, "fear_threat")) {
            return isEnglish(language) ? "Call for Help" : "Зов помощи";
        }
        if (matchesAny(narrative, "убег", "погон", "преслед", "бегу", "спаса")) {
            return isEnglish(language) ? "Escape" : "Убегание";
        }
        if (matchesAny(narrative, "опазд", "спеш", "тороп", "поезд", "самолет", "автобус", "вокзал", "дорог", "ехать", "еду")) {
            return matchesAny(narrative, "трев", "страх", "паник", "боюсь")
                ? (isEnglish(language) ? "Anxious Road" : "Тревожная дорога")
                : (isEnglish(language) ? "Rush" : "Спешка");
        }
        if (matchesAny(narrative, "двер", "замок", "ключ")) {
            return isEnglish(language) ? "Closed Door" : "Закрытая дверь";
        }
        if (matchesAny(narrative, "дом", "квартир", "комнат")) {
            return matchesAny(narrative, "стар", "детств", "родител")
                ? (isEnglish(language) ? "Old House" : "Старый дом")
                : (isEnglish(language) ? "Home" : "Дом");
        }
        if (matchesAny(narrative, "лес", "темн", "ноч", "тень")) {
            return matchesAny(narrative, "лес")
                ? (isEnglish(language) ? "Dark Forest" : "Темный лес")
                : (isEnglish(language) ? "Night Anxiety" : "Ночная тревога");
        }
        if (matchesAny(narrative, "вода", "море", "река", "волна", "дожд")) {
            return matchesAny(narrative, "дом")
                ? (isEnglish(language) ? "Home by Water" : "Дом у воды")
                : (isEnglish(language) ? "Deep Water" : "Глубокая вода");
        }
        if (matchesAny(narrative, "пад", "провал", "вниз")) {
            return isEnglish(language) ? "Falling" : "Падение";
        }
        if (matchesAny(narrative, "лестниц", "лифт", "этаж", "подним")) {
            return isEnglish(language) ? "Ascent" : "Подъем";
        }
        if (matchesAny(narrative, "мост", "дорог", "путь")) {
            return isEnglish(language) ? "Crossing" : "Переход";
        }
        return buildTitleFromKeywords(keywords, language);
    }

    private long countUserMessages(DreamConversation conversation) {
        return conversation.getMessages().stream().filter(message -> message.getRole() == ChatRole.USER).count();
    }

    private String extractUserNarrative(DreamConversation conversation) {
        return extractUserNarrativeVerbatim(conversation).toLowerCase(Locale.ROOT);
    }

    private String extractUserNarrativeVerbatim(DreamConversation conversation) {
        return conversation.getMessages().stream()
            .filter(message -> message.getRole() == ChatRole.USER)
            .map(DreamMessage::getContent)
            .reduce("", (left, right) -> left + " " + right)
            .trim();
    }

    private boolean isWeakTitle(String title, List<String> keywords) {
        String normalized = title.toLowerCase(Locale.ROOT);
        String[] words = normalized.split("\\s+");

        if (!StringUtils.hasText(normalized) || "новый сон".equals(normalized) || "new dream".equals(normalized)) {
            return true;
        }
        if (normalized.contains("сон") || normalized.contains("символ") || normalized.contains("образ")
            || normalized.contains("dream") || normalized.contains("symbol")) {
            return true;
        }
        if (words.length > 2 || !normalized.matches("(?iu)[\\p{L}\\p{N}-]+(?:\\s+[\\p{L}\\p{N}-]+)?")) {
            return true;
        }
        for (String word : words) {
            if (isWeakTitleWord(word)) {
                return true;
            }
        }
        if (words.length == 2 && words[0].equals(words[1])) {
            return true;
        }
        return keywords.stream().map(keyword -> keyword.toLowerCase(Locale.ROOT)).anyMatch(normalized::equals);
    }

    private boolean isWeakTitleWord(String word) {
        String normalizedWord = word.toLowerCase(Locale.ROOT);
        return STOP_WORDS.contains(normalizedWord)
            || TITLE_FILLER_WORDS.contains(normalizedWord)
            || TITLE_GENERIC_WORDS.contains(normalizedWord);
    }

    private String normalizeTitle(String title) {
        String collapsed = title.trim().replaceAll("\\s+", " ");
        return Character.toUpperCase(collapsed.charAt(0)) + collapsed.substring(1);
    }

    private boolean isPlaceholderTitle(String title) {
        String normalized = title.trim().toLowerCase(Locale.ROOT);
        return "новый сон".equals(normalized) || "new dream".equals(normalized);
    }

    private boolean matchesAny(String text, String... fragments) {
        for (String fragment : fragments) {
            if (text.contains(fragment)) {
                return true;
            }
        }
        return false;
    }

    private String sanitizeOutputText(String text) {
        if (!StringUtils.hasText(text)) {
            return text;
        }

        return text
            .replaceAll("(?iu)по\\s+мотивам\\s+сонника\\s+миллера[:,]?\\s*", "")
            .replaceAll("(?iu)по\\s+соннику\\s+миллера[:,]?\\s*", "")
            .replaceAll("(?iu)according\\s+to\\s+(the\\s+)?dream\\s+book[:,]?\\s*", "")
            .replaceAll("(?iu)according\\s+to\\s+(jung|freud|miller|gestalt)[:,]?\\s*", "")
            .replaceAll("(?iu)сонник\\s+миллера", "символическая трактовка")
            .replaceAll("(?iu)dream\\s+dictionary", "symbolic reading")
            .replaceAll("(?iu)миллер(?:а|у|ом|е)?", "")
            .replaceAll("(?iu)miller'?s?", "")
            .replaceAll("(?iu)юнг(?:а|у|ом|е|овский|овская|овское)?", "глубинный")
            .replaceAll("(?iu)jung(?:ian)?", "depth-oriented")
            .replaceAll("(?iu)фрейд(?:а|у|ом|е|овский|овская|овское)?", "внутренний")
            .replaceAll("(?iu)freud(?:ian)?", "inner")
            .replaceAll("(?iu)гештальт(?:-подход| подход)?", "внутренний диалог")
            .replaceAll("(?iu)gestalt", "inner-dialogue")
            .replaceAll("(?iu)источник(?:а|у|ом|е|и)?", "")
            .replaceAll("(?iu)source(?:s)?", "")
            .replaceAll("\\s{2,}", " ")
            .replaceAll("\\s+([,.!?])", "$1")
            .trim();
    }

    private String normalizeLanguage(String language) {
        return "en".equalsIgnoreCase(language) ? "en" : "ru";
    }

    private boolean isEnglish(String language) {
        return "en".equalsIgnoreCase(language);
    }

    private String clarifyingQuestion(String language) {
        return isEnglish(language)
            ? "What stood out most strongly in this dream: the person, the shift into danger, or the moment you tried to protect yourself?"
            : "Что в этом сне выделяется сильнее всего: человек, момент перехода к опасности или тот момент, когда вы начали защищать себя?";
    }

    private String fallbackInterpretation(DreamConversation conversation, List<String> keywords, String language) {
        List<DetectedTheme> themes = detectThemes(extractUserNarrative(conversation));
        List<String> parts = new ArrayList<>();

        if (hasTheme(themes, "school_authority") && hasTheme(themes, "family_identity")) {
            parts.add(isEnglish(language)
                ? "The dream places you back into a school-like, evaluative situation while tying it to your father and his history. This can be read as a return to a more vulnerable role where identity, family loyalty, and an older emotional story are being stirred up together."
                : "Сон помещает вас обратно в школьную, оценивающую ситуацию и одновременно связывает ее с фигурой отца и его историей. Это похоже на возвращение в более уязвимую роль, где одновременно поднимаются тема идентичности, семейной лояльности и старая эмоциональная память.");
        } else if (hasTheme(themes, "school_authority")) {
            parts.add(isEnglish(language)
                ? "The school setting suggests a return to a position where you are being examined, evaluated, or made emotionally smaller than you are in waking life."
                : "Школьная сцена похожа на возвращение в позицию, где вас будто снова оценивают, проверяют или делают эмоционально меньше, чем вы есть в обычной жизни.");
        }

        if (hasTheme(themes, "deception_false_identity")) {
            parts.add(hasTheme(themes, "home_boundaries")
                ? (isEnglish(language)
                    ? "What begins as something familiar then turns false and dangerous, and the move into someone else's home strengthens the theme of violated boundaries. The dream seems to track the moment when recognition breaks down and trust suddenly collapses."
                    : "То, что сначала выглядит знакомым, затем оказывается ложным и опасным, а переход в чужой дом усиливает тему нарушения границ. Сон как будто отслеживает тот момент, когда узнавание ломается, а доверие резко рушится.")
                : (isEnglish(language)
                    ? "The false or deceptive figure suggests an inner experience in which something first feels known and safe, then reveals itself as misleading, intrusive, or unsafe."
                    : "Ложная или обманчивая фигура во сне похожа на внутренний опыт, где что-то сначала ощущается знакомым и безопасным, а затем проявляется как вводящее в заблуждение, вторгающееся или небезопасное."));
        }

        if (hasTheme(themes, "shame_grief")) {
            parts.add(isEnglish(language)
                ? "The sadness and shame matter here just as much as the fear. They suggest that this dream is not only about danger, but also about an old relational wound, awkward recognition, and feelings that may still be tied to the family past."
                : "Грусть и стыд здесь важны не меньше страха. Они подсказывают, что этот сон не только про опасность, но и про старую рану в отношениях, неловкое узнавание и чувства, которые до сих пор связаны с семейным прошлым.");
        }

        if (hasTheme(themes, "fear_threat") && hasTheme(themes, "protection_help")) {
            parts.add(isEnglish(language)
                ? "The ending is important because you do not remain helpless: you call for help. That points not only to vulnerability, but also to a preserved capacity to recognize danger, seek support, and restore control."
                : "Финал особенно важен тем, что вы не остаетесь беспомощной: вы зовете помощь. Это говорит не только об уязвимости, но и о сохраненной способности распознавать опасность, искать опору и возвращать себе контроль.");
        } else if (hasTheme(themes, "fear_threat")) {
            parts.add(isEnglish(language)
                ? "The growing fear suggests that the dream is tracking a threat to safety, trust, or psychological space rather than offering a neutral symbolic scene."
                : "Нарастающий страх показывает, что сон отслеживает угрозу безопасности, доверию или психологическому пространству, а не просто рисует нейтральную символическую сцену.");
        }

        if (parts.isEmpty()) {
            String joinedKeywords = String.join(", ", keywords);
            return isEnglish(language)
                ? "The dream seems to center on the motifs %s. It may be more helpful to read these details not as isolated symbols but as one emotional story about tension, mistrust, vulnerability, and the need to restore safety and control."
                    .formatted(joinedKeywords)
                : "Похоже, что в центре этого сна стоят мотивы %s. Здесь важнее не отдельные символы сами по себе, а эмоциональная история сна: напряжение, недоверие, уязвимость и попытка вернуть себе безопасность и контроль."
                    .formatted(joinedKeywords);
        }

        parts.add(isEnglish(language)
            ? "As a waking-life hypothesis, the dream may be touching a place where old family material still makes you feel exposed, but where you now have more ability to notice danger and protect your boundaries."
            : "Как гипотеза для бодрствующей жизни, сон может касаться той точки, где старый семейный материал все еще делает вас уязвимой, но теперь у вас больше способности замечать опасность и защищать свои границы.");

        return String.join(" ", parts);
    }

    private boolean shouldUseFallback(
        OllamaAnalysisPayload payload,
        String title,
        List<String> keywords,
        String assistantMessage,
        String interpretation,
        DreamConversation conversation,
        String language
    ) {
        String narrative = extractUserNarrative(conversation);
        List<DetectedTheme> currentThemes = detectThemes(narrative);
        if (currentThemes.isEmpty()) {
            return false;
        }

        String responseText = String.join(
            " ",
            firstNonBlank(title),
            String.join(" ", keywords),
            firstNonBlank(payload.assistantMessage(), assistantMessage),
            interpretation
        ).toLowerCase(Locale.ROOT);

        List<DetectedTheme> responseThemes = detectThemes(responseText);
        int sharedThemePriority = sharedThemePriority(currentThemes, responseThemes);
        boolean hasSpecificCurrentTheme = currentThemes.stream().anyMatch(theme -> theme.priority() >= 4);
        long groundedKeywords = keywords.stream().filter(keyword -> isKeywordGrounded(keyword, narrative, keywords)).count();

        if (hasSpecificCurrentTheme && sharedThemePriority < 4) {
            return true;
        }
        if (keywords.size() >= 2 && groundedKeywords < 2) {
            return true;
        }
        return introducesUnexpectedGenericMotifs(responseText, narrative) && sharedThemePriority < 5;
    }

    private boolean hasEnoughDetailForInterpretation(DreamConversation conversation) {
        String narrative = extractUserNarrative(conversation);
        return narrative.length() >= 320 || (narrative.length() >= 180 && detectThemes(narrative).size() >= 4);
    }

    private boolean isKeywordGrounded(String keyword, String narrative, List<String> thematicKeywords) {
        if (narrative.contains(keyword)) {
            return true;
        }
        return thematicKeywords.stream().anyMatch(themeKeyword -> themeKeyword.equalsIgnoreCase(keyword));
    }

    private boolean introducesUnexpectedGenericMotifs(String responseText, String narrative) {
        int introduced = 0;
        for (String marker : GENERIC_SYMBOL_MARKERS) {
            if (responseText.contains(marker) && !narrative.contains(marker)) {
                introduced++;
            }
        }
        return introduced >= 1;
    }

    private String formatDetectedMotifs(DreamConversation conversation, String language) {
        List<DetectedTheme> themes = detectThemes(extractUserNarrativeVerbatim(conversation));
        if (themes.isEmpty()) {
            return isEnglish(language) ? "none" : "нет";
        }

        LinkedHashSet<String> labels = new LinkedHashSet<>();
        for (DetectedTheme theme : themes) {
            if (labels.size() >= 5) {
                break;
            }
            labels.add(theme.label(language));
        }
        return String.join(", ", labels);
    }

    private List<DetectedTheme> detectThemes(String text) {
        String normalizedText = firstNonBlank(text).toLowerCase(Locale.ROOT);
        List<DetectedTheme> detectedThemes = new ArrayList<>();

        for (ThemeDefinition definition : THEME_DEFINITIONS) {
            int markerMatches = 0;
            for (String marker : definition.markers()) {
                if (normalizedText.contains(marker)) {
                    markerMatches++;
                }
            }
            if (markerMatches > 0) {
                detectedThemes.add(new DetectedTheme(definition, definition.priority() * 10 + markerMatches));
            }
        }

        return detectedThemes.stream()
            .sorted(Comparator.comparingInt(DetectedTheme::score).reversed()
                .thenComparing(theme -> theme.definition().id()))
            .toList();
    }

    private boolean hasTheme(List<DetectedTheme> themes, String themeId) {
        return themes.stream().anyMatch(theme -> theme.id().equals(themeId));
    }

    private record ThemeDefinition(
        String id,
        String labelRu,
        String labelEn,
        int priority,
        List<String> markers
    ) {
        String label(String language) {
            return "en".equalsIgnoreCase(language) ? labelEn : labelRu;
        }
    }

    private record DetectedTheme(ThemeDefinition definition, int score) {
        String id() {
            return definition.id();
        }

        int priority() {
            return definition.priority();
        }

        String label(String language) {
            return definition.label(language);
        }
    }

    private record RelatedDream(DreamConversation conversation, int score) {
    }
}
