// Configuração e memória do Jarvis. Tudo fica salvo só no seu computador (pasta de dados).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const dataDir = () => process.env.JARVIS_DATA_DIR || path.join(process.cwd(), "data");
const file = (name) => path.join(dataDir(), name);

export function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), "utf8")); } catch { return fallback; }
}
export function writeJson(name, value) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(value, null, 2), { mode: 0o600 });
}

const DEFAULTS = {
  name: "Jarvis",          // nome do assistente (também é a palavra de ativação)
  title: "senhor",         // como ele chama você
  voice: { pt: "pt_BR-faber-medium", en: "en_GB-alan-medium", speed: 1.0, effect: true },
  extraDirs: [],           // pastas liberadas além das padrão
  instagram: { token: "" },
};

let cache = null;
export function getConfig() {
  if (!cache) {
    const saved = readJson("jarvis.json", {});
    cache = {
      ...DEFAULTS, ...saved,
      voice: { ...DEFAULTS.voice, ...saved.voice },
      instagram: { ...DEFAULTS.instagram, ...saved.instagram },
    };
  }
  return cache;
}
export function saveConfig(patch) {
  const cur = getConfig();
  cache = {
    ...cur, ...patch,
    voice: { ...cur.voice, ...patch.voice },
    instagram: { ...cur.instagram, ...patch.instagram },
  };
  writeJson("jarvis.json", cache);
  return cache;
}

// ---------- pastas que o Jarvis pode mexer ----------
// No app desktop o Electron informa as pastas reais (mesmo quando o Windows as move para o OneDrive).
function homeDirs() {
  try {
    const fromApp = JSON.parse(process.env.JARVIS_HOME_DIRS || "null");
    if (fromApp && typeof fromApp === "object") return fromApp;
  } catch {}
  const h = os.homedir();
  return {
    desktop: path.join(h, "Desktop"), documents: path.join(h, "Documents"), downloads: path.join(h, "Downloads"),
    pictures: path.join(h, "Pictures"), videos: path.join(h, "Videos"), music: path.join(h, "Music"),
  };
}
export function knownDirs() {
  const out = {};
  // a pasta do usuário inteira nunca entra (alguns sistemas devolvem ela quando "Vídeos" etc. não existem)
  for (const [k, v] of Object.entries(homeDirs())) {
    if (typeof v === "string" && path.resolve(v) !== path.resolve(os.homedir()) && fs.existsSync(v)) out[k] = v;
  }
  return out;
}
export function allowedDirs() {
  const extra = getConfig().extraDirs.filter((d) => typeof d === "string" && path.isAbsolute(d) && fs.existsSync(d));
  return [...new Set([...Object.values(knownDirs()), ...extra])];
}

// ---------- memória de longo prazo ----------
// Fatos que o usuário pediu para lembrar (perfil do canal, preferências...). Entram no prompt.
export const getMemory = () => readJson("memory.json", []);
export function remember(text) {
  const list = getMemory();
  const item = { id: Math.random().toString(36).slice(2, 8), text: String(text).trim().slice(0, 1000), at: Date.now() };
  list.push(item);
  writeJson("memory.json", list.slice(-200));
  return item;
}
export function forget(id) {
  const list = getMemory();
  const next = list.filter((m) => m.id !== id);
  writeJson("memory.json", next);
  return next.length !== list.length;
}
