// Cliente de la API de Easy Search.
// Todas las peticiones van a /api (Vite las reenvía al backend en desarrollo).

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function errorMessage(status, body) {
  if (body?.detail && typeof body.detail === "string") return body.detail;
  if (Array.isArray(body?.detail)) return "Revisa los datos enviados.";
  if (status === 0) return "No pudimos conectar con el servidor. Revisa tu conexión.";
  if (status >= 500) return "Tuvimos un problema en el servidor. Intenta de nuevo en un momento.";
  return "Ocurrió un error inesperado.";
}

async function request(path, { method = "GET", body, token, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(errorMessage(0), 0);
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(errorMessage(response.status, data), response.status, data);
  return data;
}

export const api = {
  search: (payload, opts) => request("/search", { method: "POST", body: payload, ...opts }),
  establishment: (slug, opts) => request(`/establishments/${encodeURIComponent(slug)}`, opts),
  categories: (opts) => request("/categories", opts),
  places: (params = {}, opts) => request(`/places?${new URLSearchParams(params)}`, opts),
};
