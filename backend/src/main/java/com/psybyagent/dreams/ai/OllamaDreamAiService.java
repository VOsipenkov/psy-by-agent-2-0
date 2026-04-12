package com.psybyagent.dreams.ai;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
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
    private static final Pattern SENTENCE_SPLIT_PATTERN = Pattern.compile("(?<=[.!?])\\s+");
    private static final Set<String> STOP_WORDS = Set.of(
        "и", "в", "во", "на", "не", "но", "что", "как", "мне", "меня", "был", "была", "были",
        "это", "этот", "эта", "эти", "она", "они", "его", "ее", "мы", "вы", "ты", "я", "сон",
        "сны", "потом", "когда", "где", "или", "под", "над", "из", "за", "для", "очень",
        "the", "with", "from", "into", "that", "this", "were", "when", "where", "about",
        "after", "before", "there", "their", "have", "felt", "dream"
    );
    private static final Set<String> TITLE_FILLER_WORDS = Set.of(
        "такие", "такой", "такая", "такое", "эти", "этот", "эта", "это",
        "какие", "какой", "какая", "какое", "так", "просто", "such", "this", "that", "just"
    );
    private static final Set<String> TITLE_GENERIC_WORDS = Set.of(
        "человек", "люди", "женщина", "мужчина", "кто-то", "person", "people", "woman", "man", "someone"
    );
    private static final Set<String> GENERIC_SYMBOL_MARKERS = Set.of(
        "вода", "море", "река", "дверь", "поезд", "лес", "город",
        "water", "sea", "river", "door", "train", "forest", "city"
    );
    private static final List<ThemeDefinition> THEME_DEFINITIONS = List.of(
        new ThemeDefinition("deception_false_identity", "обман", "deception", 6, List.of(
            "обман", "заман", "ловуш", "не та", "не тот", "ложн", "подмен", "deception", "trap", "false", "fake", "impostor"
        )),
        new ThemeDefinition("school_authority", "школа", "school", 5, List.of(
            "школ", "урок", "класс", "учител", "литератур", "математ", "school", "teacher", "class", "lesson", "authority", "evaluation"
        )),
        new ThemeDefinition("family_identity", "отец", "father", 5, List.of(
            "отец", "отца", "отцом", "пап", "родител", "семь", "развод", "бывш", "father", "dad", "parent", "family", "divorce", "resemblance", "identity"
        )),
        new ThemeDefinition("protection_help", "защита", "protection", 4, List.of(
            "полици", "подруг", "помощ", "звон", "вызва", "защит", "контрол", "police", "friend", "help", "call", "protect", "support", "control", "agency"
        )),
        new ThemeDefinition("shame_grief", "стыд", "shame", 3, List.of(
            "стыд", "стыдно", "грусть", "груст", "вина", "неловк", "shame", "ashamed", "grief", "sad", "sadness", "guilt", "embarrass"
        )),
        new ThemeDefinition("trust_mistrust", "недоверие", "mistrust", 3, List.of(
            "довер", "недовер", "подозр", "сомне", "верить", "trust", "mistrust", "suspicion", "doubt", "uncertain"
        )),
        new ThemeDefinition("home_boundaries", "дом", "home", 2, List.of(
            "дом", "дома", "домой", "квартир", "комнат", "пространств", "границ", "private space", "home", "house", "apartment", "room", "boundary", "boundaries"
        )),
        new ThemeDefinition("fear_threat", "страх", "fear", 2, List.of(
            "страх", "страш", "опас", "угроз", "тревог", "боюсь", "panic", "fear", "afraid", "danger", "threat", "unsafe", "anxiety"
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
        String normalizedLanguage = normalizeLanguage(language);
        ConversationSnapshot snapshot = buildSnapshot(conversation, normalizedLanguage);
        List<DreamConversation> relevantRecentDreams = selectRelevantRecentDreams(snapshot, recentDreams, normalizedLanguage);

        try {
            String prompt = buildPrompt(snapshot, conversation, relevantRecentDreams, normalizedLanguage);
            String requestBody = objectMapper.writeValueAsString(
                new OllamaGenerateRequest(ollamaProperties.getModel(), prompt, false, "json", false)
            );
            Duration requestTimeout = ollamaProperties.getTimeout() == null
                ? Duration.ofMinutes(3)
                : ollamaProperties.getTimeout();

            HttpRequest request = HttpRequest.newBuilder()
                .uri(buildGenerateUri())
                .timeout(requestTimeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 400 || !StringUtils.hasText(response.body())) {
                return fallback(snapshot, conversation, relevantRecentDreams, normalizedLanguage);
            }

            String responseText = extractResponseText(response.body());
            if (!StringUtils.hasText(responseText)) {
                return fallback(snapshot, conversation, relevantRecentDreams, normalizedLanguage);
            }

            OllamaAnalysisPayload payload = objectMapper.readValue(normalizeJson(responseText), OllamaAnalysisPayload.class);
            return toResult(payload, snapshot, conversation, relevantRecentDreams, normalizedLanguage);
        } catch (Exception exception) {
            log.warn("Falling back to local dream analysis because Ollama call failed: {}", exception.getMessage());
            return fallback(snapshot, conversation, relevantRecentDreams, normalizedLanguage);
        }
    }

    private DreamAiResult toResult(
        OllamaAnalysisPayload payload,
        ConversationSnapshot snapshot,
        DreamConversation conversation,
        List<DreamConversation> recentDreams,
        String language
    ) {
        boolean shouldClarify = "CLARIFYING".equalsIgnoreCase(payload.stage()) && !snapshot.readyForInterpretation();
        if (shouldClarify) {
            String assistantMessage = sanitizeOutputText(firstNonBlank(payload.assistantMessage(), clarifyingQuestion(language)));
            return new DreamAiResult(
                DreamStage.CLARIFYING,
                assistantMessage,
                conversation.getTitle(),
                sanitizeKeywords(payload.keywords(), snapshot, conversation, language),
                conversation.getInterpretation(),
                conversation.getRecommendation()
            );
        }

        String interpretationSource = firstNonBlank(payload.interpretation(), payload.assistantMessage());
        if (!StringUtils.hasText(interpretationSource)) {
            return fallback(snapshot, conversation, recentDreams, language);
        }

        List<String> keywords = sanitizeKeywords(payload.keywords(), snapshot, conversation, language);
        String title = chooseTitle(payload.title(), keywords, snapshot, language);
        String interpretation = sanitizeOutputText(interpretationSource);

        if (shouldUseFallback(payload, title, keywords, interpretation, snapshot)) {
            return fallback(snapshot, conversation, recentDreams, language);
        }

        String recurringInsight = buildRecurringDreamsInsight(keywords, recentDreams, language);
        interpretation = mergeRecurringInsight(interpretation, recurringInsight);
        String recommendation = fallbackRecommendation(snapshot, keywords, language);

        return interpretedResult(title, keywords, interpretation, recommendation, language);
    }

    private DreamAiResult fallback(
        ConversationSnapshot snapshot,
        DreamConversation conversation,
        List<DreamConversation> recentDreams,
        String language
    ) {
        List<String> keywords = sanitizeKeywords(List.of(), snapshot, conversation, language);
        String title = chooseTitle(null, keywords, snapshot, language);
        String interpretation = fallbackInterpretation(snapshot, keywords, language);
        interpretation = mergeRecurringInsight(interpretation, buildRecurringDreamsInsight(keywords, recentDreams, language));
        String recommendation = fallbackRecommendation(snapshot, keywords, language);
        return interpretedResult(title, keywords, interpretation, recommendation, language);
    }

    private String buildPrompt(
        ConversationSnapshot snapshot,
        DreamConversation conversation,
        List<DreamConversation> recentDreams,
        String language
    ) {
        String ragContext = dreamInterpretationRagService.buildContext(conversation, language);
        String recentDreamsContext = buildRecentDreamsContext(snapshot, recentDreams, language);
        String motifText = formatDetectedMotifs(snapshot, language);

        return isEnglish(language)
            ? buildEnglishPrompt(snapshot, ragContext, recentDreamsContext, motifText)
            : buildRussianPrompt(snapshot, ragContext, recentDreamsContext, motifText);
    }

    private String buildRussianPrompt(
        ConversationSnapshot snapshot,
        String ragContext,
        String recentDreamsContext,
        String motifText
    ) {
        return """
            Ты русскоязычный психотерапевт, который бережно и точно интерпретирует сновидения.
            Твоя задача — не общий разговор и не пересказ сонника, а содержательная интерпретация сна.
            Сначала читай сон как эмоциональную историю, а уже потом как набор символов.

            Правила опоры:
            - Главный источник смысла — текущий сон пользователя.
            - Недавние сны являются только вторичным фоном и используются лишь тогда, когда мотивы явно повторяются.
            - Нельзя подмешивать в ответ символы, места, персонажей и ключевые слова, которых нет в текущем сне.
            - Если у тебя уже есть описание сна, пережитые чувства и выбранные пользователем ключевые слова, ты должен вернуть stage=INTERPRETED.
            - Выбранные пользователем ключевые слова нужно учитывать как значимые опорные мотивы, а не как случайный список.
            - Не заменяй сюжет сна абстрактными символами. Если в текущем сне нет воды, города, леса или поезда, не делай их центром ответа.

            Приоритеты интерпретации:
            1. Назови центральный конфликт, эмоциональный перелом и финал сна.
            2. Если сон строится вокруг семьи, авторитета, стыда, обмана, ложного узнавания, угрозы безопасности или самозащиты, поставь эти темы выше абстрактной символики.
            3. Используй символы, чтобы уточнять сюжет, а не подменять сюжет.
            4. Связывай сон с чувствами, границами, доверием, уязвимостью, идентичностью и отношениями в реальной жизни.
            5. Если во сне есть учитель, родитель, бывший партнер родителя, дом, страх, подруга или полиция, считай их значимыми фигурами сюжета.

            Правила ответа:
            - Пиши только по-русски.
            - Не ставь психиатрических диагнозов и не давай медицинских заключений.
            - Не упоминай книги, авторов, школы, сонники, Юнга, Фрейда, гештальт или какой-либо источник.
            - Формулируй смыслы как бережные гипотезы, а не как окончательную истину.
            - Верни только валидный JSON без markdown и без текста вне JSON.

            Внутренняя проверка:
            - Какая сцена делает человека более уязвимым?
            - Кто здесь имеет власть, кто кажется знакомым, а кто становится ложным, опасным или вторгающимся?
            - Где поднимаются стыд, грусть, страх, недоверие или облегчение?
            - В какой точке возникает нарушение границ или угроза безопасности?
            - Как человек пытается вернуть себе опору, поддержку или контроль?

            Если деталей уже достаточно, интерпретация должна:
            - начинаться с главного эмоционального конфликта;
            - объяснять переход от знакомого к опасному, если он есть;
            - связывать сон с отношениями, идентичностью, границами, доверием и безопасностью;
            - завершаться осторожной гипотезой о том, чему этот сон может соответствовать в реальной жизни.

            Если деталей недостаточно, верни stage=CLARIFYING и задай ровно один точный вопрос.

            Формат ответа:
            {
              "stage": "CLARIFYING" | "INTERPRETED",
              "assistantMessage": "string",
              "title": "1-2 words",
              "keywords": ["keyword1", "keyword2", "keyword3"],
              "interpretation": "string",
              "recommendation": "string"
            }

            Правила полей:
            - title: 1-2 содержательных слова, передающих эмоциональное ядро сна.
            - keywords: 2-6 ключевых мотивов из текущего сна и выбранных пользователем слов.
            - assistantMessage: краткая подводка или один точный уточняющий вопрос.
            - interpretation: полный разбор сна.
            - recommendation: \u0440\u043e\u0432\u043d\u043e 3 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f \u0441 \u0431\u0435\u0440\u0435\u0436\u043d\u043e\u0439 \u043f\u0440\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0439 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0435\u0439 \u0432 \u0442\u043e\u043d\u0435 \u043e\u043f\u044b\u0442\u043d\u043e\u0433\u043e \u043f\u0441\u0438\u0445\u043e\u043b\u043e\u0433\u0430, \u0431\u0435\u0437 \u0434\u0438\u0430\u0433\u043d\u043e\u0437\u043e\u0432 \u0438 \u043c\u0435\u0434\u0438\u0446\u0438\u043d\u0441\u043a\u0438\u0445 \u0441\u043e\u0432\u0435\u0442\u043e\u0432.

            Выделенные мотивы текущего сна:
            %s

            Описание сна пользователя:
            %s

            Какие чувства пользователь испытывал во сне:
            %s

            Какие ключевые слова пользователь выбрал сам:
            %s

            Дополнительный контекст после выбора слов:
            %s

            Контекст знаний по интерпретации:
            %s

            Недавние сны за последнюю неделю, которые действительно могут быть связаны:
            %s
            """.formatted(
            motifText,
            fallbackSectionValue(snapshot.dreamDescription(), "нет"),
            fallbackSectionValue(snapshot.emotionDescription(), "нет"),
            snapshot.selectedKeywords().isEmpty() ? "нет" : String.join(", ", snapshot.selectedKeywords()),
            fallbackSectionValue(snapshot.additionalContext(), "нет"),
            fallbackSectionValue(ragContext, "нет"),
            fallbackSectionValue(recentDreamsContext, "нет")
        );
    }

    private String buildEnglishPrompt(
        ConversationSnapshot snapshot,
        String ragContext,
        String recentDreamsContext,
        String motifText
    ) {
        return """
            You are an English-speaking psychotherapist who interprets dreams with care and precision.
            Your job is not generic conversation and not a dream-dictionary summary.
            Read the dream first as an emotional story and only then as a field of symbols.

            Grounding rules:
            - The current dream is the main source of meaning.
            - Recent dreams are only secondary background and should be used only when motifs clearly repeat.
            - Do not import symbols, places, people, or keywords that are absent from the current dream.
            - If you already have the dream description, the felt emotions, and the user-selected keywords, you should return stage=INTERPRETED.
            - Treat the user-selected keywords as meaningful anchors, not as decorative extras.
            - Do not replace the actual storyline with generic symbols. If the current dream does not contain water, a city, a forest, or a train, do not make them central.

            Interpretation priorities:
            1. Name the central conflict, emotional turning point, and ending.
            2. If the dream is driven by family, authority, shame, deception, mistaken identity, safety threat, or self-protection, prioritize those themes over abstract symbolism.
            3. Use symbols to sharpen the plot, not to replace the plot.
            4. Connect the dream to feelings, boundaries, trust, vulnerability, identity, and present-life relationships.
            5. If the dream contains a teacher, parent, a parent's former partner, a home, fear, a friend, or police, treat them as meaningful relational signals.

            Output rules:
            - Write only in English.
            - Do not diagnose psychiatric disorders and do not give medical conclusions.
            - Do not mention books, authors, schools, dream dictionaries, Jung, Freud, Gestalt, or any source.
            - Present meanings as careful hypotheses, not absolute truth.
            - Return valid JSON only, without markdown and without text outside JSON.

            Internal checklist:
            - What scene makes the dreamer more vulnerable?
            - Who has power, who seems familiar, and who becomes false, dangerous, or intrusive?
            - Where do shame, grief, fear, mistrust, or relief rise?
            - At what point do boundaries break or safety feel threatened?
            - How does the dreamer try to restore support, agency, or control?

            If there is already enough detail, the interpretation should:
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
              "interpretation": "string",
              "recommendation": "string"
            }

            Field rules:
            - title: 1-2 meaningful words capturing the emotional core.
            - keywords: 2-6 key motifs from the current dream and the user-selected words.
            - assistantMessage: a brief lead-in or one focused follow-up question.
            - interpretation: the full dream reading.
            - recommendation: exactly 3 sentences with a gentle practical recommendation in the voice of an experienced psychologist, without diagnoses or medical advice.

            Detected motifs in the current dream:
            %s

            User dream description:
            %s

            Emotions the user felt in the dream:
            %s

            Keywords the user selected personally:
            %s

            Additional context after keyword selection:
            %s

            Dream interpretation knowledge context:
            %s

            Recent dreams from the last week that may actually be related:
            %s
            """.formatted(
            motifText,
            fallbackSectionValue(snapshot.dreamDescription(), "none"),
            fallbackSectionValue(snapshot.emotionDescription(), "none"),
            snapshot.selectedKeywords().isEmpty() ? "none" : String.join(", ", snapshot.selectedKeywords()),
            fallbackSectionValue(snapshot.additionalContext(), "none"),
            fallbackSectionValue(ragContext, "none"),
            fallbackSectionValue(recentDreamsContext, "none")
        );
    }

    private String buildRecentDreamsContext(
        ConversationSnapshot snapshot,
        List<DreamConversation> recentDreams,
        String language
    ) {
        if (recentDreams == null || recentDreams.isEmpty()) {
            return fallbackSectionValue("", isEnglish(language) ? "none" : "нет");
        }

        List<String> items = new ArrayList<>();
        for (DreamConversation recentDream : recentDreams) {
            String item = isEnglish(language)
                ? """
                    - Title: %s
                      Keywords: %s
                      Meaning: %s
                    """.formatted(
                    firstNonBlank(recentDream.getTitle(), "Untitled"),
                    recentDream.getKeywords().isEmpty() ? "none" : String.join(", ", recentDream.getKeywords()),
                    summarizeText(firstNonBlank(recentDream.getInterpretation(), recentDreamSearchText(recentDream)), 180)
                )
                : """
                    - Название: %s
                      Ключевые слова: %s
                      Смысл: %s
                    """.formatted(
                    firstNonBlank(recentDream.getTitle(), "Без названия"),
                    recentDream.getKeywords().isEmpty() ? "нет" : String.join(", ", recentDream.getKeywords()),
                    summarizeText(firstNonBlank(recentDream.getInterpretation(), recentDreamSearchText(recentDream)), 180)
                );
            items.add(item.trim());
        }

        return String.join("\n", items);
    }

    private String fallbackSectionValue(String value, String fallback) {
        return StringUtils.hasText(value) ? value.trim() : fallback;
    }

    private URI buildGenerateUri() {
        String baseUrl = ollamaProperties.getBaseUrl();
        if (baseUrl.endsWith("/")) {
            return URI.create(baseUrl + "api/generate");
        }
        return URI.create(baseUrl + "/api/generate");
    }

    private String extractResponseText(String rawBody) {
        try {
            return objectMapper.readTree(rawBody).path("response").asText("");
        } catch (Exception ignored) {
            return "";
        }
    }

    private String normalizeJson(String rawResponse) {
        String trimmed = rawResponse.trim();
        if (trimmed.startsWith("```")) {
            trimmed = trimmed.replace("```json", "").replace("```", "").trim();
        }

        int firstBrace = trimmed.indexOf('{');
        int lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return trimmed.substring(firstBrace, lastBrace + 1);
        }
        return trimmed;
    }

    private List<String> sanitizeKeywords(
        List<String> rawKeywords,
        ConversationSnapshot snapshot,
        DreamConversation conversation,
        String language
    ) {
        LinkedHashSet<String> keywords = new LinkedHashSet<>();
        String narrative = extractCurrentNarrative(snapshot);

        snapshot.selectedKeywords().forEach(keyword -> keywords.add(prettyKeyword(keyword)));
        rawKeywords.stream()
            .filter(StringUtils::hasText)
            .map(this::prettyKeyword)
            .filter(keyword -> isKeywordGrounded(keyword, narrative, snapshot.selectedKeywords()))
            .forEach(keywords::add);
        extractKeywords(narrative, language).forEach(keywords::add);
        conversation.getKeywords().stream()
            .map(this::prettyKeyword)
            .filter(keyword -> isKeywordGrounded(keyword, narrative, snapshot.selectedKeywords()))
            .forEach(keywords::add);

        if (keywords.isEmpty()) {
            keywords.add(isEnglish(language) ? "Dream" : "Сон");
            keywords.add(isEnglish(language) ? "Emotion" : "Эмоция");
        }

        return keywords.stream().limit(6).toList();
    }

    private List<String> extractKeywords(String text, String language) {
        String normalizedText = firstNonBlank(text).toLowerCase(Locale.ROOT);
        LinkedHashSet<String> keywords = new LinkedHashSet<>();

        addKeywordIfContains(keywords, normalizedText, language, "School", "Школа", "школ", "урок", "учител", "school", "teacher", "lesson");
        addKeywordIfContains(keywords, normalizedText, language, "Father", "Отец", "отец", "отца", "отцом", "пап", "father", "dad");
        addKeywordIfContains(keywords, normalizedText, language, "Former partner", "Бывшая партнерша", "бывш", "девушк", "former partner", "ex");
        addKeywordIfContains(keywords, normalizedText, language, "Deception", "Обман", "обман", "заман", "ловуш", "ложн", "deception", "false", "trap");
        addKeywordIfContains(keywords, normalizedText, language, "Recognition", "Узнавание", "узна", "recogn", "familiar");
        addKeywordIfContains(keywords, normalizedText, language, "Home", "Дом", "дом", "квартир", "комнат", "home", "house");
        addKeywordIfContains(keywords, normalizedText, language, "Fear", "Страх", "страх", "опас", "угроз", "тревог", "fear", "danger", "threat");
        addKeywordIfContains(keywords, normalizedText, language, "Friend", "Подруга", "подруг", "friend");
        addKeywordIfContains(keywords, normalizedText, language, "Police", "Полиция", "полици", "police");
        addKeywordIfContains(keywords, normalizedText, language, "Shame", "Стыд", "стыд", "неловк", "shame", "embarrass");
        addKeywordIfContains(keywords, normalizedText, language, "Trust", "Доверие", "довер", "недовер", "сомне", "trust", "mistrust");
        addKeywordIfContains(keywords, normalizedText, language, "Protection", "Защита", "защит", "помощ", "звон", "protect", "help", "call");

        for (String token : TOKEN_SPLIT_PATTERN.split(normalizedText)) {
            if (!StringUtils.hasText(token) || token.length() < 4 || STOP_WORDS.contains(token)) {
                continue;
            }
            keywords.add(prettyKeyword(token));
            if (keywords.size() >= 6) {
                break;
            }
        }

        return keywords.stream().limit(6).toList();
    }

    private void addKeywordIfContains(
        LinkedHashSet<String> keywords,
        String text,
        String language,
        String englishValue,
        String russianValue,
        String... markers
    ) {
        for (String marker : markers) {
            if (text.contains(marker)) {
                keywords.add(isEnglish(language) ? englishValue : russianValue);
                return;
            }
        }
    }

    private String chooseTitle(
        String suggestedTitle,
        List<String> keywords,
        ConversationSnapshot snapshot,
        String language
    ) {
        if (StringUtils.hasText(suggestedTitle) && !isWeakTitle(suggestedTitle, keywords)) {
            return normalizeTitle(suggestedTitle);
        }

        String narrative = extractCurrentNarrative(snapshot).toLowerCase(Locale.ROOT);
        if (containsAny(narrative, "школ", "урок", "учител", "school", "teacher", "lesson")
            && containsAny(narrative, "отец", "отца", "отцом", "пап", "father", "dad")
            && containsAny(narrative, "обман", "ложн", "заман", "deception", "false", "trap")) {
            return isEnglish(language) ? "False recognition" : "Ложное узнавание";
        }
        if (containsAny(narrative, "страх", "опас", "угроз", "fear", "danger", "threat")
            && containsAny(narrative, "полици", "подруг", "помощ", "звон", "police", "friend", "help", "call")) {
            return isEnglish(language) ? "Call for help" : "Зов помощи";
        }
        if (containsAny(narrative, "дом", "квартир", "границ", "home", "house", "boundary")) {
            return isEnglish(language) ? "Broken boundaries" : "Нарушенные границы";
        }
        if (!keywords.isEmpty()) {
            if (keywords.size() >= 2 && keywords.get(0).length() + keywords.get(1).length() <= 26) {
                return normalizeTitle("%s %s".formatted(keywords.get(0), keywords.get(1).toLowerCase(Locale.ROOT)));
            }
            return normalizeTitle(keywords.get(0));
        }
        return defaultTitle(language);
    }

    private List<DreamConversation> selectRelevantRecentDreams(
        ConversationSnapshot snapshot,
        List<DreamConversation> recentDreams,
        String language
    ) {
        if (recentDreams == null || recentDreams.isEmpty()) {
            return List.of();
        }

        List<DetectedTheme> currentThemes = detectThemes(extractCurrentNarrative(snapshot));
        return recentDreams.stream()
            .map(dream -> new RelatedDream(dream, scoreRelatedDream(dream, currentThemes, snapshot.selectedKeywords())))
            .filter(relatedDream -> relatedDream.score() > 0)
            .sorted(Comparator.comparingInt(RelatedDream::score).reversed())
            .limit(3)
            .map(RelatedDream::conversation)
            .toList();
    }

    private int scoreRelatedDream(
        DreamConversation dream,
        List<DetectedTheme> currentThemes,
        List<String> selectedKeywords
    ) {
        String recentText = recentDreamSearchText(dream);
        List<DetectedTheme> recentThemes = detectThemes(recentText);
        int sharedPriority = sharedThemePriority(currentThemes, recentThemes);
        long sharedKeywords = selectedKeywords.stream()
            .map(keyword -> keyword.toLowerCase(Locale.ROOT))
            .filter(recentText::contains)
            .count();
        return sharedPriority * 10 + Math.toIntExact(sharedKeywords);
    }

    private String buildRecurringDreamsInsight(List<String> keywords, List<DreamConversation> recentDreams, String language) {
        if (recentDreams == null || recentDreams.isEmpty()) {
            return "";
        }

        long relatedDreams = recentDreams.stream()
            .filter(dream -> keywords.stream()
                .map(keyword -> keyword.toLowerCase(Locale.ROOT))
                .anyMatch(keyword -> recentDreamSearchText(dream).contains(keyword)))
            .count();

        if (relatedDreams == 0) {
            return "";
        }

        return isEnglish(language)
            ? "A related theme also appears in other recent dreams, so this may reflect a repeating emotional pattern rather than an isolated scene."
            : "Похожая тема появляется и в других недавних снах, поэтому здесь может проявляться не случайный эпизод, а повторяющийся эмоциональный узор.";
    }

    private String mergeRecurringInsight(String interpretation, String recurringInsight) {
        if (!StringUtils.hasText(recurringInsight) || interpretation.contains(recurringInsight)) {
            return interpretation;
        }
        return interpretation + " " + recurringInsight;
    }

    private DreamAiResult interpretedResult(
        String title,
        List<String> keywords,
        String interpretation,
        String recommendation,
        String language
    ) {
        String normalizedRecommendation = normalizeRecommendation(recommendation);
        String assistantMessage = buildInterpretationAssistantMessage(interpretation, normalizedRecommendation, language);
        return new DreamAiResult(DreamStage.INTERPRETED, assistantMessage, title, keywords, interpretation, normalizedRecommendation);
    }

    private String chooseRecommendation(String recommendation, ConversationSnapshot snapshot, List<String> keywords, String language) {
        String normalizedRecommendation = normalizeRecommendation(recommendation);
        if (countSentences(normalizedRecommendation) >= 3 && !isWeakRecommendation(normalizedRecommendation, language)) {
            return normalizedRecommendation;
        }
        return fallbackRecommendation(snapshot, keywords, language);
    }

    private boolean isWeakRecommendation(String recommendation, String language) {
        String normalized = firstNonBlank(recommendation).toLowerCase(Locale.ROOT);
        if (!StringUtils.hasText(normalized)) {
            return true;
        }

        boolean hasCyrillic = normalized.codePoints()
            .anyMatch(codePoint -> Character.UnicodeBlock.of(codePoint) == Character.UnicodeBlock.CYRILLIC);
        boolean hasLongAsciiWord = normalized.matches(".*[a-z]{4,}.*");

        if (isEnglish(language) && hasCyrillic) {
            return true;
        }
        if (!isEnglish(language) && hasLongAsciiWord) {
            return true;
        }

        return normalized.contains("describe your dream")
            || normalized.contains("try again")
            || normalized.contains("display")
            || normalized.contains("once the plot")
            || normalized.contains("text again")
            || normalized.contains("format");
    }

    private String normalizeRecommendation(String recommendation) {
        List<String> sentences = splitIntoSentences(recommendation);
        if (sentences.isEmpty()) {
            return "";
        }
        return String.join(" ", sentences.stream().limit(3).toList());
    }

    private int countSentences(String text) {
        return splitIntoSentences(text).size();
    }

    private List<String> splitIntoSentences(String text) {
        String normalized = sanitizeOutputText(text);
        if (!StringUtils.hasText(normalized)) {
            return List.of();
        }
        return SENTENCE_SPLIT_PATTERN.splitAsStream(normalized.replace("\n", " "))
            .map(String::trim)
            .filter(StringUtils::hasText)
            .toList();
    }

    private String buildInterpretationAssistantMessage(String interpretation, String recommendation, String language) {
        if (!StringUtils.hasText(recommendation)) {
            return interpretation;
        }
        return isEnglish(language)
            ? interpretation + "\n\nPsychologist's recommendation:\n" + recommendation
            : interpretation + "\n\n\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u044f \u043f\u0441\u0438\u0445\u043e\u043b\u043e\u0433\u0430:\n" + recommendation;
    }

    private String fallbackRecommendation(ConversationSnapshot snapshot, List<String> keywords, String language) {
        String narrative = extractCurrentNarrative(snapshot).toLowerCase(Locale.ROOT);
        List<DetectedTheme> themes = detectThemes(narrative);
        String joinedKeywords = keywords.isEmpty() ? (isEnglish(language) ? "the dream" : "\u044d\u0442\u043e\u0442 \u0441\u043e\u043d") : String.join(", ", keywords);
        if (isEnglish(language)) {
            String first = hasTheme(themes, "fear_threat") || hasTheme(themes, "home_boundaries")
                ? "Over the next few days, notice which real-life situations bring back anxiety or a sense of reduced safety most quickly."
                : hasTheme(themes, "shame_grief")
                    ? "Over the next few days, gently notice where shame, sadness, or vulnerability show up around the same themes."
                    : "Over the next few days, return to this dream as a clue to which feelings around " + joinedKeywords + " are especially alive right now.";
            String second = hasTheme(themes, "deception_false_identity") || hasTheme(themes, "trust_mistrust")
                ? "If a similar tension appears in relationships, ask yourself where trust feels thinner right now and which boundary needs clearer protection."
                : hasTheme(themes, "protection_help")
                    ? "If the same tension returns during the day, lean in advance on the kind of support that helps you regain steadiness and a sense of control."
                    : "If the same feeling returns during the day, name the need or boundary that is asking for more attention.";
            String third = "A short note about the dream, the feelings, and any repeating themes can help you bring this material into therapy or simply track it with more care and less self-criticism.";
            return String.join(" ", first, second, third);
        }
        String first = hasTheme(themes, "fear_threat") || hasTheme(themes, "home_boundaries")
            ? "\u0412 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0434\u043d\u0438 \u043f\u043e\u043b\u0435\u0437\u043d\u043e \u043e\u0442\u043c\u0435\u0447\u0430\u0442\u044c, \u0432 \u043a\u0430\u043a\u0438\u0445 \u0440\u0435\u0430\u043b\u044c\u043d\u044b\u0445 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044f\u0445 \u0431\u044b\u0441\u0442\u0440\u0435\u0435 \u0432\u0441\u0435\u0433\u043e \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442\u0441\u044f \u0442\u0440\u0435\u0432\u043e\u0433\u0430 \u0438\u043b\u0438 \u043e\u0449\u0443\u0449\u0435\u043d\u0438\u0435 \u043d\u0435\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u0438."
            : hasTheme(themes, "shame_grief")
                ? "\u0412 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0434\u043d\u0438 \u043f\u043e\u043b\u0435\u0437\u043d\u043e \u043c\u044f\u0433\u043a\u043e \u0437\u0430\u043c\u0435\u0447\u0430\u0442\u044c, \u0433\u0434\u0435 \u0440\u044f\u0434\u043e\u043c \u0441 \u044d\u0442\u043e\u0439 \u0442\u0435\u043c\u043e\u0439 \u043f\u043e\u0434\u043d\u0438\u043c\u0430\u044e\u0442\u0441\u044f \u0441\u0442\u044b\u0434, \u0433\u0440\u0443\u0441\u0442\u044c \u0438\u043b\u0438 \u0443\u044f\u0437\u0432\u0438\u043c\u043e\u0441\u0442\u044c."
                : "\u0412 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0434\u043d\u0438 \u043f\u043e\u043b\u0435\u0437\u043d\u043e \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0442\u044c\u0441\u044f \u043a \u044d\u0442\u043e\u043c\u0443 \u0441\u043d\u0443 \u043a\u0430\u043a \u043a \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0435 \u043e \u0442\u043e\u043c, \u043a\u0430\u043a\u0438\u0435 \u0447\u0443\u0432\u0441\u0442\u0432\u0430 \u0432\u043e\u043a\u0440\u0443\u0433 \u0442\u0435\u043c\u044b " + joinedKeywords + " \u0441\u0435\u0439\u0447\u0430\u0441 \u043e\u0441\u043e\u0431\u0435\u043d\u043d\u043e \u0436\u0438\u0432\u044b.";
        String second = hasTheme(themes, "deception_false_identity") || hasTheme(themes, "trust_mistrust")
            ? "\u0415\u0441\u043b\u0438 \u043f\u043e\u0445\u043e\u0436\u0435\u0435 \u043d\u0430\u043f\u0440\u044f\u0436\u0435\u043d\u0438\u0435 \u0432\u0441\u043f\u043b\u044b\u0432\u0430\u0435\u0442 \u0432 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f\u0445, \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u043d\u0430\u0437\u0432\u0430\u0442\u044c \u0441\u0435\u0431\u0435, \u0433\u0434\u0435 \u0441\u0435\u0439\u0447\u0430\u0441 \u0442\u0440\u0443\u0434\u043d\u0435\u0435 \u0434\u043e\u0432\u0435\u0440\u044f\u0442\u044c \u0438 \u043a\u0430\u043a\u0430\u044f \u0433\u0440\u0430\u043d\u0438\u0446\u0430 \u043d\u0443\u0436\u0434\u0430\u0435\u0442\u0441\u044f \u0432 \u0431\u043e\u043b\u0435\u0435 \u044f\u0441\u043d\u043e\u0439 \u0437\u0430\u0449\u0438\u0442\u0435."
            : hasTheme(themes, "protection_help")
                ? "\u0415\u0441\u043b\u0438 \u044d\u0442\u043e \u043d\u0430\u043f\u0440\u044f\u0436\u0435\u043d\u0438\u0435 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442\u0441\u044f \u0434\u043d\u0451\u043c, \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0437\u0430\u0440\u0430\u043d\u0435\u0435 \u043e\u043f\u0435\u0440\u0435\u0442\u044c\u0441\u044f \u043d\u0430 \u0442\u043e\u0442 \u0441\u043f\u043e\u0441\u043e\u0431 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0438, \u043a\u043e\u0442\u043e\u0440\u044b\u0439 \u043f\u043e\u043c\u043e\u0433\u0430\u0435\u0442 \u0432\u0435\u0440\u043d\u0443\u0442\u044c \u0432\u0430\u043c \u0443\u0441\u0442\u043e\u0439\u0447\u0438\u0432\u043e\u0441\u0442\u044c \u0438 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044c."
                : "\u0415\u0441\u043b\u0438 \u043f\u043e\u0445\u043e\u0436\u0435\u0435 \u0447\u0443\u0432\u0441\u0442\u0432\u043e \u0432\u0441\u043f\u043b\u044b\u0432\u0430\u0435\u0442 \u0434\u043d\u0451\u043c, \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u043d\u0430\u0437\u0432\u0430\u0442\u044c, \u043a\u0430\u043a\u0430\u044f \u043f\u043e\u0442\u0440\u0435\u0431\u043d\u043e\u0441\u0442\u044c \u0438\u043b\u0438 \u0433\u0440\u0430\u043d\u0438\u0446\u0430 \u0441\u0435\u0439\u0447\u0430\u0441 \u043f\u0440\u043e\u0441\u0438\u0442 \u0431\u043e\u043b\u044c\u0448\u0435 \u0432\u043d\u0438\u043c\u0430\u043d\u0438\u044f.";
        String third = "\u041a\u043e\u0440\u043e\u0442\u043a\u0430\u044f \u0437\u0430\u043f\u0438\u0441\u044c \u0441\u043d\u0430, \u0447\u0443\u0432\u0441\u0442\u0432 \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u044e\u0449\u0438\u0445\u0441\u044f \u0442\u0435\u043c \u043c\u043e\u0436\u0435\u0442 \u043f\u043e\u043c\u043e\u0447\u044c \u043e\u0431\u0441\u0443\u0434\u0438\u0442\u044c \u044d\u0442\u043e \u0441 \u043f\u0441\u0438\u0445\u043e\u043b\u043e\u0433\u043e\u043c \u0438\u043b\u0438 \u043f\u0440\u043e\u0441\u0442\u043e \u0431\u0435\u0440\u0435\u0436\u043d\u043e \u043e\u0442\u0441\u043b\u0435\u0436\u0438\u0432\u0430\u0442\u044c \u0441\u0432\u043e\u044e \u0434\u0438\u043d\u0430\u043c\u0438\u043a\u0443 \u0431\u0435\u0437 \u0441\u0430\u043c\u043e\u043a\u0440\u0438\u0442\u0438\u043a\u0438.";
        return String.join(" ", first, second, third);
    }

    private String sanitizeOutputText(String text) {
        if (!StringUtils.hasText(text)) {
            return text;
        }

        return text
            .replaceAll("(?iu)according\\s+to\\s+(jung|freud|miller|gestalt)[:,]?\\s*", "")
            .replaceAll("(?iu)according\\s+to\\s+(the\\s+)?dream\\s+dictionary[:,]?\\s*", "")
            .replaceAll("(?iu)по\\s+соннику[:,]?\\s*", "")
            .replaceAll("(?iu)по\\s+мнению\\s+(юнга|фрейда)[:,]?\\s*", "")
            .replaceAll("(?iu)jung(?:ian)?", "")
            .replaceAll("(?iu)freud(?:ian)?", "")
            .replaceAll("(?iu)gestalt", "")
            .replaceAll("(?iu)юнг(?:а|у|ом|е)?", "")
            .replaceAll("(?iu)фрейд(?:а|у|ом|е)?", "")
            .replaceAll("(?iu)гештальт", "")
            .replaceAll("\\s{2,}", " ")
            .replaceAll("\\s+([,.!?])", "$1")
            .trim();
    }

    private String clarifyingQuestion(String language) {
        return isEnglish(language)
            ? "What stands out most strongly in this dream: the person, the emotional shift, or the moment you tried to protect yourself?"
            : "Что в этом сне выделяется сильнее всего: человек, эмоциональный перелом или момент, когда вы начали защищать себя?";
    }

    private String fallbackInterpretation(ConversationSnapshot snapshot, List<String> keywords, String language) {
        String narrative = extractCurrentNarrative(snapshot).toLowerCase(Locale.ROOT);
        List<DetectedTheme> themes = detectThemes(narrative);
        List<String> parts = new ArrayList<>();

        if (hasTheme(themes, "school_authority") && hasTheme(themes, "family_identity")) {
            parts.add(isEnglish(language)
                ? "The dream places you back into a school-like, evaluative role while tying that vulnerable position to your father and the family story around him."
                : "Сон возвращает вас в школьную, оценивающую роль и одновременно связывает эту уязвимую позицию с фигурой отца и семейной историей вокруг него.");
        } else if (hasTheme(themes, "school_authority")) {
            parts.add(isEnglish(language)
                ? "The school setting suggests a return to a place of examination, hierarchy, and emotional vulnerability."
                : "Школьная сцена похожа на возвращение в пространство проверки, иерархии и эмоциональной уязвимости.");
        }

        if (hasTheme(themes, "deception_false_identity")) {
            parts.add(hasTheme(themes, "home_boundaries")
                ? (isEnglish(language)
                    ? "Something that first feels familiar then turns false and dangerous, and the movement into someone else's home strengthens the theme of violated boundaries and collapsing trust."
                    : "То, что сначала выглядит знакомым, затем оказывается ложным и опасным, а переход в чужой дом усиливает тему нарушения границ и разрушающегося доверия.")
                : (isEnglish(language)
                    ? "The false figure suggests an experience in which the familiar becomes unsafe and recognition stops feeling reliable."
                    : "Ложная фигура указывает на опыт, в котором знакомое становится небезопасным, а узнавание перестает давать опору."));
        }

        if (hasTheme(themes, "shame_grief")) {
            parts.add(isEnglish(language)
                ? "Shame and sadness matter here as much as fear, because they point to an older relational wound rather than a random threat scene."
                : "Стыд и грусть здесь не менее важны, чем страх, потому что они указывают не на случайную угрозу, а на более старую рану в отношениях.");
        }

        if (hasTheme(themes, "fear_threat") && hasTheme(themes, "protection_help")) {
            parts.add(isEnglish(language)
                ? "The ending matters because you do not stay helpless: you call for support and try to restore safety and control."
                : "Финал особенно важен тем, что вы не остаетесь беспомощной: зовете поддержку и пытаетесь вернуть себе безопасность и контроль.");
        }

        if (parts.isEmpty()) {
            String joinedKeywords = String.join(", ", keywords);
            return isEnglish(language)
                ? "The dream gathers around %s. It reads less like a set of random symbols and more like an emotional story about trust, boundaries, vulnerability, and the need to regain safety."
                    .formatted(joinedKeywords)
                : "В центре сна оказываются %s. Здесь полезнее видеть не набор случайных символов, а эмоциональную историю о доверии, границах, уязвимости и попытке вернуть себе чувство безопасности."
                    .formatted(joinedKeywords);
        }

        if (!snapshot.selectedKeywords().isEmpty()) {
            parts.add(isEnglish(language)
                ? "The user-selected keywords reinforce the same line of meaning: %s."
                    .formatted(String.join(", ", snapshot.selectedKeywords()))
                : "Выбранные пользователем ключевые слова поддерживают ту же линию смысла: %s."
                    .formatted(String.join(", ", snapshot.selectedKeywords())));
        }

        parts.add(isEnglish(language)
            ? "A careful waking-life hypothesis is that this dream touches a place where old relational or family material still feels exposing, but where you already have more capacity to notice danger and protect your boundaries."
            : "Как бережная гипотеза для бодрствующей жизни, сон может касаться той точки, где старый семейный или связанный с отношениями опыт все еще делает человека уязвимым, но вместе с этим показывает и большую способность замечать опасность и защищать свои границы.");

        return String.join(" ", parts);
    }

    private boolean shouldUseFallback(
        OllamaAnalysisPayload payload,
        String title,
        List<String> keywords,
        String interpretation,
        ConversationSnapshot snapshot
    ) {
        String narrative = extractCurrentNarrative(snapshot);
        List<DetectedTheme> currentThemes = detectThemes(narrative);
        if (currentThemes.isEmpty()) {
            return false;
        }

        String responseText = String.join(" ", firstNonBlank(title), String.join(" ", keywords), firstNonBlank(payload.assistantMessage()), interpretation)
            .toLowerCase(Locale.ROOT);
        List<DetectedTheme> responseThemes = detectThemes(responseText);
        boolean hasSpecificCurrentTheme = currentThemes.stream().anyMatch(theme -> theme.priority() >= 4);
        long groundedKeywords = keywords.stream()
            .filter(keyword -> isKeywordGrounded(keyword, narrative, snapshot.selectedKeywords()))
            .count();

        if (hasSpecificCurrentTheme && sharedThemePriority(currentThemes, responseThemes) < 4) {
            return true;
        }
        if (keywords.size() >= 2 && groundedKeywords < 2) {
            return true;
        }
        return introducesUnexpectedGenericMotifs(responseText, narrative);
    }

    private boolean isKeywordGrounded(String keyword, String narrative, List<String> selectedKeywords) {
        String normalizedKeyword = keyword.toLowerCase(Locale.ROOT);
        if (narrative.contains(normalizedKeyword)) {
            return true;
        }
        return selectedKeywords.stream().map(value -> value.toLowerCase(Locale.ROOT)).anyMatch(normalizedKeyword::equals);
    }

    private boolean introducesUnexpectedGenericMotifs(String responseText, String narrative) {
        for (String marker : GENERIC_SYMBOL_MARKERS) {
            if (responseText.contains(marker) && !narrative.contains(marker)) {
                return true;
            }
        }
        return false;
    }

    private String formatDetectedMotifs(ConversationSnapshot snapshot, String language) {
        List<DetectedTheme> themes = detectThemes(extractCurrentNarrative(snapshot));
        if (themes.isEmpty()) {
            return isEnglish(language) ? "none" : "нет";
        }

        LinkedHashSet<String> labels = new LinkedHashSet<>();
        for (DetectedTheme theme : themes) {
            if (labels.size() >= 6) {
                break;
            }
            labels.add(theme.label(language));
        }
        return String.join(", ", labels);
    }

    private List<DetectedTheme> detectThemes(String text) {
        String normalizedText = firstNonBlank(text).toLowerCase(Locale.ROOT);
        List<DetectedTheme> themes = new ArrayList<>();

        for (ThemeDefinition definition : THEME_DEFINITIONS) {
            int markerMatches = 0;
            for (String marker : definition.markers()) {
                if (normalizedText.contains(marker)) {
                    markerMatches++;
                }
            }
            if (markerMatches > 0) {
                themes.add(new DetectedTheme(definition, definition.priority() * 10 + markerMatches));
            }
        }

        return themes.stream()
            .sorted(Comparator.comparingInt(DetectedTheme::score).reversed()
                .thenComparing(theme -> theme.definition().id()))
            .toList();
    }

    private int sharedThemePriority(List<DetectedTheme> left, List<DetectedTheme> right) {
        int best = 0;
        for (DetectedTheme leftTheme : left) {
            for (DetectedTheme rightTheme : right) {
                if (leftTheme.id().equals(rightTheme.id())) {
                    best = Math.max(best, leftTheme.priority());
                }
            }
        }
        return best;
    }

    private boolean hasTheme(List<DetectedTheme> themes, String themeId) {
        return themes.stream().anyMatch(theme -> theme.id().equals(themeId));
    }

    private ConversationSnapshot buildSnapshot(DreamConversation conversation, String language) {
        List<String> userMessages = conversation.getMessages().stream()
            .filter(message -> message.getRole() == ChatRole.USER)
            .map(DreamMessage::getContent)
            .toList();

        String dreamDescription = userMessages.size() >= 1 ? userMessages.get(0).trim() : "";
        String emotionDescription = userMessages.size() >= 2 ? userMessages.get(1).trim() : "";
        String rawKeywordSelection = userMessages.size() >= 3 ? userMessages.get(2).trim() : "";
        List<String> selectedKeywords = parseSelectedKeywords(rawKeywordSelection, language);
        String additionalContext = userMessages.size() <= 3 ? "" : String.join("\n", userMessages.subList(3, userMessages.size())).trim();

        return new ConversationSnapshot(
            dreamDescription,
            emotionDescription,
            selectedKeywords,
            additionalContext,
            StringUtils.hasText(dreamDescription) && StringUtils.hasText(emotionDescription) && !selectedKeywords.isEmpty()
        );
    }

    private List<String> parseSelectedKeywords(String rawKeywordSelection, String language) {
        LinkedHashSet<String> selectedKeywords = new LinkedHashSet<>();

        for (String fragment : rawKeywordSelection.split("[,;\\n]+")) {
            String value = fragment.trim();
            if (value.length() >= 2) {
                selectedKeywords.add(prettyKeyword(value));
            }
        }

        if (selectedKeywords.isEmpty()) {
            selectedKeywords.addAll(extractKeywords(rawKeywordSelection, language));
        }

        return selectedKeywords.stream().limit(6).toList();
    }

    private String extractCurrentNarrative(ConversationSnapshot snapshot) {
        return String.join(
            "\n",
            firstNonBlank(snapshot.dreamDescription()),
            firstNonBlank(snapshot.emotionDescription()),
            firstNonBlank(snapshot.additionalContext())
        ).trim();
    }

    private String recentDreamSearchText(DreamConversation conversation) {
        StringBuilder builder = new StringBuilder();
        builder.append(firstNonBlank(conversation.getTitle())).append(' ');
        builder.append(firstNonBlank(conversation.getInterpretation())).append(' ');
        if (conversation.getKeywords() != null) {
            builder.append(String.join(" ", conversation.getKeywords())).append(' ');
        }
        conversation.getMessages().stream()
            .filter(message -> message.getRole() == ChatRole.USER)
            .map(DreamMessage::getContent)
            .forEach(content -> builder.append(content).append(' '));
        return builder.toString().toLowerCase(Locale.ROOT);
    }

    private String summarizeText(String value, int maxLength) {
        String normalized = firstNonBlank(value).replaceAll("\\s+", " ").trim();
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength).trim() + "...";
    }

    private String prettyKeyword(String keyword) {
        String normalized = firstNonBlank(keyword).trim().replaceAll("\\s+", " ");
        if (!StringUtils.hasText(normalized)) {
            return normalized;
        }
        return Character.toUpperCase(normalized.charAt(0)) + normalized.substring(1);
    }

    private boolean isWeakTitle(String title, List<String> keywords) {
        String normalized = title.trim().toLowerCase(Locale.ROOT);
        if (!StringUtils.hasText(normalized) || isPlaceholderTitle(normalized)) {
            return true;
        }

        String[] words = normalized.split("\\s+");
        if (words.length > 2) {
            return true;
        }
        for (String word : words) {
            if (STOP_WORDS.contains(word) || TITLE_FILLER_WORDS.contains(word) || TITLE_GENERIC_WORDS.contains(word)) {
                return true;
            }
        }
        return keywords.stream().map(keyword -> keyword.toLowerCase(Locale.ROOT)).anyMatch(normalized::equals);
    }

    private String normalizeTitle(String title) {
        String normalized = firstNonBlank(title).trim().replaceAll("\\s+", " ");
        return Character.toUpperCase(normalized.charAt(0)) + normalized.substring(1);
    }

    private boolean isPlaceholderTitle(String title) {
        return "новый сон".equals(title) || "new dream".equals(title);
    }

    private String defaultTitle(String language) {
        return isEnglish(language) ? "New dream" : "Новый сон";
    }

    private boolean containsAny(String text, String... fragments) {
        for (String fragment : fragments) {
            if (text.contains(fragment)) {
                return true;
            }
        }
        return false;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return "";
    }

    private String normalizeLanguage(String language) {
        return "en".equalsIgnoreCase(language) ? "en" : "ru";
    }

    private boolean isEnglish(String language) {
        return "en".equalsIgnoreCase(language);
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

    private record ConversationSnapshot(
        String dreamDescription,
        String emotionDescription,
        List<String> selectedKeywords,
        String additionalContext,
        boolean readyForInterpretation
    ) {
    }

    private record OllamaGenerateRequest(
        String model,
        String prompt,
        boolean stream,
        String format,
        boolean think
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record OllamaAnalysisPayload(
        String stage,
        String assistantMessage,
        String title,
        List<String> keywords,
        String interpretation,
        String recommendation
    ) {
        public List<String> keywords() {
            return keywords == null ? List.of() : keywords;
        }
    }
}
