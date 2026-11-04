// Companheiro de tela: o guaxinim que fica por cima das outras janelas.
// No PC roda numa janela transparente do app desktop; no Android, numa bolha flutuante.
import { mountRaccoon } from "./raccoon.js";

const $ = (id) => document.getElementById(id);
const desk = window.raccoonDesktop;   // ponte do Electron (PC)
const droid = window.RaccoonOverlay;  // ponte do Android
const bus = "BroadcastChannel" in window ? new BroadcastChannel("raccoon") : null;
const pet = mountRaccoon($("pet"));
const lang = () => { try { return JSON.parse(localStorage.getItem("raccoon:lang")) || "pt"; } catch { return "pt"; } };

let lastFromApp = 0;
let tempMood = null, tempTimer;
let state = { mood: "happy", sleeping: false, dirty: false };

function toApp(msg) {
  if (bus) bus.postMessage(msg);
  droid?.toApp(JSON.stringify(msg));
}
const appAlive = () => Date.now() - lastFromApp < 40_000;

function render() {
  const mood = tempMood || state.mood;
  pet.className = pet.className.replace(/mood-\w+/g, "").trim() + " mood-" + mood;
  pet.classList.toggle("dirty", Boolean(state.dirty));
}
function setTemp(mood, ms = 3000) {
  tempMood = mood; clearTimeout(tempTimer);
  tempTimer = setTimeout(() => { tempMood = null; render(); }, ms);
  render();
}

// janela cresce só quando há balão/campo de texto (no Android, toques passam pelo resto da tela)
function syncExpanded() {
  const expanded = $("bubble").classList.contains("show") || $("ask").classList.contains("show");
  desk?.bubble(expanded);
  droid?.setExpanded(expanded);
}

let bubbleTimer;
function bubble(text, ms = 9000) {
  const b = $("bubble");
  b.textContent = text;
  b.classList.toggle("show", Boolean(text));
  clearTimeout(bubbleTimer);
  if (text) bubbleTimer = setTimeout(() => { b.classList.remove("show"); syncExpanded(); }, ms);
  syncExpanded();
}

// eventos vindos do app principal
function onEvent(msg) {
  if (!msg || typeof msg !== "object") return;
  lastFromApp = Date.now();
  if (msg.type === "state") { state = msg; render(); }
  else if (msg.type === "say") bubble(msg.text);
  else if (msg.type === "talking") pet.classList.toggle("talking", Boolean(msg.on));
  else if (msg.type === "listening") { pet.classList.toggle("listening", msg.on); $("mic").classList.toggle("on", msg.on); }
}
if (bus) bus.onmessage = (e) => onEvent(e.data);
window.__raccoonEvent = (json) => { try { onEvent(typeof json === "string" ? JSON.parse(json) : json); } catch {} };

// Sem o app aberto (Android com o app fechado): lê o estado salvo e dispara lembretes
function standaloneTick() {
  if (appAlive()) return;
  try {
    const p = JSON.parse(localStorage.getItem("raccoon:pet") || "{}");
    const hours = (Date.now() - (p.last || Date.now())) / 3_600_000;
    const low = Math.min((p.hunger ?? 80) - 7 * hours, (p.fun ?? 80) - 8 * hours, (p.hygiene ?? 80) - 4 * hours);
    state = { mood: p.sleeping ? "sleepy" : low < 25 ? "sad" : "happy", dirty: (p.hygiene ?? 80) - 4 * hours < 35 };
    render();
    const reminders = JSON.parse(localStorage.getItem("raccoon:reminders") || "[]");
    let changed = false;
    for (const r of reminders) {
      if (!r.fired && r.at <= Date.now()) {
        r.fired = true; changed = true;
        bubble("⏰ " + r.text, 30_000);
        setTemp("excited", 6000);
        droid?.notify(r.text);
      }
    }
    if (changed) localStorage.setItem("raccoon:reminders", JSON.stringify(reminders));
  } catch {}
}
setInterval(standaloneTick, 15_000);

// ---------- interação ----------
let downAt = null, moved = false;
pet.addEventListener("pointerdown", (e) => {
  downAt = { x: e.screenX, y: e.screenY, t: Date.now(), touch: e.pointerType === "touch" }; moved = false;
});
window.addEventListener("pointermove", (e) => {
  if (!downAt || moved) return;
  if (Math.hypot(e.screenX - downAt.x, e.screenY - downAt.y) > 6) { moved = true; desk?.dragStart(); }
});
window.addEventListener("pointerup", () => {
  if (!downAt) return;
  if (moved) desk?.dragEnd();
  else { // clique = carinho (no celular também mostra/esconde os botões)
    if (downAt.touch) $("tools").classList.toggle("show");
    setTemp("love", 2500);
    if (appAlive()) toApp({ type: "pet" });
  }
  downAt = null;
});
pet.addEventListener("dblclick", () => openApp());
pet.addEventListener("contextmenu", (e) => { e.preventDefault(); desk?.menu(); });

function openApp() { desk ? desk.openApp() : droid?.openApp(); }
$("open").onclick = openApp;
$("feed").onclick = () => { if (appAlive()) toApp({ type: "care", action: "feed" }); else openApp(); };
$("mic").onclick = () => { if (appAlive()) toApp({ type: "mic" }); else openApp(); };
$("chat").onclick = () => {
  const f = $("ask");
  f.classList.toggle("show");
  $("askInput").placeholder = lang() === "en" ? "Ask anything..." : "Pergunte algo...";
  const open = f.classList.contains("show");
  droid?.setFocusable(open);
  syncExpanded();
  if (open) { desk?.focus(); $("askInput").focus(); }
};
$("ask").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("askInput").value.trim();
  $("askInput").value = "";
  $("ask").classList.remove("show");
  droid?.setFocusable(false);
  syncExpanded();
  if (!text) return;
  if (appAlive()) { toApp({ type: "ask", text }); bubble("…", 60_000); setTemp("thinking", 60_000); }
  else openApp();
});

// No PC: deixa os cliques "atravessarem" as partes transparentes da janela
if (desk) {
  const solid = () => [$("zone"), $("bubble"), $("ask")].filter((el) => el.offsetParent && (el.id === "zone" || el.classList.contains("show")));
  window.addEventListener("mousemove", (e) => {
    const over = solid().some((el) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    desk.setIgnoreMouse(!over);
  });
  desk.onWalk(({ walking, dir }) => {
    pet.classList.toggle("walking", walking);
    $("pet").parentElement.classList.toggle("facing-left", dir < 0);
  });
}
// Android: o app nativo manda andar a bolha
window.__raccoonWalk = (walking, dir) => {
  pet.classList.toggle("walking", Boolean(walking));
  $("pet").parentElement.classList.toggle("facing-left", dir < 0);
};

toApp({ type: "hello" });
standaloneTick();
render();
