const API_BASE = "http://127.0.0.1:8000/api/v1";

function getHeaders() {
  const token = localStorage.getItem("lotoquant_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Erro ao comunicar com o motor LotoQuant.");
  }
  return data;
}

export const api = {
  register: (full_name, email, password) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ full_name, email, password }) }),
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/auth/me"),
  syncModality: (modality, backfill = 50) =>
    request(`/admin/sync/${modality}?backfill=${backfill}`, { method: "POST" }),
  getModalities: () => request("/engine/modalities"),
  getCalibration: (modality) => request(`/engine/calibration/${modality}`),
  getDailyPicks: () => request("/engine/daily-picks"),
  postDrawAudit: (payload) =>
    request("/engine/post-draw-audit", { method: "POST", body: JSON.stringify(payload) }),
  evaluateEv: (payload) =>
    request("/engine/syndicate-ev", { method: "POST", body: JSON.stringify(payload) }),
  generate: (payload) =>
    request("/engine/generate", { method: "POST", body: JSON.stringify(payload) }),
  closing: (payload) =>
    request("/engine/closing", { method: "POST", body: JSON.stringify(payload) }),
  backtest: (modality, numbers) =>
    request("/engine/backtest", { method: "POST", body: JSON.stringify({ modality, numbers }) }),
  upgradePlan: (user_email, plan_tier) =>
    request("/billing/webhook", {
      method: "POST",
      body: JSON.stringify({ event: "PAYMENT_CONFIRMED", user_email, plan_tier }),
    }),
};
