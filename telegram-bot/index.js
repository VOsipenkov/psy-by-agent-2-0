const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const TELEGRAM_API_BASE = (process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/$/, '');
const TELEGRAM_BACKEND_URL = (process.env.TELEGRAM_BACKEND_URL ?? 'http://backend:8080').replace(/\/$/, '');
const TELEGRAM_TRANSCRIBE_URL = (process.env.TELEGRAM_TRANSCRIBE_URL ?? 'http://speech-to-text:9000/transcribe').trim();
const TELEGRAM_INTERNAL_SECRET = (process.env.TELEGRAM_INTERNAL_SECRET ?? '').trim();
const TELEGRAM_POLLING_TIMEOUT = Number(process.env.TELEGRAM_POLLING_TIMEOUT ?? 25);
const TELEGRAM_RETRY_DELAY_MS = Number(process.env.TELEGRAM_RETRY_DELAY_MS ?? 4000);
const TELEGRAM_TRANSCRIBE_TIMEOUT_MS = Math.max(15_000, Number(process.env.TELEGRAM_TRANSCRIBE_TIMEOUT_MS ?? 240_000) || 240_000);
const TELEGRAM_TYPING_INTERVAL_MS = Math.max(2000, Number(process.env.TELEGRAM_TYPING_INTERVAL_MS ?? 4000) || 4000);
const TELEGRAM_PROGRESS_INTERVAL_MS = Math.max(6000, Number(process.env.TELEGRAM_PROGRESS_INTERVAL_MS ?? 12000) || 12000);
const TELEGRAM_VOICE_MAX_FILE_SIZE = 20 * 1024 * 1024;
const VOICE_DRAFT_TTL_MS = Math.max(300_000, Number(process.env.TELEGRAM_VOICE_DRAFT_TTL_MS ?? 1_800_000) || 1_800_000);
const KEYWORDS_PER_ROW = 2;
const OPTIONS_PER_ROW = 2;
const CALLBACK_ACTIONS = {
  TOGGLE: 't',
  SUBMIT: 's',
  RESET: 'r',
};
const CALLBACK_TYPES = {
  EMOTIONS: 'em',
  KEYWORDS: 'kw',
};
const VOICE_CALLBACK_ACTIONS = {
  SEND: 's',
  CANCEL: 'c',
};

let nextOffset = 0;
const pendingVoiceDrafts = new Map();
const voiceDraftCleanupTimer = setInterval(cleanupVoiceDrafts, Math.max(60_000, Math.floor(VOICE_DRAFT_TTL_MS / 3)));
voiceDraftCleanupTimer.unref?.();

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_INTERNAL_SECRET) {
  console.log('Telegram bot is disabled. Set TELEGRAM_BOT_TOKEN and TELEGRAM_INTERNAL_SECRET to enable it.');
  setInterval(() => {}, 60_000);
} else {
  await initializeBot();
  await pollForever();
}

async function initializeBot() {
  try {
    await callTelegram('setMyCommands', {
      commands: [
        { command: 'start', description: 'Start using the dream bot' },
        { command: 'new', description: 'Start a new dream' },
        { command: 'unlink', description: 'Disconnect this Telegram chat' },
        { command: 'help', description: 'Show available commands' },
      ],
    });

    const me = await callTelegram('getMe');
    console.log(`Telegram bot is running as @${me.username}`);
  } catch (error) {
    console.error('Bot initialization failed:', error.message);
  }
}

async function pollForever() {
  while (true) {
    try {
      const updates = await callTelegram('getUpdates', {
        offset: nextOffset,
        timeout: TELEGRAM_POLLING_TIMEOUT,
        allowed_updates: ['message', 'callback_query'],
      });

      for (const update of updates) {
        nextOffset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (error) {
      console.error('Polling error:', error.message);
      await sleep(TELEGRAM_RETRY_DELAY_MS);
    }
  }
}

async function handleUpdate(update) {
  if (update?.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const message = update?.message;
  const chatId = message?.chat?.id;

  if (!message || !chatId || message.chat?.type !== 'private') {
    return;
  }

  try {
    if (message.video_note) {
      await sendText(chatId, buildVideoNoteUnsupportedText(message.from?.language_code));
      return;
    }

    if (message.voice || message.audio) {
      await handleVoiceMessage(message);
      return;
    }

    const text = (message.text ?? '').trim();
    if (!text) {
      await sendText(chatId, 'Send a text message, /start, /new, /unlink, or /help.');
      return;
    }

    const [command, ...rest] = text.split(/\s+/);
    const argument = rest.join(' ').trim();

    if (command === '/help') {
      await sendText(chatId, buildHelpMessage());
      return;
    }

    if (command === '/start') {
      if (argument) {
        const reply = await withTyping(chatId, () => postBackend('/api/internal/telegram/link', buildLinkPayload(message, argument)));
        await sendBotReply(chatId, reply);
      } else {
        const reply = await withTyping(chatId, () => postBackend('/api/internal/telegram/new-dream', buildChatPayload(message)));
        await sendBotReply(chatId, {
          ...reply,
          message: `${buildWelcomeMessage()}\n\n${reply.message}`,
        });
      }
      return;
    }

    if (command === '/link') {
      if (!argument) {
        await sendText(chatId, 'Send /link CODE after generating a code in the web app.');
        return;
      }

      const reply = await withTyping(chatId, () => postBackend('/api/internal/telegram/link', buildLinkPayload(message, argument)));
      await sendBotReply(chatId, reply);
      return;
    }

    if (command === '/new') {
      const reply = await withTyping(chatId, () => postBackend('/api/internal/telegram/new-dream', buildChatPayload(message)));
      await sendBotReply(chatId, reply);
      return;
    }

    if (command === '/unlink') {
      const reply = await withTyping(chatId, () => postBackend('/api/internal/telegram/unlink', buildChatPayload(message)));
      await sendBotReply(chatId, reply);
      return;
    }

    const reply = await withTyping(chatId, () => postBackend('/api/internal/telegram/message', buildMessagePayload(message, text)));
    await sendBotReply(chatId, reply);
  } catch (error) {
    console.error('Update handling failed:', error.message);
    await sendText(chatId, error.message || 'Could not process the message right now.');
  }
}

async function handleCallbackQuery(callbackQuery) {
  const voiceDraft = parseVoiceDraftCallbackData(callbackQuery?.data);
  if (voiceDraft) {
    await handleVoiceDraftCallback(callbackQuery, voiceDraft);
    return;
  }

  const parsed = parseSelectionCallbackData(callbackQuery?.data);
  const message = callbackQuery?.message;
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  const languageCode = callbackQuery?.from?.language_code ?? null;

  if (!parsed || !chatId || !messageId) {
    if (callbackQuery?.id) {
      await answerCallbackQuery(callbackQuery.id, 'Эта кнопка больше неактуальна.');
    }
    return;
  }

  let callbackAnswered = false;

  try {
    let reply;

    if (parsed.action === CALLBACK_ACTIONS.TOGGLE) {
      reply = parsed.type === CALLBACK_TYPES.EMOTIONS
        ? await postBackend(
          '/api/internal/telegram/emotion-selection/toggle',
          buildEmotionTogglePayload(callbackQuery, parsed.conversationId, parsed.optionIndex),
        )
        : await postBackend(
          '/api/internal/telegram/keyword-selection/toggle',
          buildKeywordTogglePayload(callbackQuery, parsed.conversationId, parsed.optionIndex),
        );
      await editBotReply(chatId, messageId, reply);
      await answerCallbackQuery(callbackQuery.id, 'Выбор обновлен.');
      callbackAnswered = true;
      return;
    }

    if (parsed.action === CALLBACK_ACTIONS.RESET) {
      reply = parsed.type === CALLBACK_TYPES.EMOTIONS
        ? await postBackend(
          '/api/internal/telegram/emotion-selection/reset',
          buildSelectionActionPayload(callbackQuery, parsed.conversationId),
        )
        : await postBackend(
          '/api/internal/telegram/keyword-selection/reset',
          buildSelectionActionPayload(callbackQuery, parsed.conversationId),
        );
      await editBotReply(chatId, messageId, reply);
      await answerCallbackQuery(callbackQuery.id, 'Выбор сброшен.');
      callbackAnswered = true;
      return;
    }

    if (parsed.action === CALLBACK_ACTIONS.SUBMIT) {
      await answerCallbackQuery(callbackQuery.id, buildSubmitProgressText(parsed.type, languageCode));
      callbackAnswered = true;
      const submitWork = () => (
        parsed.type === CALLBACK_TYPES.EMOTIONS
          ? postBackend(
            '/api/internal/telegram/emotion-selection/submit',
            buildSelectionActionPayload(callbackQuery, parsed.conversationId),
          )
          : postBackend(
            '/api/internal/telegram/keyword-selection/submit',
            buildSelectionActionPayload(callbackQuery, parsed.conversationId),
          )
      );
      const submitResult = parsed.type === CALLBACK_TYPES.KEYWORDS
        ? await withInterpretationProgress(chatId, languageCode, submitWork)
        : { reply: await withTyping(chatId, submitWork), progressMessageId: null };

      reply = submitResult.reply;

      await collapseSelectionMessage(chatId, messageId, parsed.type, reply, languageCode);
      await sendBotReply(chatId, reply);
      if (submitResult.progressMessageId) {
        await safelyDeleteMessage(chatId, submitResult.progressMessageId);
      }
      return;
    }

    await answerCallbackQuery(callbackQuery.id, 'Эта кнопка больше неактуальна.');
  } catch (error) {
    console.error('Callback handling failed:', error.message);

    if (/no longer|not connected|not available/i.test(error.message ?? '')) {
      await safelyClearInlineKeyboard(chatId, messageId);
    }

    if (!callbackAnswered) {
      await answerCallbackQuery(callbackQuery.id, error.message || 'Could not process the button right now.');
      return;
    }

    if (parsed?.action === CALLBACK_ACTIONS.SUBMIT) {
      await sendText(chatId, error.message || buildSubmitErrorText(languageCode));
    }
  }
}

async function handleVoiceMessage(message) {
  const chatId = message.chat.id;
  const languageCode = message.from?.language_code ?? null;
  const audio = message.voice ?? message.audio;
  const progressMessage = await sendText(chatId, buildVoiceRecognitionProgressText(languageCode));

  try {
    if (!audio?.file_id) {
      throw new Error(buildVoiceRecognitionErrorText(languageCode));
    }

    if (Number(audio.file_size ?? 0) > TELEGRAM_VOICE_MAX_FILE_SIZE) {
      throw new Error(buildVoiceTooLargeText(languageCode));
    }

    const transcript = await withTyping(chatId, () => transcribeVoiceMessage(message));
    if (!transcript) {
      throw new Error(buildVoiceEmptyTranscriptText(languageCode));
    }

    const draftId = storeVoiceDraft({
      chatId,
      text: transcript,
      telegramUsername: message.from?.username ?? null,
      firstName: message.from?.first_name ?? null,
      languageCode,
    });

    await safelyDeleteMessage(chatId, progressMessage?.message_id);
    await sendText(
      chatId,
      buildVoiceDraftMessage(transcript, languageCode),
      buildVoiceDraftReplyMarkup(draftId, transcript, languageCode),
    );
  } catch (error) {
    console.error('Voice message handling failed:', error.message);

    if (progressMessage?.message_id) {
      await safelyEditText(chatId, progressMessage.message_id, error.message || buildVoiceRecognitionErrorText(languageCode), 'voice progress');
      return;
    }

    await sendText(chatId, error.message || buildVoiceRecognitionErrorText(languageCode));
  }
}

async function handleVoiceDraftCallback(callbackQuery, parsed) {
  const message = callbackQuery?.message;
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  const languageCode = callbackQuery?.from?.language_code ?? null;

  if (!callbackQuery?.id || !chatId || !messageId) {
    return;
  }

  const draft = pendingVoiceDrafts.get(parsed.draftId);
  if (!draft || draft.chatId !== chatId) {
    await answerCallbackQuery(callbackQuery.id, buildVoiceDraftExpiredText(languageCode));
    await safelyClearInlineKeyboard(chatId, messageId);
    return;
  }

  if (parsed.action === VOICE_CALLBACK_ACTIONS.CANCEL) {
    pendingVoiceDrafts.delete(parsed.draftId);
    await answerCallbackQuery(callbackQuery.id, buildVoiceDraftCancelledToast(languageCode));
    await editText(chatId, messageId, buildVoiceDraftCancelledMessage(languageCode), { inline_keyboard: [] });
    return;
  }

  if (parsed.action !== VOICE_CALLBACK_ACTIONS.SEND) {
    await answerCallbackQuery(callbackQuery.id, 'Эта кнопка больше неактуальна.');
    return;
  }

  await answerCallbackQuery(callbackQuery.id, buildVoiceDraftSubmitToast(languageCode));
  try {
    const backendReply = await withTyping(chatId, () => postBackend('/api/internal/telegram/message', {
      ...buildCallbackChatPayload(callbackQuery),
      text: draft.text,
    }));

    pendingVoiceDrafts.delete(parsed.draftId);
    await editText(chatId, messageId, buildVoiceDraftSubmittedMessage(draft.text, languageCode), { inline_keyboard: [] });
    await sendBotReply(chatId, backendReply);
  } catch (error) {
    console.error('Voice draft submit failed:', error.message);
    await sendText(chatId, error.message || buildVoiceRecognitionErrorText(languageCode));
  }
}

function buildHelpMessage() {
  return [
    'Dream Journal bot',
    '',
    'You can just start writing here and the bot will create your Telegram profile automatically.',
    'You can also send a voice message: I will transcribe it into text and let you send the recognized version into the dialog.',
    'If you already use the website, press "Link Telegram" there and open the generated start link.',
    '',
    'Commands:',
    '/new - start a new dream',
    '/unlink - disconnect this Telegram chat',
    '/help - show this help',
  ].join('\n');
}

function buildWelcomeMessage() {
  return [
    'Dream Journal bot',
    '',
    'Send your dream as text or as a voice message and I will guide you through the interpretation step by step.',
  ].join('\n');
}

function buildChatPayload(message) {
  return {
    chatId: message.chat.id,
    telegramUsername: message.from?.username ?? null,
    firstName: message.from?.first_name ?? null,
    languageCode: message.from?.language_code ?? null,
  };
}

function buildLinkPayload(message, code) {
  return {
    ...buildChatPayload(message),
    code,
  };
}

function buildMessagePayload(message, text) {
  return {
    ...buildChatPayload(message),
    text,
  };
}

function buildKeywordTogglePayload(callbackQuery, conversationId, keywordIndex) {
  return {
    ...buildCallbackChatPayload(callbackQuery),
    conversationId,
    keywordIndex,
  };
}

function buildEmotionTogglePayload(callbackQuery, conversationId, emotionIndex) {
  return {
    ...buildCallbackChatPayload(callbackQuery),
    conversationId,
    emotionIndex,
  };
}

function buildSelectionActionPayload(callbackQuery, conversationId) {
  return {
    ...buildCallbackChatPayload(callbackQuery),
    conversationId,
  };
}

function buildCallbackChatPayload(callbackQuery) {
  return {
    chatId: callbackQuery.message.chat.id,
    telegramUsername: callbackQuery.from?.username ?? null,
    firstName: callbackQuery.from?.first_name ?? null,
    languageCode: callbackQuery.from?.language_code ?? null,
  };
}

async function transcribeVoiceMessage(message) {
  if (!TELEGRAM_TRANSCRIBE_URL) {
    throw new Error(buildVoiceServiceUnavailableText(message.from?.language_code));
  }

  const audio = message.voice ?? message.audio;
  const telegramFile = await callTelegram('getFile', {
    file_id: audio.file_id,
  });

  if (!telegramFile?.file_path) {
    throw new Error(buildVoiceRecognitionErrorText(message.from?.language_code));
  }

  const fileResponse = await fetch(`${TELEGRAM_API_BASE}/file/bot${TELEGRAM_BOT_TOKEN}/${telegramFile.file_path}`);
  if (!fileResponse.ok) {
    throw new Error(buildVoiceRecognitionErrorText(message.from?.language_code));
  }

  const audioBuffer = await fileResponse.arrayBuffer();
  const formData = new FormData();
  const mimeType = audio.mime_type ?? guessMimeType(telegramFile.file_path);
  formData.set(
    'file',
    new Blob([audioBuffer], { type: mimeType }),
    extractTelegramFilename(telegramFile.file_path, audio, mimeType),
  );

  const transcriptionLanguage = normalizeTranscriptionLanguage(message.from?.language_code);
  if (transcriptionLanguage) {
    formData.set('language', transcriptionLanguage);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TRANSCRIBE_TIMEOUT_MS);

  try {
    const response = await fetch(TELEGRAM_TRANSCRIBE_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(data?.detail || buildVoiceRecognitionErrorText(message.from?.language_code));
    }

    return String(data?.text ?? '').trim();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(buildVoiceRecognitionTimeoutText(message.from?.language_code));
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function postBackend(path, payload) {
  const response = await fetch(`${TELEGRAM_BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Secret': TELEGRAM_INTERNAL_SECRET,
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.message || `Backend request failed: ${response.status}`);
  }

  return data;
}

async function withTyping(chatId, work) {
  await sendChatAction(chatId).catch((error) => {
    console.error('Could not send typing action:', error.message);
  });

  const timer = setInterval(() => {
    sendChatAction(chatId).catch((error) => {
      console.error('Could not send typing action:', error.message);
    });
  }, TELEGRAM_TYPING_INTERVAL_MS);

  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

async function withInterpretationProgress(chatId, languageCode, work) {
  const startedAt = Date.now();
  let progressMessage = null;

  try {
    progressMessage = await sendText(chatId, buildInterpretationProgressText(languageCode, 0));
  } catch (error) {
    console.error('Could not send interpretation progress message:', error.message);
  }

  await sendChatAction(chatId).catch((error) => {
    console.error('Could not send typing action:', error.message);
  });

  const typingTimer = setInterval(() => {
    sendChatAction(chatId).catch((error) => {
      console.error('Could not send typing action:', error.message);
    });
  }, TELEGRAM_TYPING_INTERVAL_MS);

  const progressTimer = progressMessage?.message_id
    ? setInterval(() => {
      safelyEditText(
        chatId,
        progressMessage.message_id,
        buildInterpretationProgressText(languageCode, Date.now() - startedAt),
        'progress',
      );
    }, TELEGRAM_PROGRESS_INTERVAL_MS)
    : null;

  try {
    return {
      reply: await work(),
      progressMessageId: progressMessage?.message_id ?? null,
    };
  } finally {
    clearInterval(typingTimer);
    if (progressTimer) {
      clearInterval(progressTimer);
    }
  }
}

async function sendBotReply(chatId, reply) {
  await sendText(chatId, reply.message, buildSelectionReplyMarkup(reply));
}

async function editBotReply(chatId, messageId, reply) {
  try {
    await editText(chatId, messageId, reply.message, buildSelectionReplyMarkup(reply));
  } catch (error) {
    if (/message is not modified/i.test(error.message ?? '')) {
      return;
    }
    throw error;
  }
}

async function sendText(chatId, text, replyMarkup) {
  const payload = {
    chat_id: chatId,
    text: fitTelegramText(text),
    disable_web_page_preview: true,
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  return callTelegram('sendMessage', payload);
}

async function sendChatAction(chatId, action = 'typing') {
  await callTelegram('sendChatAction', {
    chat_id: chatId,
    action,
  });
}

async function editText(chatId, messageId, text, replyMarkup) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: fitTelegramText(text),
    disable_web_page_preview: true,
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  await callTelegram('editMessageText', payload);
}

async function clearInlineKeyboard(chatId, messageId) {
  await callTelegram('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [],
    },
  });
}

async function safelyClearInlineKeyboard(chatId, messageId) {
  try {
    await clearInlineKeyboard(chatId, messageId);
  } catch (error) {
    console.error('Could not clear inline keyboard:', error.message);
  }
}

async function deleteMessage(chatId, messageId) {
  await callTelegram('deleteMessage', {
    chat_id: chatId,
    message_id: messageId,
  });
}

async function safelyDeleteMessage(chatId, messageId) {
  try {
    await deleteMessage(chatId, messageId);
  } catch (error) {
    console.error('Could not delete Telegram message:', error.message);
  }
}

async function answerCallbackQuery(callbackQueryId, text) {
  await callTelegram('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: fitCallbackText(text),
  });
}

async function safelyEditText(chatId, messageId, text, context = 'message') {
  try {
    await editText(chatId, messageId, text);
  } catch (error) {
    if (/message is not modified/i.test(error.message ?? '')) {
      return;
    }

    console.error(`Could not update Telegram ${context}:`, error.message);
  }
}

async function collapseSelectionMessage(chatId, messageId, type, reply, languageCode) {
  const summaryText = buildSelectionSummaryText(type, reply, languageCode);
  if (!summaryText) {
    await safelyClearInlineKeyboard(chatId, messageId);
    return;
  }

  try {
    await editText(chatId, messageId, summaryText, { inline_keyboard: [] });
  } catch (error) {
    console.error('Could not collapse selection message:', error.message);
    await safelyClearInlineKeyboard(chatId, messageId);
  }
}

function buildSelectionSummaryText(type, reply, languageCode) {
  const selected = type === CALLBACK_TYPES.EMOTIONS
    ? reply.selectedEmotions
    : reply.selectedKeywords;

  if (!Array.isArray(selected) || selected.length === 0) {
    return null;
  }

  const heading = isEnglishLanguage(languageCode)
    ? (type === CALLBACK_TYPES.EMOTIONS ? 'Selected emotions:' : 'Selected keywords:')
    : (type === CALLBACK_TYPES.EMOTIONS ? 'Выбраны эмоции:' : 'Выбраны ключевые слова:');

  return `${heading}\n${selected.map((value) => `- ${value}`).join('\n')}`;
}

function buildSubmitProgressText(type, languageCode) {
  if (isEnglishLanguage(languageCode)) {
    return type === CALLBACK_TYPES.EMOTIONS
      ? 'Saved. Opening the next step...'
      : 'Saved. The interpretation may take a few minutes. Showing progress below...';
  }

  return type === CALLBACK_TYPES.EMOTIONS
    ? 'Сохранил эмоции, открываю следующий шаг...'
    : 'Ответы приняты. Интерпретация может занять несколько минут, показываю прогресс ниже.';
}

function buildInterpretationProgressText(languageCode, elapsedMs) {
  if (isEnglishLanguage(languageCode)) {
    const phase = interpretationProgressPhase(elapsedMs);

    return [
      'Everything is collected. Processing the interpretation.',
      '',
      phase.label,
      phase.textEn,
      '',
      interpretationExpectedTimeText(languageCode, elapsedMs),
      'I will send the finished result here as soon as it is ready.',
    ].join('\n');
  }

  const phase = interpretationProgressPhase(elapsedMs);

  return [
    'Ответы собраны. Запускаю обработку интерпретации.',
    '',
    phase.label,
    phase.textRu,
    '',
    interpretationExpectedTimeText(languageCode, elapsedMs),
    'По готовности пришлю результат в бот.',
  ].join('\n');
}

function interpretationProgressPhase(elapsedMs) {
  if (elapsedMs < 30_000) {
    return {
      label: '[#..] 1/3',
      textRu: 'Собираю детали сна и ключевые акценты.',
      textEn: 'Collecting dream details and key accents.',
    };
  }

  if (elapsedMs < 90_000) {
    return {
      label: '[##.] 2/3',
      textRu: 'Соединяю ответы, эмоции и выбранные образы.',
      textEn: 'Linking the answers, emotions, and selected symbols.',
    };
  }

  return {
    label: '[###] 3/3',
    textRu: 'Формулирую итоговую интерпретацию.',
    textEn: 'Writing the final interpretation.',
  };
}

function buildSubmitErrorText(languageCode) {
  if (isEnglishLanguage(languageCode)) {
    return 'Could not finish the interpretation right now. Please try again in a moment.';
  }

  return 'Сейчас не смог довести интерпретацию до конца. Попробуйте еще раз чуть позже.';
}

function buildVoiceRecognitionProgressText(languageCode) {
  if (isEnglishLanguage(languageCode)) {
    return [
      'Voice message received.',
      '',
      '[#.] 1/2',
      'Transcribing the recording into text.',
      '',
      'Expected response time: up to 2 minutes.',
      'I will send the text back here when it is ready.',
    ].join('\n');
  }

  return [
    'Голосовое сообщение получил.',
    '',
    '[#.] 1/2',
    'Распознаю запись и перевожу речь в текст.',
    '',
    'Ожидаемое время ответа: до 2 минут.',
    'Когда текст будет готов, пришлю его сюда.',
  ].join('\n');
}

function buildVoiceDraftMessage(transcript, languageCode) {
  const preview = transcript.length > 3200
    ? `${transcript.slice(0, 3197)}...`
    : transcript;

  if (isEnglishLanguage(languageCode)) {
    return [
      'I have transcribed the voice message.',
      '',
      preview,
      '',
      'If the text looks correct, send it to the dialog with the button below.',
      'If you want to adjust the wording, copy the text from this message, edit it, and send it as a regular message.',
    ].join('\n');
  }

  return [
    'Распознал голосовое сообщение.',
    '',
    preview,
    '',
    'Если текст распознан верно, отправьте его в диалог кнопкой ниже.',
    'Если хотите поправить формулировки, скопируйте текст из сообщения, отредактируйте его и отправьте обычным сообщением.',
  ].join('\n');
}

function buildVoiceDraftReplyMarkup(draftId, transcript, languageCode) {
  const rows = [[
    {
      text: isEnglishLanguage(languageCode) ? 'Send Text' : 'Отправить текст',
      style: 'success',
      callback_data: buildVoiceDraftCallbackData(VOICE_CALLBACK_ACTIONS.SEND, draftId),
    },
    {
      text: isEnglishLanguage(languageCode) ? 'Cancel' : 'Не отправлять',
      style: 'danger',
      callback_data: buildVoiceDraftCallbackData(VOICE_CALLBACK_ACTIONS.CANCEL, draftId),
    },
  ]];

  if (transcript.length <= 256) {
    rows.push([{
      text: isEnglishLanguage(languageCode) ? 'Copy Text' : 'Скопировать текст',
      copy_text: {
        text: transcript,
      },
    }]);
  }

  return { inline_keyboard: rows };
}

function buildVoiceDraftSubmittedMessage(transcript, languageCode) {
  const preview = transcript.length > 900
    ? `${transcript.slice(0, 897)}...`
    : transcript;

  if (isEnglishLanguage(languageCode)) {
    return [
      'Transcribed text sent to the dialog:',
      '',
      preview,
    ].join('\n');
  }

  return [
    'Распознанный текст отправлен в диалог:',
    '',
    preview,
  ].join('\n');
}

function buildVoiceDraftCancelledMessage(languageCode) {
  return isEnglishLanguage(languageCode)
    ? 'The transcribed draft was hidden. You can record another voice message or send text manually.'
    : 'Распознанный черновик скрыт. Можно записать новое голосовое или отправить текст вручную.';
}

function buildVoiceDraftSubmitToast(languageCode) {
  return isEnglishLanguage(languageCode)
    ? 'Sending the transcribed text...'
    : 'Отправляю распознанный текст...';
}

function buildVoiceDraftCancelledToast(languageCode) {
  return isEnglishLanguage(languageCode)
    ? 'Draft hidden.'
    : 'Черновик скрыт.';
}

function buildVoiceDraftExpiredText(languageCode) {
  return isEnglishLanguage(languageCode)
    ? 'This transcribed draft is no longer available.'
    : 'Этот распознанный черновик больше неактуален.';
}

function buildVoiceRecognitionErrorText(languageCode) {
  return isEnglishLanguage(languageCode)
    ? 'Could not recognize the voice message right now. Please try again or send the text manually.'
    : 'Сейчас не удалось распознать голосовое сообщение. Попробуйте еще раз или отправьте текст вручную.';
}

function buildVoiceRecognitionTimeoutText(languageCode) {
  return isEnglishLanguage(languageCode)
    ? 'Voice recognition is taking too long. Please try again with a shorter message.'
    : 'Распознавание заняло слишком много времени. Попробуйте еще раз с более коротким сообщением.';
}

function buildVoiceEmptyTranscriptText(languageCode) {
  return isEnglishLanguage(languageCode)
    ? 'I could not extract speech from the recording. Please try again a little louder or send text manually.'
    : 'Не удалось выделить речь из записи. Попробуйте еще раз чуть громче или отправьте текст вручную.';
}

function buildVoiceTooLargeText(languageCode) {
  return isEnglishLanguage(languageCode)
    ? 'The recording is too large for Telegram bot processing. Please send a shorter voice message.'
    : 'Запись слишком большая для обработки через Telegram-бота. Отправьте более короткое голосовое сообщение.';
}

function buildVoiceServiceUnavailableText(languageCode) {
  return isEnglishLanguage(languageCode)
    ? 'Voice recognition service is not available right now. Please send the text manually.'
    : 'Сервис распознавания голоса сейчас недоступен. Отправьте текст вручную.';
}

function buildVideoNoteUnsupportedText(languageCode) {
  return isEnglishLanguage(languageCode)
    ? 'Video notes are not supported yet. Please use a voice message or plain text.'
    : 'Видеосообщения пока не поддерживаются. Используйте обычное голосовое сообщение или текст.';
}

function interpretationExpectedTimeText(languageCode, elapsedMs) {
  if (elapsedMs >= 360_000) {
    return isEnglishLanguage(languageCode)
      ? 'Expected response time: usually 2-6 minutes. The current request is taking longer than usual.'
      : 'Ожидаемое время ответа: обычно 2-6 минут. Текущий запрос обрабатывается дольше обычного.';
  }

  return isEnglishLanguage(languageCode)
    ? 'Expected response time: about 2-6 minutes.'
    : 'Ожидаемое время ответа: около 2-6 минут.';
}

function buildVoiceDraftCallbackData(action, draftId) {
  return `vt:${action}:${draftId}`;
}

function parseVoiceDraftCallbackData(data) {
  const match = String(data ?? '').match(/^vt:(s|c):([a-zA-Z0-9_-]{8,40})$/);
  if (!match) {
    return null;
  }

  const [, action, draftId] = match;
  return { action, draftId };
}

function storeVoiceDraft(draft) {
  cleanupVoiceDrafts();

  const draftId = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  pendingVoiceDrafts.set(draftId, {
    ...draft,
    createdAt: Date.now(),
  });

  if (pendingVoiceDrafts.size > 100) {
    const oldestDraftId = pendingVoiceDrafts.keys().next().value;
    if (oldestDraftId) {
      pendingVoiceDrafts.delete(oldestDraftId);
    }
  }

  return draftId;
}

function cleanupVoiceDrafts() {
  const cutoff = Date.now() - VOICE_DRAFT_TTL_MS;
  for (const [draftId, draft] of pendingVoiceDrafts.entries()) {
    if ((draft?.createdAt ?? 0) < cutoff) {
      pendingVoiceDrafts.delete(draftId);
    }
  }
}

function normalizeTranscriptionLanguage(languageCode) {
  const normalized = String(languageCode ?? '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('ru')) {
    return 'ru';
  }

  if (normalized.startsWith('en')) {
    return 'en';
  }

  return normalized.slice(0, 2);
}

function extractTelegramFilename(filePath, audio, mimeType) {
  const nameFromPath = String(filePath ?? '').split('/').pop()?.trim();
  if (nameFromPath) {
    return nameFromPath;
  }

  const extension = mimeType?.includes('mpeg')
    ? '.mp3'
    : mimeType?.includes('wav')
      ? '.wav'
      : '.ogg';

  return `voice${extension}`;
}

function guessMimeType(filePath) {
  const lowered = String(filePath ?? '').toLowerCase();
  if (lowered.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  if (lowered.endsWith('.wav')) {
    return 'audio/wav';
  }
  if (lowered.endsWith('.m4a')) {
    return 'audio/mp4';
  }
  return 'audio/ogg';
}

function isEnglishLanguage(languageCode) {
  return String(languageCode ?? '').toLowerCase().startsWith('en');
}

function buildSelectionReplyMarkup(reply) {
  const selection = getSelectionConfig(reply);
  if (!selection) {
    return null;
  }

  const selectedValues = new Set((selection.selected ?? []).map((value) => value.toLowerCase()));
  const rows = [];

  for (let index = 0; index < selection.options.length; index += OPTIONS_PER_ROW) {
    const rowOptions = selection.options.slice(index, index + OPTIONS_PER_ROW);
    rows.push(
      rowOptions.map((option, rowIndex) => ({
        text: option,
        style: selectedValues.has(option.toLowerCase()) ? 'primary' : undefined,
        callback_data: buildSelectionCallbackData(
          selection.type,
          CALLBACK_ACTIONS.TOGGLE,
          reply.conversationId,
          index + rowIndex,
        ),
      })),
    );
  }

  rows.push([
    {
      text: 'Сбросить',
      style: 'danger',
      callback_data: buildSelectionCallbackData(
        selection.type,
        CALLBACK_ACTIONS.RESET,
        reply.conversationId,
      ),
    },
    {
      text: 'Готово',
      style: 'success',
      callback_data: buildSelectionCallbackData(
        selection.type,
        CALLBACK_ACTIONS.SUBMIT,
        reply.conversationId,
      ),
    },
  ]);

  return { inline_keyboard: rows };
}

function getSelectionConfig(reply) {
  if (
    reply
    && reply.stage === 'COLLECTING_EMOTIONS'
    && Array.isArray(reply.emotionOptions)
    && reply.emotionOptions.length > 0
    && reply.conversationId
  ) {
    return {
      type: CALLBACK_TYPES.EMOTIONS,
      options: reply.emotionOptions,
      selected: reply.selectedEmotions ?? [],
    };
  }

  if (
    reply
    && reply.stage === 'SELECTING_KEYWORDS'
    && Array.isArray(reply.keywords)
    && reply.keywords.length > 0
    && reply.conversationId
  ) {
    return {
      type: CALLBACK_TYPES.KEYWORDS,
      options: reply.keywords,
      selected: reply.selectedKeywords ?? [],
    };
  }

  return null;
}

function buildSelectionCallbackData(type, action, conversationId, optionIndex) {
  if (action === CALLBACK_ACTIONS.TOGGLE) {
    return `${type}:${action}:${conversationId}:${optionIndex}`;
  }

  return `${type}:${action}:${conversationId}`;
}

function parseSelectionCallbackData(data) {
  const match = String(data ?? '').match(/^(em|kw):(t|s|r):([0-9a-fA-F-]{36})(?::(\d+))?$/);
  if (!match) {
    return null;
  }

  const [, type, action, conversationId, optionIndex] = match;
  return {
    type,
    action,
    conversationId,
    optionIndex: optionIndex == null ? null : Number(optionIndex),
  };
}

function buildKeywordReplyMarkup(reply) {
  if (!isKeywordSelectionReply(reply)) {
    return null;
  }

  const selectedKeywords = new Set((reply.selectedKeywords ?? []).map((keyword) => keyword.toLowerCase()));
  const rows = [];

  for (let index = 0; index < reply.keywords.length; index += KEYWORDS_PER_ROW) {
    const rowKeywords = reply.keywords.slice(index, index + KEYWORDS_PER_ROW);
    rows.push(
      rowKeywords.map((keyword, rowIndex) => ({
        text: keyword,
        style: selectedKeywords.has(keyword.toLowerCase()) ? 'primary' : undefined,
        callback_data: buildKeywordCallbackData(
          CALLBACK_ACTIONS.TOGGLE,
          reply.conversationId,
          index + rowIndex,
        ),
      })),
    );
  }

  rows.push([
    {
      text: 'Сбросить',
      style: 'danger',
      callback_data: buildKeywordCallbackData(CALLBACK_ACTIONS.RESET, reply.conversationId),
    },
    {
      text: 'Готово',
      style: 'success',
      callback_data: buildKeywordCallbackData(CALLBACK_ACTIONS.SUBMIT, reply.conversationId),
    },
  ]);

  return { inline_keyboard: rows };
}

function isKeywordSelectionReply(reply) {
  return Boolean(
    reply
    && reply.stage === 'SELECTING_KEYWORDS'
    && Array.isArray(reply.keywords)
    && reply.keywords.length > 0
    && reply.conversationId,
  );
}

function buildKeywordCallbackData(action, conversationId, keywordIndex) {
  if (action === CALLBACK_ACTIONS.TOGGLE) {
    return `kw:${action}:${conversationId}:${keywordIndex}`;
  }

  return `kw:${action}:${conversationId}`;
}

function parseKeywordCallbackData(data) {
  const match = String(data ?? '').match(/^kw:(t|s|r):([0-9a-fA-F-]{36})(?::(\d+))?$/);
  if (!match) {
    return null;
  }

  const [, action, conversationId, keywordIndex] = match;
  return {
    action,
    conversationId,
    keywordIndex: keywordIndex == null ? null : Number(keywordIndex),
  };
}

async function callTelegram(method, payload) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram API request failed: ${response.status}`);
  }

  return data.result;
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function fitTelegramText(text) {
  const normalized = String(text ?? '').trim();
  if (normalized.length <= 3900) {
    return normalized || 'Done.';
  }

  return `${normalized.slice(0, 3897)}...`;
}

function fitCallbackText(text) {
  const normalized = String(text ?? '').trim();
  if (normalized.length <= 180) {
    return normalized || 'Done.';
  }

  return `${normalized.slice(0, 177)}...`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
