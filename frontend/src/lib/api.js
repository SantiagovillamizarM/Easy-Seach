// Cliente de la API de Easy Search.
// Todas las peticiones van a /api (Vite las reenvía al backend en desarrollo).

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Token de sesión: lo configura AuthContext. Si el servidor responde 401 con token, se cierra la sesión.
let authToken = null;
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token;
}
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

const FIELD_NAMES = {
  email: "Correo",
  password: "Contraseña",
  new_password: "Nueva contraseña",
  current_password: "Contraseña actual",
  full_name: "Nombre",
};

function errorMessage(status, body) {
  if (body?.detail && typeof body.detail === "string") return body.detail;
  if (Array.isArray(body?.detail) && body.detail.length) {
    // Errores de validación de FastAPI/Pydantic: se muestra el primero de forma legible
    const first = body.detail[0];
    const field = FIELD_NAMES[first.loc?.[first.loc.length - 1]] ?? null;
    let msg = String(first.msg ?? "Dato inválido").replace(/^Value error, /, "");
    if (/valid email/i.test(msg)) msg = "no es un correo válido";
    if (/at least (\d+) character/i.test(msg)) msg = `debe tener al menos ${msg.match(/(\d+)/)[1]} caracteres`;
    return field ? `${field}: ${msg}` : msg;
  }
  if (status === 0) return "No pudimos conectar con el servidor. Revisa tu conexión.";
  if (status === 429) return "Demasiados intentos. Espera un momento e intenta de nuevo.";
  if (status >= 500) return "Tuvimos un problema en el servidor. Intenta de nuevo en un momento.";
  return "Ocurrió un error inesperado.";
}

async function request(path, { method = "GET", body, form, signal } = {}) {
  const headers = { Accept: "application/json" };
  let payload;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form);
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(errorMessage(0), 0);
  }

  if (response.status === 401 && authToken && onUnauthorized) onUnauthorized();
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(errorMessage(response.status, data), response.status, data);
  return data;
}

export const api = {
  // Búsqueda
  search: (payload, opts) => request("/search", { method: "POST", body: payload, ...opts }),
  recommendations: (payload, opts) => request("/recommendations", { method: "POST", body: payload, ...opts }),
  // Catálogo
  establishment: (slug, opts) => request(`/establishments/${encodeURIComponent(slug)}`, opts),
  categories: (opts) => request("/categories", opts),
  places: (params = {}, opts) => request(`/places?${new URLSearchParams(params)}`, opts),
  // Cuenta
  login: (email, password) => request("/auth/login", { method: "POST", form: { username: email, password } }),
  register: (data) => request("/auth/register", { method: "POST", body: data }),
  me: (opts) => request("/auth/me", opts),
  updateMe: (data) => request("/auth/me", { method: "PATCH", body: data }),
  changePassword: (data) => request("/auth/change-password", { method: "POST", body: data }),
  // Favoritos e historial (del usuario con sesión)
  favorites: (opts) => request("/me/favorites", opts),
  favoriteIds: (opts) => request("/me/favorites/ids", opts),
  addFavorite: (id) => request(`/me/favorites/${id}`, { method: "PUT" }),
  removeFavorite: (id) => request(`/me/favorites/${id}`, { method: "DELETE" }),
  history: (params = {}, opts) => request(`/me/history?${new URLSearchParams(params)}`, opts),
  deleteHistoryItem: (id) => request(`/me/history/${id}`, { method: "DELETE" }),
  clearHistory: () => request("/me/history", { method: "DELETE" }),
  // Reseñas
  reviews: (establishmentId, params = {}, opts) =>
    request(`/establishments/${establishmentId}/reviews?${new URLSearchParams(params)}`, opts),
  myReview: (establishmentId, opts) => request(`/establishments/${establishmentId}/reviews/mine`, opts),
  createReview: (establishmentId, data) =>
    request(`/establishments/${establishmentId}/reviews`, { method: "POST", body: data }),
  updateReview: (id, data) => request(`/reviews/${id}`, { method: "PATCH", body: data }),
  deleteReview: (id) => request(`/reviews/${id}`, { method: "DELETE" }),
  reportReview: (id, data = {}) => request(`/reviews/${id}/report`, { method: "POST", body: data }),
};
