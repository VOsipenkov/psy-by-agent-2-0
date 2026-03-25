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
        "потом", "когда", "где", "или", "под", "над", "из", "за", "для", "очень"
    );
    private static final Set<String> TITLE_FILLER_WORDS = Set.of(
        "такие", "такой", "такая", "такое",
        "эти", "этот", "эта", "это",
        "какие", "какой", "какая", "какое",
        "так", "просто"
    );
    private static final Set<String> TITLE_GENERIC_WORDS = Set.of(
        "человек", "люди", "людьми", "женщина", "мужчина", "кто-то", "ктото"
    );

    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(20))
        .build();

    private final ObjectMapper objectMapper;
    private final OllamaProperties ollamaProperties;
    private final DreamInterpretationRagService dreamInterpretationRagService;

    @Override
    public DreamAiResult generateReply(DreamConversation conversation) {
        try {
            String prompt = buildPrompt(conversation);
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
                return fallback(conversation);
            }

            String responseText = extractResponseText(response.body());
            if (!StringUtils.hasText(responseText)) {
                return fallback(conversation);
            }

            String normalizedJson = normalizeJson(responseText);
            OllamaAnalysisPayload payload = objectMapper.readValue(normalizedJson, OllamaAnalysisPayload.class);
            return toResult(payload, conversation);
        } catch (Exception exception) {
            log.warn("Falling back to local dream analysis because Ollama call failed: {}", exception.getMessage());
            return fallback(conversation);
        }
    }

    private DreamAiResult toResult(OllamaAnalysisPayload payload, DreamConversation conversation) {
        DreamStage stage = "INTERPRETED".equalsIgnoreCase(payload.stage())
            ? DreamStage.INTERPRETED
            : DreamStage.CLARIFYING;

        if (stage == DreamStage.INTERPRETED) {
            List<String> keywords = sanitizeKeywords(payload.keywords(), conversation);
            String interpretation = sanitizeOutputText(StringUtils.hasText(payload.interpretation())
                ? payload.interpretation().trim()
                : payload.assistantMessage().trim());
            String assistantMessage = sanitizeOutputText(StringUtils.hasText(payload.assistantMessage())
                ? payload.assistantMessage().trim()
                : interpretation);
            String title = chooseTitle(payload.title(), keywords, conversation);

            return new DreamAiResult(
                stage,
                assistantMessage,
                title,
                keywords,
                interpretation
            );
        }

        if (countUserMessages(conversation) >= 3) {
            return fallback(conversation);
        }

        String assistantMessage = sanitizeOutputText(StringUtils.hasText(payload.assistantMessage())
            ? payload.assistantMessage().trim()
            : "Что в этом сне запомнилось вам сильнее всего: место, человек или чувство?");

        return new DreamAiResult(
            DreamStage.CLARIFYING,
            assistantMessage,
            conversation.getTitle(),
            List.copyOf(conversation.getKeywords()),
            conversation.getInterpretation()
        );
    }

    private DreamAiResult fallback(DreamConversation conversation) {
        List<String> userMessages = conversation.getMessages().stream()
            .filter(message -> message.getRole() == ChatRole.USER)
            .map(DreamMessage::getContent)
            .toList();

        if (userMessages.size() < 2) {
            String assistantMessage = "Мне нужно еще немного контекста. Какие чувства вы испытывали во сне и какой образ или символ запомнился сильнее всего?";

            return new DreamAiResult(
                DreamStage.CLARIFYING,
                assistantMessage,
                conversation.getTitle(),
                List.of(),
                null
            );
        }

        String combinedText = String.join(" ", userMessages);
        List<String> keywords = extractKeywords(combinedText);
        String title = chooseTitle(null, keywords, conversation);
        String interpretation = "В этом сне особенно заметны символы %s. Такой сюжет обычно связан с внутренним напряжением, попыткой что-то осмыслить и потребностью вернуть себе ощущение опоры. Важно прислушаться к тому, какие чувства сон оставил после пробуждения и с чем они перекликаются в вашей текущей жизни."
            .formatted(String.join(", ", keywords));

        return new DreamAiResult(
            DreamStage.INTERPRETED,
            interpretation,
            title,
            keywords,
            interpretation
        );
    }

    private String buildPrompt(DreamConversation conversation) {
        String ragContext = dreamInterpretationRagService.buildContext(conversation);
        StringBuilder builder = new StringBuilder();
        builder.append("""
            You are a Russian-speaking psychotherapist who specializes in dream interpretation.
            Your task is not generic chat. Your task is to interpret dreams with professional care.
            Your internal lenses are:
            - symbolic dream reading
            - Jungian psychology
            - Freudian dream analysis
            - Gestalt dream work

            Use the retrieved knowledge context below as domain guidance.
            Stay focused on dream symbols, emotions, relationships, conflicts, endings, and links to the dreamer's present life.
            Be warm, careful, and non-dogmatic.
            Present meanings as hypotheses, not as absolute truth.
            Do not diagnose psychiatric disorders and do not write medical conclusions.
            Never mention sources, books, authors, schools, or theoretical frameworks in the final text.
            Never say that the interpretation is based on a dream book, Miller, Jung, Freud, Gestalt, a source, or a method.
            The user should receive only a direct interpretation, without references to origins.
            Always answer in Russian.
            Return valid JSON only, without markdown and without any extra text.

            Response schema:
            {
              \"stage\": \"CLARIFYING\" | \"INTERPRETED\",
              \"assistantMessage\": \"string\",
              \"title\": \"1-2 words\",
              \"keywords\": [\"keyword1\", \"keyword2\", \"keyword3\"],
              \"interpretation\": \"string\"
            }

            Decision rules:
            1. If details are still insufficient, return stage=CLARIFYING and ask exactly one focused follow-up question.
            2. Good follow-up questions ask about emotion, strongest symbol, ending of the dream, meaningful person, repetition, or bodily feeling.
            3. If there is enough material, return stage=INTERPRETED.
            4. For stage=INTERPRETED, title must contain 1-2 words.
            5. For stage=INTERPRETED, extract 2-3 keywords from the dream itself.
            6. For stage=INTERPRETED, assistantMessage should be a short conversational lead-in, and interpretation should be the fuller final reading.
            7. interpretation must synthesize symbols and emotions into a direct reading without citing any source or naming any school.
            8. title should capture the emotional core or central movement of the dream, not just repeat a random noun from the story.
            9. No text outside JSON.

            Retrieved knowledge context:
            """);
        builder.append(ragContext).append("\n\n");
        builder.append("Chat history:\n");

        conversation.getMessages().stream()
            .sorted(Comparator.comparing(DreamMessage::getCreatedAt))
            .forEach(message -> builder.append(message.getRole().name()).append(": ")
                .append(message.getContent())
                .append('\n'));

        return builder.toString();
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

    private List<String> sanitizeKeywords(List<String> rawKeywords, DreamConversation conversation) {
        if (rawKeywords == null || rawKeywords.isEmpty()) {
            return extractKeywords(conversation.getMessages().stream()
                .filter(message -> message.getRole() == ChatRole.USER)
                .map(DreamMessage::getContent)
                .reduce("", (left, right) -> left + " " + right));
        }

        List<String> keywords = rawKeywords.stream()
            .filter(StringUtils::hasText)
            .map(String::trim)
            .map(keyword -> keyword.toLowerCase(Locale.ROOT))
            .filter(keyword -> !Set.of("сон", "символ", "образ", "чувство").contains(keyword))
            .distinct()
            .limit(3)
            .toList();

        if (!keywords.isEmpty()) {
            return keywords;
        }

        return extractKeywords(conversation.getMessages().stream()
            .filter(message -> message.getRole() == ChatRole.USER)
            .map(DreamMessage::getContent)
            .reduce("", (left, right) -> left + " " + right));
    }

    private List<String> extractKeywords(String text) {
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        List<String> tokens = new ArrayList<>();

        for (String token : TOKEN_SPLIT_PATTERN.split(text.toLowerCase(Locale.ROOT))) {
            if (!StringUtils.hasText(token) || token.length() < 4 || STOP_WORDS.contains(token)) {
                continue;
            }
            tokens.add(token);
        }

        tokens.stream()
            .sorted(Comparator.comparingInt(String::length).reversed())
            .forEach(token -> {
                if (unique.size() < 3) {
                    unique.add(token);
                }
            });

        if (unique.isEmpty()) {
            unique.add("сон");
            unique.add("символ");
        }

        return List.copyOf(unique);
    }

    private String buildTitleFromKeywords(List<String> keywords) {
        List<String> titleWords = keywords.stream()
            .filter(StringUtils::hasText)
            .map(String::trim)
            .map(keyword -> keyword.toLowerCase(Locale.ROOT))
            .filter(keyword -> !isWeakTitleWord(keyword))
            .limit(2)
            .toList();

        if (titleWords.isEmpty()) {
            return "Новый сон";
        }

        String joined = String.join(" ", titleWords);
        return Character.toUpperCase(joined.charAt(0)) + joined.substring(1);
    }

    private String chooseTitle(String suggestedTitle, List<String> keywords, DreamConversation conversation) {
        String smartTitle = inferTitleFromConversation(conversation, keywords);

        if (!StringUtils.hasText(suggestedTitle)) {
            return smartTitle;
        }

        String normalizedSuggested = normalizeTitle(suggestedTitle);
        return isWeakTitle(normalizedSuggested, keywords) ? smartTitle : normalizedSuggested;
    }

    private String inferTitleFromConversation(DreamConversation conversation, List<String> keywords) {
        String narrative = extractUserNarrative(conversation);

        if (matchesAny(narrative, "убег", "погон", "преслед", "бегу", "спаса")) {
            return "Убегание";
        }

        if (matchesAny(narrative, "опазд", "спеш", "тороп", "поезд", "самолет", "автобус", "вокзал", "дорог", "ехать", "еду")) {
            return matchesAny(narrative, "трев", "страх", "паник", "боюсь") ? "Тревожная дорога" : "Спешка";
        }

        if (matchesAny(narrative, "двер", "замок", "ключ")) {
            return "Закрытая дверь";
        }

        if (matchesAny(narrative, "дом", "квартир", "комнат")) {
            return matchesAny(narrative, "стар", "детств", "родител") ? "Старый дом" : "Дом";
        }

        if (matchesAny(narrative, "лес", "темн", "ноч", "тень")) {
            return matchesAny(narrative, "лес") ? "Темный лес" : "Ночная тревога";
        }

        if (matchesAny(narrative, "вода", "море", "река", "волна", "дожд")) {
            return matchesAny(narrative, "дом") ? "Дом у воды" : "Глубокая вода";
        }

        if (matchesAny(narrative, "пад", "провал", "вниз")) {
            return "Падение";
        }

        if (matchesAny(narrative, "лестниц", "лифт", "этаж", "подним")) {
            return "Подъем";
        }

        if (matchesAny(narrative, "мост", "дорог", "путь")) {
            return "Переход";
        }

        return buildTitleFromKeywords(keywords);
    }

    private long countUserMessages(DreamConversation conversation) {
        return conversation.getMessages().stream()
            .filter(message -> message.getRole() == ChatRole.USER)
            .count();
    }

    private String extractUserNarrative(DreamConversation conversation) {
        return conversation.getMessages().stream()
            .filter(message -> message.getRole() == ChatRole.USER)
            .map(DreamMessage::getContent)
            .reduce("", (left, right) -> left + " " + right)
            .toLowerCase(Locale.ROOT);
    }

    private boolean isWeakTitle(String title, List<String> keywords) {
        String normalized = title.toLowerCase(Locale.ROOT);
        String[] words = normalized.split("\\s+");

        if (!StringUtils.hasText(normalized) || "новый сон".equals(normalized)) {
            return true;
        }

        if (normalized.contains("сон") || normalized.contains("символ") || normalized.contains("образ")) {
            return true;
        }

        if (words.length > 2) {
            return true;
        }

        if (!normalized.matches("(?iu)[\\p{L}\\p{N}-]+(?:\\s+[\\p{L}\\p{N}-]+)?")) {
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

        return keywords.stream()
            .map(keyword -> keyword.toLowerCase(Locale.ROOT))
            .anyMatch(normalized::equals);
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
            .replaceAll("(?iu)сонник\\s+миллера", "символическая трактовка")
            .replaceAll("(?iu)миллер(?:а|у|ом|е)?", "")
            .replaceAll("(?iu)юнг(?:а|у|ом|е|овский|овская|овское)?", "глубинный")
            .replaceAll("(?iu)фрейд(?:а|у|ом|е|овский|овская|овское)?", "внутренний")
            .replaceAll("(?iu)гештальт(?:-подход| подход)?", "внутренний диалог")
            .replaceAll("(?iu)источник(?:а|у|ом|е|и)?", "")
            .replaceAll("\\s{2,}", " ")
            .replaceAll("\\s+([,.!?])", "$1")
            .trim();
    }
}

