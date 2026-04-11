package com.psybyagent.dreams.telegram;

import com.psybyagent.dreams.common.NotFoundException;
import com.psybyagent.dreams.config.TelegramProperties;
import com.psybyagent.dreams.dream.CreateConversationRequest;
import com.psybyagent.dreams.dream.DreamConversation;
import com.psybyagent.dreams.dream.DreamConversationDetailResponse;
import com.psybyagent.dreams.dream.DreamConversationRepository;
import com.psybyagent.dreams.dream.DreamConversationService;
import com.psybyagent.dreams.dream.DreamMessageResponse;
import com.psybyagent.dreams.dream.SendMessageRequest;
import com.psybyagent.dreams.dream.UserAccount;
import com.psybyagent.dreams.dream.UserAccountRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class TelegramLinkService {

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_SELECTED_KEYWORDS = 6;
    private static final int MAX_SELECTED_EMOTIONS = 9;
    private static final List<String> EMOTIONS_RU = List.of(
        "Радость",
        "Интерес",
        "Любовь",
        "Злость",
        "Грусть",
        "Печаль",
        "Отвращение",
        "Стыд",
        "Вина"
    );
    private static final List<String> EMOTIONS_EN = List.of(
        "Joy",
        "Interest",
        "Love",
        "Anger",
        "Sadness",
        "Sorrow",
        "Disgust",
        "Shame",
        "Guilt"
    );

    private final UserAccountRepository userAccountRepository;
    private final DreamConversationRepository dreamConversationRepository;
    private final DreamConversationService dreamConversationService;
    private final TelegramProperties telegramProperties;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public TelegramLinkStatusResponse getStatus(UUID userId) {
        UserAccount user = requireUser(userId);
        String activeCode = hasActiveLinkCode(user) ? user.getTelegramLinkCode() : null;
        Instant expiresAt = hasActiveLinkCode(user) ? user.getTelegramLinkCodeExpiresAt() : null;

        return new TelegramLinkStatusResponse(
            isBotAvailable(),
            user.getTelegramChatId() != null,
            emptyToNull(telegramProperties.getBotUsername()),
            buildBotLink(),
            emptyToNull(user.getTelegramUsername()),
            activeCode,
            expiresAt,
            buildStartLink(activeCode)
        );
    }

    @Transactional
    public TelegramLinkCodeResponse issueLinkCode(UUID userId) {
        UserAccount user = requireUser(userId);
        String code = generateUniqueCode();
        Instant expiresAt = Instant.now().plus(telegramProperties.getLinkCodeTtl());

        user.setTelegramLinkCode(code);
        user.setTelegramLinkCodeExpiresAt(expiresAt);
        userAccountRepository.save(user);

        return new TelegramLinkCodeResponse(
            isBotAvailable(),
            emptyToNull(telegramProperties.getBotUsername()),
            buildBotLink(),
            code,
            expiresAt,
            buildStartLink(code)
        );
    }

    public void ensureBotSecret(String secret) {
        if (!StringUtils.hasText(telegramProperties.getInternalSecret())
            || !telegramProperties.getInternalSecret().equals(secret)) {
            throw new IllegalArgumentException("Unauthorized telegram bot request");
        }
    }

    @Transactional
    public TelegramBotReplyResponse linkChat(TelegramBotLinkRequest request) {
        if (request.chatId() == null) {
            throw new IllegalArgumentException("Telegram chat id is required");
        }

        String code = normalizeCode(request.code());
        UserAccount user = userAccountRepository.findByTelegramLinkCodeIgnoreCase(code)
            .orElseThrow(() -> new IllegalArgumentException("Link code is invalid or expired"));

        if (!hasActiveLinkCode(user) || !code.equalsIgnoreCase(user.getTelegramLinkCode())) {
            throw new IllegalArgumentException("Link code is invalid or expired");
        }

        UserAccount existingChatUser = userAccountRepository.findByTelegramChatId(request.chatId()).orElse(null);
        if (existingChatUser != null && !existingChatUser.getId().equals(user.getId())) {
            if (existingChatUser.isTelegramAutoCreated()) {
                UUID transferredConversationId = existingChatUser.getTelegramActiveConversationId();
                UUID transferredEmotionConversationId = existingChatUser.getTelegramEmotionSelectionConversationId();
                String transferredSelectedEmotions = existingChatUser.getTelegramSelectedEmotions();
                UUID transferredKeywordConversationId = existingChatUser.getTelegramKeywordSelectionConversationId();
                String transferredSelectedKeywords = existingChatUser.getTelegramSelectedKeywords();

                moveDreams(existingChatUser, user);
                dreamConversationRepository.flush();
                userAccountRepository.clearTelegramBindingById(existingChatUser.getId());

                user.setTelegramActiveConversationId(firstNonNull(user.getTelegramActiveConversationId(), transferredConversationId));
                if (user.getTelegramEmotionSelectionConversationId() == null && transferredEmotionConversationId != null) {
                    user.setTelegramEmotionSelectionConversationId(transferredEmotionConversationId);
                    user.setTelegramSelectedEmotions(transferredSelectedEmotions);
                }
                if (user.getTelegramKeywordSelectionConversationId() == null && transferredKeywordConversationId != null) {
                    user.setTelegramKeywordSelectionConversationId(transferredKeywordConversationId);
                    user.setTelegramSelectedKeywords(transferredSelectedKeywords);
                }
            } else {
                throw new IllegalArgumentException("This Telegram chat is already linked to another account");
            }
        }

        user.setTelegramChatId(request.chatId());
        user.setTelegramUsername(firstNonBlank(request.telegramUsername(), request.firstName(), user.getTelegramUsername()));
        user.setTelegramLanguage(normalizeLanguage(request.languageCode()));
        user.setTelegramLinkedAt(Instant.now());
        user.setTelegramAutoCreated(false);
        user.setTelegramLinkCode(null);
        user.setTelegramLinkCodeExpiresAt(null);
        userAccountRepository.save(user);

        return emptyReply("Telegram is linked. You can now continue in the bot or on the website.", true, false);
    }

    @Transactional
    public TelegramBotReplyResponse startNewDream(TelegramBotChatRequest request) {
        UserAccount user = resolveTelegramUser(new TelegramBotChatRequest(
            request.chatId(),
            request.telegramUsername(),
            request.firstName(),
            request.languageCode()
        ));
        updateChatMetadata(user, request.telegramUsername(), request.firstName(), request.languageCode());

        String language = firstNonBlank(user.getTelegramLanguage(), normalizeLanguage(request.languageCode()));
        DreamConversationDetailResponse detail = dreamConversationService.createConversation(
            user.getId(),
            new CreateConversationRequest(language)
        );

        user.setTelegramActiveConversationId(detail.id());
        clearEmotionSelectionState(user);
        clearKeywordSelectionState(user);
        TelegramBotReplyResponse reply = buildConversationReply(user, detail, "Starting a new dream.\n\n");
        userAccountRepository.save(user);
        return reply;
    }

    @Transactional
    public TelegramBotReplyResponse handleMessage(TelegramBotMessageRequest request) {
        if (!StringUtils.hasText(request.text())) {
            throw new IllegalArgumentException("Telegram text message is empty");
        }

        UserAccount user = resolveTelegramUser(new TelegramBotChatRequest(
            request.chatId(),
            request.telegramUsername(),
            request.firstName(),
            request.languageCode()
        ));
        updateChatMetadata(user, request.telegramUsername(), request.firstName(), request.languageCode());
        String language = firstNonBlank(user.getTelegramLanguage(), normalizeLanguage(request.languageCode()));

        DreamConversationDetailResponse activeConversation = resolveActiveConversation(user, language);
        DreamConversationDetailResponse updated = dreamConversationService.addUserMessage(
            user.getId(),
            activeConversation.id(),
            new SendMessageRequest(request.text().trim(), language)
        );

        user.setTelegramActiveConversationId(updated.id());
        TelegramBotReplyResponse reply = buildConversationReply(user, updated, "");
        userAccountRepository.save(user);
        return reply;
    }

    @Transactional
    public TelegramBotReplyResponse toggleEmotionSelection(TelegramEmotionToggleRequest request) {
        if (request.emotionIndex() == null) {
            throw new IllegalArgumentException("Emotion index is required");
        }

        UserAccount user = requireLinkedUser(request.chatId());
        updateChatMetadata(user, request.telegramUsername(), request.firstName(), request.languageCode());

        DreamConversationDetailResponse detail = requireEmotionSelectionDetail(user, request.conversationId());
        List<String> emotionOptions = emotionOptionsFor(user);
        int emotionIndex = request.emotionIndex();

        if (emotionIndex < 0 || emotionIndex >= emotionOptions.size()) {
            throw new IllegalArgumentException("This emotion button is no longer valid.");
        }

        LinkedHashSet<String> selectedEmotions = new LinkedHashSet<>(readSelectedEmotions(user, detail.id(), emotionOptions));
        String clickedEmotion = emotionOptions.get(emotionIndex);

        if (selectedEmotions.contains(clickedEmotion)) {
            selectedEmotions.remove(clickedEmotion);
        } else {
            selectedEmotions.add(clickedEmotion);
        }

        setEmotionSelectionState(user, detail.id(), List.copyOf(selectedEmotions));
        TelegramBotReplyResponse reply = buildConversationReply(user, detail, "");
        userAccountRepository.save(user);
        return reply;
    }

    @Transactional
    public TelegramBotReplyResponse submitEmotionSelection(TelegramKeywordActionRequest request) {
        UserAccount user = requireLinkedUser(request.chatId());
        updateChatMetadata(user, request.telegramUsername(), request.firstName(), request.languageCode());
        String language = firstNonBlank(user.getTelegramLanguage(), normalizeLanguage(request.languageCode()));

        DreamConversationDetailResponse detail = requireEmotionSelectionDetail(user, request.conversationId());
        List<String> selectedEmotions = readSelectedEmotions(user, detail.id(), emotionOptionsFor(user));

        if (selectedEmotions.isEmpty()) {
            throw new IllegalArgumentException(isEnglish(language)
                ? "Select at least one emotion first."
                : "Сначала выберите хотя бы одну эмоцию.");
        }

        DreamConversationDetailResponse updated = dreamConversationService.addUserMessage(
            user.getId(),
            detail.id(),
            new SendMessageRequest(String.join(", ", selectedEmotions), language)
        );

        user.setTelegramActiveConversationId(updated.id());
        TelegramBotReplyResponse reply = buildConversationReply(user, updated, "");
        reply = new TelegramBotReplyResponse(
            reply.message(),
            reply.linked(),
            reply.linkRequired(),
            reply.dreamTitle(),
            reply.stage(),
            reply.emotionOptions(),
            List.copyOf(selectedEmotions),
            reply.keywords(),
            reply.selectedKeywords(),
            reply.conversationId()
        );
        userAccountRepository.save(user);
        return reply;
    }

    @Transactional
    public TelegramBotReplyResponse resetEmotionSelection(TelegramKeywordActionRequest request) {
        UserAccount user = requireLinkedUser(request.chatId());
        updateChatMetadata(user, request.telegramUsername(), request.firstName(), request.languageCode());

        DreamConversationDetailResponse detail = requireEmotionSelectionDetail(user, request.conversationId());
        setEmotionSelectionState(user, detail.id(), List.of());
        TelegramBotReplyResponse reply = buildConversationReply(user, detail, "");
        userAccountRepository.save(user);
        return reply;
    }

    @Transactional
    public TelegramBotReplyResponse toggleKeywordSelection(TelegramKeywordToggleRequest request) {
        if (request.keywordIndex() == null) {
            throw new IllegalArgumentException("Keyword index is required");
        }

        UserAccount user = requireLinkedUser(request.chatId());
        updateChatMetadata(user, request.telegramUsername(), request.firstName(), request.languageCode());

        DreamConversationDetailResponse detail = requireKeywordSelectionDetail(user, request.conversationId());
        List<String> availableKeywords = detail.keywords();
        int keywordIndex = request.keywordIndex();

        if (keywordIndex < 0 || keywordIndex >= availableKeywords.size()) {
            throw new IllegalArgumentException("This keyword button is no longer valid.");
        }

        LinkedHashSet<String> selectedKeywords = new LinkedHashSet<>(readSelectedKeywords(user, detail.id(), availableKeywords));
        String clickedKeyword = availableKeywords.get(keywordIndex);

        if (selectedKeywords.contains(clickedKeyword)) {
            selectedKeywords.remove(clickedKeyword);
        } else {
            if (selectedKeywords.size() >= MAX_SELECTED_KEYWORDS) {
                throw new IllegalArgumentException(isEnglish(user.getTelegramLanguage())
                    ? "You can select up to 6 keywords."
                    : "Можно выбрать не больше 6 ключевых слов.");
            }
            selectedKeywords.add(clickedKeyword);
        }

        setKeywordSelectionState(user, detail.id(), List.copyOf(selectedKeywords));
        TelegramBotReplyResponse reply = buildConversationReply(user, detail, "");
        userAccountRepository.save(user);
        return reply;
    }

    @Transactional
    public TelegramBotReplyResponse submitKeywordSelection(TelegramKeywordActionRequest request) {
        UserAccount user = requireLinkedUser(request.chatId());
        updateChatMetadata(user, request.telegramUsername(), request.firstName(), request.languageCode());
        String language = firstNonBlank(user.getTelegramLanguage(), normalizeLanguage(request.languageCode()));

        DreamConversationDetailResponse detail = requireKeywordSelectionDetail(user, request.conversationId());
        List<String> selectedKeywords = readSelectedKeywords(user, detail.id(), detail.keywords());

        if (selectedKeywords.isEmpty()) {
            throw new IllegalArgumentException(isEnglish(language)
                ? "Select at least one keyword first."
                : "Сначала выберите хотя бы одно ключевое слово.");
        }

        DreamConversationDetailResponse updated = dreamConversationService.addUserMessage(
            user.getId(),
            detail.id(),
            new SendMessageRequest(String.join(", ", selectedKeywords), language)
        );

        user.setTelegramActiveConversationId(updated.id());
        TelegramBotReplyResponse reply = buildConversationReply(user, updated, "");
        reply = new TelegramBotReplyResponse(
            reply.message(),
            reply.linked(),
            reply.linkRequired(),
            reply.dreamTitle(),
            reply.stage(),
            reply.emotionOptions(),
            reply.selectedEmotions(),
            reply.keywords(),
            List.copyOf(selectedKeywords),
            reply.conversationId()
        );
        userAccountRepository.save(user);
        return reply;
    }

    @Transactional
    public TelegramBotReplyResponse resetKeywordSelection(TelegramKeywordActionRequest request) {
        UserAccount user = requireLinkedUser(request.chatId());
        updateChatMetadata(user, request.telegramUsername(), request.firstName(), request.languageCode());

        DreamConversationDetailResponse detail = requireKeywordSelectionDetail(user, request.conversationId());
        setKeywordSelectionState(user, detail.id(), List.of());
        TelegramBotReplyResponse reply = buildConversationReply(user, detail, "");
        userAccountRepository.save(user);
        return reply;
    }

    @Transactional
    public TelegramBotReplyResponse unlinkChat(TelegramBotChatRequest request) {
        UserAccount user = requireLinkedUser(request.chatId());
        clearTelegramBinding(user);
        userAccountRepository.save(user);

        return emptyReply(
            "Telegram chat disconnected. If you send a new message here later, a Telegram profile will be created again automatically.",
            false,
            false
        );
    }

    private UserAccount requireUser(UUID userId) {
        return userAccountRepository.findById(userId)
            .orElseThrow(() -> new NotFoundException("User not found"));
    }

    private UserAccount requireLinkedUser(Long chatId) {
        if (chatId == null) {
            throw new IllegalArgumentException("Telegram chat id is required");
        }

        return userAccountRepository.findByTelegramChatId(chatId)
            .orElseThrow(() -> new IllegalArgumentException("This Telegram chat is not connected yet."));
    }

    private UserAccount resolveTelegramUser(TelegramBotChatRequest request) {
        if (request.chatId() == null) {
            throw new IllegalArgumentException("Telegram chat id is required");
        }

        return userAccountRepository.findByTelegramChatId(request.chatId())
            .orElseGet(() -> createTelegramUser(request));
    }

    private DreamConversationDetailResponse resolveActiveConversation(UserAccount user, String language) {
        if (user.getTelegramActiveConversationId() != null) {
            try {
                return dreamConversationService.getConversation(user.getId(), user.getTelegramActiveConversationId());
            } catch (NotFoundException exception) {
                user.setTelegramActiveConversationId(null);
                clearEmotionSelectionState(user);
                clearKeywordSelectionState(user);
            }
        }

        DreamConversationDetailResponse created = dreamConversationService.createConversation(
            user.getId(),
            new CreateConversationRequest(language)
        );
        user.setTelegramActiveConversationId(created.id());
        return created;
    }

    private DreamConversationDetailResponse requireEmotionSelectionDetail(UserAccount user, UUID conversationId) {
        DreamConversationDetailResponse detail = requireConversationForSelection(user, conversationId);
        if (!isEmotionSelectionStage(detail)) {
            clearEmotionSelectionState(user);
            throw new IllegalArgumentException(isEnglish(user.getTelegramLanguage())
                ? "These emotion buttons are no longer active. Continue with the latest message or send /new."
                : "Эти кнопки эмоций уже неактуальны. Продолжите последний диалог или отправьте /new.");
        }
        return detail;
    }

    private DreamConversationDetailResponse requireKeywordSelectionDetail(UserAccount user, UUID conversationId) {
        DreamConversationDetailResponse detail = requireConversationForSelection(user, conversationId);
        if (!isKeywordSelectionStage(detail)) {
            clearKeywordSelectionState(user);
            throw new IllegalArgumentException(isEnglish(user.getTelegramLanguage())
                ? "These keyword buttons are no longer active. Continue with the latest message or send /new."
                : "Эти кнопки ключевых слов уже неактуальны. Продолжите последний диалог или отправьте /new.");
        }
        return detail;
    }

    private DreamConversationDetailResponse requireConversationForSelection(UserAccount user, UUID conversationId) {
        if (conversationId == null || user.getTelegramActiveConversationId() == null
            || !conversationId.equals(user.getTelegramActiveConversationId())) {
            throw new IllegalArgumentException(isEnglish(user.getTelegramLanguage())
                ? "These buttons are no longer active. Start a new dream or continue the latest one."
                : "Эти кнопки уже неактуальны. Начните новый сон или продолжайте последний.");
        }

        try {
            return dreamConversationService.getConversation(user.getId(), conversationId);
        } catch (NotFoundException exception) {
            user.setTelegramActiveConversationId(null);
            clearEmotionSelectionState(user);
            clearKeywordSelectionState(user);
            throw new IllegalArgumentException(isEnglish(user.getTelegramLanguage())
                ? "This dream is no longer available. Send /new to start again."
                : "Этот сон больше недоступен. Отправьте /new, чтобы начать заново.");
        }
    }

    private UserAccount createTelegramUser(TelegramBotChatRequest request) {
        UserAccount created = new UserAccount();
        created.setUsername(generateTelegramUsername(request));
        created.setPasswordHash(passwordEncoder.encode(randomCode(24)));
        created.setTelegramChatId(request.chatId());
        created.setTelegramUsername(firstNonBlank(request.telegramUsername(), request.firstName()));
        created.setTelegramLanguage(normalizeLanguage(request.languageCode()));
        created.setTelegramLinkedAt(Instant.now());
        created.setTelegramAutoCreated(true);
        return userAccountRepository.save(created);
    }

    private void moveDreams(UserAccount fromUser, UserAccount toUser) {
        List<DreamConversation> conversations = new ArrayList<>(
            dreamConversationRepository.findByUserAccountIdOrderByUpdatedAtDesc(fromUser.getId())
        );

        for (DreamConversation conversation : conversations) {
            conversation.setUserAccount(toUser);
        }

        if (!conversations.isEmpty()) {
            dreamConversationRepository.saveAll(conversations);
        }
    }

    private void clearTelegramBinding(UserAccount user) {
        user.setTelegramChatId(null);
        user.setTelegramUsername(null);
        user.setTelegramLinkedAt(null);
        user.setTelegramActiveConversationId(null);
        user.setTelegramLanguage(null);
        user.setTelegramLinkCode(null);
        user.setTelegramLinkCodeExpiresAt(null);
        clearEmotionSelectionState(user);
        clearKeywordSelectionState(user);
    }

    private void updateChatMetadata(UserAccount user, String telegramUsername, String firstName, String languageCode) {
        user.setTelegramUsername(firstNonBlank(telegramUsername, firstName, user.getTelegramUsername()));
        user.setTelegramLanguage(normalizeLanguage(firstNonBlank(languageCode, user.getTelegramLanguage())));
    }

    private TelegramBotReplyResponse buildConversationReply(UserAccount user, DreamConversationDetailResponse detail, String prefix) {
        String language = firstNonBlank(user.getTelegramLanguage(), "ru");

        if (isEmotionSelectionStage(detail)) {
            clearKeywordSelectionState(user);
            List<String> emotionOptions = emotionOptionsFor(user);
            List<String> selectedEmotions = readSelectedEmotions(user, detail.id(), emotionOptions);
            setEmotionSelectionState(user, detail.id(), selectedEmotions);

            return new TelegramBotReplyResponse(
                prefix + buildEmotionSelectionMessage(lastAssistantMessage(detail), selectedEmotions, language),
                true,
                false,
                detail.title(),
                detail.stage(),
                emotionOptions,
                selectedEmotions,
                List.copyOf(detail.keywords()),
                List.of(),
                detail.id()
            );
        }

        if (isKeywordSelectionStage(detail) && !detail.keywords().isEmpty()) {
            clearEmotionSelectionState(user);
            List<String> selectedKeywords = readSelectedKeywords(user, detail.id(), detail.keywords());
            setKeywordSelectionState(user, detail.id(), selectedKeywords);

            return new TelegramBotReplyResponse(
                prefix + buildKeywordSelectionMessage(lastAssistantMessage(detail), selectedKeywords, language),
                true,
                false,
                detail.title(),
                detail.stage(),
                List.of(),
                List.of(),
                List.copyOf(detail.keywords()),
                selectedKeywords,
                detail.id()
            );
        }

        clearEmotionSelectionState(user);
        clearKeywordSelectionState(user);

        return new TelegramBotReplyResponse(
            prefix + buildStandardMessage(detail, language),
            true,
            false,
            detail.title(),
            detail.stage(),
            List.of(),
            List.of(),
            List.copyOf(detail.keywords()),
            List.of(),
            detail.id()
        );
    }

    private TelegramBotReplyResponse emptyReply(String message, boolean linked, boolean linkRequired) {
        return new TelegramBotReplyResponse(
            message,
            linked,
            linkRequired,
            null,
            null,
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            null
        );
    }

    private String buildStandardMessage(DreamConversationDetailResponse detail, String language) {
        String assistantMessage = lastAssistantMessage(detail);

        if ("INTERPRETED".equalsIgnoreCase(detail.stage()) && StringUtils.hasText(detail.title())) {
            return isEnglish(language)
                ? "Dream title: " + detail.title() + "\n\n" + assistantMessage
                : "Название сна: " + detail.title() + "\n\n" + assistantMessage;
        }

        return assistantMessage;
    }

    private String buildEmotionSelectionMessage(String assistantMessage, List<String> selectedEmotions, String language) {
        StringBuilder builder = new StringBuilder(assistantMessage);

        if (isEnglish(language)) {
            builder.append("\n\nTap the emotion buttons below. You can choose several emotions.");
            builder.append(selectedEmotions.isEmpty()
                ? "\n\nSelected: none yet."
                : "\n\nSelected:\n" + toBulletList(selectedEmotions));
            builder.append("\n\nPress Done when you're ready.");
            return builder.toString();
        }

        builder.append("\n\nНажмите на кнопки эмоций ниже. Можно выбрать несколько эмоций.");
        builder.append(selectedEmotions.isEmpty()
            ? "\n\nВыбрано: пока ничего."
            : "\n\nВыбрано:\n" + toBulletList(selectedEmotions));
        builder.append("\n\nНажмите «Готово», когда закончите.");
        return builder.toString();
    }

    private String buildKeywordSelectionMessage(String assistantMessage, List<String> selectedKeywords, String language) {
        StringBuilder builder = new StringBuilder(assistantMessage);

        if (isEnglish(language)) {
            builder.append("\n\nTap the keyword buttons below to choose the motifs that fit your dream.");
            builder.append(selectedKeywords.isEmpty()
                ? "\n\nSelected: none yet."
                : "\n\nSelected:\n" + toBulletList(selectedKeywords));
            builder.append("\n\nPress Done when you're ready.");
            return builder.toString();
        }

        builder.append("\n\nНажмите на кнопки ключевых слов ниже, чтобы выбрать подходящие мотивы сна.");
        builder.append(selectedKeywords.isEmpty()
            ? "\n\nВыбрано: пока ничего."
            : "\n\nВыбрано:\n" + toBulletList(selectedKeywords));
        builder.append("\n\nНажмите «Готово», когда закончите.");
        return builder.toString();
    }

    private String lastAssistantMessage(DreamConversationDetailResponse detail) {
        List<DreamMessageResponse> messages = detail.messages();
        for (int index = messages.size() - 1; index >= 0; index -= 1) {
            DreamMessageResponse message = messages.get(index);
            if ("ASSISTANT".equalsIgnoreCase(message.role())) {
                return message.content();
            }
        }

        return StringUtils.hasText(detail.interpretation()) ? detail.interpretation() : "The dream was updated.";
    }

    private String toBulletList(List<String> values) {
        return values.stream()
            .map(value -> "- " + value)
            .reduce((left, right) -> left + "\n" + right)
            .orElse("");
    }

    private boolean isEmotionSelectionStage(DreamConversationDetailResponse detail) {
        return "COLLECTING_EMOTIONS".equalsIgnoreCase(detail.stage());
    }

    private boolean isKeywordSelectionStage(DreamConversationDetailResponse detail) {
        return "SELECTING_KEYWORDS".equalsIgnoreCase(detail.stage());
    }

    private List<String> emotionOptionsFor(UserAccount user) {
        return isEnglish(user.getTelegramLanguage()) ? EMOTIONS_EN : EMOTIONS_RU;
    }

    private List<String> readSelectedEmotions(UserAccount user, UUID conversationId, List<String> availableEmotions) {
        if (conversationId == null
            || user.getTelegramEmotionSelectionConversationId() == null
            || !conversationId.equals(user.getTelegramEmotionSelectionConversationId())) {
            return List.of();
        }

        return readSelectedValues(user.getTelegramSelectedEmotions(), availableEmotions, MAX_SELECTED_EMOTIONS);
    }

    private List<String> readSelectedKeywords(UserAccount user, UUID conversationId, List<String> availableKeywords) {
        if (conversationId == null
            || user.getTelegramKeywordSelectionConversationId() == null
            || !conversationId.equals(user.getTelegramKeywordSelectionConversationId())) {
            return List.of();
        }

        return readSelectedValues(user.getTelegramSelectedKeywords(), availableKeywords, MAX_SELECTED_KEYWORDS);
    }

    private List<String> readSelectedValues(String rawValue, List<String> availableValues, int limit) {
        if (!StringUtils.hasText(rawValue)) {
            return List.of();
        }

        LinkedHashSet<String> selectedValues = new LinkedHashSet<>();
        String[] rawLines = rawValue.split("\\R+");

        for (String rawLine : rawLines) {
            String normalized = rawLine.trim();
            if (!StringUtils.hasText(normalized)) {
                continue;
            }

            availableValues.stream()
                .filter(value -> value.equalsIgnoreCase(normalized))
                .findFirst()
                .ifPresent(selectedValues::add);
        }

        return selectedValues.stream()
            .limit(limit)
            .toList();
    }

    private void setEmotionSelectionState(UserAccount user, UUID conversationId, List<String> selectedEmotions) {
        user.setTelegramEmotionSelectionConversationId(conversationId);
        user.setTelegramSelectedEmotions(serializeSelections(selectedEmotions, MAX_SELECTED_EMOTIONS));
    }

    private void clearEmotionSelectionState(UserAccount user) {
        user.setTelegramEmotionSelectionConversationId(null);
        user.setTelegramSelectedEmotions(null);
    }

    private void setKeywordSelectionState(UserAccount user, UUID conversationId, List<String> selectedKeywords) {
        user.setTelegramKeywordSelectionConversationId(conversationId);
        user.setTelegramSelectedKeywords(serializeSelections(selectedKeywords, MAX_SELECTED_KEYWORDS));
    }

    private void clearKeywordSelectionState(UserAccount user) {
        user.setTelegramKeywordSelectionConversationId(null);
        user.setTelegramSelectedKeywords(null);
    }

    private String serializeSelections(List<String> values, int limit) {
        if (values == null || values.isEmpty()) {
            return null;
        }

        return values.stream()
            .filter(StringUtils::hasText)
            .limit(limit)
            .reduce((left, right) -> left + "\n" + right)
            .orElse(null);
    }

    private boolean hasActiveLinkCode(UserAccount user) {
        return StringUtils.hasText(user.getTelegramLinkCode())
            && user.getTelegramLinkCodeExpiresAt() != null
            && user.getTelegramLinkCodeExpiresAt().isAfter(Instant.now());
    }

    private String normalizeCode(String value) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("Link code is required");
        }

        return value.trim().toUpperCase(Locale.ROOT);
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < 12; attempt += 1) {
            String code = randomCode(8);
            if (userAccountRepository.findByTelegramLinkCodeIgnoreCase(code).isEmpty()) {
                return code;
            }
        }

        throw new IllegalStateException("Could not generate a unique Telegram link code");
    }

    private String randomCode(int length) {
        StringBuilder builder = new StringBuilder(length);
        for (int index = 0; index < length; index += 1) {
            builder.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return builder.toString();
    }

    private boolean isBotAvailable() {
        return telegramProperties.isEnabled() && StringUtils.hasText(telegramProperties.getBotUsername());
    }

    private String buildBotLink() {
        if (!StringUtils.hasText(telegramProperties.getBotUsername())) {
            return null;
        }

        return "https://t.me/" + telegramProperties.getBotUsername();
    }

    private String buildStartLink(String code) {
        if (!StringUtils.hasText(code) || !StringUtils.hasText(telegramProperties.getBotUsername())) {
            return null;
        }

        return "https://t.me/" + telegramProperties.getBotUsername() + "?start=" + code;
    }

    private String generateTelegramUsername(TelegramBotChatRequest request) {
        String base = firstNonBlank(request.telegramUsername(), request.firstName(), "telegram");
        base = base.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_]+", "_").replaceAll("_+", "_");
        base = base.replaceAll("^_+|_+$", "");

        if (base.length() < 3) {
            base = "telegram";
        }

        base = "tg_" + base;
        if (base.length() > 32) {
            base = base.substring(0, 32);
        }

        String candidate = base;
        int suffix = 1;

        while (userAccountRepository.findByUsernameIgnoreCase(candidate).isPresent()) {
            String trailer = "_" + suffix;
            int maxBaseLength = Math.max(3, 40 - trailer.length());
            candidate = base.substring(0, Math.min(base.length(), maxBaseLength)) + trailer;
            suffix += 1;
        }

        return candidate;
    }

    private String normalizeLanguage(String languageCode) {
        return firstNonBlank(languageCode).toLowerCase(Locale.ROOT).startsWith("en") ? "en" : "ru";
    }

    private boolean isEnglish(String languageCode) {
        return "en".equalsIgnoreCase(firstNonBlank(languageCode));
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return "";
    }

    private UUID firstNonNull(UUID left, UUID right) {
        return left != null ? left : right;
    }

    private String emptyToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
