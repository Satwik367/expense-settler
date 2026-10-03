const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    credentials: 'include', // sends/receives the httpOnly auth cookie
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    const error = new Error(message);
    error.details = data?.details;
    error.status = res.status;
    throw error;
  }

  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  listGroups: () => request('/groups'),
  createGroup: (payload) => request('/groups', { method: 'POST', body: payload }),
  getGroup: (groupId) => request(`/groups/${groupId}`),
  addMember: (groupId, email) => request(`/groups/${groupId}/members`, { method: 'POST', body: { email } }),
  leaveGroup: (groupId) => request(`/groups/${groupId}/leave`, { method: 'POST' }),

  listExpenses: (groupId) => request(`/groups/${groupId}/expenses`),
  createExpense: (groupId, payload) => request(`/groups/${groupId}/expenses`, { method: 'POST', body: payload }),

  computeSettlements: (groupId) => request(`/groups/${groupId}/settlements/compute`, { method: 'POST' }),
  listSettlements: (groupId) => request(`/groups/${groupId}/settlements`),

  createOrder: (settlementId) => request(`/payments/create-order/${settlementId}`, { method: 'POST' }),
  verifyCallback: (payload) => request('/payments/verify-callback', { method: 'POST', body: payload }),
};