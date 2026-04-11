alter table users
    add column if not exists telegram_auto_created boolean not null default false;
