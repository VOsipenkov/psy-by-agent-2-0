alter table users
    add column if not exists email varchar(160);
