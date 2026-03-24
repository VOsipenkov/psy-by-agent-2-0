package com.psybyagent.dreams.ai;

import com.psybyagent.dreams.dream.DreamConversation;

public interface DreamAiService {

    DreamAiResult generateReply(DreamConversation conversation);
}
