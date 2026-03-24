create table users (
    id uuid primary key,
    username varchar(40) not null unique,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table dream_conversations (
    id uuid primary key,
    user_id uuid not null references users (id) on delete cascade,
    title varchar(120) not null,
    stage varchar(32) not null,
    interpretation text,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table dream_messages (
    id uuid primary key,
    conversation_id uuid not null references dream_conversations (id) on delete cascade,
    role varchar(32) not null,
    content text not null,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table dream_keywords (
    conversation_id uuid not null references dream_conversations (id) on delete cascade,
    position_index integer not null,
    keyword varchar(64) not null,
    primary key (conversation_id, position_index)
);

create index idx_dream_conversations_user_updated
    on dream_conversations (user_id, updated_at desc);

create index idx_dream_messages_conversation_created
    on dream_messages (conversation_id, created_at asc);
