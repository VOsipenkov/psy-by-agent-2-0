alter table users
    add column if not exists telegram_emotion_selection_conversation_id uuid,
    add column if not exists telegram_selected_emotions text;
