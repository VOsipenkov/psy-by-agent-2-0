import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDream,
  deleteDream,
  fetchDream,
  fetchDreams,
  isMockApiEnabled,
  loginUser,
  sendDreamMessage,
} from './api';

const STORAGE_KEY = 'dream-journal-user';

function App() {
  const [user, setUser] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [dreams, setDreams] = useState([]);
  const [activeDream, setActiveDream] = useState(null);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [draftMessage, setDraftMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dreamToDelete, setDreamToDelete] = useState(null);
  const [isMockMode, setIsMockMode] = useState(() => isMockApiEnabled());
  const timelineEndRef = useRef(null);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void bootstrapUser(user);
  }, [user?.id]);

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
      const list = sortDreams(await fetchDreams(currentUser.id));
      setDreams(list);

      if (list.length === 0) {
        const created = await createDream(currentUser.id);
        setActiveDream(created);
        setDreams([toSummary(created)]);
        return;
      }

      const detail = await fetchDream(currentUser.id, list[0].id);
      setActiveDream(detail);
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      syncApiMode();
      setLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const loggedInUser = await loginUser(username.trim(), password.trim());
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedInUser));
      setUser(loggedInUser);
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
    const target = dreams.find((dream) => dream.id === dreamId);

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
    setSubmitting(true);
    setError('');

    try {
      await deleteDream(user.id, dreamId);

      const nextDreams = dreams.filter((dream) => dream.id !== dreamId);
      setDreams(nextDreams);

      if (activeDream?.id !== dreamId) {
        return;
      }

      if (nextDreams.length > 0) {
        const detail = await fetchDream(user.id, nextDreams[0].id);
        setActiveDream(detail);
      } else {
        const created = await createDream(user.id);
        setActiveDream(created);
        setDreams([toSummary(created)]);
      }
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      syncApiMode();
      setSubmitting(false);
      setDreamToDelete(null);
    }
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
            <h1>Записывайте сны в живом диалоге, а не в скучной анкете</h1>
            <p className="lead">
              Ассистент задает уточняющие вопросы, выделяет ключевые образы и собирает интерпретацию в одной беседе.
            </p>
            <div className="feature-grid">
              <article className="feature-card">
                <span className="feature-index">01</span>
                <strong>Диалог вместо формы</strong>
                <p>Вы просто рассказываете сон, как человеку, а не заполняете длинные поля.</p>
              </article>
              <article className="feature-card">
                <span className="feature-index">02</span>
                <strong>Ключевые символы</strong>
                <p>После уточнений система выделит главные образы и соберет итоговый смысл сна.</p>
              </article>
              <article className="feature-card">
                <span className="feature-index">03</span>
                <strong>История под рукой</strong>
                <p>Любой прошлый сон можно открыть, перечитать и при необходимости удалить отдельно.</p>
              </article>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleLogin}>
            <div className="auth-form-head">
              <p className="eyebrow">Вход</p>
              <h2>Продолжить работу</h2>
            </div>

            <label htmlFor="username">Логин</label>
            <input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="например, admin"
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
              placeholder="например, admin"
              minLength={3}
              maxLength={100}
              required
            />

            <div className="auth-note">
              <span>Тестовый вход</span>
              <strong>admin / admin</strong>
            </div>

            <p className="hint-text">Если backend не запущен, откроется локальный демо-режим только для frontend.</p>

            <button type="submit" disabled={loading} className="primary-button">
              {loading ? 'Входим...' : 'Открыть дневник'}
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
            <div className="profile-badge">{user.username.slice(0, 1).toUpperCase()}</div>
            <div>
              <p className="eyebrow">Dream Journal</p>
              <h2>{sidebarTitle}</h2>
              <p className="sidebar-copy">Личный дневник снов и история прошлых интерпретаций.</p>
            </div>
            <button className="ghost-button sidebar-logout" type="button" onClick={handleLogout}>
              Выйти
            </button>
          </div>

          <div className="sidebar-section-head">
            <span>Предыдущие сны</span>
            <span>{dreams.length}</span>
          </div>

          {isMockMode ? <div className="mock-banner">Локальный демо-режим: интерфейс работает без backend и Docker.</div> : null}

          <div className="dream-list">
            {dreams.map((dream) => (
              <article key={dream.id} className={`dream-card ${activeDream?.id === dream.id ? 'is-active' : ''}`}>
                <button className="dream-card-main" type="button" onClick={() => handleSelectDream(dream.id)}>
                  <div className="dream-card-head">
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
