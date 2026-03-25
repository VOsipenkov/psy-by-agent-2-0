import { useEffect, useMemo, useState } from 'react';
import {
  createDream,
  deleteDream,
  fetchDream,
  fetchDreams,
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

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void bootstrapUser(user);
  }, [user?.id]);

  async function bootstrapUser(currentUser) {
    setLoading(true);
    setError('');

    try {
      const list = await fetchDreams(currentUser.id);
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
      setLoading(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setDreams([]);
    setActiveDream(null);
    setDraftMessage('');
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
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitMessage(event) {
    event.preventDefault();

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
      setSubmitting(false);
    }
  }

  async function handleDeleteDream(dreamId) {
    if (!user?.id) {
      return;
    }

    const target = dreams.find((dream) => dream.id === dreamId);
    const accepted = window.confirm(`Удалить сон "${target?.title ?? 'Без названия'}" вместе с перепиской?`);

    if (!accepted) {
      return;
    }

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
      setSubmitting(false);
    }
  }

  const sidebarTitle = useMemo(() => {
    if (!user) {
      return 'Dream Journal';
    }

    return `${user.username}, ваши сны`;
  }, [user]);

  if (!user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">Dream Journal</p>
          <h1>Расскажите сон, а мы превратим его в смысл</h1>
          <p className="lead">
            Сервис ведет диалог, задает уточняющие вопросы и собирает интерпретацию сна с ключевыми образами.
          </p>
          <form className="auth-form" onSubmit={handleLogin}>
            <label htmlFor="username">Логин</label>
            <input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="например, roberto"
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
            <p className="hint-text">Тестовая учетка: admin / admin</p>
            <button type="submit" disabled={loading} className="primary-button">
              {loading ? 'Входим...' : 'Войти'}
            </button>
          </form>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <div>
            <p className="eyebrow">Dream Journal</p>
            <h2>{sidebarTitle}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={handleLogout}>
            Выйти
          </button>
        </div>

        <button className="primary-button" type="button" onClick={handleCreateDream} disabled={submitting}>
          Новый сон
        </button>

        <div className="dream-list">
          {dreams.map((dream) => (
            <button
              key={dream.id}
              className={`dream-pill ${activeDream?.id === dream.id ? 'is-active' : ''}`}
              type="button"
              onClick={() => handleSelectDream(dream.id)}
            >
              <div className="dream-pill-copy">
                <strong>{dream.title}</strong>
                <span>{dream.keywords?.length ? dream.keywords.join(', ') : 'Ожидает анализа'}</span>
              </div>
              <span
                className="dream-pill-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDeleteDream(dream.id);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void handleDeleteDream(dream.id);
                  }
                }}
              >
                ?
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="workspace">
        <section className="chat-panel">
          <div className="chat-head">
            <div>
              <p className="eyebrow">Текущий сон</p>
              <h1>{activeDream?.title ?? 'Загрузка...'}</h1>
            </div>
            <div className={`status-badge status-${(activeDream?.stage ?? 'NEW').toLowerCase()}`}>
              {humanizeStage(activeDream?.stage)}
            </div>
          </div>

          <div className="chat-timeline">
            {activeDream?.messages?.map((message) => (
              <article
                key={message.id}
                className={`message-card ${message.role === 'USER' ? 'message-user' : 'message-assistant'}`}
              >
                <p className="message-role">{message.role === 'USER' ? 'Вы' : 'Ассистент'}</p>
                <p>{message.content}</p>
                <time>{formatDate(message.createdAt)}</time>
              </article>
            ))}

            {!activeDream?.messages?.length && !loading ? (
              <div className="empty-state">
                <p>Диалог появится здесь, как только вы начнете описывать сон.</p>
              </div>
            ) : null}
          </div>

          <form className="composer" onSubmit={handleSubmitMessage}>
            <textarea
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              placeholder="Опишите сон: кто был рядом, какие символы вы запомнили, что чувствовали..."
              rows={4}
              disabled={loading || submitting || !activeDream}
            />
            <div className="composer-actions">
              {error ? <p className="error-text">{error}</p> : <p className="hint-text">Пишите свободно, как в обычном чате.</p>}
              <button className="primary-button" type="submit" disabled={loading || submitting || !draftMessage.trim()}>
                {submitting ? 'Отправляем...' : 'Отправить'}
              </button>
            </div>
          </form>
        </section>

        <section className="insight-panel">
          <p className="eyebrow">Интерпретация</p>
          <h2>Смысл сна</h2>

          {activeDream?.interpretation ? (
            <>
              <div className="keywords">
                {activeDream.keywords.map((keyword) => (
                  <span key={keyword} className="keyword-chip">
                    {keyword}
                  </span>
                ))}
              </div>
              <p className="interpretation-text">{activeDream.interpretation}</p>
              <p className="meta-text">Название сна: {activeDream.title}</p>
            </>
          ) : (
            <div className="waiting-card">
              <p>
                Когда ассистент соберет достаточно деталей, здесь появятся ключевые слова и итоговая интерпретация сна.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
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
      return 'Интерпретирован';
    default:
      return 'Новый';
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


