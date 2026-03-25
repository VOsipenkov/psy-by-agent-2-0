package com.psybyagent.dreams.ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.psybyagent.dreams.dream.ChatRole;
import com.psybyagent.dreams.dream.DreamConversation;
import com.psybyagent.dreams.dream.DreamMessage;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class DreamInterpretationRagService {

    private static final Pattern TOKEN_SPLIT_PATTERN = Pattern.compile("[^\\p{L}\\p{N}]+");
    private static final List<String> FIXED_QUERY_TOKENS = List.of(
        "dream",
        "interpretation",
        "symbolic",
        "jung",
        "freud",
        "gestalt",
        "symbols",
        "emotion"
    );

    private final List<KnowledgeChunk> knowledgeChunks;

    public DreamInterpretationRagService(ObjectMapper objectMapper) {
        this.knowledgeChunks = loadKnowledgeChunks(objectMapper);
    }

    public String buildContext(DreamConversation conversation) {
        List<KnowledgeChunk> retrievedChunks = retrieve(conversation, 5);
        StringBuilder builder = new StringBuilder();

        for (KnowledgeChunk chunk : retrievedChunks) {
            builder.append("- [")
                .append(chunk.title())
                .append("] ")
                .append(chunk.content())
                .append('\n');
        }

        return builder.toString().trim();
    }

    private List<KnowledgeChunk> retrieve(DreamConversation conversation, int limit) {
        Set<String> queryTokens = buildQueryTokens(conversation);

        return knowledgeChunks.stream()
            .map(chunk -> new ScoredChunk(chunk, score(chunk, queryTokens)))
            .filter(chunk -> chunk.chunk().alwaysInclude() || chunk.score() > 0)
            .sorted(Comparator.<ScoredChunk>comparingInt(ScoredChunk::score).reversed()
                .thenComparing(chunk -> chunk.chunk().priority(), Comparator.reverseOrder())
                .thenComparing(chunk -> chunk.chunk().title()))
            .limit(limit)
            .map(ScoredChunk::chunk)
            .toList();
    }

    private Set<String> buildQueryTokens(DreamConversation conversation) {
        List<String> tokens = new ArrayList<>();

        conversation.getMessages().stream()
            .sorted(Comparator.comparing(DreamMessage::getCreatedAt))
            .filter(message -> message.getRole() == ChatRole.USER)
            .map(DreamMessage::getContent)
            .forEach(content -> tokens.addAll(extractTokens(content)));

        if (StringUtils.hasText(conversation.getTitle())) {
            tokens.addAll(extractTokens(conversation.getTitle()));
        }

        conversation.getKeywords().forEach(keyword -> tokens.addAll(extractTokens(keyword)));
        tokens.addAll(FIXED_QUERY_TOKENS);

        return tokens.stream()
            .map(token -> token.toLowerCase(Locale.ROOT))
            .distinct()
            .sorted(Comparator.comparingInt(String::length).reversed())
            .limit(16)
            .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
    }

    private List<String> extractTokens(String text) {
        List<String> tokens = new ArrayList<>();

        for (String token : TOKEN_SPLIT_PATTERN.split(text.toLowerCase(Locale.ROOT))) {
            if (token.length() >= 4) {
                tokens.add(token);
            }
        }

        return tokens;
    }

    private int score(KnowledgeChunk chunk, Set<String> queryTokens) {
        String searchableText = chunk.searchableText();
        long matches = queryTokens.stream()
            .filter(searchableText::contains)
            .count();

        int baseScore = chunk.priority() * 10 + Math.toIntExact(matches) * 25;
        return chunk.alwaysInclude() ? baseScore + 1_000 : baseScore;
    }

    private List<KnowledgeChunk> loadKnowledgeChunks(ObjectMapper objectMapper) {
        ClassPathResource resource = new ClassPathResource("ai/dream-rag-kb.json");

        try (InputStream inputStream = resource.getInputStream()) {
            return objectMapper.readValue(inputStream, new TypeReference<List<KnowledgeChunk>>() {
            });
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to load dream interpretation knowledge base", exception);
        }
    }

    private record ScoredChunk(KnowledgeChunk chunk, int score) {
    }

    public record KnowledgeChunk(
        String id,
        String title,
        int priority,
        boolean alwaysInclude,
        List<String> tags,
        String content
    ) {
        String searchableText() {
            String tagText = tags == null ? "" : String.join(" ", tags);
            return (title + " " + tagText + " " + content).toLowerCase(Locale.ROOT);
        }
    }
}
