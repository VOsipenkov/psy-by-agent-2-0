package com.psybyagent.dreams.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.psybyagent.dreams.config.OllamaProperties;
import com.psybyagent.dreams.dream.ChatRole;
import com.psybyagent.dreams.dream.DreamConversation;
import com.psybyagent.dreams.dream.DreamMessage;
import com.psybyagent.dreams.dream.DreamStage;
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
import org.springframework.web.client.RestClient;

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

    private final RestClient ollamaRestClient;
    private final ObjectMapper objectMapper;
    private final OllamaProperties ollamaProperties;

    @Override
    public DreamAiResult generateReply(DreamConversation conversation) {
        try {
            String prompt = buildPrompt(conversation);
            OllamaGenerateResponse response = ollamaRestClient.post()
                .uri("/api/generate")
                .body(new OllamaGenerateRequest(ollamaProperties.getModel(), prompt, false, "json"))
                .retrieve()
                .body(OllamaGenerateResponse.class);

            if (response == null || !StringUtils.hasText(response.response())) {
                return fallback(conversation);
            }

            String normalizedJson = normalizeJson(response.response());
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
            String interpretation = StringUtils.hasText(payload.interpretation())
                ? payload.interpretation().trim()
                : payload.assistantMessage().trim();
            String title = StringUtils.hasText(payload.title())
                ? payload.title().trim()
                : buildTitleFromKeywords(keywords);

            return new DreamAiResult(
                stage,
                interpretation,
                title,
                keywords,
                interpretation
            );
        }

        String assistantMessage = StringUtils.hasText(payload.assistantMessage())
            ? payload.assistantMessage().trim()
            : "Что в этом сне запомнилось вам сильнее всего: место, человек или чувство?";

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
        String title = buildTitleFromKeywords(keywords);
        String interpretation = "По мотивам сонника Миллера в этом сне выделяются символы %s. Такой сюжет обычно связан с внутренним напряжением, попыткой что-то осмыслить и потребностью вернуть себе ощущение опоры. Стоит обратить внимание на эмоции из сна и на то, с чем они перекликаются в вашей текущей жизни."
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
        StringBuilder builder = new StringBuilder();
        builder.append("""
            Ты - русскоязычный ассистент по анализу снов.
            Работай по мотивам сонника Миллера, но без цитирования книги.
            Тебе нужно прочитать историю диалога и вернуть только JSON без markdown.

            Формат ответа:
            {
              \"stage\": \"CLARIFYING\" | \"INTERPRETED\",
              \"assistantMessage\": \"строка\",
              \"title\": \"1-2 слова\",
              \"keywords\": [\"слово1\", \"слово2\", \"слово3\"],
              \"interpretation\": \"строка\"
            }

            Правила:
            1. Если данных недостаточно, верни stage=CLARIFYING и задай 1 вопрос.
            2. Если данных достаточно, верни stage=INTERPRETED.
            3. При INTERPRETED title обязан быть из 1-2 слов.
            4. При INTERPRETED выдели 2-3 ключевых слова.
            5. При INTERPRETED interpretation должна быть понятной, мягкой и на русском.
            6. Никакого текста вне JSON.

            История чата:
            """);

        conversation.getMessages().stream()
            .sorted(Comparator.comparing(DreamMessage::getCreatedAt))
            .forEach(message -> builder.append(message.getRole().name()).append(": ")
                .append(message.getContent())
                .append('\n'));

        return builder.toString();
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
            .distinct()
            .limit(3)
            .toList();

        return keywords.isEmpty() ? List.of("сон", "образ") : keywords;
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
        List<String> titleWords = keywords.stream().limit(2).toList();
        if (titleWords.isEmpty()) {
            return "Новый сон";
        }

        String joined = String.join(" ", titleWords);
        return Character.toUpperCase(joined.charAt(0)) + joined.substring(1);
    }
}
