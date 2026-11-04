// Integração com o Google Agenda (OAuth 2.0 + Calendar API v3), sem bibliotecas extras.
// O token fica salvo só no seu computador (pasta de dados do Raccoon).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];
const API = "https://www.googleapis.com/calendar/v3";

const dataDir = () => process.env.RACCOON_DATA_DIR || path.join(process.cwd(), "data");
const file = (name) => path.join(dataDir(), name);

function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), "utf8")); } catch { return fallback; }
}
function writeJson(name, value) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(value, null, 2), { mode: 0o600 });
}

// ---------- configuração ----------
export function getCredentials() {
  const saved = readJson("google-client.json", {});
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || saved.clientId || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || saved.clientSecret || "",
  };
}
export function saveCredentials({ clientId, clientSecret }) {
  writeJson("google-client.json", { clientId: String(clientId).trim(), clientSecret: String(clientSecret).trim() });
}

let token = null;
const loadToken = () => (token ??= readJson("google-token.json", null));

export function status() {
  const { clientId, clientSecret } = getCredentials();
  const t = loadToken();
  return { configured: Boolean(clientId && clientSecret), connected: Boolean(t?.refresh_token), email: t?.email || null };
}

export function disconnect() {
  const t = loadToken();
  token = null;
  try { fs.unlinkSync(file("google-token.json")); } catch {}
  if (t?.refresh_token) {
    fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(t.refresh_token), { method: "POST" }).catch(() => {});
  }
}

// ---------- OAuth ----------
// Usa um cliente OAuth do tipo "App para computador": o Google aceita o retorno em
// http://127.0.0.1:<porta> sem cadastrar a URL.
const pending = new Map(); // state -> { verifier, redirect }

export function authUrl(redirect) {
  const { clientId } = getCredentials();
  const state = crypto.randomBytes(16).toString("hex");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  pending.set(state, { verifier, redirect });
  setTimeout(() => pending.delete(state), 10 * 60_000);
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + q;
}

export async function finishAuth(code, state) {
  const p = pending.get(state);
  if (!p) throw new Error("Pedido de login expirado. Tente conectar de novo.");
  pending.delete(state);
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: p.redirect, grant_type: "authorization_code", code_verifier: p.verifier,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Falha no login do Google");
  let email = null;
  try {
    const me = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${data.access_token}` } });
    email = (await me.json()).email || null;
  } catch {}
  token = { ...data, email, expires_at: Date.now() + (data.expires_in - 60) * 1000 };
  writeJson("google-token.json", token);
}

async function accessToken() {
  const t = loadToken();
  if (!t?.refresh_token) throw new Error("Google Agenda não conectada");
  if (t.access_token && Date.now() < t.expires_at) return t.access_token;
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === "invalid_grant") disconnect(); // acesso revogado ou expirado
    throw new Error("Não consegui renovar o acesso ao Google Agenda. Conecte de novo.");
  }
  token = { ...t, access_token: data.access_token, expires_at: Date.now() + (data.expires_in - 60) * 1000 };
  writeJson("google-token.json", token);
  return token.access_token;
}

async function api(method, pathname, { query, body } = {}) {
  const url = API + pathname + (query ? "?" + new URLSearchParams(query) : "");
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Google Agenda respondeu ${res.status}`);
  return data;
}

// ---------- fuso horário ----------
// Converte "2026-11-04T18:30" (horário local no fuso tz) para um Date em UTC.
function tzOffsetMs(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}
export function localToDate(local, tz) {
  const naive = Date.parse(String(local).slice(0, 19) + "Z");
  if (Number.isNaN(naive)) throw new Error("data/hora inválida: " + local);
  let guess = naive - tzOffsetMs(new Date(naive), tz);
  guess = naive - tzOffsetMs(new Date(guess), tz); // segunda passada acerta horário de verão
  return new Date(guess);
}
function formatLocal(iso, tz) {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; // dia inteiro
  return new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(" ", "T");
}
export function validTz(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

// ---------- operações ----------
const simplify = (ev, tz) => ({
  id: ev.id,
  title: ev.summary || "(sem título)",
  start: formatLocal(ev.start?.dateTime || ev.start?.date, tz),
  end: formatLocal(ev.end?.dateTime || ev.end?.date, tz),
  all_day: Boolean(ev.start?.date),
  location: ev.location || undefined,
  link: ev.htmlLink,
});

export async function listEvents({ start, end, query }, tz) {
  const data = await api("GET", "/calendars/primary/events", {
    query: {
      timeMin: localToDate(start, tz).toISOString(),
      timeMax: localToDate(end, tz).toISOString(),
      singleEvents: "true", orderBy: "startTime", maxResults: "50", timeZone: tz,
      ...(query ? { q: query } : {}),
    },
  });
  return (data.items || []).map((ev) => simplify(ev, tz));
}

export async function createEvent({ title, start, end, all_day, description, location }, tz) {
  const body = { summary: title, description, location };
  if (all_day) {
    const s = String(start).slice(0, 10);
    let e = String(end || start).slice(0, 10);
    if (e <= s) e = new Date(Date.parse(s + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
    body.start = { date: s };
    body.end = { date: e };
  } else {
    const s = String(start).slice(0, 16);
    const e = end ? String(end).slice(0, 16) : formatLocal(new Date(localToDate(s, tz).getTime() + 3_600_000).toISOString(), tz);
    body.start = { dateTime: s + ":00", timeZone: tz };
    body.end = { dateTime: e.slice(0, 16) + ":00", timeZone: tz };
  }
  return simplify(await api("POST", "/calendars/primary/events", { body }), tz);
}

export async function deleteEvent({ id }) {
  await api("DELETE", `/calendars/primary/events/${encodeURIComponent(id)}`);
  return { deleted: true, id };
}

export async function upcoming(tz, minutes = 24 * 60) {
  const now = Date.now();
  const data = await api("GET", "/calendars/primary/events", {
    query: {
      timeMin: new Date(now).toISOString(), timeMax: new Date(now + minutes * 60_000).toISOString(),
      singleEvents: "true", orderBy: "startTime", maxResults: "20", timeZone: tz,
    },
  });
  return (data.items || []).map((ev) => ({ ...simplify(ev, tz), startsAt: Date.parse(ev.start?.dateTime || ev.start?.date + "T00:00:00") }));
}
