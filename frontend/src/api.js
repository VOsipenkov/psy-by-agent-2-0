const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request(path, options = {}) {
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

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function loginUser(username) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export function fetchDreams(userId) {
  return request(`/api/users/${userId}/dreams`);
}

export function createDream(userId) {
  return request(`/api/users/${userId}/dreams`, {
    method: 'POST',
  });
}

export function fetchDream(userId, dreamId) {
  return request(`/api/users/${userId}/dreams/${dreamId}`);
}

export function sendDreamMessage(userId, dreamId, content) {
  return request(`/api/users/${userId}/dreams/${dreamId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function deleteDream(userId, dreamId) {
  return request(`/api/users/${userId}/dreams/${dreamId}`, {
    method: 'DELETE',
  });
}
