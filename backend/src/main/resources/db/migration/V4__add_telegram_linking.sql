alter table users
    add column if not exists telegram_chat_id bigint,
    add column if not exists telegram_username varchar(100),
    add column if not exists telegram_link_code varchar(20),
    add column if not exists telegram_link_code_expires_at timestamptz,
    add column if not exists telegram_linked_at timestamptz,
    add column if not exists telegram_active_conversation_id uuid,
    add column if not exists telegram_language varchar(8);

create unique index if not exists ux_users_telegram_chat_id
    on users (telegram_chat_id)
    where telegram_chat_id is not null;

create unique index if not exists ux_users_telegram_link_code
    on users (telegram_link_code)
    where telegram_link_code is not null;
