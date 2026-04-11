import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createTelegramLinkCode,
  createDream,
  deleteDream,
  fetchDream,
  fetchDreams,
  fetchTelegramLinkStatus,
  isMockApiEnabled,
  loginUser,
  registerUser,
  sendDreamMessage,
} from './api';
import { formatDateForLanguage, getUiCopy, humanizeStageForLanguage } from './i18n';

const STORAGE_KEY = 'dream-journal-user';
const LANGUAGE_STORAGE_KEY = 'dream-journal-language';
const AVATAR_STORAGE_KEY_PREFIX = 'dream-journal-avatar';
const DREAM_ORDER_STORAGE_KEY_PREFIX = 'dream-journal-order';
const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;

export default function LocalizedApp() {
  const [user, setUser] = useState(() => readStoredUser());
  const [language, setLanguage] = useState(() => readStoredLanguage());
  const [dreams, setDreams] = useState([]);
  const [activeDream, setActiveDream] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingDream, setCreatingDream] = useState(false);
  const [deletingDream, setDeletingDream] = useState(false);
  const [pendingDreamIds, setPendingDreamIds] = useState([]);
  const [error, setError] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [isMockMode, setIsMockMode] = useState(() => isMockApiEnabled());
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState('');
  const [profileImage, setProfileImage] = useState(() => readProfileImage(readStoredUser()?.id));
  const [customDreamOrder, setCustomDreamOrder] = useState(() => readDreamOrder(readStoredUser()?.id));
  const [previewDreamOrder, setPreviewDreamOrder] = useState(null);
  const [draggedDreamId, setDraggedDreamId] = useState(null);
  const [dragOverDreamId, setDragOverDreamId] = useState(null);
  const timelineEndRef = useRef(null);
  const profileImageInputRef = useRef(null);
  const activeDreamIdRef = useRef(null);
  const dreamLoadRequestRef = useRef(0);
  const timelineSnapshotRef = useRef({ dreamId: null, messageCount: 0 });
  const speechRecognitionRef = useRef(null);
  const speechBaseDraftRef = useRef('');
  const speechTranscriptRef = useRef('');

  const copy = useMemo(() => getUiCopy(language), [language]);
  const telegramText = {
    title: copy.telegramTitle ?? 'Telegram',
    hint: copy.telegramHint ?? 'You can write to the bot directly. To connect this website account, press "Link Telegram".',
    linkedHint: copy.telegramLinkedHint ?? 'This account is already linked to the Telegram bot.',
    linkedAs: copy.telegramLinkedAs ?? 'Linked as {username}.',
    linked: copy.telegramLinked ?? 'Linked',
    notLinked: copy.telegramNotLinked ?? 'Not linked',
    codeLabel: copy.telegramCodeLabel ?? 'Link code',
    expiresLabel: copy.telegramExpiresLabel ?? 'Valid until:',
    generateCode: copy.telegramGenerateCode ?? 'Link Telegram',
    refreshCode: copy.telegramRefreshCode ?? 'Relink Telegram',
    generating: copy.telegramGenerating ?? 'Generating...',
    openBot: copy.telegramOpenBot ?? 'Go to Telegram',
  };
  const orderedDreams = useMemo(() => applyDreamOrder(dreams, customDreamOrder), [dreams, customDreamOrder]);
  const displayedDreams = useMemo(
    () => applyDreamOrder(dreams, previewDreamOrder ?? customDreamOrder),
    [dreams, customDreamOrder, previewDreamOrder],
  );
  const activeDreamPending = activeDream?.id ? pendingDreamIds.includes(activeDream.id) : false;
  const keywordSelectionActive = activeDream?.stage === 'SELECTING_KEYWORDS';
  const selectedComposerKeywords = useMemo(() => parseComposerKeywords(draftMessage), [draftMessage]);
  const voiceRecognitionAvailable = isSpeechRecognitionSupported();
  const composerLocked = loading || activeDreamPending || !activeDream;
  const telegramLinked = Boolean(telegramStatus?.linked);
  const telegramBotLink = telegramStatus?.botLink
    ?? (telegramStatus?.botUsername ? `https://t.me/${telegramStatus.botUsername}` : null);
  const telegramStartLink = telegramStatus?.startLink ?? null;
  const telegramLinkCode = telegramStatus?.linkCode ?? '';
  const composerStatusMessage = error
    || speechError
    || (isVoiceRecording
      ? copy.voiceRecordingHint
      : (keywordSelectionActive ? copy.keywordSelectionSendHint : copy.composerHint));
  const composerStatusClassName = error || speechError
    ? 'error-text'
    : `hint-text${isVoiceRecording ? ' composer-status-live' : ''}`;
  const voiceButtonLabel = isVoiceRecording ? copy.voiceStop : copy.voiceInput;
  const voiceButtonTitle = voiceRecognitionAvailable ? voiceButtonLabel : copy.voiceUnsupported;

  useEffect(() => {
    writeStoredLanguage(language);
  }, [language]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    void bootstrapUser(user);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setTelegramStatus(null);
      setTelegramError('');
      return;
    }

    void bootstrapTelegram(user);
  }, [user?.id]);

  useEffect(() => {
    activeDreamIdRef.current = activeDream?.id ?? null;
  }, [activeDream?.id]);

  useEffect(() => {
    if (!user?.id) {
      setProfileImage('');
      setCustomDreamOrder([]);
      return;
    }
    setProfileImage(readProfileImage(user.id));
    setCustomDreamOrder(readDreamOrder(user.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    if (customDreamOrder.length > 0) {
      writeDreamOrder(user.id, customDreamOrder);
      return;
    }
    clearDreamOrder(user.id);
  }, [customDreamOrder, user?.id]);

  useEffect(() => {
    const dreamId = activeDream?.id ?? null;
    const messageCount = activeDream?.messages?.length ?? 0;
    const previous = timelineSnapshotRef.current;
    const shouldScroll = previous.dreamId === dreamId && messageCount > previous.messageCount;

    if (shouldScroll) {
      timelineEndRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
    }

    timelineSnapshotRef.current = { dreamId, messageCount };
  }, [activeDream?.id, activeDream?.messages?.length]);

  useEffect(() => () => {
    const recognition = speechRecognitionRef.current;

    if (!recognition) {
      return;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;

    try {
      recognition.stop();
    } catch {
      // Ignore browsers throwing when recognition is already stopping.
    }
  }, []);

  function syncApiMode() {
    setIsMockMode(isMockApiEnabled());
  }

  function beginDreamLoadRequest() {
    dreamLoadRequestRef.current += 1;
    return dreamLoadRequestRef.current;
  }

  function isLatestDreamLoadRequest(requestId) {
    return dreamLoadRequestRef.current === requestId;
  }

  function humanizeStage(stage) {
    return humanizeStageForLanguage(stage, language);
  }

  function formatDate(value) {
    return formatDateForLanguage(value, language);
  }

  function isDreamPending(dreamId) {
    return dreamId ? pendingDreamIds.includes(dreamId) : false;
  }

  function markDreamPending(dreamId) {
    setPendingDreamIds((current) => (current.includes(dreamId) ? current : [...current, dreamId]));
  }

  function clearDreamPending(dreamId) {
    setPendingDreamIds((current) => current.filter((itemId) => itemId !== dreamId));
  }

  function stopVoiceRecognition() {
    const recognition = speechRecognitionRef.current;

    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      speechRecognitionRef.current = null;

      try {
        recognition.stop();
      } catch {
        // Ignore browsers throwing when recognition is already stopping.
      }
    }

    speechBaseDraftRef.current = '';
    speechTranscriptRef.current = '';
    setIsVoiceRecording(false);
  }

  function handleDraftMessageChange(event) {
    setDraftMessage(event.target.value);

    if (speechError) {
      setSpeechError('');
    }
  }

  function handleVoiceInputToggle() {
    if (isVoiceRecording) {
      stopVoiceRecognition();
      return;
    }

    const SpeechRecognition = getSpeechRecognitionConstructor();

    if (!SpeechRecognition) {
      setSpeechError(copy.voiceUnsupported);
      return;
    }

    setError('');
    setSpeechError('');
    speechBaseDraftRef.current = draftMessage;
    speechTranscriptRef.current = '';

    const recognition = new SpeechRecognition();
    recognition.lang = getSpeechRecognitionLanguage(language);
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let nextFinalTranscript = speechTranscriptRef.current;
      let interimTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript ?? '';

        if (event.results[index].isFinal) {
          nextFinalTranscript = mergeVoiceTranscript(nextFinalTranscript, transcript);
        } else {
          interimTranscript = mergeVoiceTranscript(interimTranscript, transcript);
        }
      }

      speechTranscriptRef.current = nextFinalTranscript;
      setDraftMessage(buildVoiceDraft(speechBaseDraftRef.current, nextFinalTranscript, interimTranscript));
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') {
        return;
      }

      setSpeechError(getSpeechRecognitionErrorMessage(event.error, copy));
      setIsVoiceRecording(false);
      speechRecognitionRef.current = null;
    };

    recognition.onend = () => {
      speechRecognitionRef.current = null;
      speechBaseDraftRef.current = '';
      speechTranscriptRef.current = '';
      setIsVoiceRecording(false);
    };

    speechRecognitionRef.current = recognition;

    try {
      recognition.start();
      setIsVoiceRecording(true);
    } catch {
      speechRecognitionRef.current = null;
      setSpeechError(copy.voiceCaptureError);
      setIsVoiceRecording(false);
    }
  }

  async function bootstrapUser(currentUser) {
    const requestId = beginDreamLoadRequest();
    setLoading(true);
    setError('');

    try {
      const fetchedDreams = sortDreams(await fetchDreams(currentUser.id));
      const storedOrder = sanitizeDreamOrder(fetchedDreams, readDreamOrder(currentUser.id));
      const displayDreams = applyDreamOrder(fetchedDreams, storedOrder);

      if (!isLatestDreamLoadRequest(requestId)) {
        return;
      }

      setCustomDreamOrder(storedOrder);
      setDreams(fetchedDreams);

      if (displayDreams.length === 0) {
        clearDreamOrder(currentUser.id);
        setActiveDream(null);
        const created = await createDream(currentUser.id, language);
        if (!isLatestDreamLoadRequest(requestId)) {
          return;
        }
        setActiveDream(created);
        setDreams([toSummary(created)]);
        setCustomDreamOrder([]);
        return;
      }

      const detail = await fetchDream(currentUser.id, displayDreams[0].id);
      if (!isLatestDreamLoadRequest(requestId)) {
        return;
      }
      setActiveDream(detail);
    } catch (apiError) {
      if (isLatestDreamLoadRequest(requestId)) {
        setError(apiError.message);
      }
    } finally {
      syncApiMode();
      if (isLatestDreamLoadRequest(requestId)) {
        setLoading(false);
      }
    }
  }

  async function bootstrapTelegram(currentUser) {
    setTelegramLoading(true);
    setTelegramError('');

    try {
      const status = await fetchTelegramLinkStatus(currentUser.id);
      setTelegramStatus(status);
    } catch (apiError) {
      setTelegramError(apiError.message);
    } finally {
      syncApiMode();
      setTelegramLoading(false);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (authMode === 'register' && password !== confirmPassword) {
        throw new Error(copy.passwordsDontMatch);
      }

      const authenticatedUser = authMode === 'register'
        ? await registerUser(username.trim(), password.trim(), email.trim())
        : await loginUser(username.trim(), password.trim());

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));
      setUser(authenticatedUser);
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      syncApiMode();
      setLoading(false);
    }
  }

  function handleLogout() {
    stopVoiceRecognition();
    window.localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setDreams([]);
    setActiveDream(null);
    setDraftMessage('');
    setError('');
    setSpeechError('');
    setTelegramStatus(null);
    setTelegramError('');
    setTelegramLoading(false);
    setProfileImage('');
    setCustomDreamOrder([]);
    setPreviewDreamOrder(null);
    setDraggedDreamId(null);
    setDragOverDreamId(null);
    setPendingDreamIds([]);
    setCreatingDream(false);
    setDeletingDream(false);
  }

  async function handleGenerateTelegramLinkCode() {
    if (!user?.id) {
      return;
    }

    setTelegramLoading(true);
    setTelegramError('');

    try {
      const response = await createTelegramLinkCode(user.id);
      setTelegramStatus((current) => ({
        ...(current ?? {}),
        available: response.available,
        botUsername: response.botUsername,
        linkCode: response.code,
        linkCodeExpiresAt: response.expiresAt,
        startLink: response.startLink,
      }));
    } catch (apiError) {
      setTelegramError(apiError.message);
    } finally {
      syncApiMode();
      setTelegramLoading(false);
    }
  }

  async function handleBindTelegram() {
    if (telegramLinked) {
      if (telegramBotLink) {
        window.open(telegramBotLink, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    setTelegramLoading(true);
    setTelegramError('');

    try {
      const response = await createTelegramLinkCode(user.id);
      const nextStatus = {
        ...(telegramStatus ?? {}),
        available: response.available,
        botUsername: response.botUsername,
        botLink: response.botLink ?? (response.botUsername ? `https://t.me/${response.botUsername}` : null),
        linkCode: response.code,
        linkCodeExpiresAt: response.expiresAt,
        startLink: response.startLink,
      };

      setTelegramStatus(nextStatus);

      if (nextStatus.startLink) {
        window.open(nextStatus.startLink, '_blank', 'noopener,noreferrer');
      }
    } catch (apiError) {
      setTelegramError(apiError.message);
    } finally {
      syncApiMode();
      setTelegramLoading(false);
    }
  }

  function handleOpenTelegramBot() {
    if (!telegramBotLink) {
      return;
    }

    window.open(telegramBotLink, '_blank', 'noopener,noreferrer');
  }

  async function handleSelectDream(dreamId) {
    if (!user?.id || dreamId === activeDream?.id) {
      return;
    }

    stopVoiceRecognition();
    const requestId = beginDreamLoadRequest();
    const previousActiveDream = activeDream;
    const dreamSummary = orderedDreams.find((dream) => dream.id === dreamId);

    setLoading(true);
    setError('');
    setSpeechError('');
    setDraftMessage('');
    setPreviewDreamOrder(null);
    if (dreamSummary) {
      setActiveDream(createLoadingDream(dreamSummary));
    }

    try {
      const detail = await fetchDream(user.id, dreamId);
      if (!isLatestDreamLoadRequest(requestId)) {
        return;
      }
      setActiveDream(detail);
    } catch (apiError) {
      if (isLatestDreamLoadRequest(requestId)) {
        setError(apiError.message);
        setActiveDream(previousActiveDream);
      }
    } finally {
      syncApiMode();
      if (isLatestDreamLoadRequest(requestId)) {
        setLoading(false);
      }
    }
  }

  async function handleCreateDream() {
    if (!user?.id) {
      return;
    }

    stopVoiceRecognition();
    const requestId = beginDreamLoadRequest();
    const previousActiveDream = activeDream;
    setCreatingDream(true);
    setError('');
    setSpeechError('');
    setDraftMessage('');
    setPreviewDreamOrder(null);
    setActiveDream(null);

    try {
      const created = await createDream(user.id, language);
      if (!isLatestDreamLoadRequest(requestId)) {
        return;
      }
      setActiveDream(created);
      setDreams((current) => sortDreams([toSummary(created), ...current]));
      setCustomDreamOrder((current) => (
        current.length > 0 ? [created.id, ...current.filter((dreamId) => dreamId !== created.id)] : current
      ));
    } catch (apiError) {
      if (isLatestDreamLoadRequest(requestId)) {
        setError(apiError.message);
        setActiveDream(previousActiveDream);
      }
    } finally {
      syncApiMode();
      setCreatingDream(false);
    }
  }

  async function submitCurrentMessage() {
    if (!user?.id || !activeDream?.id || !draftMessage.trim()) {
      return;
    }

    stopVoiceRecognition();
    const dreamId = activeDream.id;
    const outgoingMessage = draftMessage.trim();

    markDreamPending(dreamId);
    setError('');
    setSpeechError('');
    setDraftMessage('');

    try {
      const updated = await sendDreamMessage(user.id, dreamId, outgoingMessage, language);
      setDreams((current) => sortDreams([toSummary(updated), ...current.filter((item) => item.id !== updated.id)]));
      setActiveDream((current) => (current?.id === updated.id ? updated : current));
    } catch (apiError) {
      setError(apiError.message);

      if (activeDreamIdRef.current === dreamId) {
        setDraftMessage((current) => current || outgoingMessage);
      }
    } finally {
      syncApiMode();
      clearDreamPending(dreamId);
    }
  }

  function handleSubmitMessage(event) {
    event.preventDefault();
    void submitCurrentMessage();
  }

  function handleComposerKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    if (!loading && !activeDreamPending && draftMessage.trim()) {
      void submitCurrentMessage();
    }
  }

  async function handleDeleteDream(dreamId) {
    if (!user?.id || !dreamId || deletingDream) {
      return;
    }

    stopVoiceRecognition();
    const requestId = beginDreamLoadRequest();
    const nextOrder = customDreamOrder.filter((itemId) => itemId !== dreamId);
    setDeletingDream(true);
    setError('');
    setSpeechError('');
    setDraftMessage('');
    setPreviewDreamOrder(null);

    try {
      await deleteDream(user.id, dreamId);

      const nextDreams = dreams.filter((dream) => dream.id !== dreamId);
      const nextDisplayedDreams = applyDreamOrder(nextDreams, nextOrder);

      if (!isLatestDreamLoadRequest(requestId)) {
        return;
      }

      setCustomDreamOrder(nextOrder);
      setDreams(nextDreams);

      if (activeDream?.id !== dreamId) {
        return;
      }

      if (nextDisplayedDreams.length > 0) {
        setActiveDream(createLoadingDream(nextDisplayedDreams[0]));
        const detail = await fetchDream(user.id, nextDisplayedDreams[0].id);
        if (!isLatestDreamLoadRequest(requestId)) {
          return;
        }
        setActiveDream(detail);
      } else {
        setActiveDream(null);
        const created = await createDream(user.id, language);
        if (!isLatestDreamLoadRequest(requestId)) {
          return;
        }
        setActiveDream(created);
        setDreams([toSummary(created)]);
        setCustomDreamOrder([]);
      }
    } catch (apiError) {
      if (isLatestDreamLoadRequest(requestId)) {
        setError(apiError.message);
      }
    } finally {
      syncApiMode();
      setDeletingDream(false);
    }
  }

  function handleDreamDragStart(event, dreamId) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dreamId);
    setDraggedDreamId(dreamId);
    setDragOverDreamId(dreamId);
    setPreviewDreamOrder(displayedDreams.map((dream) => dream.id));
  }

  function handleDreamDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function handleDreamDragEnter(event, dreamId) {
    event.preventDefault();
    if (!draggedDreamId || draggedDreamId === dreamId) {
      return;
    }
    const currentOrder = previewDreamOrder ?? displayedDreams.map((dream) => dream.id);
    const nextOrder = reorderDreamIds(currentOrder, draggedDreamId, dreamId);
    setDragOverDreamId(dreamId);
    if (!areDreamOrdersEqual(currentOrder, nextOrder)) {
      setPreviewDreamOrder(nextOrder);
    }
  }

  function handleDreamDrop(event, targetDreamId) {
    event.preventDefault();
    const sourceDreamId = draggedDreamId ?? event.dataTransfer.getData('text/plain');

    if (!sourceDreamId) {
      setDraggedDreamId(null);
      setDragOverDreamId(null);
      setPreviewDreamOrder(null);
      return;
    }

    const currentOrder = previewDreamOrder ?? displayedDreams.map((dream) => dream.id);
    const nextOrder = sourceDreamId === targetDreamId
      ? currentOrder
      : reorderDreamIds(currentOrder, sourceDreamId, targetDreamId);

    setCustomDreamOrder(nextOrder);
    setDraggedDreamId(null);
    setDragOverDreamId(null);
    setPreviewDreamOrder(null);
  }

  function handleDreamDragEnd() {
    setDraggedDreamId(null);
    setDragOverDreamId(null);
    setPreviewDreamOrder(null);
  }

  function openProfileImageDialog() {
    profileImageInputRef.current?.click();
  }

  function handleProfileImageChange(event) {
    const file = event.target.files?.[0];

    if (!file || !user?.id) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError(copy.profileImageTypeError);
      event.target.value = '';
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      setError(copy.profileImageSizeError);
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError(copy.profileImageReadError);
        return;
      }
      writeProfileImage(user.id, reader.result);
      setProfileImage(reader.result);
      setError('');
    };
    reader.onerror = () => {
      setError(copy.profileImageUploadError);
    };

    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function handleKeywordSuggestionClick(keyword) {
    if (!keywordSelectionActive) {
      return;
    }

    if (speechError) {
      setSpeechError('');
    }

    setDraftMessage((current) => toggleKeywordSelectionDraft(current, keyword));
  }

  const sidebarTitle = user ? user.username : copy.appName;

  if (!user) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card-copy">
          <div className="auth-copy">
            <p className="eyebrow">{copy.appName}</p>
            <h1>{copy.authHeroTitle}</h1>
            <p className="lead">{copy.authLead}</p>
            <div className="feature-grid">
              {copy.features.map((feature) => (
                <article key={feature.index} className="feature-card">
                  <span className="feature-index">{feature.index}</span>
                  <strong>{feature.title}</strong>
                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <div className="auth-form-head">
              <p className="eyebrow">{authMode === 'login' ? copy.authLogin : copy.authRegister}</p>
              <h2>{authMode === 'login' ? copy.authContinue : copy.authCreateAccount}</h2>
            </div>

            <div className="auth-switch">
              <button
                className={`auth-switch-button ${authMode === 'login' ? 'is-active' : ''}`}
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setEmail('');
                  setConfirmPassword('');
                }}
              >
                {copy.authLoginButton}
              </button>
              <button
                className={`auth-switch-button ${authMode === 'register' ? 'is-active' : ''}`}
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setError('');
                }}
              >
                {copy.authRegisterButton}
              </button>
            </div>

            <label htmlFor="username">{copy.usernameLabel}</label>
            <input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={copy.usernamePlaceholder}
              minLength={3}
              maxLength={40}
              required
            />

            {authMode === 'register' ? (
              <>
                <label htmlFor="email">{copy.emailLabel}</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  maxLength={160}
                  autoComplete="email"
                />
              </>
            ) : null}

            <label htmlFor="password">{copy.passwordLabel}</label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={authMode === 'login' ? copy.passwordLoginPlaceholder : copy.passwordRegisterPlaceholder}
              minLength={3}
              maxLength={100}
              required
            />

            {authMode === 'register' ? (
              <>
                <label htmlFor="confirmPassword">{copy.confirmPasswordLabel}</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder={copy.confirmPasswordPlaceholder}
                  minLength={3}
                  maxLength={100}
                  required
                />
              </>
            ) : null}

            <p className="hint-text">{copy.authHint}</p>

            <button type="submit" disabled={loading} className="primary-button">
              {loading
                ? (authMode === 'login' ? copy.authLoggingIn : copy.authCreatingAccount)
                : (authMode === 'login' ? copy.authOpenJournal : copy.authSignUp)}
            </button>

            {error ? <p className="error-text">{error}</p> : null}
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="profile-stack">
              <button
                className="profile-badge profile-badge-button"
                type="button"
                onClick={openProfileImageDialog}
                aria-label={copy.uploadProfilePhoto}
                title={copy.uploadProfilePhoto}
              >
                {profileImage ? (
                  <img className="profile-avatar-image" src={profileImage} alt={copy.uploadProfilePhoto} />
                ) : (
                  user.username.slice(0, 1).toUpperCase()
                )}
              </button>

                <div className="language-switch" aria-label="Language switch">
                  <button
                    type="button"
                    className={`language-chip ${language === 'ru' ? 'is-active' : ''}`}
                    onClick={() => {
                      stopVoiceRecognition();
                      setSpeechError('');
                      setLanguage('ru');
                    }}
                  >
                    RU
                  </button>
                  <button
                    type="button"
                    className={`language-chip ${language === 'en' ? 'is-active' : ''}`}
                    onClick={() => {
                      stopVoiceRecognition();
                      setSpeechError('');
                      setLanguage('en');
                    }}
                  >
                    EN
                  </button>
                </div>
            </div>

            <div>
              <p className="eyebrow">{copy.appName}</p>
              <h2>{sidebarTitle}</h2>
            </div>

            <button className="ghost-button sidebar-logout" type="button" onClick={handleLogout}>
              {copy.logout}
            </button>

            <input
              ref={profileImageInputRef}
              className="visually-hidden-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleProfileImageChange}
            />
          </div>

          <div className="sidebar-section-head">
            <span>{copy.previousDreams}</span>
            <span>{orderedDreams.length}</span>
          </div>

          {isMockMode ? <div className="mock-banner">{copy.mockBanner}</div> : null}

          <section className="telegram-card">
            <div className="telegram-card-head">
              <p className="panel-label panel-label-dark">{telegramText.title}</p>
              <span className={`telegram-status-pill ${telegramLinked ? 'is-linked' : ''}`}>
                {telegramLinked ? telegramText.linked : telegramText.notLinked}
              </span>
            </div>

            <p className="hint-text">
              {telegramLinked
                ? (telegramStatus?.telegramUsername
                  ? telegramText.linkedAs.replace('{username}', telegramStatus.telegramUsername)
                  : telegramText.linkedHint)
                : telegramText.hint}
            </p>

            {telegramError ? <p className="error-text">{telegramError}</p> : null}

            {telegramLinkCode ? (
              <div className="telegram-code-block">
                <span className="telegram-code-label">{telegramText.codeLabel}</span>
                <strong className="telegram-code-value">{telegramLinkCode}</strong>
                <span className="hint-text">
                  {telegramText.expiresLabel} {formatDate(telegramStatus?.linkCodeExpiresAt) || copy.justNow}
                </span>
              </div>
            ) : null}

            <div className="telegram-card-actions">
              <button
                className="ghost-button telegram-action-button"
                type="button"
                onClick={() => void handleBindTelegram()}
                disabled={telegramLoading}
              >
                {telegramLoading ? telegramText.generating : (telegramLinkCode ? telegramText.refreshCode : telegramText.generateCode)}
              </button>

              <button
                className="primary-button telegram-action-button"
                type="button"
                onClick={handleOpenTelegramBot}
                disabled={!telegramBotLink}
              >
                {telegramText.openBot}
              </button>
            </div>
          </section>

          <div className="sidebar-dreams-section">
            <div className="dream-list">
              {displayedDreams.map((dream) => (
                <article
                  key={dream.id}
                  className={[
                    'dream-card',
                    activeDream?.id === dream.id ? 'is-active' : '',
                    draggedDreamId === dream.id ? 'is-dragging' : '',
                    dragOverDreamId === dream.id && draggedDreamId !== dream.id ? 'is-drop-target' : '',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={(event) => handleDreamDragStart(event, dream.id)}
                  onDragOver={handleDreamDragOver}
                  onDragEnter={(event) => handleDreamDragEnter(event, dream.id)}
                  onDrop={(event) => handleDreamDrop(event, dream.id)}
                  onDragEnd={handleDreamDragEnd}
                >
                  <button className="dream-card-main" type="button" onClick={() => handleSelectDream(dream.id)}>
                    <div className="dream-card-head">
                      <span className="dream-card-grip" aria-hidden="true">::</span>
                      <strong>{dream.title}</strong>
                      <div className="dream-card-meta">
                        {isDreamPending(dream.id) ? (
                          <span className="dream-card-spinner" aria-label={copy.waitingResponse} title={copy.waitingResponse} />
                        ) : null}
                        <span>{humanizeStage(dream.stage)}</span>
                      </div>
                    </div>
                    <p>{formatDreamListKeywords(dream, copy.fallbackDreamKeywords)}</p>
                    <time>{formatDate(dream.updatedAt) || copy.justNow}</time>
                  </button>
                  <button
                    className="dream-card-delete"
                    type="button"
                    aria-label={`${copy.deleteDreamTitle} ${dream.title}`}
                    onClick={() => void handleDeleteDream(dream.id)}
                    disabled={isDreamPending(dream.id) || deletingDream}
                  >
                    x
                  </button>
                </article>
              ))}
            </div>

            <div className="sidebar-actions">
              <button className="primary-button new-dream-button" type="button" onClick={handleCreateDream} disabled={creatingDream || deletingDream}>
                {copy.newDream}
              </button>
            </div>
          </div>
        </aside>

        <main className="workspace">
          <div className="workspace-grid">
            <section className="chat-panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">{copy.currentDream}</p>
                  <h2>{activeDream?.title ?? copy.preparingDream}</h2>
                </div>
                <div className="section-head-side">
                  <div className={`status-badge status-${(activeDream?.stage ?? 'NEW').toLowerCase()}`}>
                    {humanizeStage(activeDream?.stage)}
                  </div>
                  {loading ? <span className="inline-status">{copy.updating}</span> : null}
                  {!loading && activeDreamPending ? <span className="inline-status">{copy.assistantThinking}</span> : null}
                </div>
              </div>

              <div className="chat-timeline">
                {activeDream?.messages?.map((message) => (
                  <article
                    key={message.id}
                    className={`message-card ${message.role === 'USER' ? 'message-user' : 'message-assistant'}`}
                  >
                    <div className="message-meta">
                      <p className="message-role">{message.role === 'USER' ? copy.you : copy.assistant}</p>
                      <time>{formatDate(message.createdAt)}</time>
                    </div>
                    <p className="message-content">{message.content}</p>
                  </article>
                ))}

                {activeDreamPending ? (
                  <article className="message-card message-assistant message-thinking" aria-live="polite">
                    <div className="message-meta">
                      <p className="message-role">{copy.assistant}</p>
                      <time>{copy.justNow}</time>
                    </div>
                    <div className="typing-dots" aria-label={copy.assistantThinking}>
                      <span />
                      <span />
                      <span />
                    </div>
                  </article>
                ) : null}

                {!activeDream?.messages?.length && !loading ? (
                  <div className="empty-state">
                    <p>{copy.emptyTimeline}</p>
                  </div>
                ) : null}

                <div ref={timelineEndRef} />
              </div>

              <form className="composer" onSubmit={handleSubmitMessage}>
                {keywordSelectionActive ? (
                  <div className="keyword-selector">
                    <div className="keyword-selector-head">
              <p className="panel-label panel-label-dark">{copy.keywordSelectionTitle}</p>
                      <p className="hint-text">{copy.keywordSelectionHint}</p>
                    </div>

                    {activeDream?.keywords?.length ? (
                      <div className="keyword-selector-grid">
                        {activeDream.keywords.map((keyword) => (
                          <button
                            key={keyword}
                            className={`keyword-toggle ${selectedComposerKeywords.includes(keyword.toLowerCase()) ? 'is-active' : ''}`}
                            type="button"
                            onClick={() => handleKeywordSuggestionClick(keyword)}
                            disabled={loading || activeDreamPending}
                          >
                            {keyword}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="hint-text">{copy.keywordSelectionEmpty}</p>
                    )}
                  </div>
                ) : null}

                <label className="composer-label" htmlFor="dream-message">{copy.composerLabel}</label>
                <textarea
                  id="dream-message"
                  value={draftMessage}
                  onChange={handleDraftMessageChange}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={keywordSelectionActive ? copy.keywordComposerPlaceholder : copy.composerPlaceholder}
                  rows={5}
                  disabled={composerLocked || isVoiceRecording}
                />
                <div className="composer-actions">
                  <p className={composerStatusClassName}>{composerStatusMessage}</p>
                  <div className="composer-submit-group">
                    <button
                      className={`ghost-button composer-mic-button ${isVoiceRecording ? 'is-recording' : ''}`}
                      type="button"
                      onClick={handleVoiceInputToggle}
                      disabled={composerLocked}
                      aria-label={voiceButtonLabel}
                      aria-pressed={isVoiceRecording}
                      title={voiceButtonTitle}
                    >
                      <span className="composer-mic-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V7A3.5 3.5 0 1 0 8.5 7v5a3.5 3.5 0 0 0 3.5 3.5Zm6-3.5a1 1 0 1 1 2 0 8 8 0 0 1-7 7.94V22h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.06A8 8 0 0 1 4 12a1 1 0 1 1 2 0 6 6 0 0 0 12 0Z" />
                        </svg>
                      </span>
                    </button>
                    <button className="primary-button" type="submit" disabled={composerLocked || isVoiceRecording || !draftMessage.trim()}>
                      {activeDreamPending ? copy.waitingResponse : copy.send}
                    </button>
                  </div>
                </div>
              </form>
            </section>

            <aside className="insight-panel">
              <div className="section-head section-head-light">
                <div>
                  <p className="eyebrow eyebrow-light">{copy.analysis}</p>
                  <h2>{copy.interpretationTitle}</h2>
                </div>
              </div>

              {activeDream?.interpretation ? (
                <>
                  <div className="keywords-block">
                    <p className="panel-label">{copy.keyImages}</p>
                    <div className="keywords">
                      {activeDream.keywords.map((keyword) => (
                        <span key={keyword} className="keyword-chip">{keyword}</span>
                      ))}
                    </div>
                  </div>

                  <div className="insight-story">
                    <p className="panel-label">{copy.whatItMayMean}</p>
                    <p className="interpretation-text">{activeDream.interpretation}</p>
                  </div>

                  <div className="insight-details">
                    <div className="detail-row">
                      <span>{copy.dreamTitleLabel}</span>
                      <strong>{activeDream.title}</strong>
                    </div>
                    <div className="detail-row">
                      <span>{copy.statusLabel}</span>
                      <strong>{humanizeStage(activeDream.stage)}</strong>
                    </div>
                    <div className="detail-row">
                      <span>{copy.updatedLabel}</span>
                      <strong>{formatDate(activeDream.updatedAt) || copy.justNow}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {activeDream?.keywords?.length ? (
                    <div className="keywords-block">
                      <p className="panel-label">{copy.keyImages}</p>
                      <div className="keywords">
                        {activeDream.keywords.map((keyword) => (
                          <span key={keyword} className="keyword-chip">{keyword}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="waiting-card waiting-card-strong">
                    <p>{copy.waitingInterpretation}</p>
                  </div>

                  <div className="process-list">
                    {copy.processSteps.map((step, index) => (
                      <article key={step} className="process-step">
                        <span>{index + 1}</span>
                        <p>{step}</p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </aside>
          </div>
        </main>
      </div>
    </>
  );
}

function readStoredUser() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : null;
}

function readStoredLanguage() {
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return saved === 'en' ? 'en' : 'ru';
}

function writeStoredLanguage(language) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language === 'en' ? 'en' : 'ru');
}

function readProfileImage(userId) {
  if (!userId) {
    return '';
  }
  return window.localStorage.getItem(getAvatarStorageKey(userId)) ?? '';
}

function writeProfileImage(userId, imageData) {
  if (userId) {
    window.localStorage.setItem(getAvatarStorageKey(userId), imageData);
  }
}

function readDreamOrder(userId) {
  if (!userId) {
    return [];
  }

  const saved = window.localStorage.getItem(getDreamOrderStorageKey(userId));
  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeDreamOrder(userId, order) {
  if (userId) {
    window.localStorage.setItem(getDreamOrderStorageKey(userId), JSON.stringify(order));
  }
}

function clearDreamOrder(userId) {
  if (userId) {
    window.localStorage.removeItem(getDreamOrderStorageKey(userId));
  }
}

function getAvatarStorageKey(userId) {
  return `${AVATAR_STORAGE_KEY_PREFIX}-${userId}`;
}

function getDreamOrderStorageKey(userId) {
  return `${DREAM_ORDER_STORAGE_KEY_PREFIX}-${userId}`;
}

function toSummary(dream) {
  return {
    id: dream.id,
    title: dream.title,
    stage: dream.stage,
    keywords: dream.keywords,
    updatedAt: dream.updatedAt,
  };
}

function createLoadingDream(dream) {
  return {
    id: dream.id,
    title: dream.title,
    stage: dream.stage,
    interpretation: dream.interpretation ?? null,
    keywords: dream.keywords ?? [],
    messages: [],
    updatedAt: dream.updatedAt,
  };
}

function sortDreams(dreams) {
  return [...dreams].sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
}

function sanitizeDreamOrder(dreams, order) {
  const availableIds = new Set(dreams.map((dream) => dream.id));
  return order.filter((dreamId) => availableIds.has(dreamId));
}

function applyDreamOrder(dreams, order) {
  const sanitizedOrder = sanitizeDreamOrder(dreams, order);
  if (sanitizedOrder.length === 0) {
    return sortDreams(dreams);
  }

  const dreamsById = new Map(dreams.map((dream) => [dream.id, dream]));
  const orderedDreams = sanitizedOrder.map((dreamId) => dreamsById.get(dreamId)).filter(Boolean);
  const remainingDreams = sortDreams(dreams.filter((dream) => !sanitizedOrder.includes(dream.id)));
  return [...orderedDreams, ...remainingDreams];
}

function reorderDreamIds(currentIds, sourceId, targetId) {
  const nextIds = currentIds.filter((dreamId) => dreamId !== sourceId);
  const targetIndex = nextIds.indexOf(targetId);
  if (targetIndex === -1) {
    return currentIds;
  }
  nextIds.splice(targetIndex, 0, sourceId);
  return nextIds;
}

function areDreamOrdersEqual(left, right) {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((dreamId, index) => dreamId === right[index]);
}

function formatDreamListKeywords(dream, fallbackText) {
  if (dream?.stage !== 'INTERPRETED' || !dream.keywords?.length) {
    return fallbackText;
  }

  return dream.keywords.join(' • ');
}

function parseComposerKeywords(value) {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function toggleKeywordSelectionDraft(currentValue, keyword) {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) {
    return currentValue;
  }

  const parts = currentValue
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const existingIndex = parts.findIndex((item) => item.toLowerCase() === normalizedKeyword.toLowerCase());
  if (existingIndex >= 0) {
    const next = parts.filter((_, index) => index !== existingIndex);
    return next.join(', ');
  }

  return [...parts, normalizedKeyword].join(', ');
}

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function isSpeechRecognitionSupported() {
  return Boolean(getSpeechRecognitionConstructor());
}

function getSpeechRecognitionLanguage(language) {
  return language === 'en' ? 'en-US' : 'ru-RU';
}

function normalizeVoiceSegment(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function mergeVoiceTranscript(currentTranscript, nextFragment) {
  const left = normalizeVoiceSegment(currentTranscript);
  const right = normalizeVoiceSegment(nextFragment);

  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return `${left} ${right}`;
}

function buildVoiceDraft(baseDraft, finalTranscript, interimTranscript = '') {
  const combinedTranscript = mergeVoiceTranscript(finalTranscript, interimTranscript);

  if (!combinedTranscript) {
    return baseDraft;
  }

  const trimmedBase = baseDraft.trimEnd();

  if (!trimmedBase) {
    return combinedTranscript;
  }

  return `${trimmedBase}${/\s$/.test(baseDraft) ? '' : ' '}${combinedTranscript}`;
}

function getSpeechRecognitionErrorMessage(errorCode, copy) {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return copy.voicePermissionError;
    case 'no-speech':
      return copy.voiceNoSpeechError;
    case 'audio-capture':
      return copy.voiceCaptureError;
    default:
      return copy.voiceCaptureError;
  }
}
