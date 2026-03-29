import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDream,
  deleteDream,
  fetchDream,
  fetchDreams,
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
  const [dreamToDelete, setDreamToDelete] = useState(null);
  const [isMockMode, setIsMockMode] = useState(() => isMockApiEnabled());
  const [profileImage, setProfileImage] = useState(() => readProfileImage(readStoredUser()?.id));
  const [customDreamOrder, setCustomDreamOrder] = useState(() => readDreamOrder(readStoredUser()?.id));
  const [draggedDreamId, setDraggedDreamId] = useState(null);
  const [dragOverDreamId, setDragOverDreamId] = useState(null);
  const timelineEndRef = useRef(null);
  const profileImageInputRef = useRef(null);
  const activeDreamIdRef = useRef(null);

  const copy = useMemo(() => getUiCopy(language), [language]);
  const orderedDreams = useMemo(() => applyDreamOrder(dreams, customDreamOrder), [dreams, customDreamOrder]);
  const activeDreamPending = activeDream?.id ? pendingDreamIds.includes(activeDream.id) : false;

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
    timelineEndRef.current?.scrollIntoView({
      behavior: activeDream?.messages?.length ? 'smooth' : 'auto',
      block: 'end',
    });
  }, [activeDream?.id, activeDream?.messages?.length]);

  useEffect(() => {
    if (!dreamToDelete) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setDreamToDelete(null);
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [dreamToDelete]);

  function syncApiMode() {
    setIsMockMode(isMockApiEnabled());
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

  async function bootstrapUser(currentUser) {
    setLoading(true);
    setError('');

    try {
      const fetchedDreams = sortDreams(await fetchDreams(currentUser.id));
      const storedOrder = sanitizeDreamOrder(fetchedDreams, readDreamOrder(currentUser.id));
      const displayDreams = applyDreamOrder(fetchedDreams, storedOrder);

      setCustomDreamOrder(storedOrder);
      setDreams(fetchedDreams);

      if (displayDreams.length === 0) {
        clearDreamOrder(currentUser.id);
        const created = await createDream(currentUser.id, language);
        setActiveDream(created);
        setDreams([toSummary(created)]);
        setCustomDreamOrder([]);
        return;
      }

      const detail = await fetchDream(currentUser.id, displayDreams[0].id);
      setActiveDream(detail);
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      syncApiMode();
      setLoading(false);
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
    window.localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setDreams([]);
    setActiveDream(null);
    setDraftMessage('');
    setDreamToDelete(null);
    setError('');
    setProfileImage('');
    setCustomDreamOrder([]);
    setDraggedDreamId(null);
    setDragOverDreamId(null);
    setPendingDreamIds([]);
    setCreatingDream(false);
    setDeletingDream(false);
  }

  async function handleSelectDream(dreamId) {
    if (!user?.id || dreamId === activeDream?.id) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const detail = await fetchDream(user.id, dreamId);
      setActiveDream(detail);
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      syncApiMode();
      setLoading(false);
    }
  }

  async function handleCreateDream() {
    if (!user?.id) {
      return;
    }

    setCreatingDream(true);
    setError('');

    try {
      const created = await createDream(user.id, language);
      setActiveDream(created);
      setDreams((current) => sortDreams([toSummary(created), ...current]));
      setCustomDreamOrder((current) => (
        current.length > 0 ? [created.id, ...current.filter((dreamId) => dreamId !== created.id)] : current
      ));
      setDraftMessage('');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      syncApiMode();
      setCreatingDream(false);
    }
  }

  async function submitCurrentMessage() {
    if (!user?.id || !activeDream?.id || !draftMessage.trim()) {
      return;
    }

    const dreamId = activeDream.id;
    const outgoingMessage = draftMessage.trim();

    markDreamPending(dreamId);
    setError('');
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

  function requestDeleteDream(dreamId) {
    const target = orderedDreams.find((dream) => dream.id === dreamId);
    if (target) {
      setDreamToDelete(target);
    }
  }

  async function confirmDeleteDream() {
    if (!user?.id || !dreamToDelete?.id) {
      return;
    }

    const dreamId = dreamToDelete.id;
    const nextOrder = customDreamOrder.filter((itemId) => itemId !== dreamId);
    setDeletingDream(true);
    setError('');

    try {
      await deleteDream(user.id, dreamId);

      const nextDreams = dreams.filter((dream) => dream.id !== dreamId);
      const nextDisplayedDreams = applyDreamOrder(nextDreams, nextOrder);

      setCustomDreamOrder(nextOrder);
      setDreams(nextDreams);

      if (activeDream?.id !== dreamId) {
        return;
      }

      if (nextDisplayedDreams.length > 0) {
        const detail = await fetchDream(user.id, nextDisplayedDreams[0].id);
        setActiveDream(detail);
      } else {
        const created = await createDream(user.id, language);
        setActiveDream(created);
        setDreams([toSummary(created)]);
        setCustomDreamOrder([]);
      }
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      syncApiMode();
      setDeletingDream(false);
      setDreamToDelete(null);
    }
  }

  function handleDreamDragStart(event, dreamId) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dreamId);
    setDraggedDreamId(dreamId);
    setDragOverDreamId(dreamId);
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
    setDragOverDreamId(dreamId);
  }

  function handleDreamDrop(event, targetDreamId) {
    event.preventDefault();
    const sourceDreamId = draggedDreamId ?? event.dataTransfer.getData('text/plain');

    if (!sourceDreamId || sourceDreamId === targetDreamId) {
      setDraggedDreamId(null);
      setDragOverDreamId(null);
      return;
    }

    setCustomDreamOrder(reorderDreamIds(
      orderedDreams.map((dream) => dream.id),
      sourceDreamId,
      targetDreamId,
    ));
    setDraggedDreamId(null);
    setDragOverDreamId(null);
  }

  function handleDreamDragEnd() {
    setDraggedDreamId(null);
    setDragOverDreamId(null);
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
      setError(language === 'en' ? 'You can upload images only.' : 'Можно загрузить только изображение.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      setError(language === 'en' ? 'The image must be smaller than 5 MB.' : 'Фото должно быть меньше 5 МБ.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError(language === 'en' ? 'Could not read the image.' : 'Не удалось прочитать изображение.');
        return;
      }
      writeProfileImage(user.id, reader.result);
      setProfileImage(reader.result);
      setError('');
    };
    reader.onerror = () => {
      setError(language === 'en' ? 'Could not upload the image.' : 'Не удалось загрузить изображение.');
    };

    reader.readAsDataURL(file);
    event.target.value = '';
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
                  onClick={() => setLanguage('ru')}
                >
                  RU
                </button>
                <button
                  type="button"
                  className={`language-chip ${language === 'en' ? 'is-active' : ''}`}
                  onClick={() => setLanguage('en')}
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

          <div className="sidebar-dreams-section">
            <div className="dream-list">
              {orderedDreams.map((dream) => (
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
                      <span className="dream-card-grip" aria-hidden="true">⋮⋮</span>
                      <strong>{dream.title}</strong>
                      <div className="dream-card-meta">
                        {isDreamPending(dream.id) ? (
                          <span className="dream-card-spinner" aria-label={copy.waitingResponse} title={copy.waitingResponse} />
                        ) : null}
                        <span>{humanizeStage(dream.stage)}</span>
                      </div>
                    </div>
                    <p>{dream.keywords?.length ? dream.keywords.join(' • ') : copy.fallbackDreamKeywords}</p>
                    <time>{formatDate(dream.updatedAt) || copy.justNow}</time>
                  </button>
                  <button
                    className="dream-card-delete"
                    type="button"
                    aria-label={`${copy.deleteDreamTitle} ${dream.title}`}
                    onClick={() => requestDeleteDream(dream.id)}
                    disabled={isDreamPending(dream.id) || deletingDream}
                  >
                    ×
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

                {!activeDream?.messages?.length && !loading ? (
                  <div className="empty-state">
                    <p>{copy.emptyTimeline}</p>
                  </div>
                ) : null}

                <div ref={timelineEndRef} />
              </div>

              <form className="composer" onSubmit={handleSubmitMessage}>
                <label className="composer-label" htmlFor="dream-message">{copy.composerLabel}</label>
                <textarea
                  id="dream-message"
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={copy.composerPlaceholder}
                  rows={5}
                  disabled={loading || activeDreamPending || !activeDream}
                />
                <div className="composer-actions">
                  {error ? <p className="error-text">{error}</p> : <p className="hint-text">{copy.composerHint}</p>}
                  <button className="primary-button" type="submit" disabled={loading || activeDreamPending || !draftMessage.trim()}>
                    {activeDreamPending ? copy.waitingResponse : copy.send}
                  </button>
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

      {dreamToDelete ? (
        <div className="modal-scrim" role="presentation" onClick={() => setDreamToDelete(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">{copy.confirmation}</p>
            <h2 id="delete-dialog-title">{copy.deleteDreamTitle}</h2>
            <p className="modal-copy">
              {copy.deleteDreamCopy} <strong>{dreamToDelete.title}</strong>
            </p>
            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => setDreamToDelete(null)} disabled={deletingDream}>
                {copy.cancel}
              </button>
              <button className="danger-button" type="button" onClick={() => void confirmDeleteDream()} disabled={deletingDream}>
                {deletingDream ? copy.deleting : copy.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
