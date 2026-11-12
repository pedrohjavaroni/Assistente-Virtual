// Jarvis — servidor local
// Serve a interface e faz a ponte com a API do Claude (respostas transmitidas por Server-Sent Events).
// As ferramentas (controle do PC, vídeo, Instagram, agenda) rodam aqui, no seu computador.
// A chave da API fica só aqui, nunca na interface.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { APP_TOOLS, APP_TOOL_NAMES, MEMORY_TOOLS, CALENDAR_TOOLS, PC_TOOLS, INSTAGRAM_TOOLS, WEB_SEARCH, validateToolInput } from "./tools.js";
import { buildSystemPrompt, turnContext } from "./prompt.js";
import { getConfig, saveConfig, allowedDirs, knownDirs, remember, forget } from "./config.js";
import * as google from "./google.js";
import * as pc from "./pc.js";
import * as tts from "./tts.js";
import * as instagram from "./instagram.js";
import { videoEdit } from "./video.js";

export { setDesktopBridge } from "./pc.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, "..", ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.JARVIS_MODEL || "claude-opus-5-5";
const MAX_ROUNDS = 12;

// Cliente criado sob demanda: no app desktop a chave pode ser definida depois de iniciar
let client = null, clientKey = null;
function getClient() {
  const key = process.env.ANTHROPIC_API_KEY || null;
  if (!client || key !== clientKey) { client = new Anthropic(); clientKey = key; }
  return client;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(here, "..", "public")));
// Whisper (reconhecimento de voz offline) servido localmente
const modules = path.join(here, "..", "node_modules");
app.use("/vendor/transformers", express.static(path.join(modules, "@huggingface", "transformers", "dist")));
app.use("/vendor/ort", express.static(path.join(modules, "onnxruntime-web", "dist")));

// Só o próprio computador controla o PC e mexe nas configurações. Além do endereço de origem,
// confere Host/Origin para que nenhum site aberto no navegador consiga se passar pelo app.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const hostOf = (v) => { try { return new URL(v.includes("://") ? v : `http://${v}`).hostname; } catch { return ""; } };
function isLocal(req) {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) return false;
  if (!LOCAL_HOSTS.has(hostOf(req.headers.host || ""))) return false;
  const origin = req.headers.origin;
  return !origin || LOCAL_HOSTS.has(hostOf(origin));
}
const localOnly = (req, res, next) => (isLocal(req) ? next() : res.status(403).json({ error: "Faça isso no computador onde o Jarvis está rodando." }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY), name: getConfig().name });
});

// ---------- avisos do servidor para a interface (ex: post agendado publicado) ----------
const listeners = new Set();
app.get("/api/events", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(": ok\n\n");
  listeners.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => { clearInterval(ping); listeners.delete(res); });
});
function notify(text) { for (const res of listeners) res.write(`data: ${JSON.stringify({ type: "say", text })}\n\n`); }

// ---------- conversas ----------
// O histórico fica aqui no servidor e só cresce (nunca é editado). O prompt e a lista de
// ferramentas ficam fixos durante a conversa; se algo mudar (ex: Instagram conectado), começa outra.
const sessions = new Map();
function getSession(id, local) {
  const cfg = getConfig();
  const calendar = google.status(), ig = instagram.connected();
  const sig = [local, calendar.connected, ig, cfg.name, cfg.title].join("|");
  const key = `${id}:${local}`;
  let s = sessions.get(key);
  if (!s || s.sig !== sig || Date.now() - s.last > 30 * 60_000 || s.history.length > 80) {
    const custom = [...APP_TOOLS, ...MEMORY_TOOLS, ...(calendar.connected ? CALENDAR_TOOLS : []),
      ...(local ? PC_TOOLS : []), ...(local && ig ? INSTAGRAM_TOOLS : [])];
    s = {
      sig, history: [], busy: false,
      system: buildSystemPrompt({ local, calendar, instagram: ig }),
      tools: [...custom, WEB_SEARCH],
      byName: new Map(custom.map((t) => [t.name, t])),
    };
    sessions.set(key, s);
    for (const [k, v] of sessions) if (Date.now() - v.last > 2 * 3_600_000) sessions.delete(k);
  }
  s.last = Date.now();
  return s;
}

// Ações sem volta só rodam depois de um "sim" do usuário: a primeira chamada registra o pedido,
// e a ferramenta só executa se for chamada de novo, igualzinha, em uma mensagem posterior do usuário.
const pending = new Map();
function confirmed(name, input, requestId) {
  const key = name + JSON.stringify(input);
  const p = pending.get(key);
  if (p && p.requestId !== requestId && Date.now() - p.at < 5 * 60_000) { pending.delete(key); return true; }
  pending.set(key, { requestId, at: Date.now() });
  return false;
}
const NEEDS_CONFIRM = "AGUARDANDO CONFIRMAÇÃO: nada foi executado ainda. Diga ao usuário exatamente o que será feito e pergunte se confirma. " +
  "Só depois que ele responder que sim, chame esta ferramenta de novo com exatamente os mesmos dados.";

const STATUS = {
  open_app: "Abrindo o programa", open_url: "Abrindo o navegador", system_control: "Ajustando o sistema", look_at_screen: "Olhando a tela",
  find_files: "Procurando arquivos", list_folder: "Olhando a pasta", read_file: "Lendo o arquivo", write_file: "Salvando", open_path: "Abrindo",
  video_edit: "Editando o vídeo", instagram_overview: "Consultando o Instagram", instagram_account_insights: "Consultando o Instagram",
  instagram_post_insights: "Consultando o Instagram", instagram_publish: "Preparando a publicação", instagram_scheduled: "Vendo os agendamentos",
  calendar_list_events: "Consultando a agenda", calendar_create_event: "Marcando na agenda", calendar_delete_event: "Atualizando a agenda",
  remember: "Guardando na memória", forget: "Atualizando a memória",
};

/** Executa uma ferramenta do servidor. Retorna o conteúdo do tool_result (texto ou blocos). */
async function runTool(name, input, { tz, requestId, send }) {
  switch (name) {
    case "remember": return { saved: remember(input.fact).id };
    case "forget": return { removed: forget(input.id) };
    case "calendar_list_events": return google.listEvents(input, tz);
    case "calendar_create_event": { const r = await google.createEvent(input, tz); send({ type: "action", name: "calendar_changed", input: {} }); return r; }
    case "calendar_delete_event": {
      if (!confirmed(name, input, requestId)) return NEEDS_CONFIRM;
      const r = await google.deleteEvent(input); send({ type: "action", name: "calendar_changed", input: {} }); return r;
    }
    case "open_app": return pc.openApp(input);
    case "open_url": return pc.openUrl(input);
    case "system_control":
      if (pc.CONFIRM_ACTIONS.has(input.action) && !confirmed(name, input, requestId)) return NEEDS_CONFIRM;
      return pc.systemControl(input);
    case "look_at_screen": {
      const img = await pc.captureForVision();
      return [{ type: "image", source: { type: "base64", ...img } }, { type: "text", text: "Captura da tela do usuário neste momento." }];
    }
    case "find_files": return pc.findFiles(input);
    case "list_folder": return pc.listFolder(input);
    case "read_file": return pc.readFile(input);
    case "write_file": return pc.writeFile(input);
    case "open_path": return pc.openPath(input);
    case "video_edit": return videoEdit(input);
    case "instagram_overview": return instagram.overview(input);
    case "instagram_account_insights": return instagram.accountInsights(input);
    case "instagram_post_insights": return instagram.mediaInsights(input);
    case "instagram_publish": {
      instagram.checkPost(input); // erros de arquivo/legenda aparecem antes de pedir confirmação
      if (input.schedule_at && Number.isNaN(Date.parse(input.schedule_at))) throw new Error("schedule_at inválido");
      if (!confirmed(name, input, requestId)) return NEEDS_CONFIRM;
      if (input.schedule_at) {
        const item = instagram.schedule({ ...input, at: google.localToDate(input.schedule_at, tz) });
        return { scheduled: true, id: item.id, at: new Date(item.at).toISOString() };
      }
      return instagram.publish(input);
    }
    case "instagram_scheduled":
      return input.action === "cancel" ? { cancelled: instagram.cancelScheduled(input.id || "") } : { scheduled: instagram.listScheduled() };
    default: throw new Error("ferramenta desconhecida");
  }
}

/**
 * POST /api/chat
 * body: { text, session, tasks: [...], tz, clientNow }
 * resposta: text/event-stream com eventos
 *   {type:"text", text}            pedaço da fala
 *   {type:"status", text}          o que ele está fazendo (ferramenta em uso)
 *   {type:"action", name, input}   ação para a interface executar (tarefa, lembrete, cartão)
 *   {type:"done"} | {type:"error", message}
 */
let requestCounter = 0;
app.post("/api/chat", async (req, res) => {
  const { text, session: sid = "default", tasks = [], tz: rawTz, clientNow } = req.body ?? {};
  if (typeof text !== "string" || !text.trim() || text.length > 8000) return res.status(400).json({ error: "text obrigatório" });
  const tz = typeof rawTz === "string" && google.validTz(rawTz) ? rawTz : "America/Sao_Paulo";
  const session = getSession(String(sid).slice(0, 64), isLocal(req));
  if (session.busy) return res.status(409).json({ error: "ainda estou respondendo o pedido anterior" });
  session.busy = true;
  const requestId = ++requestCounter;

  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  let aborted = false;
  res.on("close", () => { aborted = true; });
  const send = (event) => { if (!aborted) res.write(`data: ${JSON.stringify(event)}\n\n`); };

  const { history } = session;
  const checkpoint = history.length; // se der erro no meio, a conversa volta para cá
  history.push({ role: "user", content: [{ type: "text", text: turnContext({ clientNow, tz, tasks }) }, { type: "text", text: text.trim() }] });

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const stream = getClient().beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" }, // respostas rápidas: é uma conversa por voz
        cache_control: { type: "ephemeral" },
        system: session.system,
        tools: session.tools,
        messages: history,
      });
      stream.on("text", (delta) => send({ type: "text", text: delta }));
      const message = await stream.finalMessage();
      history.push({ role: "assistant", content: message.content });

      if (message.stop_reason === "refusal") { send({ type: "text", text: "Receio não poder ajudar com isso." }); break; }
      if (message.stop_reason === "pause_turn") continue; // busca na web em andamento: o servidor continua de onde parou
      if (message.stop_reason !== "tool_use") break;

      const results = [];
      for (const block of message.content) {
        if (block.type !== "tool_use") continue;
        const result = { type: "tool_result", tool_use_id: block.id };
        const error = validateToolInput(session.byName.get(block.name), block.input);
        if (error) results.push({ ...result, is_error: true, content: error });
        else if (APP_TOOL_NAMES.has(block.name)) {
          send({ type: "action", name: block.name, input: block.input });
          results.push({ ...result, content: "ok" });
        } else {
          send({ type: "status", text: STATUS[block.name] || "Trabalhando" });
          try {
            const out = await runTool(block.name, block.input, { tz, requestId, send });
            results.push({ ...result, content: typeof out === "string" || Array.isArray(out) ? out : JSON.stringify(out ?? "ok") });
          } catch (err) {
            results.push({ ...result, is_error: true, content: String(err.message || err).slice(0, 1000) });
          }
        }
      }
      history.push({ role: "user", content: results });
    }
    send({ type: "done" });
  } catch (err) {
    console.error(err);
    history.length = checkpoint;
    let message = process.env.ANTHROPIC_API_KEY ? "Erro ao falar com a IA." : "Falta a chave da API do Claude. Coloque em Configurações.";
    if (err instanceof Anthropic.AuthenticationError) message = "Chave da API inválida ou ausente.";
    else if (err instanceof Anthropic.RateLimitError) message = "Muitos pedidos seguidos. Um instante, por favor.";
    else if (err instanceof Anthropic.APIConnectionError) message = "Sem conexão com a API do Claude.";
    else if (err instanceof Anthropic.APIError) message = `Erro da API (${err.status}).`;
    send({ type: "error", message });
  } finally {
    session.busy = false;
    session.last = Date.now();
    res.end();
  }
});

app.post("/api/chat/reset", (req, res) => {
  const id = String(req.body?.session || "default").slice(0, 64);
  for (const key of sessions.keys()) if (key.startsWith(id + ":") && !sessions.get(key).busy) sessions.delete(key);
  res.json({ ok: true });
});

// ---------- voz ----------
app.get("/api/tts/status", (_req, res) => res.json(tts.status()));
app.post("/api/tts/setup", localOnly, (_req, res) => { tts.setup().catch(() => {}); res.json(tts.status()); });
app.post("/api/tts", async (req, res) => {
  const { text, lang } = req.body ?? {};
  if (typeof text !== "string" || !text.trim() || text.length > 3000) return res.status(400).json({ error: "text inválido" });
  try {
    const wav = await tts.synth(text, lang === "en" ? "en" : "pt");
    res.set({ "Content-Type": "audio/wav", "Cache-Control": "no-store" }).send(wav);
  } catch (err) {
    res.status(503).json({ error: String(err.message || err) });
  }
});

// ---------- configurações ----------
const settings = async () => {
  const cfg = getConfig();
  return {
    name: cfg.name, title: cfg.title, voice: cfg.voice, extraDirs: cfg.extraDirs,
    dirs: allowedDirs(), knownDirs: knownDirs(), tts: tts.status(), instagram: await instagram.status(),
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL,
  };
};
app.get("/api/settings", localOnly, async (_req, res) => res.json(await settings()));
app.post("/api/settings", localOnly, async (req, res) => {
  const b = req.body ?? {}, patch = {};
  const word = (v, max) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
  if (b.name !== undefined) { if (!word(b.name, 24)) return res.status(400).json({ error: "nome inválido" }); patch.name = b.name.trim(); }
  if (b.title !== undefined) { if (!word(b.title, 24)) return res.status(400).json({ error: "tratamento inválido" }); patch.title = b.title.trim(); }
  if (b.voice && typeof b.voice === "object") {
    patch.voice = {};
    for (const k of ["pt", "en"]) if (typeof b.voice[k] === "string" && /^[\w-]{3,80}$/.test(b.voice[k])) patch.voice[k] = b.voice[k];
    if (Number.isFinite(b.voice.speed)) patch.voice.speed = Math.max(0.6, Math.min(1.6, b.voice.speed));
    if (typeof b.voice.effect === "boolean") patch.voice.effect = b.voice.effect;
  }
  if (Array.isArray(b.extraDirs)) {
    patch.extraDirs = b.extraDirs.filter((d) => typeof d === "string" && path.isAbsolute(d) && fs.existsSync(d)).slice(0, 20);
  }
  saveConfig(patch);
  if (patch.voice) tts.setup().catch(() => {});
  res.json(await settings());
});

app.post("/api/instagram/connect", localOnly, async (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (token.length < 20) return res.status(400).json({ error: "Token inválido." });
  try { const a = await instagram.connect(token); res.json({ connected: true, username: a.username }); }
  catch (err) { res.status(400).json({ error: String(err.message || err) }); }
});
app.post("/api/instagram/disconnect", localOnly, (_req, res) => { instagram.disconnect(); res.json({ connected: false }); });

// ---------- Google Agenda ----------
app.get("/api/google/status", (req, res) => res.json({ ...google.status(), local: isLocal(req) }));
app.post("/api/google/config", localOnly, (req, res) => {
  const { clientId, clientSecret } = req.body ?? {};
  if (typeof clientId !== "string" || !clientId.includes(".apps.googleusercontent.com") || typeof clientSecret !== "string" || clientSecret.length < 8) {
    return res.status(400).json({ error: "Client ID ou Client Secret inválido." });
  }
  google.saveCredentials({ clientId, clientSecret });
  res.json(google.status());
});
app.post("/api/google/disconnect", localOnly, (_req, res) => { google.disconnect(); res.json(google.status()); });
app.get("/auth/google", localOnly, (req, res) => {
  if (!google.status().configured) return res.status(400).send("Configure o Client ID e o Client Secret primeiro.");
  res.redirect(google.authUrl(`http://127.0.0.1:${req.socket.localPort}/auth/google/callback`));
});
app.get("/auth/google/callback", localOnly, async (req, res) => {
  const page = (title, msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Jarvis</title>
    <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#060a12;color:#dbe7f5;font:16px system-ui;text-align:center">
    <div><h2 style="color:#4fd8ff">${title}</h2><p>${msg}</p></div></body>`;
  const esc = (v) => String(v).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
  if (req.query.error) return res.send(page("Não conectado", "Você cancelou ou o Google recusou: " + esc(req.query.error)));
  try {
    await google.finishAuth(String(req.query.code || ""), String(req.query.state || ""));
    res.send(page("Google Agenda conectada", "Pode fechar esta aba e voltar para o Jarvis."));
  } catch (err) {
    res.status(400).send(page("Não deu certo", esc(err.message)));
  }
});
app.get("/api/google/upcoming", async (req, res) => {
  const tz = google.validTz(String(req.query.tz)) ? String(req.query.tz) : "America/Sao_Paulo";
  if (!google.status().connected) return res.json({ connected: false, events: [] });
  try {
    res.json({ connected: true, events: await google.upcoming(tz, Math.min(Number(req.query.minutes) || 1440, 10080)) });
  } catch (err) {
    res.status(502).json({ connected: google.status().connected, error: String(err.message || err), events: [] });
  }
});

/** Inicia o servidor. Retorna a porta usada. Por segurança, por padrão só atende o próprio computador. */
export function startServer(port = PORT, host = process.env.HOST || "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const used = server.address().port;
      console.log(`Jarvis rodando em http://localhost:${used}`);
      if (!process.env.ANTHROPIC_API_KEY) console.warn("ANTHROPIC_API_KEY não definida: crie um arquivo .env (veja .env.example).");
      instagram.startScheduler(notify);
      if (tts.status().supported && !tts.status().ready) tts.setup().catch((err) => console.warn("voz:", err.message));
      resolve(used);
    });
    server.on("error", reject);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();
