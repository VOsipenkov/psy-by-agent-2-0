const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const FORCE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true';
const MOCK_DB_KEY = 'dream-journal-mock-db-v3';
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
    },
  );

  return db;
}

function createMockUserRecord(db, username, password) {
  const user = {
    id: nextId(db, 'user'),
    username,
    password,
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
    updatedAt: messages.at(-1)?.createdAt ?? new Date().toISOString(),
    messages,
    ...overrides,
  };

  db.dreamsByUser[String(userId)].push(dream);
  sortDreamsInDb(db, userId);
  return dream;
}

function createEmptyDream(db, userId) {
  const now = new Date().toISOString();
  const dream = {
    id: nextId(db, 'dream'),
    title: 'Новый сон',
    stage: 'NEW',
    keywords: [],
    interpretation: null,
    updatedAt: now,
    messages: [
      {
        id: nextId(db, 'message'),
        role: 'ASSISTANT',
        content: 'Опишите сон как можно подробнее. Я задам пару уточняющих вопросов, а потом соберу интерпретацию.',
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

function extractKeywords(text) {
  const lowered = text.toLowerCase();
  const hinted = SYMBOL_HINTS.filter((word) => lowered.includes(word)).slice(0, 3);

  if (hinted.length >= 2) {
    return hinted.map(capitalize);
  }

  const fallbackWords = lowered
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !COMMON_WORDS.has(word));

  const combined = [...hinted, ...fallbackWords];
  const unique = [];

  combined.forEach((word) => {
    const normalized = word.toLowerCase();

    if (!unique.some((item) => item.toLowerCase() === normalized)) {
      unique.push(word);
    }
  });

  return (unique.slice(0, 3).map(capitalize).length ? unique.slice(0, 3).map(capitalize) : ['Дорога', 'Дом', 'Ночь']);
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function buildDreamTitle(keywords) {
  return keywords.slice(0, 2).join(' ');
}

function buildInterpretation(text, keywords) {
  const symbols = keywords.map((keyword) => keyword.toLowerCase()).join(', ');

  return `В этом сне особенно выделяются ${symbols}. Такие символы часто связаны с внутренним переходом, скрытой тревогой и поиском опоры. Сон похож на сюжет о том, что вы уже чувствуете движение к переменам, но еще проверяете, насколько безопасно сделать следующий шаг. Если опираться на эмоции из рассказа, ключевой смысл здесь не в опасности, а в перестройке и поиске более устойчивого состояния.`;
}

function buildAssistantInterpretationMessage(keywords, interpretation) {
  return `Я бы выделил ключевые образы: ${keywords.join(', ')}.\n\n${interpretation}`;
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

function inferDreamTitle(text, keywords) {
  const lowered = text.toLowerCase();

  if (includesAny(lowered, ['убег', 'погон', 'преслед', 'бегу', 'спаса'])) {
    return 'Убегание';
  }

  if (includesAny(lowered, ['опазд', 'спеш', 'тороп', 'поезд', 'самолет', 'автобус', 'вокзал', 'дорог', 'еду', 'ехать'])) {
    return includesAny(lowered, ['трев', 'страх', 'паник', 'боюсь']) ? 'Тревожная дорога' : 'Спешка';
  }

  if (includesAny(lowered, ['двер', 'замок', 'ключ'])) {
    return 'Закрытая дверь';
  }

  if (includesAny(lowered, ['дом', 'квартир', 'комнат'])) {
    return includesAny(lowered, ['стар', 'детств', 'родител']) ? 'Старый дом' : 'Дом';
  }

  if (includesAny(lowered, ['лес', 'темн', 'ноч', 'тень'])) {
    return lowered.includes('лес') ? 'Темный лес' : 'Ночная тревога';
  }

  if (includesAny(lowered, ['вода', 'море', 'река', 'волна', 'дожд'])) {
    return lowered.includes('дом') ? 'Дом у воды' : 'Глубокая вода';
  }

  if (includesAny(lowered, ['пад', 'провал', 'вниз'])) {
    return 'Падение';
  }

  if (includesAny(lowered, ['лестниц', 'лифт', 'этаж', 'подним'])) {
    return 'Подъем';
  }

  if (includesAny(lowered, ['мост', 'путь'])) {
    return 'Переход';
  }

  return buildDreamTitle(keywords);
}

function advanceMockConversation(db, dream) {
  const userMessages = dream.messages.filter((message) => message.role === 'USER');
  const allUserText = userMessages.map((message) => message.content).join(' ');

  if (userMessages.length === 1) {
    dream.stage = 'CLARIFYING';
    appendAssistantMessage(db, dream, 'Что в этом сне чувствовалось сильнее всего: тревога, облегчение, интерес или растерянность? И был ли рядом кто-то важный?');
    return;
  }

  if (userMessages.length === 2) {
    dream.stage = 'CLARIFYING';
    appendAssistantMessage(db, dream, 'Еще один момент для точности: чем все закончилось и какой образ запомнился самым ярким в финале?');
    return;
  }

  const keywords = extractKeywords(allUserText);
  const interpretation = buildInterpretation(allUserText, keywords);

  dream.keywords = keywords;
  dream.title = inferDreamTitle(allUserText, keywords);
  dream.stage = 'INTERPRETED';
  dream.interpretation = interpretation;
  appendAssistantMessage(db, dream, buildAssistantInterpretationMessage(keywords, interpretation));
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
    source: 'mock',
  };
}

async function mockRegister(username, password) {
  await delay();

  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (trimmedUsername.length < 3 || trimmedPassword.length < 3) {
    throw new Error('Логин и пароль должны быть не короче 3 символов.');
  }

  const db = readMockDb();
  const exists = db.users.some((item) => item.username.toLowerCase() === trimmedUsername.toLowerCase());

  if (exists) {
    throw new Error('Пользователь с таким логином уже существует.');
  }

  const user = createMockUserRecord(db, trimmedUsername, trimmedPassword);
  writeMockDb(db);

  return {
    id: user.id,
    username: user.username,
    source: 'mock',
  };
}

async function mockFetchDreams(userId) {
  await delay();
  const db = readMockDb();
  const collection = getDreamCollection(db, userId);
  return clone(collection.map(summarizeDream));
}

async function mockCreateDream(userId) {
  await delay();
  const db = readMockDb();
  const dream = createEmptyDream(db, userId);
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

async function mockSendDreamMessage(userId, dreamId, content) {
  await delay();
  const db = readMockDb();
  const dream = getDreamRecord(db, userId, dreamId);

  if (!dream) {
    throw new Error('Сон не найден в локальном демо-режиме.');
  }

  appendUserMessage(db, dream, content);
  advanceMockConversation(db, dream);
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

export function registerUser(username, password) {
  return withFallback(
    () => request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
    () => mockRegister(username, password),
  );
}

export function fetchDreams(userId) {
  return withFallback(
    () => request(`/api/users/${userId}/dreams`),
    () => mockFetchDreams(userId),
  );
}

export function createDream(userId) {
  return withFallback(
    () => request(`/api/users/${userId}/dreams`, {
      method: 'POST',
    }),
    () => mockCreateDream(userId),
  );
}

export function fetchDream(userId, dreamId) {
  return withFallback(
    () => request(`/api/users/${userId}/dreams/${dreamId}`),
    () => mockFetchDream(userId, dreamId),
  );
}

export function sendDreamMessage(userId, dreamId, content) {
  return withFallback(
    () => request(`/api/users/${userId}/dreams/${dreamId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
    () => mockSendDreamMessage(userId, dreamId, content),
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
