export const UI_COPY = {
  ru: {
    appName: 'Dream Journal',
    authHeroTitle: 'Сны, к которым можно возвращаться',
    authLead:
      'Сохраняйте ночные сюжеты в спокойном диалоге, перечитывайте детали и получайте интерпретацию сна в одной истории.',
    features: [
      {
        index: '01',
        title: 'Живой рассказ',
        description: 'Вместо анкеты вы просто рассказываете сон так, как он вспоминается.',
      },
      {
        index: '02',
        title: 'Чувства и мотивы',
        description: 'Сервис выделяет ключевые образы, эмоции и поворотные моменты сна.',
      },
      {
        index: '03',
        title: 'Личный архив',
        description: 'К каждому сну можно вернуться позже, сравнить его с новыми сюжетами или удалить.',
      },
    ],
    authLogin: 'Вход',
    authRegister: 'Регистрация',
    authContinue: 'Продолжить работу',
    authCreateAccount: 'Создать аккаунт',
    authLoginButton: 'Войти',
    authRegisterButton: 'Регистрация',
    usernameLabel: 'Логин',
    usernamePlaceholder: 'придумайте логин',
    emailLabel: 'Email для рассылки (необязательно)',
    passwordLabel: 'Пароль',
    passwordLoginPlaceholder: 'введите пароль',
    passwordRegisterPlaceholder: 'придумайте пароль',
    confirmPasswordLabel: 'Повторите пароль',
    confirmPasswordPlaceholder: 'повторите пароль',
    authHint: 'Если backend не запущен, откроется локальный демо-режим только для frontend.',
    authOpenJournal: 'Открыть дневник',
    authSignUp: 'Зарегистрироваться',
    authLoggingIn: 'Входим...',
    authCreatingAccount: 'Создаем аккаунт...',
    uploadProfilePhoto: 'Загрузить фото профиля',
    profileImageTypeError: 'Можно загрузить только изображение.',
    profileImageSizeError: 'Фото должно быть меньше 5 МБ.',
    profileImageReadError: 'Не удалось прочитать изображение.',
    profileImageUploadError: 'Не удалось загрузить изображение.',
    logout: 'Выйти',
    previousDreams: 'Предыдущие сны',
    mockBanner: 'Локальный демо-режим: интерфейс работает без backend и Docker.',
    fallbackDreamKeywords: 'Ассистент еще собирает детали',
    justNow: 'Только что',
    newDream: 'Новый сон',
    currentDream: 'Текущий сон',
    preparingDream: 'Подготавливаем новый сон',
    updating: 'Обновляем...',
    assistantThinking: 'Ассистент думает...',
    you: 'Вы',
    assistant: 'Ассистент',
    emptyTimeline:
      'Начните с описания сна. Ассистент попросит чувства, предложит ключевые слова и затем соберет интерпретацию.',
    composerLabel: 'Сообщение',
    composerPlaceholder:
      'Опишите сон: кто был рядом, что происходило, какие детали запомнились...',
    keywordComposerPlaceholder: 'Выберите слова кнопками ниже или впишите их через запятую...',
    composerHint: 'Enter отправляет сообщение, Shift+Enter переносит строку.',
    voiceInput: 'Надиктовать сообщение',
    voiceStop: 'Остановить запись',
    voiceRecordingHint: 'Идет запись: говорите в микрофон, затем остановите его, чтобы текст остался в поле.',
    voiceUnsupported:
      'В этом браузере распознавание речи недоступно. Попробуйте Chrome, Edge или другой браузер с поддержкой Web Speech API.',
    voicePermissionError: 'Доступ к микрофону запрещен. Разрешите его в браузере и попробуйте снова.',
    voiceNoSpeechError: 'Речь не распознана. Попробуйте говорить чуть громче и без длинной паузы.',
    voiceCaptureError: 'Не удалось запустить голосовой ввод. Попробуйте еще раз.',
    waitingResponse: 'Ожидаем ответ...',
    send: 'Отправить',
    analysis: 'Разбор',
    interpretationTitle: 'Интерпретация сна',
    keyImages: 'Ключевые образы',
    whatItMayMean: 'Что может означать сон',
    dreamTitleLabel: 'Название сна',
    statusLabel: 'Статус',
    updatedLabel: 'Последнее обновление',
    waitingInterpretation:
      'Здесь появятся ключевые слова и итоговая интерпретация, когда ассистент соберет достаточно данных.',
    processSteps: [
      'Вы описываете сон своими словами.',
      'Ассистент уточняет, какие чувства вы испытывали во сне.',
      'Затем вы выбираете ключевые слова и предметы сна.',
      'После этого появляется итоговая интерпретация.',
    ],
    keywordSelectionTitle: 'Выберите ключевые слова или предметы сна',
    keywordSelectionHint:
      'Нажимайте на кнопки. Выбранные слова автоматически соберутся в поле сообщения через запятую.',
    keywordSelectionEmpty: 'Ключевые слова пока подготавливаются.',
    keywordSelectionSendHint: 'Когда список готов, нажмите "Отправить".',
    confirmation: 'Подтверждение',
    deleteDreamTitle: 'Удалить сон?',
    deleteDreamCopy:
      'Сон будет удален вместе со всей перепиской. Это действие нельзя отменить.',
    cancel: 'Отмена',
    confirm: 'Подтвердить',
    deleting: 'Удаляем...',
    passwordsDontMatch: 'Пароли не совпадают.',
  },
  en: {
    appName: 'Dream Journal',
    authHeroTitle: 'Dreams you can return to',
    authLead:
      'Save dream stories in a calm dialogue, revisit the details later, and keep the interpretation in one place.',
    features: [
      {
        index: '01',
        title: 'Natural telling',
        description: 'Instead of filling out a form, you simply tell the dream the way you remember it.',
      },
      {
        index: '02',
        title: 'Feelings and motifs',
        description: 'The app highlights key images, emotions, and turning points in the dream.',
      },
      {
        index: '03',
        title: 'Personal archive',
        description: 'You can return to any dream later, compare it with newer ones, or delete it.',
      },
    ],
    authLogin: 'Login',
    authRegister: 'Register',
    authContinue: 'Continue your journal',
    authCreateAccount: 'Create an account',
    authLoginButton: 'Login',
    authRegisterButton: 'Register',
    usernameLabel: 'Username',
    usernamePlaceholder: 'choose a username',
    emailLabel: 'Email for future updates (optional)',
    passwordLabel: 'Password',
    passwordLoginPlaceholder: 'enter your password',
    passwordRegisterPlaceholder: 'create a password',
    confirmPasswordLabel: 'Repeat password',
    confirmPasswordPlaceholder: 'repeat the password',
    authHint: 'If the backend is unavailable, the frontend will switch to local demo mode.',
    authOpenJournal: 'Open journal',
    authSignUp: 'Sign up',
    authLoggingIn: 'Logging in...',
    authCreatingAccount: 'Creating account...',
    uploadProfilePhoto: 'Upload profile photo',
    profileImageTypeError: 'You can upload images only.',
    profileImageSizeError: 'The image must be smaller than 5 MB.',
    profileImageReadError: 'Could not read the image.',
    profileImageUploadError: 'Could not upload the image.',
    logout: 'Log out',
    previousDreams: 'Previous dreams',
    mockBanner: 'Local demo mode: the interface is running without the backend or Docker.',
    fallbackDreamKeywords: 'The assistant is still gathering details',
    justNow: 'Just now',
    newDream: 'New dream',
    currentDream: 'Current dream',
    preparingDream: 'Preparing a new dream',
    updating: 'Updating...',
    assistantThinking: 'Assistant is thinking...',
    you: 'You',
    assistant: 'Assistant',
    emptyTimeline:
      'Start by describing the dream. The assistant will ask about feelings, offer keywords, and then interpret it.',
    composerLabel: 'Message',
    composerPlaceholder:
      'Describe the dream: who was there, what happened, which details stayed with you...',
    keywordComposerPlaceholder: 'Pick words with the buttons below or type them separated by commas...',
    composerHint: 'Enter sends the message, Shift+Enter inserts a line break.',
    voiceInput: 'Dictate message',
    voiceStop: 'Stop recording',
    voiceRecordingHint: 'Recording is active. Speak into the microphone, then stop it to keep the text in the field.',
    voiceUnsupported:
      'Speech recognition is not available in this browser. Try Chrome, Edge, or another browser with Web Speech API support.',
    voicePermissionError: 'Microphone access is blocked. Allow it in the browser and try again.',
    voiceNoSpeechError: 'No speech was recognized. Try speaking a little louder and without a long pause.',
    voiceCaptureError: 'Could not start voice input. Please try again.',
    waitingResponse: 'Waiting for reply...',
    send: 'Send',
    analysis: 'Analysis',
    interpretationTitle: 'Dream interpretation',
    keyImages: 'Key motifs',
    whatItMayMean: 'What the dream may mean',
    dreamTitleLabel: 'Dream title',
    statusLabel: 'Status',
    updatedLabel: 'Last updated',
    waitingInterpretation:
      'Keywords and the final interpretation will appear here once the assistant has enough detail.',
    processSteps: [
      'You describe the dream in your own words.',
      'The assistant asks what emotions you felt in the dream.',
      'Then you choose the key words and objects from the dream.',
      'After that the final interpretation appears.',
    ],
    keywordSelectionTitle: 'Choose the key words or objects from the dream',
    keywordSelectionHint:
      'Click the buttons. The selected words will be collected in the message field, separated by commas.',
    keywordSelectionEmpty: 'Keyword suggestions are still being prepared.',
    keywordSelectionSendHint: 'When the list looks right, press "Send".',
    confirmation: 'Confirmation',
    deleteDreamTitle: 'Delete this dream?',
    deleteDreamCopy:
      'The dream will be removed together with the full conversation. This action cannot be undone.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    deleting: 'Deleting...',
    passwordsDontMatch: 'Passwords do not match.',
  },
};

export function getUiCopy(language) {
  return UI_COPY[language] ?? UI_COPY.ru;
}

export function humanizeStageForLanguage(stage, language) {
  if (language === 'en') {
    switch (stage) {
      case 'CLARIFYING':
      case 'COLLECTING_EMOTIONS':
        return 'Emotions';
      case 'SELECTING_KEYWORDS':
        return 'Keywords';
      case 'INTERPRETED':
        return 'Interpretation ready';
      default:
        return 'New dream';
    }
  }

  switch (stage) {
    case 'CLARIFYING':
    case 'COLLECTING_EMOTIONS':
      return 'Эмоции';
    case 'SELECTING_KEYWORDS':
      return 'Ключевые слова';
    case 'INTERPRETED':
      return 'Интерпретация готова';
    default:
      return 'Новый сон';
  }
}

export function formatDateForLanguage(value, language) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
