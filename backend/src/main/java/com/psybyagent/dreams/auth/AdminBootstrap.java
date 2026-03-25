package com.psybyagent.dreams.auth;

import com.psybyagent.dreams.dream.ChatRole;
import com.psybyagent.dreams.dream.DreamConversation;
import com.psybyagent.dreams.dream.DreamConversationRepository;
import com.psybyagent.dreams.dream.DreamMessage;
import com.psybyagent.dreams.dream.DreamStage;
import com.psybyagent.dreams.dream.UserAccount;
import com.psybyagent.dreams.dream.UserAccountRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class AdminBootstrap implements ApplicationRunner {

    private final UserAccountRepository userAccountRepository;
    private final DreamConversationRepository dreamConversationRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        UserAccount admin = userAccountRepository.findByUsernameIgnoreCase("admin")
            .orElseGet(UserAccount::new);

        admin.setUsername("admin");

        if (admin.getPasswordHash() == null || !passwordEncoder.matches("admin", admin.getPasswordHash())) {
            admin.setPasswordHash(passwordEncoder.encode("admin"));
        }

        admin = userAccountRepository.save(admin);
        ensureSeedDreams(admin);
    }

    private void ensureSeedDreams(UserAccount admin) {
        List<DreamConversation> existingConversations = dreamConversationRepository
            .findByUserAccountIdOrderByUpdatedAtDesc(admin.getId());

        ensureConversation(
            admin,
            existingConversations,
            "Тревожная дорога",
            List.of(
                assistant("Опишите свой сон как можно подробнее. Я задам пару уточняющих вопросов, выделю ключевые символы и предложу интерпретацию."),
                user("Мне снилось, что я мчусь на поезд через мокрый город и все время боюсь опоздать."),
                assistant("Что во сне ощущалось сильнее всего: тревога, облегчение или азарт? И был ли рядом кто-то знакомый?"),
                user("Сильнее всего тревога. Рядом мелькала сестра, будто торопила меня."),
                assistant("А чем закончился сон: вы успели, поезд ушел или все оборвалось?"),
                user("Я успел в последний момент, и когда двери закрылись, стало легче дышать."),
                assistant("Здесь особенно заметны спешка, поезд и фигура сестры. Сон похож на внутренний сюжет про важный переход, к которому вы уже близки, хотя тревога все еще подгоняет вас. Страх опоздать часто появляется, когда решение назрело, но внутри остается сомнение, хватит ли сил и времени. Финал с закрывающимися дверями и облегчением говорит о готовности войти в новый этап и о том, что поддержка рядом все же ощущается.")
            ),
            List.of("спешка", "поезд", "тревога"),
            "Здесь особенно заметны спешка, поезд и фигура сестры. Сон похож на внутренний сюжет про важный переход, к которому вы уже близки, хотя тревога все еще подгоняет вас. Страх опоздать часто появляется, когда решение назрело, но внутри остается сомнение, хватит ли сил и времени. Финал с закрывающимися дверями и облегчением говорит о готовности войти в новый этап и о том, что поддержка рядом все же ощущается."
        );

        ensureConversation(
            admin,
            existingConversations,
            "Закрытая дверь",
            List.of(
                assistant("Опишите свой сон как можно подробнее. Я задам пару уточняющих вопросов, выделю ключевые символы и предложу интерпретацию."),
                user("Мне снился старый дом у воды, я ходил по комнатам и никак не мог открыть одну дверь ключом."),
                assistant("Дом казался знакомым или чужим? Что вы чувствовали у этой двери?"),
                user("Будто дом знакомый с детства, а у двери было и любопытство, и тревога."),
                assistant("Что было за дверью или сон закончился раньше?"),
                user("Сон оборвался прямо перед тем, как замок щелкнул."),
                assistant("В этом сне особенно выделяются старый дом, вода и закрытая дверь. Такой сюжет часто связан с памятью, эмоциональной глубиной и частью внутреннего опыта, к которой вы уже подошли, но еще не готовы войти до конца. Любопытство рядом с тревогой показывает, что внутри назревает важное соприкосновение с чем-то личным и давно знакомым. Незавершенный финал намекает: ответ близко, но для него нужно чуть больше внутренней готовности.")
            ),
            List.of("дом", "дверь", "вода"),
            "В этом сне особенно выделяются старый дом, вода и закрытая дверь. Такой сюжет часто связан с памятью, эмоциональной глубиной и частью внутреннего опыта, к которой вы уже подошли, но еще не готовы войти до конца. Любопытство рядом с тревогой показывает, что внутри назревает важное соприкосновение с чем-то личным и давно знакомым. Незавершенный финал намекает: ответ близко, но для него нужно чуть больше внутренней готовности."
        );
    }

    private void ensureConversation(
        UserAccount admin,
        List<DreamConversation> existingConversations,
        String title,
        List<DreamMessage> messages,
        List<String> keywords,
        String interpretation
    ) {
        boolean exists = existingConversations.stream()
            .anyMatch(conversation -> title.equalsIgnoreCase(conversation.getTitle()));

        if (exists) {
            return;
        }

        DreamConversation conversation = new DreamConversation();
        conversation.setUserAccount(admin);
        conversation.setTitle(title);
        conversation.setStage(DreamStage.INTERPRETED);
        conversation.setInterpretation(interpretation);
        conversation.getKeywords().addAll(keywords);
        messages.forEach(conversation::addMessage);
        dreamConversationRepository.save(conversation);
    }

    private DreamMessage assistant(String content) {
        DreamMessage message = new DreamMessage();
        message.setRole(ChatRole.ASSISTANT);
        message.setContent(content);
        return message;
    }

    private DreamMessage user(String content) {
        DreamMessage message = new DreamMessage();
        message.setRole(ChatRole.USER);
        message.setContent(content);
        return message;
    }
}
