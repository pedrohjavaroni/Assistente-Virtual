// Instagram pela API oficial da Meta: métricas da conta, desempenho dos posts, publicar e agendar.
// Precisa de conta Profissional (Criador ou Empresa) e de um token gerado no painel da Meta: docs/instagram.md
import fs from "node:fs";
import path from "node:path";
import { getConfig, saveConfig, readJson, writeJson } from "./config.js";
import { resolveSafe } from "./pc.js";

const VERSION = process.env.IG_API_VERSION || "v27.0";
const token = () => process.env.INSTAGRAM_TOKEN || getConfig().instagram.token || "";
// Tokens do "login do Instagram" começam com IG; os do login do Facebook (EAA...) usam o outro servidor
const host = () => (token().startsWith("IG") ? "https://graph.instagram.com" : "https://graph.facebook.com");

export const connected = () => Boolean(token());

async function api(pathname, { method = "GET", params = {} } = {}) {
  if (!token()) throw new Error("Instagram não conectado");
  const url = new URL(`${host()}/${VERSION}/${pathname}`);
  const body = new URLSearchParams({ ...params, access_token: token() });
  if (method === "GET") url.search = body.toString();
  const res = await fetch(url, method === "GET" ? {} : { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    const expired = e.code === 190;
    throw new Error(expired ? "O token do Instagram expirou ou é inválido. Gere outro no painel da Meta e cole nas configurações do Jarvis."
      : `Instagram recusou (${e.code ?? res.status}): ${e.error_user_msg || e.message || "erro desconhecido"}`);
  }
  return json;
}

let me = null;
export async function account() {
  if (me && me.token === token()) return me;
  let info;
  if (token().startsWith("IG")) {
    info = await api("me", { params: { fields: "user_id,username,name,account_type,media_count,followers_count,follows_count" } });
    info.id = info.user_id || info.id;
  } else {
    const pages = await api("me/accounts", { params: { fields: "instagram_business_account{id,username,name,media_count,followers_count,follows_count}" } });
    info = pages.data?.find((p) => p.instagram_business_account)?.instagram_business_account;
    if (!info) throw new Error("Esse token não tem uma conta profissional do Instagram ligada a uma página do Facebook.");
  }
  me = { ...info, token: token() };
  return me;
}

export async function connect(newToken) {
  const prev = getConfig().instagram;
  saveConfig({ instagram: { token: String(newToken).trim(), savedAt: Date.now(), refreshedAt: 0 } });
  me = null;
  try { return await account(); }
  catch (err) { saveConfig({ instagram: prev }); me = null; throw err; }
}
export function disconnect() { saveConfig({ instagram: { token: "", savedAt: 0 } }); me = null; }

export async function status() {
  if (!connected()) return { connected: false };
  try { const a = await account(); return { connected: true, username: a.username, followers: a.followers_count }; }
  catch (err) { return { connected: true, error: String(err.message || err) }; }
}

const short = (s, n = 120) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");

/** Perfil + últimos posts com números básicos */
export async function overview({ limit = 10 } = {}) {
  const a = await account();
  const media = await api(`${a.id}/media`, {
    params: { fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit: Math.max(1, Math.min(25, limit)) },
  });
  return {
    username: a.username, followers: a.followers_count, following: a.follows_count, posts: a.media_count,
    recent: (media.data || []).map((m) => ({
      id: m.id, type: m.media_product_type || m.media_type, date: m.timestamp?.slice(0, 10),
      likes: m.like_count, comments: m.comments_count, caption: short(m.caption), link: m.permalink,
    })),
  };
}

const MEDIA_METRICS = {
  REELS: "reach,views,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time",
  STORY: "reach,views,replies,shares,total_interactions",
  FEED: "reach,views,likes,comments,saved,shares,total_interactions,follows,profile_visits",
};
export async function mediaInsights({ media_id }) {
  const m = await api(String(media_id), { params: { fields: "media_product_type,media_type,caption,permalink,timestamp" } });
  const kind = MEDIA_METRICS[m.media_product_type] ? m.media_product_type : "FEED";
  const res = await api(`${media_id}/insights`, { params: { metric: MEDIA_METRICS[kind] } });
  const metrics = {};
  for (const d of res.data || []) metrics[d.name] = d.values?.[0]?.value ?? d.total_value?.value;
  return { id: media_id, type: kind, date: m.timestamp?.slice(0, 10), caption: short(m.caption), link: m.permalink, metrics };
}

/** Números da conta nos últimos N dias (a Meta pode atrasar os dados em até 48 h) */
export async function accountInsights({ days = 7 } = {}) {
  const a = await account();
  const d = Math.max(1, Math.min(30, Math.round(days)));
  const until = Math.floor(Date.now() / 1000), since = until - d * 86_400;
  const res = await api(`${a.id}/insights`, {
    params: { metric: "reach,views,accounts_engaged,total_interactions,likes,comments,shares,saves", period: "day", metric_type: "total_value", since, until },
  });
  const metrics = {};
  for (const m of res.data || []) metrics[m.name] = m.total_value?.value;
  return { username: a.username, days: d, followers_now: a.followers_count, metrics };
}

// ---------- publicar ----------
const isUrl = (s) => /^https:\/\//i.test(String(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Confere a publicação antes de pedir confirmação ao usuário. Retorna o caminho/URL normalizado. */
export function checkPost({ kind, source, caption = "" }) {
  if (!["image", "reel"].includes(kind)) throw new Error("kind deve ser image ou reel");
  if (caption.length > 2200) throw new Error("legenda passa de 2200 caracteres");
  if (isUrl(source)) return source;
  if (kind === "image") {
    throw new Error("A API do Instagram só aceita foto por link público (https). Para foto que está no computador, " +
      "o usuário precisa subir a imagem em algum lugar público antes, ou postar pelo app do Instagram. Reels do computador funcionam direto.");
  }
  const file = resolveSafe(source);
  if (![".mp4", ".mov"].includes(path.extname(file).toLowerCase())) throw new Error("Reels precisa ser um arquivo .mp4 ou .mov");
  if (fs.statSync(file).size > 300 * 1024 * 1024) throw new Error("vídeo maior que 300 MB");
  return file;
}

export async function publish({ kind, source, caption = "" }) {
  const src = checkPost({ kind, source, caption });
  const a = await account();
  let container;
  if (kind === "image") {
    container = await api(`${a.id}/media`, { method: "POST", params: { image_url: src, caption } });
  } else if (isUrl(src)) {
    container = await api(`${a.id}/media`, { method: "POST", params: { media_type: "REELS", video_url: src, caption } });
  } else {
    // vídeo do computador: envio direto ("resumable upload")
    container = await api(`${a.id}/media`, { method: "POST", params: { media_type: "REELS", upload_type: "resumable", caption } });
    const size = fs.statSync(src).size;
    const up = await fetch(container.uri || `https://rupload.facebook.com/ig-api-upload/${VERSION}/${container.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${token()}`, offset: "0", file_size: String(size), "Content-Length": String(size) },
      body: fs.createReadStream(src), duplex: "half",
    });
    const result = await up.json().catch(() => ({}));
    if (!up.ok || !result.success) throw new Error("envio do vídeo falhou: " + (result.debug_info?.message || result.error?.message || up.status));
  }
  // vídeos são processados pelo Instagram antes de poderem ser publicados
  for (let i = 0; kind === "reel" && i < 60; i++) {
    const st = await api(container.id, { params: { fields: "status_code,status" } });
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") throw new Error("o Instagram não aceitou o vídeo: " + (st.status || st.status_code));
    if (i === 59) throw new Error("o Instagram demorou demais para processar o vídeo");
    await sleep(5000);
  }
  const done = await api(`${a.id}/media_publish`, { method: "POST", params: { creation_id: container.id } });
  const link = await api(done.id, { params: { fields: "permalink" } }).catch(() => ({}));
  return { published: true, id: done.id, link: link.permalink };
}

// ---------- agendamento (o PC precisa estar ligado na hora) ----------
const getQueue = () => readJson("instagram-agenda.json", []);
const saveQueue = (q) => writeJson("instagram-agenda.json", q.slice(-100));

export function schedule({ kind, source, caption = "", at }) {
  const when = new Date(at).getTime();
  if (!Number.isFinite(when) || when < Date.now() + 60_000) throw new Error("a data do agendamento precisa ser no futuro");
  const src = checkPost({ kind, source, caption });
  const item = { id: Math.random().toString(36).slice(2, 8), kind, source: src, caption, at: when, status: "agendado" };
  saveQueue([...getQueue(), item]);
  return item;
}
export const listScheduled = () =>
  getQueue().filter((p) => p.status === "agendado" || Date.now() - p.at < 7 * 86_400_000)
    .map((p) => ({ ...p, caption: short(p.caption, 80), at: new Date(p.at).toISOString() }));
export function cancelScheduled(id) {
  const q = getQueue(), item = q.find((p) => p.id === id && p.status === "agendado");
  if (!item) return false;
  item.status = "cancelado"; saveQueue(q);
  return true;
}

let ticking = false;
async function tick(notify) {
  if (ticking || !connected()) return;
  ticking = true;
  try {
    for (const item of getQueue().filter((p) => p.status === "agendado" && p.at <= Date.now())) {
      const update = (patch) => { const q = getQueue(); Object.assign(q.find((p) => p.id === item.id) || {}, patch); saveQueue(q); };
      if (Date.now() - item.at > 2 * 3_600_000) { // PC estava desligado: não posta com muito atraso
        update({ status: "perdido" });
        notify?.(`Não publiquei o post agendado para ${new Date(item.at).toLocaleString("pt-BR")}: o computador estava desligado na hora.`);
        continue;
      }
      update({ status: "publicando" });
      try {
        const r = await publish(item);
        update({ status: "publicado", link: r.link });
        notify?.("Post agendado publicado no Instagram.");
      } catch (err) {
        update({ status: "erro", error: String(err.message || err) });
        notify?.("Não consegui publicar o post agendado: " + String(err.message || err));
      }
    }
    // tokens do login do Instagram valem 60 dias: renova a cada semana
    const ig = getConfig().instagram;
    if (ig.token?.startsWith("IG") && Date.now() - (ig.refreshedAt || ig.savedAt || 0) > 7 * 86_400_000) {
      saveConfig({ instagram: { refreshedAt: Date.now() } }); // marca antes, para não insistir se falhar
      const url = new URL("https://graph.instagram.com/refresh_access_token");
      url.search = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: ig.token }).toString();
      const json = await (await fetch(url)).json().catch(() => ({}));
      if (json.access_token) saveConfig({ instagram: { token: json.access_token } });
    }
  } catch (err) { console.error("instagram:", err.message); }
  finally { ticking = false; }
}
export function startScheduler(notify) {
  const timer = setInterval(() => tick(notify), 30_000);
  timer.unref?.();
}
