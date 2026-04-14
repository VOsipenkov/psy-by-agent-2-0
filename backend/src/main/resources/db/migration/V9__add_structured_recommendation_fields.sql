alter table dream_conversations
    add column recommendation_trigger text,
    add column recommendation_micro_action text,
    add column recommendation_journal_prompt text;
