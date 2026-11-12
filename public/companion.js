// Orbe flutuante: fica por cima das outras janelas no app desktop.
// Clique = falar · duplo clique = abrir a janela · arrastar = mover · botão direito = menu.
import { mountOrb } from "./orb.js";

const $ = (id) => document.getElementById(id);
const desk = window.argosDesktop;
const bus = "BroadcastChannel" in window ? new BroadcastChannel("argos") : null;
const orb = mountOrb($("orb"));
const toApp = (msg) => bus?.postMessage(msg);

// a janela só "segura" o mouse onde há algo visível; o resto deixa os cliques passarem
function syncExpanded() {
  desk?.bubble($("bubble").classList.contains("show") || $("ask").classList.contains("show"));
}
let bubbleTimer;
function bubble(text, ms = 12_000) {
  const b = $("bubble");
  b.textContent = text;
  b.classList.toggle("show", Boolean(text));
  clearTimeout(bubbleTimer);
  if (text) bubbleTimer = setTimeout(() => { b.classList.remove("show"); syncExpanded(); }, ms);
  syncExpanded();
}

if (bus) bus.onmessage = ({ data: msg }) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "state") orb.set(msg.state);
  else if (msg.type === "say") bubble(msg.text, msg.text === "…" ? 90_000 : 12_000);
};

// clique, duplo clique e arrastar
let down = null, moved = false, clickTimer = null;
$("orb").addEventListener("pointerdown", (e) => { down = { x: e.screenX, y: e.screenY }; moved = false; });
window.addEventListener("pointermove", (e) => {
  if (!down || moved) return;
  if (Math.hypot(e.screenX - down.x, e.screenY - down.y) > 6) { moved = true; desk?.dragStart(); }
});
window.addEventListener("pointerup", () => {
  if (!down) return;
  if (moved) desk?.dragEnd();
  else if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; desk?.showMain(); }
  else clickTimer = setTimeout(() => { clickTimer = null; toApp({ type: "mic" }); }, 260);
  down = null;
});
$("orb").addEventListener("contextmenu", (e) => { e.preventDefault(); desk?.menu(); });
$("open").onclick = () => desk?.showMain();
$("chat").onclick = () => {
  const open = $("ask").classList.toggle("show");
  syncExpanded();
  if (open) { desk?.focus(); $("askInput").focus(); }
};
$("ask").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("askInput").value.trim();
  $("askInput").value = "";
  $("ask").classList.remove("show");
  syncExpanded();
  if (text) toApp({ type: "ask", text });
});

if (desk) {
  const solid = () => [$("zone"), $("bubble"), $("ask")].filter((el) => el.id === "zone" || el.classList.contains("show"));
  window.addEventListener("mousemove", (e) => {
    const over = solid().some((el) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    desk.setIgnoreMouse(!over);
  });
}

toApp({ type: "hello" });
