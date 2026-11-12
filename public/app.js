// Jarvis — janela principal: conversa, voz, tarefas, agenda e configurações.
import { Voice, detectLang } from "./voice.js";
import { mountOrb } from "./orb.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) { try { const v = localStorage.getItem("jarvis:" + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem("jarvis:" + key, JSON.stringify(value)); } catch {} },
};
const uid = () => Math.random().toString(36).slice(2, 9);
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
const TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

const desktop = window.jarvisDesktop;                       // ponte do app desktop (Electron)
const bus = "BroadcastChannel" in window ? new BroadcastChannel("jarvis") : null; // conversa com o orbe flutuante
const orb = mountOrb($("orb"));
const sessionId = uid() + uid();

let cfg = { name: "Jarvis", title: "senhor", voice: { effect: true } };
let tasks = store.get("tasks", []);
let reminders = store.get("reminders", []);
let busy = false, listening = false, talking = false;

// ---------- estado visual ----------
function broadcast(msg) { try { bus?.postMessage(msg); } catch {} }
function refreshOrb() {
  const state = listening ? "listening" : talking ? "talking" : busy ? "thinking" : "idle";
  orb.set(state);
  $("micBtn").classList.toggle("on", listening);
  broadcast({ type: "state", state });
}
function hint(text = "") { $("hint").textContent = text; }
function statusLine(text) { $("statusLine").textContent = text; }

function addMsg(kind, text) {
  const el = Object.assign(document.createElement("div"), { className: "msg " + kind, textContent: text });
  $("chat").append(el);
  $("chat").scrollTop = $("chat").scrollHeight;
  return el;
}

// markdown bem simples para os cartões (títulos, listas, negrito)
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function renderMarkdown(src) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  let html = "", inList = false;
  for (const line of String(src).split(/\r?\n/)) {
    const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/), head = line.match(/^#{1,4}\s+(.*)$/);
    if (item) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(item[1])}</li>`; continue; }
    if (inList) { html += "</ul>"; inList = false; }
    if (head) html += `<h4>${inline(head[1])}</h4>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  return html + (inList ? "</ul>" : "");
}
function addCard(title, content) {
  const card = Object.assign(document.createElement("article"), { className: "card" });
  card.innerHTML = `<header><strong></strong><button class="btn small">Copiar</button></header><div class="body"></div>`;
  card.querySelector("strong").textContent = title;
  card.querySelector(".body").innerHTML = renderMarkdown(content);
  const btn = card.querySelector("button");
  btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(content); btn.textContent = "Copiado"; setTimeout(() => { btn.textContent = "Copiar"; }, 1500); } catch {}
  });
  $("chat").append(card);
  $("chat").scrollTop = $("chat").scrollHeight;
  desktop?.showMain?.(); // conteúdo longo: traz a janela para a frente
}

// ---------- voz ----------
const voice = new Voice({
  onListening(on) { listening = on; hint(on ? "Ouvindo…" : ""); refreshOrb(); },
  onInterim(text) { hint(text); },
  onFinal(text) { hint(""); ask(text); },
  onWake() { hint("Pois não?"); chime(); },
  onStatus(s) { if (s === "loading") statusLine("preparando o reconhecimento de voz (só na primeira vez)"); else updateStatusLine(); },
  onError(err) {
    listening = false; refreshOrb();
    addMsg("sys", err === "denied" ? "Sem permissão para usar o microfone." : "Problema no reconhecimento de voz: " + err);
  },
});

// bip curto quando ele ouve o nome
function chime() {
  try {
    const ctx = voice.audio(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.2);
  } catch {}
}

function speakOut(text, lang = "pt") {
  if (!store.get("speak", true)) return;
  voice.effect = cfg.voice?.effect !== false;
  voice.speak(text, lang, {
    onStart() { talking = true; refreshOrb(); },
    onEnd(natural) {
      talking = false; refreshOrb();
      // se ele terminou com uma pergunta, já fica ouvindo a resposta
      if (natural && /\?\s*$/.test(text)) voice.expectReply();
    },
  });
}
function stopSpeaking() { voice.stopSpeaking(); talking = false; refreshOrb(); }

/** Fala e mostra uma mensagem do próprio app (lembretes, avisos). */
function say(text, { speak = true } = {}) {
  addMsg("ai", text);
  broadcast({ type: "say", text });
  if (speak) speakOut(text);
}

function micToggle() {
  if (talking) { stopSpeaking(); return; }
  if (!voice.supported) { addMsg("sys", "Este navegador não tem reconhecimento de voz. No app desktop funciona."); return; }
  voice.toggle();
}
$("micBtn").addEventListener("click", micToggle);
$("orb").addEventListener("click", micToggle);

// ---------- conversa com a IA ----------
function localIsoNow() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  const day = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][d.getDay()];
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())} (${day})`;
}

async function ask(text) {
  text = String(text || "").trim();
  if (!text || busy) return;
  stopSpeaking();
  busy = true; refreshOrb();
  addMsg("me", text);
  broadcast({ type: "say", text: "…" });
  let msgEl = null, reply = "";
  const replyLang = detectLang(text);

  try {
    const res = await fetch("api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, session: sessionId, tasks, tz: TZ, clientNow: localIsoNow() }),
    });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, idx).replace(/^data: /, "");
        buf = buf.slice(idx + 2);
        if (!line || line.startsWith(":")) continue;
        const ev = JSON.parse(line);
        if (ev.type === "text") {
          reply += ev.text;
          msgEl ??= addMsg("ai", "");
          msgEl.textContent = reply.trim();
          hint("");
          $("chat").scrollTop = $("chat").scrollHeight;
        } else if (ev.type === "status") {
          hint(ev.text + "…");
          // o que ele disse antes de usar a ferramenta vira uma fala separada da resposta final
          if (reply.trim()) reply += "\n";
        } else if (ev.type === "action") handleAction(ev.name, ev.input);
        else if (ev.type === "error") { reply = reply || ev.message; (msgEl ??= addMsg("ai", "")).textContent = reply; }
      }
    }
  } catch (err) {
    console.error(err);
    reply = "Não consegui falar com o servidor do Jarvis.";
    (msgEl ??= addMsg("ai", "")).textContent = reply;
  } finally {
    busy = false; hint(""); refreshOrb();
    reply = reply.trim();
    broadcast({ type: "say", text: reply });
    if (reply) speakOut(reply, replyLang);
  }
}

function handleAction(name, input) {
  switch (name) {
    case "add_task": tasks.push({ id: uid(), title: input.title, done: false }); break;
    case "complete_task": { const t = tasks.find((x) => x.id === input.id); if (t) t.done = true; break; }
    case "set_reminder":
      reminders.push({ id: uid(), text: input.text, at: new Date(input.at).getTime(), fired: false });
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      break;
    case "show_card": addCard(input.title, input.content); return;
    case "calendar_changed": refreshCalendar(); return;
    default: return;
  }
  saveLists();
}

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("input").value;
  $("input").value = "";
  ask(text);
});
$("newChatBtn").addEventListener("click", async () => {
  if (busy) return;
  await fetch("api/chat/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: sessionId }) }).catch(() => {});
  $("chat").replaceChildren();
  addMsg("sys", "Nova conversa. A memória permanente continua guardada.");
});

// ---------- tarefas e lembretes ----------
function saveLists() { store.set("tasks", tasks); store.set("reminders", reminders); renderLists(); }

function renderLists() {
  const list = $("taskList");
  list.replaceChildren();
  if (!tasks.length) list.innerHTML = "<li><small>Nenhuma tarefa.</small></li>";
  for (const task of tasks) {
    const li = document.createElement("li");
    li.className = task.done ? "done" : "";
    const cb = Object.assign(document.createElement("input"), { type: "checkbox", checked: task.done });
    cb.addEventListener("change", () => { task.done = cb.checked; saveLists(); });
    const span = Object.assign(document.createElement("span"), { className: "t", textContent: task.title });
    const del = Object.assign(document.createElement("button"), { innerHTML: TRASH, title: "Apagar" });
    del.addEventListener("click", () => { tasks = tasks.filter((x) => x !== task); saveLists(); });
    li.append(cb, span, del);
    list.append(li);
  }
  const rl = $("reminderList");
  rl.replaceChildren();
  const upcoming = reminders.filter((r) => !r.fired).sort((a, b) => a.at - b.at);
  if (!upcoming.length) rl.innerHTML = "<li><small>Nenhum lembrete.</small></li>";
  for (const r of upcoming) {
    const li = document.createElement("li");
    const span = Object.assign(document.createElement("span"), { className: "t", textContent: r.text });
    const when = Object.assign(document.createElement("small"), { textContent: new Date(r.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) });
    const del = Object.assign(document.createElement("button"), { innerHTML: TRASH, title: "Apagar" });
    del.addEventListener("click", () => { reminders = reminders.filter((x) => x !== r); saveLists(); });
    li.append(span, when, del);
    rl.append(li);
  }
}
$("taskForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("taskInput").value.trim();
  if (!title) return;
  tasks.push({ id: uid(), title, done: false });
  $("taskInput").value = "";
  saveLists();
});

function notifyOs(body, tag) {
  if ("Notification" in window && Notification.permission === "granted") { try { new Notification(cfg.name, { body, tag }); } catch {} }
}
function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const r of reminders) {
    if (r.fired || r.at > now) continue;
    r.fired = true; changed = true;
    say(`Lembrete, ${cfg.title}: ${r.text}`);
    notifyOs(r.text, r.id);
  }
  reminders = reminders.filter((r) => !r.fired || now - r.at < 86_400_000);
  if (changed) saveLists();
}

// ---------- gavetas ----------
function openDrawer(id) {
  for (const d of document.querySelectorAll(".drawer")) d.hidden = d.id !== id;
  if (id === "tasksDrawer") { renderLists(); refreshCalendar(); }
  if (id === "settingsDrawer") loadSettings();
}
$("tasksBtn").addEventListener("click", () => openDrawer("tasksDrawer"));
$("settingsBtn").addEventListener("click", () => openDrawer("settingsDrawer"));
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { b.closest(".drawer").hidden = true; }));

// ---------- configurações ----------
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

function updateStatusLine() {
  const bits = [];
  if (store.get("wake", true) && voice.supported) bits.push(`diga “${cfg.name}”`);
  else bits.push("clique no orbe para falar");
  statusLine(bits.join(" · "));
}

function applyConfig(s) {
  cfg = s;
  $("brandName").textContent = s.name.toUpperCase();
  document.title = s.name;
  $("input").placeholder = `Digite ou diga “${s.name}, …”`;
  voice.setName(s.name);
  voice.effect = s.voice.effect !== false;
  updateStatusLine();
}

let ttsPoll = null;
function renderSettings(s) {
  applyConfig(s);
  $("nameInput").value = s.name;
  $("titleInput").value = s.title;
  $("speedInput").value = s.voice.speed;
  $("speedVal").textContent = `${Number(s.voice.speed).toFixed(2)}x`;
  $("effectToggle").checked = s.voice.effect !== false;
  $("voicesDir").textContent = s.tts.voicesDir;

  // vozes: as do catálogo (baixadas sob demanda) + as que você colocou na pasta
  const custom = s.tts.installed.filter((id) => !s.tts.catalog.some((c) => c.id === id));
  for (const [sel, lang] of [[$("voicePt"), "pt"], [$("voiceEn"), "en"]]) {
    sel.replaceChildren();
    const options = [...s.tts.catalog.filter((c) => c.lang === lang).map((c) => [c.id, c.label + (s.tts.installed.includes(c.id) ? "" : " (baixa ao escolher)")]),
      ...custom.map((id) => [id, `${id} (sua voz)`])];
    for (const [id, label] of options) sel.append(new Option(label, id, false, id === s.voice[lang]));
  }
  const t = s.tts;
  $("ttsMsg").className = "muted" + (t.error ? " err" : "");
  $("ttsMsg").textContent = t.error ? "Não consegui instalar a voz: " + t.error
    : t.busy ? `Instalando a voz neural (${t.step || "preparando"})… enquanto isso ele usa a voz do sistema.`
    : t.ready ? "Voz neural local (Piper) instalada. Funciona sem internet."
    : t.supported ? "Voz neural ainda não instalada." : "A voz neural não tem versão para este sistema; usando a voz do sistema.";
  clearTimeout(ttsPoll);
  if (t.busy && !$("settingsDrawer").hidden) ttsPoll = setTimeout(loadSettings, 3000);

  const dl = $("dirList");
  dl.replaceChildren();
  for (const dir of s.dirs) {
    const li = document.createElement("li");
    li.append(Object.assign(document.createElement("span"), { className: "t", textContent: dir }));
    if (s.extraDirs.includes(dir)) {
      const del = Object.assign(document.createElement("button"), { innerHTML: TRASH, title: "Remover" });
      del.addEventListener("click", () => saveSettings({ extraDirs: s.extraDirs.filter((d) => d !== dir) }));
      li.append(del);
    }
    dl.append(li);
  }

  const ig = s.instagram;
  $("igMsg").className = "muted" + (ig.error ? " err" : "");
  $("igMsg").textContent = ig.error ? ig.error
    : ig.connected ? `Conectado como @${ig.username} (${ig.followers ?? "?"} seguidores).`
    : "Para ver métricas e publicar, cole o token da sua conta profissional. Passo a passo: docs/instagram.md. Criar conteúdo funciona sem conectar.";
  $("igForm").hidden = ig.connected && !ig.error;
  $("igDisconnect").hidden = !ig.connected;

  $("keySection").hidden = !desktop;
  $("keyMsg").textContent = s.hasKey ? "Chave salva neste computador. Para trocar, cole a nova." : "É o que liga o Jarvis à IA. Crie em console.anthropic.com; ela fica salva só neste computador.";
}

async function loadSettings() {
  try {
    const res = await fetch("api/settings");
    if (!res.ok) throw new Error();
    renderSettings(await res.json());
  } catch { /* acesso remoto: sem configurações */ }
  refreshCalendar();
}
async function saveSettings(patch) {
  const res = await post("api/settings", patch);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { addMsg("sys", body.error || "Não consegui salvar."); return; }
  renderSettings(body);
}

$("nameInput").addEventListener("change", (e) => saveSettings({ name: e.target.value }));
$("titleInput").addEventListener("change", (e) => saveSettings({ title: e.target.value }));
$("voicePt").addEventListener("change", (e) => saveSettings({ voice: { pt: e.target.value } }));
$("voiceEn").addEventListener("change", (e) => saveSettings({ voice: { en: e.target.value } }));
$("speedInput").addEventListener("input", (e) => { $("speedVal").textContent = `${Number(e.target.value).toFixed(2)}x`; });
$("speedInput").addEventListener("change", (e) => saveSettings({ voice: { speed: Number(e.target.value) } }));
$("effectToggle").addEventListener("change", (e) => saveSettings({ voice: { effect: e.target.checked } }));
$("testVoice").addEventListener("click", () => {
  const was = store.get("speak", true);
  store.set("speak", true);
  speakOut(`Todos os sistemas operacionais, ${cfg.title}. Às suas ordens.`);
  store.set("speak", was);
});

$("wakeToggle").checked = store.get("wake", true);
$("wakeToggle").addEventListener("change", (e) => {
  if (e.target.checked && !voice.supported) { e.target.checked = false; addMsg("sys", "Reconhecimento de voz indisponível aqui."); return; }
  store.set("wake", e.target.checked);
  voice.setWakeMode(e.target.checked);
  updateStatusLine();
});
$("speakToggle").checked = store.get("speak", true);
$("speakToggle").addEventListener("change", (e) => { store.set("speak", e.target.checked); if (!e.target.checked) stopSpeaking(); });

$("dirForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  let dir = $("dirInput").value.trim();
  if (!dir && desktop?.pickFolder) dir = await desktop.pickFolder();
  if (!dir) return;
  $("dirInput").value = "";
  await saveSettings({ extraDirs: [...new Set([...(cfg.extraDirs || []), dir])] });
  if (!cfg.dirs?.includes(dir)) addMsg("sys", "Não encontrei essa pasta. Confira o caminho.");
});

$("igForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = $("igInput").value.trim();
  if (!token) return;
  $("igMsg").textContent = "Conectando…";
  const res = await post("api/instagram/connect", { token });
  const body = await res.json().catch(() => ({}));
  $("igInput").value = "";
  if (!res.ok) { $("igMsg").className = "muted err"; $("igMsg").textContent = body.error || "Não consegui conectar."; return; }
  loadSettings();
});
$("igDisconnect").addEventListener("click", async () => { await post("api/instagram/disconnect"); loadSettings(); });

if (desktop) {
  $("autostartRow").hidden = false;
  $("orbRow").hidden = false;
  desktop.info().then((info) => {
    $("autostartToggle").checked = info.autostart;
    $("autostartRow").hidden = !info.canAutostart;
    $("orbToggle").checked = info.orb;
    if (!info.hasKey) { openDrawer("settingsDrawer"); desktop.showMain(); addMsg("sys", "Falta a chave da API do Claude: coloque em Configurações."); }
  });
  $("autostartToggle").addEventListener("change", (e) => desktop.setAutostart(e.target.checked));
  $("orbToggle").addEventListener("change", (e) => desktop.setOrb(e.target.checked));
  $("keyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = $("keyInput").value.trim();
    if (!key) return;
    await desktop.setApiKey(key);
    $("keyInput").value = "";
    addMsg("sys", "Chave salva.");
    loadSettings();
  });
  desktop.onHotkey?.(() => micToggle());
}

// ---------- Google Agenda ----------
let gcal = { connected: false }, gcalEvents = [];
const alerted = store.get("gcalAlerted", {});

async function refreshCalendar() {
  try { gcal = await (await fetch("api/google/status")).json(); } catch { return; }
  $("gcalConfig").hidden = !(gcal.local && !gcal.configured);
  $("gcalConnect").hidden = !(gcal.local && gcal.configured && !gcal.connected);
  $("gcalDisconnect").hidden = !(gcal.local && gcal.connected);
  const msg = gcal.connected ? `Conectada (${gcal.email || "Google"}).`
    : gcal.configured ? "Chave salva. Falta conectar com a sua conta Google."
    : "Para o Jarvis ver e marcar compromissos, crie uma chave grátis no Google (passo a passo em docs/google-agenda.md).";
  $("gcalCfgMsg").textContent = msg;
  $("gcalMsg").textContent = gcal.connected ? "Próximas 24 horas:" : "Não conectada. Conecte em Configurações.";
  await loadEvents();
}
async function loadEvents() {
  const list = $("gcalList");
  list.replaceChildren();
  if (!gcal.connected) { gcalEvents = []; return; }
  try {
    const r = await (await fetch(`api/google/upcoming?minutes=1440&tz=${encodeURIComponent(TZ)}`)).json();
    if (r.error) throw new Error(r.error);
    gcalEvents = r.events;
  } catch { list.innerHTML = "<li><small>Não consegui ler a agenda agora.</small></li>"; return; }
  if (!gcalEvents.length) list.innerHTML = "<li><small>Nada marcado.</small></li>";
  for (const ev of gcalEvents) {
    const li = document.createElement("li");
    li.append(
      Object.assign(document.createElement("span"), { className: "when", textContent: ev.all_day ? "dia" : new Date(ev.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }),
      Object.assign(document.createElement("span"), { className: "t", textContent: ev.title }),
    );
    list.append(li);
  }
}
// avisa uns 10 minutos antes de cada compromisso
function checkCalendarAlerts() {
  const now = Date.now();
  for (const ev of gcalEvents) {
    if (ev.all_day || alerted[ev.id] === ev.startsAt) continue;
    const mins = Math.round((ev.startsAt - now) / 60_000);
    if (mins > 10 || mins < -1) continue;
    alerted[ev.id] = ev.startsAt;
    const text = mins <= 0 ? `${ev.title} está começando agora, ${cfg.title}.` : `${ev.title} começa em ${mins} minutos, ${cfg.title}.`;
    say(text);
    notifyOs(text, ev.id);
  }
  for (const id of Object.keys(alerted)) if (alerted[id] < now - 86_400_000) delete alerted[id];
  store.set("gcalAlerted", alerted);
}
$("gcalConfig").addEventListener("submit", async (e) => {
  e.preventDefault();
  const res = await post("api/google/config", { clientId: $("gcalId").value.trim(), clientSecret: $("gcalSecret").value.trim() });
  if (!res.ok) { addMsg("sys", (await res.json().catch(() => ({}))).error || "Não consegui salvar."); return; }
  $("gcalSecret").value = "";
  refreshCalendar();
});
$("gcalConnect").addEventListener("click", () => {
  window.open("auth/google", "_blank");
  $("gcalCfgMsg").textContent = "Aguardando o login no navegador…";
  let tries = 0;
  const poll = setInterval(async () => {
    tries++;
    await refreshCalendar();
    if (gcal.connected) { clearInterval(poll); say("Google Agenda conectada."); }
    else if (tries > 60) clearInterval(poll);
  }, 3000);
});
$("gcalDisconnect").addEventListener("click", async () => { await post("api/google/disconnect"); refreshCalendar(); });

// ---------- orbe flutuante e avisos do servidor ----------
if (bus) bus.onmessage = ({ data: msg }) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "ask" && typeof msg.text === "string") ask(msg.text);
  else if (msg.type === "mic") micToggle();
  else if (msg.type === "hello") refreshOrb();
};
try {
  const events = new EventSource("api/events");
  events.onmessage = (e) => { try { const ev = JSON.parse(e.data); if (ev.type === "say") say(ev.text); } catch {} };
} catch {}

// ---------- início ----------
async function start() {
  try {
    const res = await fetch("api/settings");
    if (res.ok) applyConfig(await res.json());
    else { const h = await (await fetch("api/health")).json(); applyConfig({ ...cfg, name: h.name || "Jarvis" }); }
  } catch {}
  renderLists();
  refreshCalendar();
  checkReminders();
  setInterval(checkReminders, 15_000);
  setInterval(() => gcal.connected && loadEvents(), 5 * 60_000);
  setInterval(checkCalendarAlerts, 30_000);
  if (store.get("wake", true) && voice.supported && desktop) voice.setWakeMode(true);

  const hour = new Date().getHours();
  const greet = hour < 5 ? "Boa noite" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  // no app desktop ele se apresenta em voz alta assim que o computador liga
  say(`${greet}, ${cfg.title}. Sistemas online.`, { speak: Boolean(desktop) });
}
start();
