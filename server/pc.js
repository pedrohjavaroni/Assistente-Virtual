// Controle do computador: abrir apps e sites, volume/mídia/energia, arquivos e captura de tela.
// Foco no Windows; macOS e Linux têm suporte básico.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { allowedDirs, knownDirs } from "./config.js";

const WIN = process.platform === "win32", MAC = process.platform === "darwin";

// Ponte com o app desktop (Electron): captura de tela e abrir coisas do jeito nativo.
let bridge = {};
export function setDesktopBridge(b) { bridge = b || {}; }

function run(cmd, args, { timeout = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || "").trim().slice(0, 300) || "falhou"));
      else resolve(stdout);
    });
  });
}
function launch(cmd, args) {
  const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {});
  child.unref();
}
const ps = (script, opts) =>
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8;" + script], opts);

export const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ---------- apps ----------
let appCache = null, appCacheAt = 0;
async function listApps() {
  if (appCache && Date.now() - appCacheAt < 5 * 60_000) return appCache;
  let apps = [];
  if (WIN) {
    // Tudo que aparece no menu Iniciar (programas normais e apps da loja)
    const out = await ps("Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress", { timeout: 30_000 });
    const parsed = JSON.parse(out || "[]");
    apps = (Array.isArray(parsed) ? parsed : [parsed]).map((a) => ({ name: a.Name, id: a.AppID }));
  } else if (MAC) {
    for (const dir of ["/Applications", "/System/Applications", path.join(process.env.HOME || "", "Applications")]) {
      for (const f of await fsp.readdir(dir).catch(() => [])) {
        if (f.endsWith(".app")) apps.push({ name: f.slice(0, -4), id: path.join(dir, f) });
      }
    }
  } else {
    const dirs = ["/usr/share/applications", "/var/lib/flatpak/exports/share/applications",
      path.join(process.env.HOME || "", ".local/share/applications")];
    for (const dir of dirs) {
      for (const f of await fsp.readdir(dir).catch(() => [])) {
        if (!f.endsWith(".desktop")) continue;
        const text = await fsp.readFile(path.join(dir, f), "utf8").catch(() => "");
        const name = text.match(/^Name=(.+)$/m)?.[1];
        if (name && !/^NoDisplay=true/m.test(text)) apps.push({ name, id: f.slice(0, -8) });
      }
    }
  }
  appCache = apps.filter((a) => a.name && a.id);
  appCacheAt = Date.now();
  return appCache;
}

export function matchApp(apps, query) {
  const q = norm(query), words = q.split(/\s+/).filter(Boolean);
  const score = (name) => {
    const n = norm(name), extra = Math.min(n.length - q.length, 40) / 2;
    if (n === q) return 100;
    if (` ${n} `.includes(` ${q} `)) return 80 - extra;   // palavra inteira: "chrome" -> "Google Chrome"
    if (n.includes(q)) return 55 - extra;
    if (words.length > 1 && words.every((w) => n.includes(w))) return 30;
    return 0;
  };
  return apps.map((a) => ({ ...a, score: score(a.name) })).filter((a) => a.score > 0).sort((a, b) => b.score - a.score);
}

export async function openApp({ name }) {
  const apps = await listApps();
  const hits = matchApp(apps, name);
  if (!hits.length) {
    const first = norm(name).split(/\s+/)[0] || "";
    const near = apps.filter((a) => first.length > 2 && norm(a.name).includes(first.slice(0, 4))).slice(0, 8).map((a) => a.name);
    throw new Error(`Não achei um app chamado "${name}" neste computador.` +
      (near.length ? ` Parecidos: ${near.join(", ")}.` : " Se for um serviço online, abra o site com open_url."));
  }
  const app = hits[0];
  if (WIN) launch("explorer.exe", [`shell:AppsFolder\\${app.id}`]);
  else if (MAC) launch("open", ["-a", app.id]);
  else launch("gtk-launch", [app.id]);
  return { opened: app.name };
}

// ---------- sites ----------
export async function openUrl({ url }) {
  let u;
  try { u = new URL(url); } catch { throw new Error("URL inválida"); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Só abro endereços http/https");
  if (bridge.openExternal) await bridge.openExternal(u.href);
  else if (WIN) launch("rundll32.exe", ["url.dll,FileProtocolHandler", u.href]);
  else launch(MAC ? "open" : "xdg-open", [u.href]);
  return { opened: u.href };
}

// ---------- volume, mídia, energia ----------
const VK = { volume_mute: 0xad, volume_down: 0xae, volume_up: 0xaf, next_track: 0xb0, previous_track: 0xb1, play_pause: 0xb3 };
const winKeys = (presses) => ps(
  "$k=Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);' -Name K -Namespace JV -PassThru;" +
  presses.map(([vk, n]) => `for($i=0;$i -lt ${n};$i++){$k::keybd_event(${vk},0,0,[UIntPtr]::Zero);$k::keybd_event(${vk},0,2,[UIntPtr]::Zero)}`).join(";"));

export const CONFIRM_ACTIONS = new Set(["shutdown", "restart"]);

export async function systemControl({ action, value }) {
  const level = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  if (action === "screenshot") return saveScreenshot();
  if (WIN) {
    switch (action) {
      case "volume_up": await winKeys([[VK.volume_up, 5]]); break;           // cada toque = 2%
      case "volume_down": await winKeys([[VK.volume_down, 5]]); break;
      case "volume_set": await winKeys([[VK.volume_down, 50], [VK.volume_up, Math.round(level / 2)]]); break;
      case "mute": await winKeys([[VK.volume_mute, 1]]); break;
      case "play_pause": case "next_track": case "previous_track": await winKeys([[VK[action], 1]]); break;
      case "lock": launch("rundll32.exe", ["user32.dll,LockWorkStation"]); break;
      case "sleep": launch("rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]); break;
      case "shutdown": await run("shutdown", ["/s", "/t", "30"]); return { ok: true, note: "desliga em 30 segundos; cancel_shutdown cancela" };
      case "restart": await run("shutdown", ["/r", "/t", "30"]); return { ok: true, note: "reinicia em 30 segundos; cancel_shutdown cancela" };
      case "cancel_shutdown": await run("shutdown", ["/a"]); break;
      default: throw new Error("ação desconhecida");
    }
    return { ok: true };
  }
  if (MAC) {
    const osa = (s) => run("osascript", ["-e", s]);
    switch (action) {
      case "volume_up": await osa("set volume output volume ((output volume of (get volume settings)) + 10)"); break;
      case "volume_down": await osa("set volume output volume ((output volume of (get volume settings)) - 10)"); break;
      case "volume_set": await osa(`set volume output volume ${level}`); break;
      case "mute": await osa("set volume output muted (not (output muted of (get volume settings)))"); break;
      case "lock": await run("pmset", ["displaysleepnow"]); break;
      case "sleep": await run("pmset", ["sleepnow"]); break;
      case "shutdown": await osa('tell application "System Events" to shut down'); break;
      case "restart": await osa('tell application "System Events" to restart'); break;
      default: throw new Error("essa ação ainda não funciona no macOS");
    }
    return { ok: true };
  }
  switch (action) {
    case "volume_up": await run("pactl", ["set-sink-volume", "@DEFAULT_SINK@", "+10%"]); break;
    case "volume_down": await run("pactl", ["set-sink-volume", "@DEFAULT_SINK@", "-10%"]); break;
    case "volume_set": await run("pactl", ["set-sink-volume", "@DEFAULT_SINK@", `${level}%`]); break;
    case "mute": await run("pactl", ["set-sink-mute", "@DEFAULT_SINK@", "toggle"]); break;
    case "play_pause": await run("playerctl", ["play-pause"]); break;
    case "next_track": await run("playerctl", ["next"]); break;
    case "previous_track": await run("playerctl", ["previous"]); break;
    case "lock": await run("loginctl", ["lock-session"]); break;
    case "sleep": await run("systemctl", ["suspend"]); break;
    case "shutdown": await run("shutdown", ["-h", "+1"]); return { ok: true, note: "desliga em 1 minuto; cancel_shutdown cancela" };
    case "restart": await run("shutdown", ["-r", "+1"]); return { ok: true, note: "reinicia em 1 minuto; cancel_shutdown cancela" };
    case "cancel_shutdown": await run("shutdown", ["-c"]); break;
    default: throw new Error("ação desconhecida");
  }
  return { ok: true };
}

// ---------- tela ----------
/** Captura a tela para a IA olhar. Retorna { data: base64 JPEG } */
export async function captureForVision() {
  if (!bridge.captureScreen) throw new Error("Ver a tela só funciona no app desktop do Jarvis.");
  const jpeg = await bridge.captureScreen({ maxSize: 1568, format: "jpeg" });
  return { media_type: "image/jpeg", data: jpeg.toString("base64") };
}
async function saveScreenshot() {
  if (!bridge.captureScreen) throw new Error("Captura de tela só funciona no app desktop do Jarvis.");
  const png = await bridge.captureScreen({ format: "png" });
  const dirs = knownDirs();
  const dir = path.join(dirs.pictures || dirs.documents || allowedDirs()[0], "Jarvis");
  await fsp.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "-");
  const file = path.join(dir, `captura-${stamp}.png`);
  await fsp.writeFile(file, png);
  return { saved: file };
}

// ---------- arquivos ----------
const ALIASES = {
  desktop: ["desktop", "area de trabalho"], documents: ["documents", "documentos", "meus documentos"],
  downloads: ["downloads", "baixados"], pictures: ["pictures", "imagens", "fotos"],
  videos: ["videos", "movies", "filmes"], music: ["music", "musicas", "musica"],
};
const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};
const same = (p) => (WIN || MAC ? p.toLowerCase() : p);

/** Resolve um caminho pedido pela IA e garante que fica dentro das pastas liberadas. */
export function resolveSafe(input, { mustExist = true } = {}) {
  let p = String(input || "").trim().replace(/^["']|["']$/g, "");
  if (!p) throw new Error("caminho vazio");
  if (!path.isAbsolute(p)) {
    const parts = p.split(/[\\/]+/), known = knownDirs();
    const alias = Object.keys(ALIASES).find((k) => known[k] && ALIASES[k].includes(norm(parts[0])));
    p = alias ? path.join(known[alias], ...parts.slice(1)) : path.join(known.documents || allowedDirs()[0] || process.cwd(), p);
  }
  p = path.resolve(p);
  // segue atalhos/links da parte que já existe, para ninguém escapar das pastas liberadas
  let real = p, tail = [];
  while (!fs.existsSync(real)) {
    const up = path.dirname(real);
    if (up === real) break;
    tail.unshift(path.basename(real)); real = up;
  }
  try { real = path.join(fs.realpathSync(real), ...tail); } catch { real = p; }
  const roots = allowedDirs().map((r) => { try { return fs.realpathSync(r); } catch { return r; } });
  if (!roots.some((r) => inside(same(real), same(r)))) {
    throw new Error(`"${p}" fica fora das pastas liberadas (${allowedDirs().join("; ")}). O usuário pode liberar outras pastas nas configurações do Jarvis.`);
  }
  if (mustExist && !fs.existsSync(real)) throw new Error(`Não existe: ${p}`);
  return real;
}

const KINDS = {
  video: [".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"],
  image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic"],
  audio: [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"],
  document: [".pdf", ".doc", ".docx", ".txt", ".md", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".odt"],
};
const SKIP = new Set(["node_modules", "AppData", "Library", "$RECYCLE.BIN", "System Volume Information"]);
const describe = (file, st) => ({
  path: file, type: st.isDirectory() ? "pasta" : "arquivo",
  size_mb: st.isDirectory() ? undefined : Math.round(st.size / 10485.76) / 100,
  modified: new Date(st.mtimeMs).toISOString().slice(0, 16),
});

export async function findFiles({ query = "", folder, kind = "any" }) {
  const roots = folder ? [resolveSafe(folder)] : allowedDirs();
  const words = norm(query).split(/\s+/).filter(Boolean), exts = KINDS[kind];
  const found = [], queue = roots.map((r) => ({ dir: r, depth: 0 })), deadline = Date.now() + 4000;
  let visited = 0;
  while (queue.length && visited < 40_000 && Date.now() < deadline) {
    const { dir, depth } = queue.shift();
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      visited++;
      if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name), isDir = e.isDirectory();
      if (isDir && depth < 6) queue.push({ dir: full, depth: depth + 1 });
      const n = norm(e.name);
      if (!words.every((w) => n.includes(w))) continue;
      if (exts ? isDir || !exts.includes(path.extname(n)) : !words.length) continue;
      try { found.push({ full, st: await fsp.stat(full) }); } catch {}
    }
  }
  found.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  return { total: found.length, results: found.slice(0, 15).map((f) => describe(f.full, f.st)), searched: roots };
}

export async function listFolder({ path: p }) {
  const dir = resolveSafe(p);
  const names = (await fsp.readdir(dir)).filter((n) => !n.startsWith("."));
  const items = [];
  for (const n of names.slice(0, 400)) {
    try { items.push({ full: path.join(dir, n), st: await fsp.stat(path.join(dir, n)) }); } catch {}
  }
  items.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  return { folder: dir, total: names.length, items: items.slice(0, 60).map((f) => describe(f.full, f.st)) };
}

export async function readFile({ path: p }) {
  const file = resolveSafe(p);
  const st = await fsp.stat(file);
  if (st.isDirectory()) throw new Error("é uma pasta; use list_folder");
  if (st.size > 200_000) throw new Error("arquivo grande demais para ler (limite de 200 KB de texto)");
  const buf = await fsp.readFile(file);
  if (buf.includes(0)) throw new Error("não é um arquivo de texto");
  return { path: file, content: buf.toString("utf8") };
}

const TEXT_EXT = new Set([".txt", ".md", ".csv", ".srt", ".json", ".html"]);
export async function writeFile({ path: p, content = "", folder = false }) {
  let target = String(p || "").trim();
  // só um nome solto vai para Documentos/Jarvis
  if (!/[\\/]/.test(target)) target = path.join(knownDirs().documents || allowedDirs()[0], "Jarvis", target);
  const file = resolveSafe(target, { mustExist: false });
  if (folder) { await fsp.mkdir(file, { recursive: true }); return { created_folder: file }; }
  if (!TEXT_EXT.has(path.extname(file).toLowerCase())) throw new Error("só crio arquivos de texto: " + [...TEXT_EXT].join(" "));
  await fsp.mkdir(path.dirname(file), { recursive: true });
  try { await fsp.writeFile(file, String(content), { flag: "wx" }); } // nunca sobrescreve
  catch (err) { throw new Error(err.code === "EEXIST" ? "já existe um arquivo com esse nome; escolha outro nome" : err.message); }
  return { created: file };
}

export async function openPath({ path: p, reveal = false }) {
  const file = resolveSafe(p);
  if (reveal && bridge.showItemInFolder) bridge.showItemInFolder(file);
  else if (bridge.openPath) { const err = await bridge.openPath(reveal ? path.dirname(file) : file); if (err) throw new Error(err); }
  else if (WIN) launch("explorer.exe", [reveal ? `/select,${file}` : file]);
  else launch(MAC ? "open" : "xdg-open", [reveal ? path.dirname(file) : file]);
  return { opened: file };
}
