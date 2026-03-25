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

const STORAGE_KEY = 'dream-journal-user';
const AVATAR_STORAGE_KEY_PREFIX = 'dream-journal-avatar';
const DREAM_ORDER_STORAGE_KEY_PREFIX = 'dream-journal-order';
const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;

function App() {
  const [user, setUser] = useState(() => readStoredUser());
  const [dreams, setDreams] = useState([]);
  const [activeDream, setActiveDream] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dreamToDelete, setDreamToDelete] = useState(null);
  const [isMockMode, setIsMockMode] = useState(() => isMockApiEnabled());
  const [profileImage, setProfileImage] = useState(() => readProfileImage(readStoredUser()?.id));
  const [customDreamOrder, setCustomDreamOrder] = useState(() => readDreamOrder(readStoredUser()?.id));
  const [draggedDreamId, setDraggedDreamId] = useState(null);
  const [dragOverDreamId, setDragOverDreamId] = useState(null);
  const timelineEndRef = useRef(null);
  const profileImageInputRef = useRef(null);

  const orderedDreams = useMemo(
    () => applyDreamOrder(dreams, customDreamOrder),
    [dreams, customDreamOrder],
  );

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void bootstrapUser(user);
  }, [user?.id]);

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
        const created = await createDream(currentUser.id);
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
        throw new Error('Пароли не совпадают');
      }

      const authAction = authMode === 'register' ? registerUser : loginUser;
      const authenticatedUser = await authAction(username.trim(), password.trim());
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

    setSubmitting(true);
    setError('');

    try {
      const created = await createDream(user.id);
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
      setSubmitting(false);
    }
  }

  async function submitCurrentMessage() {
    if (!user?.id || !activeDream?.id || !draftMessage.trim()) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const updated = await sendDreamMessage(user.id, activeDream.id, draftMessage.trim());
      setActiveDream(updated);
      setDreams((current) => sortDreams([toSummary(updated), ...current.filter((item) => item.id !== updated.id)]));
      setDraftMessage('');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      syncApiMode();
      setSubmitting(false);
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

    if (!loading && !submitting && draftMessage.trim()) {
      void submitCurrentMessage();
    }
  }

  function requestDeleteDream(dreamId) {
    const target = orderedDreams.find((dream) => dream.id === dreamId);

    if (!target) {
      return;
    }

    setDreamToDelete(target);
  }

  async function confirmDeleteDream() {
    if (!user?.id || !dreamToDelete?.id) {
      return;
    }

    const dreamId = dreamToDelete.id;
    const nextOrder = customDreamOrder.filter((itemId) => itemId !== dreamId);
    setSubmitting(true);
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
        const created = await createDream(user.id);
        setActiveDream(created);
        setDreams([toSummary(created)]);
        setCustomDreamOrder([]);
      }
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      syncApiMode();
      setSubmitting(false);
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

    const reorderedIds = reorderDreamIds(
      orderedDreams.map((dream) => dream.id),
      sourceDreamId,
      targetDreamId,
    );

    setCustomDreamOrder(reorderedIds);
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
      setError('Можно загрузить только изображение.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      setError('Фото должно быть меньше 5 МБ.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError('Не удалось прочитать изображение.');
        return;
      }

      writeProfileImage(user.id, reader.result);
      setProfileImage(reader.result);
      setError('');
    };

    reader.onerror = () => {
      setError('Не удалось загрузить изображение.');
    };

    reader.readAsDataURL(file);
    event.target.value = '';
  }

  const sidebarTitle = useMemo(() => {
    if (!user) {
      return 'Dream Journal';
    }

    return user.username;
  }, [user]);

  if (!user) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card-copy">
          <div className="auth-copy">
            <p className="eyebrow">Dream Journal</p>
            <h1>Сны, к которым можно возвращаться</h1>
            <p className="lead">
              Сохраняйте ночные сюжеты в спокойном диалоге, перечитывайте детали и получайте интерпретацию сна в одной истории.
            </p>
            <div className="feature-grid">
              <article className="feature-card">
                <span className="feature-index">01</span>
                <strong>Живой рассказ</strong>
                <p>Вместо анкеты вы просто рассказываете сон так, как он вспоминается.</p>
              </article>
              <article className="feature-card">
                <span className="feature-index">02</span>
                <strong>Символы и чувства</strong>
                <p>Сервис выделяет ключевые образы, эмоции и поворотные моменты сна.</p>
              </article>
              <article className="feature-card">
                <span className="feature-index">03</span>
                <strong>Личный архив</strong>
                <p>К каждому сну можно вернуться позже, сравнить его с новыми сюжетами или удалить.</p>
              </article>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <div className="auth-form-head">
              <p className="eyebrow">{authMode === 'login' ? 'Вход' : 'Регистрация'}</p>
              <h2>{authMode === 'login' ? 'Продолжить работу' : 'Создать аккаунт'}</h2>
            </div>

            <div className="auth-switch">
              <button
                className={`auth-switch-button ${authMode === 'login' ? 'is-active' : ''}`}
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                  setConfirmPassword('');
                }}
              >
                Войти
              </button>
              <button
                className={`auth-switch-button ${authMode === 'register' ? 'is-active' : ''}`}
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setError('');
                }}
              >
                Регистрация
              </button>
            </div>

            <label htmlFor="username">Логин</label>
            <input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="придумайте логин"
              minLength={3}
              maxLength={40}
              required
            />

            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={authMode === 'login' ? 'введите пароль' : 'придумайте пароль'}
              minLength={3}
              maxLength={100}
              required
            />

            {authMode === 'register' ? (
              <>
                <label htmlFor="confirmPassword">Повторите пароль</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="повторите пароль"
                  minLength={3}
                  maxLength={100}
                  required
                />
              </>
            ) : null}

            <p className="hint-text">Если backend не запущен, откроется локальный демо-режим только для frontend.</p>

            <button type="submit" disabled={loading} className="primary-button">
              {loading ? (authMode === 'login' ? 'Входим...' : 'Создаем аккаунт...') : authMode === 'login' ? 'Открыть дневник' : 'Зарегистрироваться'}
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
            <button
              className="profile-badge profile-badge-button"
              type="button"
              onClick={openProfileImageDialog}
              aria-label="Загрузить фото профиля"
              title="Загрузить фото профиля"
            >
              {profileImage ? (
                <img
                  className="profile-avatar-image"
                  src={profileImage}
                  alt={`Фото пользователя ${user.username}`}
                />
              ) : (
                user.username.slice(0, 1).toUpperCase()
              )}
            </button>
            <div>
              <p className="eyebrow">Dream Journal</p>
              <h2>{sidebarTitle}</h2>
            </div>
            <button className="ghost-button sidebar-logout" type="button" onClick={handleLogout}>
              Выйти
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
            <span>Предыдущие сны</span>
            <span>{orderedDreams.length}</span>
          </div>

          {isMockMode ? <div className="mock-banner">Локальный демо-режим: интерфейс работает без backend и Docker.</div> : null}

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
                      <span className="dream-card-grip" aria-hidden="true">
                        ⋮⋮
                      </span>
                      <strong>{dream.title}</strong>
                      <span>{humanizeStage(dream.stage)}</span>
                    </div>
                    <p>{dream.keywords?.length ? dream.keywords.join(' • ') : 'Ассистент еще собирает детали'}</p>
                    <time>{formatDate(dream.updatedAt) || 'Только что'}</time>
                  </button>
                  <button
                    className="dream-card-delete"
                    type="button"
                    aria-label={`Удалить сон ${dream.title}`}
                    onClick={() => requestDeleteDream(dream.id)}
                  >
                    ×
                  </button>
                </article>
              ))}
            </div>

            <div className="sidebar-actions">
              <button className="primary-button new-dream-button" type="button" onClick={handleCreateDream} disabled={submitting}>
                Новый сон
              </button>
            </div>
          </div>
        </aside>

        <main className="workspace">
          <div className="workspace-grid">
            <section className="chat-panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Текущий сон</p>
                  <h2>{activeDream?.title ?? 'Подготавливаем новый сон'}</h2>
                </div>
                <div className="section-head-side">
                  <div className={`status-badge status-${(activeDream?.stage ?? 'NEW').toLowerCase()}`}>
                    {humanizeStage(activeDream?.stage)}
                  </div>
                  {loading ? <span className="inline-status">Обновляем...</span> : null}
                </div>
              </div>

              <div className="chat-timeline">
                {activeDream?.messages?.map((message) => (
                  <article
                    key={message.id}
                    className={`message-card ${message.role === 'USER' ? 'message-user' : 'message-assistant'}`}
                  >
                    <div className="message-meta">
                      <p className="message-role">{message.role === 'USER' ? 'Вы' : 'Ассистент'}</p>
                      <time>{formatDate(message.createdAt)}</time>
                    </div>
                    <p className="message-content">{message.content}</p>
                  </article>
                ))}

                {!activeDream?.messages?.length && !loading ? (
                  <div className="empty-state">
                    <p>Начните с любого описания сна. Ассистент сам подхватит беседу и задаст уточняющие вопросы.</p>
                  </div>
                ) : null}

                <div ref={timelineEndRef} />
              </div>

              <form className="composer" onSubmit={handleSubmitMessage}>
                <label className="composer-label" htmlFor="dream-message">
                  Сообщение
                </label>
                <textarea
                  id="dream-message"
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Опишите сон: кто был рядом, какие символы запомнились, что чувствовали..."
                  rows={5}
                  disabled={loading || submitting || !activeDream}
                />
                <div className="composer-actions">
                  {error ? (
                    <p className="error-text">{error}</p>
                  ) : (
                    <p className="hint-text">Enter отправляет сообщение, Shift+Enter переносит строку.</p>
                  )}
                  <button className="primary-button" type="submit" disabled={loading || submitting || !draftMessage.trim()}>
                    {submitting ? 'Отправляем...' : 'Отправить'}
                  </button>
                </div>
              </form>
            </section>

            <aside className="insight-panel">
              <div className="section-head section-head-light">
                <div>
                  <p className="eyebrow eyebrow-light">Разбор</p>
                  <h2>Интерпретация сна</h2>
                </div>
              </div>

              {activeDream?.interpretation ? (
                <>
                  <div className="keywords-block">
                    <p className="panel-label">Ключевые образы</p>
                    <div className="keywords">
                      {activeDream.keywords.map((keyword) => (
                        <span key={keyword} className="keyword-chip">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="insight-story">
                    <p className="panel-label">Что может означать сон</p>
                    <p className="interpretation-text">{activeDream.interpretation}</p>
                  </div>

                  <div className="insight-details">
                    <div className="detail-row">
                      <span>Название сна</span>
                      <strong>{activeDream.title}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Статус</span>
                      <strong>{humanizeStage(activeDream.stage)}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Последнее обновление</span>
                      <strong>{formatDate(activeDream.updatedAt) || 'Сейчас'}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="waiting-card waiting-card-strong">
                    <p>
                      Здесь появятся 2-3 ключевых слова и итоговая интерпретация, когда ассистент соберет достаточно деталей.
                    </p>
                  </div>

                  <div className="process-list">
                    <article className="process-step">
                      <span>1</span>
                      <p>Вы свободно рассказываете сон без жесткой формы.</p>
                    </article>
                    <article className="process-step">
                      <span>2</span>
                      <p>Ассистент задает пару уточняющих вопросов и выделяет символы.</p>
                    </article>
                    <article className="process-step">
                      <span>3</span>
                      <p>После этого появляется название сна и итоговая трактовка.</p>
                    </article>
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
            <p className="eyebrow">Подтверждение</p>
            <h2 id="delete-dialog-title">Удалить сон?</h2>
            <p className="modal-copy">
              Сон <strong>{dreamToDelete.title}</strong> будет удален вместе со всей перепиской. Это действие нельзя отменить.
            </p>
            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => setDreamToDelete(null)} disabled={submitting}>
                Отмена
              </button>
              <button className="danger-button" type="button" onClick={() => void confirmDeleteDream()} disabled={submitting}>
                {submitting ? 'Удаляем...' : 'Подтвердить'}
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

function readProfileImage(userId) {
  if (!userId) {
    return '';
  }

  return window.localStorage.getItem(getAvatarStorageKey(userId)) ?? '';
}

function writeProfileImage(userId, imageData) {
  if (!userId) {
    return;
  }

  window.localStorage.setItem(getAvatarStorageKey(userId), imageData);
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
  if (!userId) {
    return;
  }

  window.localStorage.setItem(getDreamOrderStorageKey(userId), JSON.stringify(order));
}

function clearDreamOrder(userId) {
  if (!userId) {
    return;
  }

  window.localStorage.removeItem(getDreamOrderStorageKey(userId));
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

function humanizeStage(stage) {
  switch (stage) {
    case 'CLARIFYING':
      return 'Уточнение';
    case 'INTERPRETED':
      return 'Интерпретация готова';
    default:
      return 'Новый сон';
  }
}

function formatDate(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default App;
