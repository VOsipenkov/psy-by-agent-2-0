const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const FORCE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true';
const MOCK_DB_KEY = 'dream-journal-mock-db-v4';
const MOCK_TELEGRAM_KEY = 'dream-journal-mock-telegram-v1';
const COMMON_WORDS = new Set([
  'и',
  'в',
  'во',
  'на',
  'не',
  'но',
  'что',
  'я',
  'мы',
  'он',
  'она',
  'они',
  'это',
  'как',
  'мне',
  'меня',
  'был',
  'была',
  'были',
  'было',
  'когда',
  'потом',
  'очень',
  'будто',
  'себя',
  'свой',
  'свою',
  'свои',
  'из',
  'за',
  'под',
  'над',
  'при',
  'или',
  'ли',
  'то',
  'а',
  'у',
  'о',
  'об',
  'от',
  'по',
  'мысли',
  'там',
  'тут',
  'где',
  'если',
  'уже',
  'былa',
]);
const SYMBOL_HINTS = [
  'вода',
  'море',
  'река',
  'дом',
  'лес',
  'дорога',
  'поезд',
  'самолет',
  'лестница',
  'окно',
  'дождь',
  'огонь',
  'кошка',
  'собака',
  'ребенок',
  'змея',
  'птица',
  'ключ',
  'город',
  'мост',
  'ночь',
  'тень',
  'волна',
  'звезда',
];

let mockModeEnabled = FORCE_MOCK_API;

function normalizeLanguage(language) {
  return language === 'en' ? 'en' : 'ru';
}

async function request(path, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      ...options,
    });

    if (!response.ok) {
      let message = 'Не удалось выполнить запрос';

      try {
        const errorBody = await response.json();
        message = errorBody.message ?? message;
      } catch (error) {
        message = response.statusText || message;
      }

      const requestError = new Error(message);
      requestError.status = response.status;
      throw requestError;
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    const networkError = new Error('Сервер недоступен. Включен локальный демо-режим frontend.');
    networkError.code = 'NETWORK_ERROR';
    throw networkError;
  }
}

function shouldFallbackToMock(error) {
  return Boolean(error?.code === 'NETWORK_ERROR' || error?.status >= 500);
}

async function withFallback(realAction, mockAction) {
  if (mockModeEnabled) {
    return mockAction();
  }

  try {
    return await realAction();
  } catch (error) {
    if (!shouldFallbackToMock(error)) {
      throw error;
    }

    mockModeEnabled = true;
    return mockAction();
  }
}

function delay(ms = 180) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readMockDb() {
  const saved = window.localStorage.getItem(MOCK_DB_KEY);

  if (saved) {
    return JSON.parse(saved);
  }

  const initialDb = createInitialMockDb();
  writeMockDb(initialDb);
  return initialDb;
}

function writeMockDb(db) {
  window.localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
}

function readMockTelegramState() {
  const saved = window.localStorage.getItem(MOCK_TELEGRAM_KEY);

  if (saved) {
    return JSON.parse(saved);
  }

  const initialState = {};
  writeMockTelegramState(initialState);
  return initialState;
}

function writeMockTelegramState(state) {
  window.localStorage.setItem(MOCK_TELEGRAM_KEY, JSON.stringify(state));
}

function createInitialMockDb() {
  const db = {
    counters: {
      user: 1,
      dream: 1,
      message: 1,
    },
    users: [],
    dreamsByUser: {},
  };

  const admin = createMockUserRecord(db, 'admin', 'admin');
  createSeedDream(
    db,
    admin.id,
    [
      messageSeed(db, 'ASSISTANT', 'Опишите сон как можно подробнее. Я задам пару уточняющих вопросов, а потом соберу интерпретацию.', minutesAgo(55)),
      messageSeed(db, 'USER', 'Мне снилось, что я иду через темный лес к поезду, а вокруг моросит дождь и я все время боюсь опоздать.', minutesAgo(53)),
      messageSeed(db, 'ASSISTANT', 'Что вы чувствовали сильнее всего: тревогу, надежду, растерянность? И был ли кто-то рядом?', minutesAgo(52)),
      messageSeed(db, 'USER', 'Сильнее всего была тревога, но рядом мелькала сестра, будто она знала дорогу.', minutesAgo(49)),
      messageSeed(db, 'ASSISTANT', 'Тогда уточню еще один момент: поезд уехал, вы успели или сон оборвался в ожидании?', minutesAgo(47)),
      messageSeed(db, 'USER', 'Я успел в последний момент и почувствовал облегчение, когда двери закрылись.', minutesAgo(45)),
      messageSeed(
        db,
        'ASSISTANT',
        'Здесь особенно заметны лес, поезд и дождь. Такой сон похож на внутренний переходный этап, где тревога уже сменяется движением вперед. Часто такой сюжет приходит, когда человек близок к решению и постепенно выходит из неопределенности.',
        minutesAgo(44),
      ),
    ],
    {
      title: 'Тревожная дорога',
      stage: 'INTERPRETED',
      keywords: ['Спешка', 'Поезд', 'Тревога'],
      interpretation:
        'Здесь особенно заметны лес, поезд и дождь. Лес часто отражает период неопределенности, поезд связан с движением и неизбежными переменами, а дождь показывает эмоциональную разрядку. В сумме сон похож на внутренний сюжет о том, как вы проходите тревожный этап и все же входите в новое состояние с ощущением облегчения.',
      recommendationDetails: buildRecommendationDetails(['Спешка', 'Поезд', 'Тревога'], 'ru'),
      recommendation:
        formatRecommendationDetails(buildRecommendationDetails(['Спешка', 'Поезд', 'Тревога'], 'ru'), 'ru'),
    },
  );

  createSeedDream(
    db,
    admin.id,
    [
      messageSeed(db, 'ASSISTANT', 'Опишите сон как можно подробнее. Я задам пару уточняющих вопросов, а потом соберу интерпретацию.', minutesAgo(18)),
      messageSeed(db, 'USER', 'Сегодня снился старый дом у воды, и я никак не мог открыть дверь ключом.', minutesAgo(16)),
      messageSeed(db, 'ASSISTANT', 'Интересный образ. Подскажите, дом казался знакомым или чужим, и что вы чувствовали у двери?', minutesAgo(15)),
      messageSeed(db, 'USER', 'Будто дом знакомый с детства, а у двери было и любопытство, и тревога.', minutesAgo(13)),
      messageSeed(db, 'ASSISTANT', 'Что было за дверью или сон закончился раньше?', minutesAgo(12)),
      messageSeed(db, 'USER', 'Сон оборвался прямо перед тем, как замок щелкнул.', minutesAgo(11)),
      messageSeed(
        db,
        'ASSISTANT',
        'В этом сне особенно выделяются старый дом, вода и закрытая дверь. Такой сюжет часто связан с памятью, эмоциональной глубиной и частью внутреннего опыта, к которой вы уже подошли, но еще не готовы войти до конца. Любопытство рядом с тревогой показывает, что внутри назревает важное соприкосновение с чем-то личным и давно знакомым.',
        minutesAgo(10),
      ),
    ],
    {
      title: 'Закрытая дверь',
      stage: 'INTERPRETED',
      keywords: ['Дом', 'Дверь', 'Вода'],
      interpretation:
        'В этом сне особенно выделяются старый дом, вода и закрытая дверь. Такой сюжет часто связан с памятью, эмоциональной глубиной и частью внутреннего опыта, к которой вы уже подошли, но еще не готовы войти до конца. Любопытство рядом с тревогой показывает, что внутри назревает важное соприкосновение с чем-то личным и давно знакомым.',
      recommendationDetails: buildRecommendationDetails(['Дом', 'Дверь', 'Вода'], 'ru'),
      recommendation:
        formatRecommendationDetails(buildRecommendationDetails(['Дом', 'Дверь', 'Вода'], 'ru'), 'ru'),
    },
  );

  return db;
}

function createMockUserRecord(db, username, password, email = '') {
  const user = {
    id: nextId(db, 'user'),
    username,
    password,
    email: normalizeEmail(email),
  };

  db.users.push(user);
  db.dreamsByUser[String(user.id)] = [];
  return user;
}

function createSeedDream(db, userId, messages, overrides = {}) {
  const dream = {
    id: nextId(db, 'dream'),
    title: 'Новый сон',
    stage: 'NEW',
    keywords: [],
    interpretation: null,
    recommendation: null,
    recommendationDetails: null,
    updatedAt: messages.at(-1)?.createdAt ?? new Date().toISOString(),
    messages,
    ...overrides,
  };

  db.dreamsByUser[String(userId)].push(dream);
  sortDreamsInDb(db, userId);
  return dream;
}

function getWelcomeMessage(language) {
  return normalizeLanguage(language) === 'en'
    ? 'What did you dream about? Describe your dream in as much detail as you can.'
    : 'Что вам приснилось? Опишите свой сон как можно подробнее.';
}

function createEmptyDream(db, userId, language = 'ru') {
  const now = new Date().toISOString();
  const normalizedLanguage = normalizeLanguage(language);
  const dream = {
    id: nextId(db, 'dream'),
    title: normalizedLanguage === 'en' ? 'New dream' : 'Новый сон',
    stage: 'NEW',
    keywords: [],
    interpretation: null,
    recommendation: null,
    recommendationDetails: null,
    updatedAt: now,
    messages: [
      {
        id: nextId(db, 'message'),
        role: 'ASSISTANT',
        content: getWelcomeMessage(normalizedLanguage),
        createdAt: now,
      },
    ],
  };

  db.dreamsByUser[String(userId)] ??= [];
  db.dreamsByUser[String(userId)].unshift(dream);
  return dream;
}

function messageSeed(db, role, content, createdAt) {
  return {
    id: nextId(db, 'message'),
    role,
    content,
    createdAt,
  };
}

function nextId(db, scope) {
  const nextValue = db.counters[scope];
  db.counters[scope] += 1;
  return nextValue;
}

function minutesAgo(value) {
  return new Date(Date.now() - value * 60_000).toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortDreamsInDb(db, userId) {
  db.dreamsByUser[String(userId)] = [...(db.dreamsByUser[String(userId)] ?? [])].sort(
    (left, right) => new Date(right.updatedAt) - new Date(left.updatedAt),
  );
}

function getDreamCollection(db, userId) {
  db.dreamsByUser[String(userId)] ??= [];
  return db.dreamsByUser[String(userId)];
}

function getDreamRecord(db, userId, dreamId) {
  return getDreamCollection(db, userId).find((dream) => dream.id === dreamId);
}

function summarizeDream(dream) {
  return {
    id: dream.id,
    title: dream.title,
    stage: dream.stage,
    keywords: dream.keywords,
    updatedAt: dream.updatedAt,
  };
}

function getEmotionPrompt(language) {
  return normalizeLanguage(language) === 'en'
    ? 'What emotions did you feel during the dream? For example: fear, shame, anxiety, relief, confusion, curiosity.'
    : 'Какие чувства вы испытывали во время сна? Например: страх, стыд, тревогу, облегчение, растерянность, интерес.';
}

function getKeywordSelectionPrompt(language) {
  return normalizeLanguage(language) === 'en'
    ? 'I highlighted the key words and objects from the dream. Choose the relevant ones with the buttons below and send them as a comma-separated list.'
    : 'Я выделил ключевые слова и предметы сна. Выберите подходящие кнопками ниже и отправьте их списком через запятую.';
}

function getKeywordSelectionRetryPrompt(language) {
  return normalizeLanguage(language) === 'en'
    ? 'I could not recognize the chosen keywords yet. Click the buttons below or type the selected words separated by commas.'
    : 'Я пока не смог распознать выбранные ключевые слова. Нажмите на кнопки ниже или впишите выбранные слова через запятую.';
}

function extractKeywords(text, language = 'ru', limit = 12) {
  const normalizedLanguage = normalizeLanguage(language);
  const lowered = text.toLowerCase();
  const suggestions = [];
  const hintGroups = [
    { ru: 'школа', en: 'school', stems: ['школ', 'урок', 'учител', 'класс', 'литератур', 'математ', 'school', 'teacher', 'lesson', 'class'] },
    { ru: 'учитель', en: 'teacher', stems: ['учител', 'teacher'] },
    { ru: 'отец', en: 'father', stems: ['отец', 'отца', 'отцом', 'пап', 'father', 'dad'] },
    { ru: 'бывшая партнерша', en: 'former partner', stems: ['бывш', 'девушк', 'partner', 'former partner', 'ex'] },
    { ru: 'стыд', en: 'shame', stems: ['стыд', 'неловк', 'shame', 'ashamed'] },
    { ru: 'грусть', en: 'sadness', stems: ['груст', 'печал', 'sad', 'grief'] },
    { ru: 'обман', en: 'deception', stems: ['обман', 'заман', 'ловуш', 'ложн', 'trap', 'deception', 'false', 'fake'] },
    { ru: 'узнавание', en: 'recognition', stems: ['узна', 'recogn', 'familiar'] },
    { ru: 'дом', en: 'home', stems: ['дом', 'квартир', 'комнат', 'home', 'house', 'apartment'] },
    { ru: 'страх', en: 'fear', stems: ['страх', 'опас', 'угроз', 'тревог', 'fear', 'threat', 'danger', 'unsafe'] },
    { ru: 'подруга', en: 'friend', stems: ['подруг', 'friend'] },
    { ru: 'полиция', en: 'police', stems: ['полици', 'police'] },
    { ru: 'границы', en: 'boundaries', stems: ['границ', 'boundar'] },
    { ru: 'идентичность', en: 'identity', stems: ['похож', 'сход', 'identity', 'resemblance'] },
    { ru: 'доверие', en: 'trust', stems: ['довер', 'недовер', 'сомне', 'trust', 'mistrust', 'doubt'] },
    { ru: 'защита', en: 'protection', stems: ['защит', 'помощ', 'звон', 'control', 'protect', 'help', 'call'] },
  ];

  hintGroups.forEach((group) => {
    if (group.stems.some((stem) => lowered.includes(stem))) {
      suggestions.push(normalizedLanguage === 'en' ? group.en : group.ru);
    }
  });

  SYMBOL_HINTS.forEach((word) => {
    if (lowered.includes(word)) {
      suggestions.push(capitalize(word));
    }
  });

  lowered
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !COMMON_WORDS.has(word))
    .forEach((word) => {
      suggestions.push(normalizedLanguage === 'en' ? word : word);
    });

  const unique = [];
  suggestions.forEach((item) => {
    const normalized = item.trim().toLowerCase();
    if (normalized && !unique.some((value) => value.toLowerCase() === normalized)) {
      unique.push(item.trim());
    }
  });

  const fallback = normalizedLanguage === 'en'
    ? ['dream', 'emotion', 'memory', 'fear', 'home', 'relationship']
    : ['сон', 'эмоции', 'память', 'страх', 'дом', 'отношения'];

  return [...unique, ...fallback]
    .filter((item, index, list) => list.findIndex((value) => value.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, limit);
}

function parseSelectedKeywords(text, availableKeywords) {
  const lowered = text.toLowerCase();
  const selected = [];

  text.split(/[,\n;]/).forEach((fragment) => {
    const candidate = fragment.trim().toLowerCase();
    if (!candidate) {
      return;
    }

    const matched = availableKeywords.find((keyword) => keyword.toLowerCase() === candidate);
    if (matched && !selected.some((value) => value.toLowerCase() === matched.toLowerCase())) {
      selected.push(matched);
    }
  });

  if (selected.length > 0) {
    return selected;
  }

  availableKeywords.forEach((keyword) => {
    if (lowered.includes(keyword.toLowerCase()) && !selected.some((value) => value.toLowerCase() === keyword.toLowerCase())) {
      selected.push(keyword);
    }
  });

  return selected;
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function buildDreamTitle(keywords, language = 'ru') {
  const normalizedLanguage = normalizeLanguage(language);
  const cleaned = keywords.filter(Boolean);

  if (cleaned.length >= 2) {
    return `${capitalize(cleaned[0])} ${cleaned[1].toLowerCase()}`;
  }

  return normalizedLanguage === 'en' ? 'New dream' : 'Новый сон';
}

function buildInterpretation(dreamText, emotions, keywords, language = 'ru') {
  const normalizedLanguage = normalizeLanguage(language);
  const narrative = `${dreamText} ${emotions}`.toLowerCase();
  const keywordList = keywords.join(', ');
  const hasSchool = includesAny(narrative, ['школ', 'урок', 'учител', 'school', 'teacher', 'lesson']);
  const hasFather = includesAny(narrative, ['отец', 'отца', 'отцом', 'пап', 'father', 'dad']);
  const hasDeception = includesAny(narrative, ['обман', 'заман', 'ловуш', 'ложн', 'deception', 'false', 'trap', 'fake']);
  const hasFear = includesAny(narrative, ['страх', 'тревог', 'опас', 'угроз', 'fear', 'danger', 'threat']);
  const hasProtection = includesAny(narrative, ['полици', 'подруг', 'помощ', 'звон', 'police', 'friend', 'help', 'call']);
  const hasShame = includesAny(narrative, ['стыд', 'неловк', 'груст', 'печал', 'shame', 'embarrass', 'sad', 'grief']);

  if (normalizedLanguage === 'en') {
    const parts = [];

    if (hasSchool && hasFather) {
      parts.push('The dream places you back into an evaluative school role while linking that vulnerable position to your father and the family story around him.');
    }
    if (hasDeception) {
      parts.push('The shift from recognition to deception suggests that something once familiar no longer feels trustworthy or safe.');
    }
    if (hasShame) {
      parts.push('Shame and sadness matter here as much as fear, because they point to an older relational wound rather than a random threat scene.');
    }
    if (hasFear && hasProtection) {
      parts.push('The ending is important because you do not stay helpless: you call for support and try to restore safety and control.');
    }
    if (parts.length === 0) {
      parts.push(`The dream gathers around ${keywordList}. It reads less like a set of random symbols and more like an emotional story about trust, boundaries, and the need to regain safety.`);
    }

    parts.push(`A careful waking-life hypothesis is that this dream touches a place where ${keywordList} still connect to vulnerability, but also to your capacity to protect yourself.`);
    return parts.join(' ');
  }

  const parts = [];

  if (hasSchool && hasFather) {
    parts.push('Сон возвращает вас в школьную, оценивающую роль и одновременно связывает эту уязвимую позицию с фигурой отца и семейной историей вокруг него.');
  }
  if (hasDeception) {
    parts.push('Переход от узнавания к ощущению обмана показывает, что что-то знакомое перестает казаться надежным и безопасным.');
  }
  if (hasShame) {
    parts.push('Стыд и грусть здесь не менее важны, чем страх: они указывают не на случайную угрозу, а на старую эмоциональную рану в отношениях.');
  }
  if (hasFear && hasProtection) {
    parts.push('Финал особенно важен тем, что вы не остаетесь беспомощной: зовете поддержку и пытаетесь вернуть себе безопасность и контроль.');
  }
  if (parts.length === 0) {
    parts.push(`В центре сна оказываются ${keywordList}. Здесь полезнее видеть не набор случайных символов, а эмоциональную историю о доверии, границах и попытке вернуть себе чувство безопасности.`);
  }

  parts.push(`Как бережная гипотеза для бодрствующей жизни, сон может касаться той точки, где мотивы ${keywordList} до сих пор задевают уязвимость, но вместе с этим показывают и вашу способность себя защищать.`);
  return parts.join(' ');
}

function buildAssistantInterpretationMessage(keywords, interpretation, recommendationDetails, language = 'ru') {
  const recommendation = formatRecommendationDetails(recommendationDetails, language);

  if (normalizeLanguage(language) === 'en') {
    return `I would keep these motifs in focus: ${keywords.join(', ')}.\n\n${interpretation}\n\nPsychologist's recommendation:\n${recommendation}`;
  }

  return `Я бы держал в фокусе такие мотивы: ${keywords.join(', ')}.\n\n${interpretation}\n\nРекомендация психолога:\n${recommendation}`;
}

function buildRecommendationDetails(keywords, language = 'ru') {
  const normalizedLanguage = normalizeLanguage(language);
  const focus = keywords.length ? keywords.join(', ') : (normalizedLanguage === 'en' ? 'the dream' : 'этот сон');

  if (normalizedLanguage === 'en') {
    return {
      trigger: `Watch for real-life situations where the same tension around ${focus} returns most quickly.`,
      microAction: 'When it returns, name one fact you know for sure, one feeling that rose first, and one boundary that needs protection now.',
      journalPrompt: `For journaling or therapy, choose one turning point around ${focus} and write what changed there, what it reminds you of, and what support would have helped.`,
    };
  }

  return {
    trigger: `Смотрите, в каких реальных ситуациях быстрее всего возвращается похожее напряжение вокруг темы ${focus}.`,
    microAction: 'Когда оно поднимается, назовите один факт, в котором вы уверены, первое чувство, которое включилось, и одну границу, которую сейчас важно защитить.',
    journalPrompt: `Для дневника или разговора с психологом выберите один поворотный момент вокруг темы ${focus} и запишите, что там изменилось, что это напоминает в жизни и какая поддержка была бы уместна.`,
  };
}

function formatRecommendationDetails(recommendationDetails, language = 'ru') {
  if (!recommendationDetails) {
    return '';
  }

  const trigger = recommendationDetails.trigger?.trim();
  const microAction = recommendationDetails.microAction?.trim();
  const journalPrompt = recommendationDetails.journalPrompt?.trim();
  const parts = [trigger, microAction, journalPrompt].filter(Boolean);

  if (!parts.length) {
    return '';
  }

  if (normalizeLanguage(language) === 'en') {
    return [
      trigger ? `1. Trigger: ${trigger}` : null,
      microAction ? `2. Micro-action: ${microAction}` : null,
      journalPrompt ? `3. Journal prompt: ${journalPrompt}` : null,
    ].filter(Boolean).join('\n');
  }

  return [
    trigger ? `1. Где это может включаться: ${trigger}` : null,
    microAction ? `2. Что сделать за 1-5 минут: ${microAction}` : null,
    journalPrompt ? `3. Что вынести в дневник или терапию: ${journalPrompt}` : null,
  ].filter(Boolean).join('\n');
}

function buildRecommendation(keywords, language = 'ru') {
  return formatRecommendationDetails(buildRecommendationDetails(keywords, language), language);
}

function appendAssistantMessage(db, dream, content) {
  const createdAt = new Date().toISOString();
  dream.messages.push({
    id: nextId(db, 'message'),
    role: 'ASSISTANT',
    content,
    createdAt,
  });
  dream.updatedAt = createdAt;
}

function appendUserMessage(db, dream, content) {
  const createdAt = new Date().toISOString();
  dream.messages.push({
    id: nextId(db, 'message'),
    role: 'USER',
    content,
    createdAt,
  });
  dream.updatedAt = createdAt;
}

function includesAny(text, fragments) {
  return fragments.some((fragment) => text.includes(fragment));
}

function inferDreamTitle(text, keywords, language = 'ru') {
  const lowered = text.toLowerCase();
  const isEnglish = normalizeLanguage(language) === 'en';

  if (
    includesAny(lowered, ['школ', 'урок', 'учител', 'school', 'teacher', 'lesson'])
    && includesAny(lowered, ['отец', 'отца', 'отцом', 'пап', 'father', 'dad'])
    && includesAny(lowered, ['обман', 'ложн', 'заман', 'deception', 'false', 'trap'])
  ) {
    return isEnglish ? 'False recognition' : 'Ложное узнавание';
  }

  if (includesAny(lowered, ['убег', 'погон', 'преслед', 'бегу', 'спаса'])) {
    return isEnglish ? 'Escape' : 'Убегание';
  }

  if (includesAny(lowered, ['опазд', 'спеш', 'тороп', 'поезд', 'самолет', 'автобус', 'вокзал', 'дорог', 'еду', 'ехать'])) {
    return includesAny(lowered, ['трев', 'страх', 'паник', 'боюсь'])
      ? (isEnglish ? 'Anxious road' : 'Тревожная дорога')
      : (isEnglish ? 'Rush' : 'Спешка');
  }

  if (includesAny(lowered, ['двер', 'замок', 'ключ'])) {
    return isEnglish ? 'Closed door' : 'Закрытая дверь';
  }

  if (includesAny(lowered, ['дом', 'квартир', 'комнат'])) {
    return includesAny(lowered, ['стар', 'детств', 'родител'])
      ? (isEnglish ? 'Old house' : 'Старый дом')
      : (isEnglish ? 'Home' : 'Дом');
  }

  if (includesAny(lowered, ['лес', 'темн', 'ноч', 'тень'])) {
    return lowered.includes('лес')
      ? (isEnglish ? 'Dark forest' : 'Темный лес')
      : (isEnglish ? 'Night fear' : 'Ночная тревога');
  }

  if (includesAny(lowered, ['вода', 'море', 'река', 'волна', 'дожд'])) {
    return lowered.includes('дом')
      ? (isEnglish ? 'House by water' : 'Дом у воды')
      : (isEnglish ? 'Deep water' : 'Глубокая вода');
  }

  if (includesAny(lowered, ['пад', 'провал', 'вниз'])) {
    return isEnglish ? 'Falling' : 'Падение';
  }

  if (includesAny(lowered, ['лестниц', 'лифт', 'этаж', 'подним'])) {
    return isEnglish ? 'Ascent' : 'Подъем';
  }

  if (includesAny(lowered, ['мост', 'путь'])) {
    return isEnglish ? 'Crossing' : 'Переход';
  }

  return buildDreamTitle(keywords);
}

function advanceMockConversation(db, dream, language = 'ru') {
  const normalizedLanguage = normalizeLanguage(language);
  const userMessages = dream.messages.filter((message) => message.role === 'USER').map((message) => message.content.trim());
  const dreamDescription = userMessages[0] ?? '';
  const emotionDescription = userMessages[1] ?? '';
  const keywordSelection = userMessages[2] ?? '';

  switch (dream.stage) {
    case 'NEW':
      dream.keywords = extractKeywords(dreamDescription, normalizedLanguage, 12);
      dream.interpretation = null;
      dream.recommendation = null;
      dream.recommendationDetails = null;
      dream.stage = 'COLLECTING_EMOTIONS';
      appendAssistantMessage(db, dream, getEmotionPrompt(normalizedLanguage));
      return;
    case 'COLLECTING_EMOTIONS':
    case 'CLARIFYING':
      if (!dream.keywords?.length) {
        dream.keywords = extractKeywords(dreamDescription, normalizedLanguage, 12);
      }
      dream.stage = 'SELECTING_KEYWORDS';
      appendAssistantMessage(db, dream, getKeywordSelectionPrompt(normalizedLanguage));
      return;
    case 'SELECTING_KEYWORDS': {
      const selectedKeywords = parseSelectedKeywords(keywordSelection, dream.keywords ?? []);
      if (!selectedKeywords.length) {
        appendAssistantMessage(db, dream, getKeywordSelectionRetryPrompt(normalizedLanguage));
        return;
      }

      const interpretation = buildInterpretation(dreamDescription, emotionDescription, selectedKeywords, normalizedLanguage);
      const recommendationDetails = buildRecommendationDetails(selectedKeywords, normalizedLanguage);
      const recommendation = formatRecommendationDetails(recommendationDetails, normalizedLanguage);
      dream.keywords = selectedKeywords;
      dream.title = inferDreamTitle(`${dreamDescription} ${emotionDescription}`, selectedKeywords, normalizedLanguage);
      dream.stage = 'INTERPRETED';
      dream.interpretation = interpretation;
      dream.recommendation = recommendation;
      dream.recommendationDetails = recommendationDetails;
      appendAssistantMessage(db, dream, buildAssistantInterpretationMessage(selectedKeywords, interpretation, recommendationDetails, normalizedLanguage));
      return;
    }
    case 'INTERPRETED': {
      const allUserText = userMessages.join(' ');
      const selectedKeywords = dream.keywords?.length ? dream.keywords : extractKeywords(allUserText, normalizedLanguage, 6);
      const interpretation = buildInterpretation(dreamDescription, `${emotionDescription} ${userMessages.slice(3).join(' ')}`.trim(), selectedKeywords, normalizedLanguage);
      const recommendationDetails = buildRecommendationDetails(selectedKeywords, normalizedLanguage);
      const recommendation = formatRecommendationDetails(recommendationDetails, normalizedLanguage);
      dream.interpretation = interpretation;
      dream.recommendation = recommendation;
      dream.recommendationDetails = recommendationDetails;
      dream.title = inferDreamTitle(allUserText, selectedKeywords, normalizedLanguage);
      appendAssistantMessage(db, dream, buildAssistantInterpretationMessage(selectedKeywords, interpretation, recommendationDetails, normalizedLanguage));
      return;
    }
    default:
      return;
  }
}

async function mockLogin(username, password) {
  await delay();

  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (trimmedUsername.length < 3 || trimmedPassword.length < 3) {
    throw new Error('Логин и пароль должны быть не короче 3 символов.');
  }

  const db = readMockDb();
  const user = db.users.find((item) => item.username.toLowerCase() === trimmedUsername.toLowerCase());

  if (!user) {
    throw new Error('Пользователь с таким логином не найден.');
  }

  if (user.password !== trimmedPassword) {
    throw new Error('Неверный пароль для локального демо-режима. Попробуйте admin / admin.');
  }

  writeMockDb(db);

  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    source: 'mock',
  };
}

function normalizeEmail(email) {
  const trimmedEmail = email?.trim().toLowerCase() ?? '';
  return trimmedEmail || null;
}

function validateOptionalEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!normalizedEmail) {
    return null;
  }

  if (normalizedEmail.length > 160) {
    throw new Error('Email должен быть не длиннее 160 символов.');
  }

  if (!emailPattern.test(normalizedEmail)) {
    throw new Error('Укажите корректный email.');
  }

  return normalizedEmail;
}

async function mockRegister(username, password, email) {
  await delay();

  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();
  const normalizedEmail = validateOptionalEmail(email);

  if (trimmedUsername.length < 3 || trimmedPassword.length < 3) {
    throw new Error('Логин и пароль должны быть не короче 3 символов.');
  }

  const db = readMockDb();
  const exists = db.users.some((item) => item.username.toLowerCase() === trimmedUsername.toLowerCase());

  if (exists) {
    throw new Error('Пользователь с таким логином уже существует.');
  }

  const user = createMockUserRecord(db, trimmedUsername, trimmedPassword, normalizedEmail);
  writeMockDb(db);

  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    source: 'mock',
  };
}

async function mockFetchDreams(userId) {
  await delay();
  const db = readMockDb();
  const collection = getDreamCollection(db, userId);
  return clone(collection.map(summarizeDream));
}

async function mockCreateDream(userId, language) {
  await delay();
  const db = readMockDb();
  const dream = createEmptyDream(db, userId, language);
  sortDreamsInDb(db, userId);
  writeMockDb(db);
  return clone(dream);
}

async function mockFetchDream(userId, dreamId) {
  await delay();
  const db = readMockDb();
  const dream = getDreamRecord(db, userId, dreamId);

  if (!dream) {
    throw new Error('Сон не найден в локальном демо-режиме.');
  }

  return clone(dream);
}

async function mockSendDreamMessage(userId, dreamId, content, language) {
  await delay();
  const db = readMockDb();
  const dream = getDreamRecord(db, userId, dreamId);

  if (!dream) {
    throw new Error('Сон не найден в локальном демо-режиме.');
  }

  appendUserMessage(db, dream, content);
  advanceMockConversation(db, dream, language);
  sortDreamsInDb(db, userId);
  writeMockDb(db);
  return clone(dream);
}

async function mockDeleteDream(userId, dreamId) {
  await delay();
  const db = readMockDb();
  db.dreamsByUser[String(userId)] = getDreamCollection(db, userId).filter((dream) => dream.id !== dreamId);
  writeMockDb(db);
  return null;
}

function generateMockTelegramCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';

  for (let index = 0; index < 8; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return result;
}

async function mockFetchTelegramLinkStatus(userId) {
  await delay();
  const telegramState = readMockTelegramState();
  const record = telegramState[String(userId)] ?? {};
  const isActive = record.expiresAt && new Date(record.expiresAt).getTime() > Date.now();
  const linkCode = isActive ? record.code : null;

  if (!isActive && record.code) {
    delete telegramState[String(userId)];
    writeMockTelegramState(telegramState);
  }

  return {
    available: true,
    linked: false,
    botUsername: 'dream_journal_demo_bot',
    botLink: 'https://t.me/dream_journal_demo_bot',
    telegramUsername: null,
    linkCode,
    linkCodeExpiresAt: isActive ? record.expiresAt : null,
    startLink: linkCode ? `https://t.me/dream_journal_demo_bot?start=${linkCode}` : null,
  };
}

async function mockCreateTelegramLinkCode(userId) {
  await delay();
  const telegramState = readMockTelegramState();
  const code = generateMockTelegramCode();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

  telegramState[String(userId)] = { code, expiresAt };
  writeMockTelegramState(telegramState);

  return {
    available: true,
    botUsername: 'dream_journal_demo_bot',
    botLink: 'https://t.me/dream_journal_demo_bot',
    code,
    expiresAt,
    startLink: `https://t.me/dream_journal_demo_bot?start=${code}`,
  };
}

export function isMockApiEnabled() {
  return mockModeEnabled;
}

export function loginUser(username, password) {
  return withFallback(
    () => request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
    () => mockLogin(username, password),
  );
}

export function registerUser(username, password, email) {
  return withFallback(
    () => request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, email: normalizeEmail(email) }),
    }),
    () => mockRegister(username, password, email),
  );
}

export function fetchDreams(userId) {
  return withFallback(
    () => request(`/api/users/${userId}/dreams`),
    () => mockFetchDreams(userId),
  );
}

export function createDream(userId, language) {
  return withFallback(
    () => request(`/api/users/${userId}/dreams`, {
      method: 'POST',
      body: JSON.stringify({ language: normalizeLanguage(language) }),
    }),
    () => mockCreateDream(userId, language),
  );
}

export function fetchDream(userId, dreamId) {
  return withFallback(
    () => request(`/api/users/${userId}/dreams/${dreamId}`),
    () => mockFetchDream(userId, dreamId),
  );
}

export function sendDreamMessage(userId, dreamId, content, language) {
  return withFallback(
    () => request(`/api/users/${userId}/dreams/${dreamId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, language: normalizeLanguage(language) }),
    }),
    () => mockSendDreamMessage(userId, dreamId, content, language),
  );
}

export function deleteDream(userId, dreamId) {
  return withFallback(
    () => request(`/api/users/${userId}/dreams/${dreamId}`, {
      method: 'DELETE',
    }),
    () => mockDeleteDream(userId, dreamId),
  );
}

export function fetchTelegramLinkStatus(userId) {
  return withFallback(
    () => request(`/api/users/${userId}/telegram`),
    () => mockFetchTelegramLinkStatus(userId),
  );
}

export function createTelegramLinkCode(userId) {
  return withFallback(
    () => request(`/api/users/${userId}/telegram/link-code`, {
      method: 'POST',
    }),
    () => mockCreateTelegramLinkCode(userId),
  );
}
