alter table users
    add column if not exists telegram_keyword_selection_conversation_id uuid,
    add column if not exists telegram_selected_keywords text;
