// Raccoon IA — app do bichinho virtual (roda no navegador, PC e celular)
import { I18N, detectLang } from "./i18n.js";
import { Voice } from "./voice.js";
import { mountRaccoon } from "./raccoon.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem("raccoon:" + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("raccoon:" + key, JSON.stringify(value)); } catch { /* sem storage */ }
  },
};
mountRaccoon($("pet"));

// Canal com o companheiro de tela (app desktop) e com a bolha do Android
const bus = "BroadcastChannel" in window ? new BroadcastChannel("raccoon") : null;
const native = window.RaccoonAndroid;
const desktop = window.raccoonDesktop;
let talking = false;
function broadcast(msg) {
  try { bus?.postMessage(msg); } catch {}
  try { native?.overlayEvent?.(JSON.stringify(msg)); } catch {}
}
function setTalking(on) {
  talking = on;
  $("pet").classList.toggle("talking", on);
  broadcast({ type: "talking", on });
}

const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (n) => Math.max(0, Math.min(100, n));

// ---------- estado ----------
let lang = store.get("lang", navigator.language?.startsWith("pt") ? "pt" : "en");
const t = (key) => I18N[lang][key] ?? key;

const pet = Object.assign(
  { name: "Raccoon", hunger: 80, energy: 80, fun: 80, hygiene: 80, xp: 0, sleeping: false, last: Date.now() },
  store.get("pet", {}),
);
let tasks = store.get("tasks", []);
let reminders = store.get("reminders", []);
let history = store.get("history", []);
let tempMood = null;
let tempMoodTimer = null;
let busy = false;

// Quanto cada status cai por hora (o tempo passa mesmo com o app fechado)
const DECAY = { hunger: 7, energy: 5, fun: 8, hygiene: 4 };

function tick() {
  const now = Date.now();
  const hours = Math.min((now - pet.last) / 3_600_000, 48);
  pet.last = now;
  for (const [k, rate] of Object.entries(DECAY)) {
    if (pet.sleeping && k === "energy") pet.energy = clamp(pet.energy + 25 * hours);
    else pet[k] = clamp(pet[k] - rate * hours * (pet.sleeping ? 0.4 : 1));
  }
  if (pet.sleeping && pet.energy >= 100) { pet.sleeping = false; say(t("wokeUp")); }
  store.set("pet", pet);
  render();
}

function level() { return Math.floor(pet.xp / 100) + 1; }
function addXp(n) {
  const before = level();
  pet.xp += n;
  if (level() > before) { burst("⭐"); say(t("levelUp").replace("{n}", level())); }
}

function currentMood() {
  if (tempMood) return tempMood;
  if (pet.sleeping) return "sleepy";
  const low = Math.min(pet.hunger, pet.fun, pet.hygiene);
  if (low < 25) return "sad";
  if (pet.energy < 20) return "sleepy";
  return "happy";
}

function setTempMood(mood, ms = 4000) {
  tempMood = mood;
  clearTimeout(tempMoodTimer);
  tempMoodTimer = setTimeout(() => { tempMood = null; render(); }, ms);
  render();
}

// ---------- tela ----------
function render() {
  const el = $("pet");
  el.className = el.className.replace(/mood-\w+/g, "").trim() + " mood-" + currentMood();
  el.classList.toggle("dirty", pet.hygiene < 35);
  $("stage").classList.toggle("night", pet.sleeping);
  for (const k of Object.keys(DECAY)) {
    const bar = $("bar-" + k);
    bar.style.width = pet[k] + "%";
    const color = pet[k] > 60 ? "var(--cyan)" : pet[k] > 30 ? "var(--amber)" : "var(--red)";
    bar.style.background = color;
    bar.style.color = color;
  }
  $("level").textContent = `${t("lvl")} ${level()}`;
  document.querySelectorAll(".care button").forEach((b) => {
    b.disabled = pet.sleeping && b.dataset.care !== "sleep";
  });
  document.querySelector('[data-care="sleep"] span').textContent = pet.sleeping ? t("wake_up") : t("sleep");
  const open = tasks.filter((x) => !x.done).length;
  $("taskBadge").hidden = open === 0;
  $("taskBadge").textContent = open;
  broadcast({ type: "state", mood: currentMood(), sleeping: pet.sleeping, dirty: pet.hygiene < 35 });
}

function applyLang() {
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  $("langBtn").textContent = lang.toUpperCase();
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $("input").placeholder = t("placeholder");
  $("taskInput").placeholder = t("newTask");
  voice.setLang(lang);
  render();
}

function addMsg(who, text) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  $("chat").append(div);
  $("chat").scrollTop = $("chat").scrollHeight;
  return div;
}

let bubbleTimer;
function bubble(text, keep = false) {
  const b = $("bubble");
  b.hidden = !text;
  b.textContent = text;
  clearTimeout(bubbleTimer);
  if (!keep && text) bubbleTimer = setTimeout(() => { b.hidden = true; }, 9000);
}

/** Fala do guaxinim: balão + chat + voz */
function say(text, { speak = true } = {}) {
  addMsg("pet", text);
  bubble(text);
  broadcast({ type: "say", text });
  if (speak) speakOut(text);
}

function burst(emoji) {
  const s = document.createElement("span");
  s.textContent = emoji;
  s.style.left = 35 + Math.random() * 30 + "%";
  $("fx").append(s);
  setTimeout(() => s.remove(), 1300);
}

// ---------- cuidados (tamagotchi) ----------
const lastCare = {};
function care(action) {
  if (Date.now() - (lastCare[action] || 0) < 1500) return;
  lastCare[action] = Date.now();
  switch (action) {
    case "feed":
      if (pet.hunger > 95) { say(t("full")); setTempMood("thinking"); return; }
      pet.hunger = clamp(pet.hunger + 25); pet.hygiene = clamp(pet.hygiene - 3);
      burst(["🍕", "🍣", "🌮", "🍔", "🍩"][Math.floor(Math.random() * 5)]);
      setTempMood("excited"); say(t("yum"));
      break;
    case "play":
      if (pet.energy < 15) { say(t("tooTired")); setTempMood("sleepy"); return; }
      pet.fun = clamp(pet.fun + 25); pet.energy = clamp(pet.energy - 10); pet.hunger = clamp(pet.hunger - 5);
      burst("🎮"); setTempMood("cool", 5000); say(t("fun_yay"));
      break;
    case "clean":
      pet.hygiene = 100; burst("🫧"); burst("✨"); setTempMood("cool"); say(t("clean_yay"));
      break;
    case "sleep":
      pet.sleeping = !pet.sleeping;
      say(pet.sleeping ? t("goodnight") : t("wokeUp"));
      break;
  }
  addXp(5);
  store.set("pet", pet);
  render();
}

// Comandos de voz curtos são resolvidos na hora, sem gastar IA
const LOCAL_COMMANDS = [
  ["feed", /\b(aliment\w*|com(e|er|ida)|fome|feed|eat|food|snack|lanche)\b/i],
  ["play", /\b(brinc\w*|jog(ar|o)|play|game|gaming)\b/i],
  ["clean", /\b(banho|limp\w*|lav\w*|clean|bath|wash)\b/i],
  ["sleep", /\b(dorm\w*|sono|nana|sleep|bed|nap|acord\w*|wake)\b/i],
];
function tryLocalCommand(text) {
  if (text.split(/\s+/).length > 5 || text.includes("?")) return false;
  const hit = LOCAL_COMMANDS.find(([, re]) => re.test(text));
  if (!hit) return false;
  if (hit[0] === "sleep" && /acord|wake/i.test(text) && !pet.sleeping) return false;
  addMsg("me", text);
  care(hit[0]);
  return true;
}

$("pet").addEventListener("click", () => {
  if (pet.sleeping) { say(t("shh"), { speak: false }); return; }
  pet.fun = clamp(pet.fun + 3); burst("✨"); setTempMood("love", 2500);
  store.set("pet", pet); render();
});
document.querySelectorAll(".care button").forEach((b) => b.addEventListener("click", () => care(b.dataset.care)));

// ---------- conversa com a IA ----------
async function ask(text) {
  if (busy) return;
  text = text.trim();
  if (!text) return;
  if (tryLocalCommand(text)) return;
  if (pet.sleeping) { pet.sleeping = false; store.set("pet", pet); render(); }

  busy = true;
  addMsg("me", text);
  setTempMood("thinking", 60_000);
  bubble("…", true);
  const msgEl = addMsg("pet", "…");
  const replyLang = detectLang(text, lang);

  // Conversas muito longas recomeçam (o histórico só cresce, nunca é editado)
  if (history.length > 60) history = [];
  const outgoing = [...history, { role: "user", content: text }];
  let reply = "";

  try {
    const res = await fetch("api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: outgoing,
        lang,
        pet: { ...pet, level: level(), clientNow: localIsoNow() },
        tasks,
        tz: TZ,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

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
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === "text") {
          if (!reply) { if (tempMood === "thinking") tempMood = null; setTalking(true); }
          reply += ev.text;
          msgEl.textContent = reply;
          bubble(reply, true);
          $("chat").scrollTop = $("chat").scrollHeight;
        } else if (ev.type === "action") {
          handleAction(ev.name, ev.input);
        } else if (ev.type === "done") {
          history = ev.messages;
          store.set("history", history);
        } else if (ev.type === "error") {
          reply = reply || "😵 " + ev.message;
          msgEl.textContent = reply;
        }
      }
    }
  } catch (err) {
    reply = t("offline");
    msgEl.textContent = reply;
    console.error(err);
  } finally {
    busy = false;
    setTalking(false);
    broadcast({ type: "say", text: reply });
    if (tempMood === "thinking") tempMood = null;
    if (!reply) { reply = "🦝"; msgEl.textContent = reply; }
    bubble(reply);
    render();
    addXp(2);
    store.set("pet", pet);
    speakOut(reply, replyLang);
  }
}

function localIsoNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const days = I18N[lang].days;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())} (${days[d.getDay()]})`;
}

function handleAction(name, input) {
  switch (name) {
    case "add_task":
      tasks.push({ id: uid(), title: input.title, done: false });
      burst("📝");
      break;
    case "complete_task": {
      const task = tasks.find((x) => x.id === input.id);
      if (task && !task.done) { task.done = true; addXp(10); burst("✅"); }
      break;
    }
    case "set_reminder":
      reminders.push({ id: uid(), text: input.text, at: new Date(input.at).getTime(), fired: false });
      askNotifyPermission();
      burst("⏰");
      break;
    case "set_mood":
      setTempMood(input.mood, 5000);
      break;
    case "calendar_busy":
      burst("📅");
      return;
    case "calendar_changed":
      refreshCalendar();
      return;
  }
  saveLists();
}

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("input").value;
  $("input").value = "";
  ask(text);
});

// ---------- voz ----------
const voice = new Voice({
  onListening(on) {
    $("micBtn").classList.toggle("on", on);
    $("pet").classList.toggle("listening", on);
    broadcast({ type: "listening", on });
  },
  onInterim(text) { bubble("🎤 " + text, true); },
  onFinal(text) { ask(text); },
  onWake() { burst("👂"); bubble(t("listening"), true); },
  onError(msg) { addMsg("sys", msg === "denied" ? t("micDenied") : `${t("micError")}: ${msg}`); },
  onStatus(s) { if (s === "loading") addMsg("sys", t("voiceLoading")); if (s === "ready") addMsg("sys", t("voiceReady")); },
});

function speakOut(text, l = lang) {
  if (!$("speakToggle").checked) return;
  voice.speak(text, l, {
    onStart: () => setTalking(true),
    onEnd: () => setTalking(false),
  });
}

$("micBtn").addEventListener("click", () => {
  if (!voice.supported) { addMsg("sys", t("noVoice")); return; }
  askNotifyPermission();
  voice.toggle();
});
$("wakeToggle").checked = store.get("wake", false);
$("wakeToggle").addEventListener("change", (e) => {
  store.set("wake", e.target.checked);
  if (e.target.checked && !voice.supported) { addMsg("sys", t("noVoice")); e.target.checked = false; return; }
  voice.setWakeMode(e.target.checked);
  addMsg("sys", e.target.checked ? t("wakeOn") : t("wakeOff"));
});
$("speakToggle").checked = store.get("speak", true);
$("speakToggle").addEventListener("change", (e) => { store.set("speak", e.target.checked); if (!e.target.checked) voice.stopSpeaking(); });

$("langBtn").addEventListener("click", () => {
  lang = lang === "pt" ? "en" : "pt";
  store.set("lang", lang);
  applyLang();
  say(t("langChanged"));
});

// ---------- tarefas e lembretes ----------
function saveLists() {
  store.set("tasks", tasks);
  store.set("reminders", reminders);
  renderLists();
  render();
}

function renderLists() {
  const list = $("taskList");
  list.replaceChildren();
  if (!tasks.length) list.innerHTML = `<li><small>${t("noTasks")}</small></li>`;
  for (const task of tasks) {
    const li = document.createElement("li");
    li.className = task.done ? "done" : "";
    const cb = Object.assign(document.createElement("input"), { type: "checkbox", checked: task.done });
    cb.addEventListener("change", () => {
      task.done = cb.checked;
      if (task.done) { addXp(10); setTempMood("excited"); bubble(t("taskDone")); }
      saveLists(); store.set("pet", pet);
    });
    const span = Object.assign(document.createElement("span"), { className: "t", textContent: task.title });
    const del = Object.assign(document.createElement("button"), { innerHTML: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>', title: t("delete") });
    del.addEventListener("click", () => { tasks = tasks.filter((x) => x !== task); saveLists(); });
    li.append(cb, span, del);
    list.append(li);
  }

  const rl = $("reminderList");
  rl.replaceChildren();
  const upcoming = reminders.filter((r) => !r.fired).sort((a, b) => a.at - b.at);
  if (!upcoming.length) rl.innerHTML = `<li><small>${t("noReminders")}</small></li>`;
  for (const r of upcoming) {
    const li = document.createElement("li");
    const when = new Date(r.at).toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { dateStyle: "short", timeStyle: "short" });
    li.innerHTML = `<span class="t"></span><small>${when}</small>`;
    li.querySelector(".t").textContent = "⏰ " + r.text;
    const del = Object.assign(document.createElement("button"), { innerHTML: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>' });
    del.addEventListener("click", () => { reminders = reminders.filter((x) => x !== r); saveLists(); });
    li.append(del);
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
$("tasksBtn").addEventListener("click", () => { renderLists(); refreshCalendar(); $("drawer").hidden = false; });
$("closeDrawer").addEventListener("click", () => { $("drawer").hidden = true; });

function askNotifyPermission() {
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
}

function checkReminders() {
  const now = Date.now();
  reminders = store.get("reminders", reminders); // a bolha do Android pode ter disparado algum
  let changed = false;
  for (const r of reminders) {
    if (r.fired || r.at > now) continue;
    r.fired = true;
    changed = true;
    const text = `${t("reminder")}: ${r.text}`;
    say(text);
    setTempMood("excited", 6000);
    if (native?.notify) native.notify(r.text);
    else if ("Notification" in window && Notification.permission === "granted") {
      navigator.serviceWorker?.ready
        .then((reg) => reg.showNotification("Raccoon IA 🦝", { body: r.text, icon: "icons/icon.svg", tag: r.id }))
        .catch(() => new Notification("Raccoon IA 🦝", { body: r.text }));
    }
  }
  // guarda só os lembretes do último dia
  reminders = reminders.filter((r) => !r.fired || now - r.at < 86_400_000);
  if (changed) saveLists();
}

// ---------- companheiro de tela ----------
// Mensagens vindas do guaxinim que anda pela tela (PC) ou da bolha (Android)
function onCompanion(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "care") care(msg.action);
  else if (msg.type === "ask" && typeof msg.text === "string") ask(msg.text);
  else if (msg.type === "mic") $("micBtn").click();
  else if (msg.type === "pet") $("pet").click();
  else if (msg.type === "hello") { render(); broadcast({ type: "talking", on: talking }); }
}
if (bus) bus.onmessage = (e) => onCompanion(e.data);
window.__raccoonFromOverlay = (json) => { try { onCompanion(JSON.parse(json)); } catch {} };

if (desktop || native?.toggleOverlay) {
  document.body.classList.add("is-desktop");
  $("companionBtn").title = t("companion");
  $("companionBtn").addEventListener("click", async () => {
    const on = await (desktop ? desktop.toggleCompanion() : native.toggleOverlay());
    addMsg("sys", on ? t("companionOn") : t("companionOff"));
  });
}

if (desktop) {
  $("settings").hidden = false;
  desktop.info().then((info) => {
    if (!info.hasKey) { renderLists(); $("drawer").hidden = false; addMsg("sys", t("needKey")); }
  });
  $("keyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = $("keyInput").value.trim();
    if (!key) return;
    await desktop.setApiKey(key);
    $("keyInput").value = "";
    addMsg("sys", t("keySaved"));
  });
}

// ---------- Google Agenda ----------
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
let gcal = { connected: false };
let gcalEvents = [];
const alerted = store.get("gcalAlerted", {});

async function refreshCalendar() {
  try {
    gcal = await (await fetch("api/google/status")).json();
  } catch { return; }
  const msg = $("gcalMsg");
  $("gcalConfig").hidden = !(gcal.local && !gcal.configured);
  $("gcalConnect").hidden = !(gcal.local && gcal.configured && !gcal.connected);
  $("gcalDisconnect").hidden = !(gcal.local && gcal.connected);
  if (gcal.connected) msg.textContent = t(gcal.local ? "gcalConnected" : "gcalRemoteOn").replace("{email}", gcal.email || "Google");
  else if (!gcal.local) msg.textContent = t("gcalRemote");
  else msg.textContent = gcal.configured ? t("gcalReady") : t("gcalNeedConfig");
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
  } catch {
    list.innerHTML = `<li><small>${t("gcalError")}</small></li>`;
    return;
  }
  if (!gcalEvents.length) list.innerHTML = `<li><small>${t("gcalEmpty")}</small></li>`;
  for (const ev of gcalEvents) {
    const li = document.createElement("li");
    const when = Object.assign(document.createElement("span"), {
      className: "when",
      textContent: ev.all_day ? "—" : new Date(ev.startsAt).toLocaleTimeString(lang === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit" }),
    });
    const title = Object.assign(document.createElement("span"), { className: "t", textContent: ev.title });
    li.append(when, title);
    list.append(li);
  }
}

// avisa ~10 minutos antes de cada compromisso
function checkCalendarAlerts() {
  const now = Date.now();
  for (const ev of gcalEvents) {
    if (ev.all_day || alerted[ev.id] === ev.startsAt) continue;
    const mins = Math.round((ev.startsAt - now) / 60_000);
    if (mins > 10 || mins < -1) continue;
    alerted[ev.id] = ev.startsAt;
    const text = mins <= 0 ? t("gcalNowEvt").replace("{title}", ev.title) : t("gcalSoon").replace("{n}", mins).replace("{title}", ev.title);
    say("📅 " + text);
    setTempMood("excited", 6000);
    if (native?.notify) native.notify(text);
    else if ("Notification" in window && Notification.permission === "granted") {
      navigator.serviceWorker?.ready.then((reg) => reg.showNotification("Raccoon IA", { body: text, icon: "icons/icon-512.png", tag: ev.id })).catch(() => {});
    }
  }
  for (const id of Object.keys(alerted)) if (alerted[id] < now - 86_400_000) delete alerted[id];
  store.set("gcalAlerted", alerted);
}

$("gcalConfig").addEventListener("submit", async (e) => {
  e.preventDefault();
  const res = await fetch("api/google/config", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: $("gcalId").value.trim(), clientSecret: $("gcalSecret").value.trim() }),
  });
  if (!res.ok) { addMsg("sys", (await res.json().catch(() => ({}))).error || t("gcalError")); return; }
  $("gcalSecret").value = "";
  refreshCalendar();
});
$("gcalConnect").addEventListener("click", () => {
  window.open("auth/google", "_blank");
  $("gcalMsg").textContent = t("gcalWaiting");
  let tries = 0;
  const poll = setInterval(async () => {
    tries++;
    await refreshCalendar();
    if (gcal.connected) { clearInterval(poll); say(t("gcalNow")); }
    else if (tries > 60) clearInterval(poll);
  }, 3000);
});
$("gcalDisconnect").addEventListener("click", async () => {
  await fetch("api/google/disconnect", { method: "POST" });
  refreshCalendar();
});

refreshCalendar();
setInterval(() => gcal.connected && loadEvents(), 5 * 60_000);
setInterval(checkCalendarAlerts, 30_000);

// ---------- início ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

applyLang();
tick();
setInterval(tick, 10_000);
setInterval(checkReminders, 15_000);
checkReminders();
if ($("wakeToggle").checked) voice.setWakeMode(true);

const hour = new Date().getHours();
const greet = hour < 12 ? t("goodMorning") : hour < 18 ? t("goodAfternoon") : t("goodEvening");
setTimeout(() => say(`${greet} ${currentMood() === "sad" ? t("needCare") : t("howHelp")}`, { speak: false }), 400);
