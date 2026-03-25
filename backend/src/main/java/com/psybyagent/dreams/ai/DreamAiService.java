package com.psybyagent.dreams.ai;

import com.psybyagent.dreams.dream.DreamConversation;
import java.util.List;

public interface DreamAiService {

    DreamAiResult generateReply(DreamConversation conversation, List<DreamConversation> recentDreams);
}
