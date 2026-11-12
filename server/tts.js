// Voz do Jarvis: Piper, um sintetizador neural que roda 100% no computador (grátis e offline).
// Na primeira vez baixa o motor (~25 MB) e a voz escolhida (~60 MB) para a pasta de dados.
// Voz própria: coloque o seu modelo Piper (arquivo.onnx + arquivo.onnx.json) na pasta "voices".
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dataDir, getConfig } from "./config.js";

const RELEASE = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/";
const ARCHIVES = {
  "win32-x64": "piper_windows_amd64.zip",
  "linux-x64": "piper_linux_x86_64.tar.gz",
  "linux-arm64": "piper_linux_aarch64.tar.gz",
  "darwin-x64": "piper_macos_x64.tar.gz",
  "darwin-arm64": "piper_macos_aarch64.tar.gz",
};
const VOICES_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/";

export const CATALOG = [
  { id: "pt_BR-faber-medium", lang: "pt", label: "Faber (português, grave)" },
  { id: "pt_BR-edresson-low", lang: "pt", label: "Edresson (português)" },
  { id: "en_GB-alan-medium", lang: "en", label: "Alan (inglês britânico)" },
  { id: "en_US-ryan-high", lang: "en", label: "Ryan (inglês americano)" },
];

const engineDir = () => path.join(dataDir(), "piper");
const engineBin = () => path.join(engineDir(), "piper", process.platform === "win32" ? "piper.exe" : "piper");
export const voicesDir = () => path.join(dataDir(), "voices");
const voiceFile = (id) => path.join(voicesDir(), `${id}.onnx`);
const hasVoice = (id) => fs.existsSync(voiceFile(id)) && fs.existsSync(voiceFile(id) + ".json");

let state = { busy: false, step: "", error: "" };

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`download falhou (${res.status}): ${url}`);
  const tmp = dest + ".part";
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  await fsp.rename(tmp, dest);
}

async function ensureEngine() {
  if (fs.existsSync(engineBin())) return;
  const archive = ARCHIVES[`${process.platform}-${process.arch}`];
  if (!archive) throw new Error("a voz Piper não tem versão para este sistema");
  state.step = "baixando o motor de voz";
  await fsp.mkdir(engineDir(), { recursive: true });
  const file = path.join(engineDir(), archive);
  await download(RELEASE + archive, file);
  // o tar que vem no Windows 10+ também abre .zip
  await new Promise((resolve, reject) =>
    execFile("tar", ["-xf", file, "-C", engineDir()], { windowsHide: true }, (err) => (err ? reject(new Error("não consegui extrair o motor de voz: " + err.message)) : resolve())));
  await fsp.rm(file, { force: true });
  if (process.platform !== "win32") await fsp.chmod(engineBin(), 0o755).catch(() => {});
  if (!fs.existsSync(engineBin())) throw new Error("motor de voz incompleto depois de extrair");
}

async function ensureVoice(id) {
  if (hasVoice(id)) return;
  const m = /^([a-z]{2})_([A-Z]{2})-([a-z0-9_]+)-(x_low|low|medium|high)$/.exec(id);
  if (!m) throw new Error(`voz "${id}" não encontrada na pasta de vozes`);
  state.step = `baixando a voz ${id}`;
  await fsp.mkdir(voicesDir(), { recursive: true });
  const base = `${VOICES_URL}${m[1]}/${m[1]}_${m[2]}/${m[3]}/${m[4]}/${id}.onnx`;
  await download(base + ".json", voiceFile(id) + ".json");
  await download(base, voiceFile(id));
}

let setupPromise = null;
/** Baixa o que faltar (motor + vozes configuradas). Pode ser chamado várias vezes. */
export function setup() {
  setupPromise ??= (async () => {
    state = { busy: true, step: "", error: "" };
    try {
      await ensureEngine();
      const { voice } = getConfig();
      await ensureVoice(voice.pt);
      await ensureVoice(voice.en).catch(() => {}); // inglês é opcional
      state = { busy: false, step: "", error: "" };
    } catch (err) {
      state = { busy: false, step: "", error: String(err.message || err) };
      throw err;
    } finally { setupPromise = null; }
  })();
  return setupPromise;
}

export function installedVoices() {
  try {
    return fs.readdirSync(voicesDir()).filter((f) => f.endsWith(".onnx") && fs.existsSync(path.join(voicesDir(), f + ".json")))
      .map((f) => f.slice(0, -5));
  } catch { return []; }
}

export function status() {
  const { voice } = getConfig();
  return {
    ready: fs.existsSync(engineBin()) && hasVoice(voice.pt),
    supported: Boolean(ARCHIVES[`${process.platform}-${process.arch}`]),
    ...state, voice, installed: installedVoices(), catalog: CATALOG, voicesDir: voicesDir(),
  };
}

let counter = 0;
/** Texto -> áudio WAV (Buffer) */
export async function synth(text, lang = "pt") {
  const { voice } = getConfig();
  let id = lang === "en" && hasVoice(voice.en) ? voice.en : voice.pt;
  if (!fs.existsSync(engineBin()) || !hasVoice(id)) throw new Error("voz ainda não instalada");
  const out = path.join(os.tmpdir(), `jarvis-tts-${process.pid}-${++counter}.wav`);
  const speed = Math.max(0.6, Math.min(1.6, Number(voice.speed) || 1));
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(engineBin(), ["--model", voiceFile(id), "--output_file", out, "--length_scale", String(Math.round(100 / speed) / 100)],
        { windowsHide: true, cwd: path.dirname(engineBin()) });
      let err = "";
      child.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error("piper falhou: " + err.trim().split("\n").pop()))));
      child.stdin.on("error", () => {});
      child.stdin.end(String(text).replace(/\s+/g, " ").trim() + "\n");
    });
    return await fsp.readFile(out);
  } finally {
    fsp.rm(out, { force: true }).catch(() => {});
  }
}
