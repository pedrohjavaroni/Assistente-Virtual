// Raccoon IA — servidor
// Serve o app (PWA) e faz a ponte com a API do Claude, transmitindo a resposta
// por Server-Sent Events. A chave da API fica só aqui no servidor, nunca no navegador.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, CALENDAR_TOOLS, SERVER_TOOL_NAMES, validateToolInput } from "./tools.js";
import * as google from "./google.js";
import { buildSystemPrompt } from "./prompt.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, "..", ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.RACCOON_MODEL || "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 5;

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
// Whisper (voz offline do app desktop) servido localmente
const modules = path.join(here, "..", "node_modules");
app.use("/vendor/transformers", express.static(path.join(modules, "@huggingface", "transformers", "dist")));
app.use("/vendor/ort", express.static(path.join(modules, "onnxruntime-web", "dist")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

/**
 * POST /api/chat
 * body: { messages: MessageParam[], lang: "pt"|"en", pet: {...}, tasks: [...] }
 * resposta: text/event-stream com eventos
 *   {type:"text", text}        pedaço da fala do guaxinim
 *   {type:"action", name, input}  ação para o app executar (tarefa, lembrete, humor)
 *   {type:"done", messages}    histórico atualizado (para o próximo turno)
 *   {type:"error", message}
 */
app.post("/api/chat", async (req, res) => {
  const { messages, lang = "pt", pet = {}, tasks = [], tz: rawTz } = req.body ?? {};
  const tz = typeof rawTz === "string" && google.validTz(rawTz) ? rawTz : "America/Sao_Paulo";
  const calendar = google.status();
  const tools = calendar.connected ? [...TOOLS, ...CALENDAR_TOOLS] : TOOLS;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages obrigatório" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  let aborted = false;
  res.on("close", () => { aborted = true; });

  // Histórico só cresce (append-only): mandamos de volta o conteúdo completo
  // de cada resposta, incluindo blocos de thinking, para manter o contexto válido.
  const history = [...messages];
  const system = buildSystemPrompt({ lang, pet, tasks, now: new Date(), tz, calendar });

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS && !aborted; round++) {
      const stream = getClient().beta.messages.stream({
        model: MODEL,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system,
        tools,
        messages: history,
      });

      stream.on("text", (text) => { if (!aborted) send({ type: "text", text }); });
      const message = await stream.finalMessage();
      history.push({ role: "assistant", content: message.content });

      if (message.stop_reason === "refusal") {
        send({
          type: "text",
          text: lang === "en"
            ? "Hmm, I can't help with that one. Let's try something else!"
            : "Hmm, com isso eu não posso ajudar. Vamos tentar outra coisa!",
        });
        break;
      }
      if (message.stop_reason !== "tool_use") break;

      // Executa as ferramentas: o servidor valida e repassa a ação ao app,
      // que guarda as tarefas/lembretes no próprio aparelho.
      const results = [];
      for (const block of message.content) {
        if (block.type !== "tool_use") continue;
        const error = validateToolInput(block.name, block.input);
        if (error) {
          results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: error });
          continue;
        }
        if (SERVER_TOOL_NAMES.has(block.name)) {
          // Google Agenda: executa aqui e devolve o resultado para a IA
          send({ type: "action", name: "calendar_busy", input: {} });
          try {
            const result = await runCalendarTool(block.name, block.input, tz);
            results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
            if (block.name !== "calendar_list_events") send({ type: "action", name: "calendar_changed", input: {} });
          } catch (err) {
            results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: String(err.message || err) });
          }
          continue;
        }
        send({ type: "action", name: block.name, input: block.input });
        results.push({ type: "tool_result", tool_use_id: block.id, content: "ok" });
      }
      history.push({ role: "user", content: results });
    }
    send({ type: "done", messages: history });
  } catch (err) {
    console.error(err);
    let message = process.env.ANTHROPIC_API_KEY ? "Erro ao falar com a IA." : "Falta a ANTHROPIC_API_KEY no arquivo .env do servidor.";
    if (err instanceof Anthropic.AuthenticationError) message = "Chave da API inválida ou ausente (ANTHROPIC_API_KEY).";
    else if (err instanceof Anthropic.RateLimitError) message = "Muitas perguntas seguidas — espere um pouquinho.";
    else if (err instanceof Anthropic.APIConnectionError) message = "Sem conexão com a API do Claude.";
    else if (err instanceof Anthropic.APIError) message = `Erro da API (${err.status}).`;
    send({ type: "error", message });
  } finally {
    res.end();
  }
});

function runCalendarTool(name, input, tz) {
  if (name === "calendar_list_events") return google.listEvents(input, tz);
  if (name === "calendar_create_event") return google.createEvent(input, tz);
  if (name === "calendar_delete_event") return google.deleteEvent(input);
  throw new Error("ferramenta desconhecida");
}

// ---------- Google Agenda ----------
// Configurar e conectar só a partir do próprio computador (o login do Google exige 127.0.0.1)
const isLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
const localOnly = (req, res, next) => (isLocal(req) ? next() : res.status(403).json({ error: "Faça isso no computador onde o Raccoon está rodando." }));

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
  const redirect = `http://127.0.0.1:${req.socket.localPort}/auth/google/callback`;
  res.redirect(google.authUrl(redirect));
});
app.get("/auth/google/callback", localOnly, async (req, res) => {
  const page = (title, msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Raccoon IA</title>
    <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0e17;color:#e9ecf5;font:16px system-ui;text-align:center">
    <div><h2 style="color:#3ef0d0">${title}</h2><p>${msg}</p></div></body>`;
  const esc = (v) => String(v).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
  if (req.query.error) return res.send(page("Não conectado", "Você cancelou ou o Google recusou: " + esc(req.query.error)));
  try {
    await google.finishAuth(String(req.query.code || ""), String(req.query.state || ""));
    res.send(page("Google Agenda conectada ✓", "Pode fechar esta aba e voltar pro Raccoon."));
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

// Mostra o endereço para abrir no celular (com QR code), escolhendo o IP do Wi-Fi
// e deixando de lado placas virtuais (WSL, Docker, VirtualBox, VPN...).
const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|^br-|^veth|vbox|virbr|utun|tailscale|zerotier|loopback/i;
function lanAddresses() {
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const n of addrs ?? []) {
      if (n.family !== "IPv4" || n.internal || n.address.startsWith("169.254.")) continue;
      let score = 0;
      if (n.address.startsWith("192.168.")) score += 3;
      else if (n.address.startsWith("10.")) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(n.address)) score -= 1; // geralmente WSL/Docker
      if (/wi-?fi|wlan|wireless|^en0$|^wl/i.test(name)) score += 2;
      if (VIRTUAL.test(name)) score -= 5;
      list.push({ name, address: n.address, score });
    }
  }
  return list.sort((a, b) => b.score - a.score);
}
async function printPhoneAccess(port) {
  const [best, ...others] = lanAddresses();
  if (!best) { console.log("   (nenhuma rede encontrada: conecte o PC ao Wi-Fi para usar no celular)"); return; }
  const url = `http://${best.address}:${port}`;
  console.log(`\n📱 No celular (mesmo Wi-Fi do PC), abra no navegador:\n\n   ${url}\n`);
  try {
    const { default: qr } = await import("qrcode-terminal");
    qr.generate(url, { small: true }, (code) => console.log(code.replace(/^/gm, "   ")));
    console.log("   ↑ ou aponte a câmera do celular para este QR code\n");
  } catch {}
  if (others.length) console.log(`   Se não abrir, tente: ${others.map((o) => `http://${o.address}:${port}`).join("  ou  ")}`);
  if (process.platform === "win32") {
    console.log("   Windows: se o celular não conectar, libere o Node.js no Firewall (veja docs/celular.md).");
  }
}

/** Inicia o servidor. Retorna a porta usada. */
export function startServer(port = PORT, host = process.env.HOST || "0.0.0.0") {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, async () => {
      const used = server.address().port;
      console.log(`🦝 Raccoon IA rodando em http://localhost:${used}`);
      if (host === "0.0.0.0") await printPhoneAccess(used);
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn("⚠️  ANTHROPIC_API_KEY não definida — crie um arquivo .env (veja .env.example).");
      }
      resolve(used);
    });
    server.on("error", reject);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();
