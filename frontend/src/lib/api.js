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
  name: "Nombre",
  phone: "Teléfono",
  whatsapp: "WhatsApp",
  website: "Sitio web",
  facebook: "Facebook",
  price: "Precio",
  price_min: "Precio mínimo",
  price_max: "Precio máximo",
  description: "Descripción",
  date: "Fecha",
  code: "Código",
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

async function request(path, { method = "GET", body, form, multipart, signal } = {}) {
  const headers = { Accept: "application/json" };
  let payload;
  if (multipart) {
    // FormData con archivos: el navegador pone el Content-Type con su "boundary"
    payload = multipart;
  } else if (form) {
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
  traffic: (id, coords, opts) => request(`/establishments/${id}/traffic`, { method: "POST", body: coords, ...opts }),
  // Cuenta
  login: (email, password, captchaToken) =>
    request("/auth/login", {
      method: "POST",
      form: { username: email, password, ...(captchaToken ? { captcha_token: captchaToken } : {}) },
    }),
  register: (data) => request("/auth/register", { method: "POST", body: data }),
  captchaConfig: (opts) => request("/auth/captcha-config", opts),
  verifyEmail: (code) => request("/auth/verify-email", { method: "POST", body: { code } }),
  resendCode: () => request("/auth/resend-code", { method: "POST" }),
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
  // Perfiles comerciales
  createClaim: (establishmentId, data) =>
    request(`/establishments/${establishmentId}/claims`, { method: "POST", body: data }),
  myClaims: (opts) => request("/me/claims", opts),
  // Panel comercial (propietario o admin)
  ownerEstablishments: (opts) => request("/owner/establishments", opts),
  ownerEstablishment: (id, opts) => request(`/owner/establishments/${id}`, opts),
  updateEstablishment: (id, data) => request(`/establishments/${id}`, { method: "PATCH", body: data }),
  replaceHours: (id, slots) => request(`/establishments/${id}/hours`, { method: "PUT", body: { slots } }),
  addSpecialHours: (id, data) => request(`/establishments/${id}/special-hours`, { method: "POST", body: data }),
  deleteSpecialHours: (id, specialId) =>
    request(`/establishments/${id}/special-hours/${specialId}`, { method: "DELETE" }),
  addOffering: (id, data) => request(`/establishments/${id}/offerings`, { method: "POST", body: data }),
  updateOffering: (offeringId, data) => request(`/offerings/${offeringId}`, { method: "PATCH", body: data }),
  deleteOffering: (offeringId) => request(`/offerings/${offeringId}`, { method: "DELETE" }),
  uploadPhoto: (id, file, caption) => {
    const data = new FormData();
    data.append("file", file);
    if (caption) data.append("caption", caption);
    return request(`/establishments/${id}/photos`, { method: "POST", multipart: data });
  },
  deletePhoto: (id, photoId) => request(`/establishments/${id}/photos/${photoId}`, { method: "DELETE" }),
  // Panel administrativo (solo admin)
  admin: {
    overview: (opts) => request("/admin/overview", opts),
    reviews: (params, opts) => request(`/admin/reviews?${qs(params)}`, opts),
    approveReview: (id) => request(`/admin/reviews/${id}/approve`, { method: "POST" }),
    rejectReview: (id, reason) => request(`/admin/reviews/${id}/reject`, { method: "POST", body: { reason } }),
    claims: (status, opts) => request(`/admin/claims?${qs({ status })}`, opts),
    approveClaim: (id, note) => request(`/admin/claims/${id}/approve`, { method: "POST", body: { note } }),
    rejectClaim: (id, note) => request(`/admin/claims/${id}/reject`, { method: "POST", body: { note } }),
    establishments: (params, opts) => request(`/admin/establishments?${qs(params)}`, opts),
    updateEstablishment: (id, data) => request(`/admin/establishments/${id}`, { method: "PATCH", body: data }),
    removeOwner: (id) => request(`/admin/establishments/${id}/owner`, { method: "DELETE" }),
    duplicates: (opts) => request("/admin/duplicates", opts),
    dismissDuplicate: (aId, bId) => request("/admin/duplicates/dismiss", { method: "POST", body: { a_id: aId, b_id: bId } }),
    users: (params, opts) => request(`/admin/users?${qs(params)}`, opts),
    updateUser: (id, data) => request(`/admin/users/${id}`, { method: "PATCH", body: data }),
    categories: (opts) => request("/admin/categories", opts),
    searchStats: (days, opts) => request(`/admin/search-stats?${qs({ days })}`, opts),
  },
};

// Parámetros de consulta sin valores vacíos: { q: "", page: 2 } -> "page=2"
function qs(params = {}) {
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return new URLSearchParams(clean).toString();
}
