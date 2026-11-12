// Edição de vídeo com ffmpeg: cortar, formato Reels (9:16), juntar, tirar silêncios, velocidade, áudio.
// Nunca altera o arquivo original: sempre cria um arquivo novo na mesma pasta.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolveSafe } from "./pc.js";

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const p = createRequire(import.meta.url)("ffmpeg-static");
    // dentro do instalador o binário fica fora do pacote .asar
    const real = p && p.replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep);
    if (real && fs.existsSync(real)) return real;
  } catch {}
  return "ffmpeg";
}

function ffmpeg(args, { timeout = 30 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", ...args], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => { err = (err + d).slice(-200_000); });
    const timer = setTimeout(() => child.kill(), timeout);
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(e.code === "ENOENT" ? "ffmpeg não está instalado" : e.message)); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, err }); });
  });
}
async function encode(args, out) {
  const { code, err } = await ffmpeg(["-n", ...args, out]);
  if (code !== 0) {
    fs.rm(out, { force: true }, () => {});
    const last = err.trim().split(/\r?\n/).filter((l) => !/^(frame|size)=/.test(l)).slice(-3).join(" | ");
    throw new Error("ffmpeg falhou: " + last.slice(0, 400));
  }
  return out;
}

/** "90", "1:30" ou "0:01:30" -> segundos */
export function parseTime(v) {
  if (typeof v === "number") return v;
  const parts = String(v ?? "").trim().split(":").map(Number);
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) throw new Error(`tempo inválido: ${v}`);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export async function probe(file) {
  const { err } = await ffmpeg(["-i", file]);
  const dur = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const video = err.match(/Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/);
  if (!dur && !video) throw new Error("não consegui ler esse arquivo como vídeo/áudio");
  const rotated = /rotate\s*:\s*(90|270)|rotation of -?(90|270)/.test(err);
  let [w, h] = video ? [Number(video[1]), Number(video[2])] : [0, 0];
  if (rotated) [w, h] = [h, w];
  return {
    duration: dur ? Math.round((Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])) * 100) / 100 : 0,
    width: w, height: h,
    fps: Number(err.match(/([\d.]+) fps/)?.[1]) || 0,
    has_audio: /Stream #.*Audio:/.test(err),
    size_mb: Math.round(fs.statSync(file).size / 10485.76) / 100,
  };
}

function outPath(input, suffix, ext = ".mp4") {
  const dir = path.dirname(input), base = path.basename(input, path.extname(input));
  for (let i = 0; i < 100; i++) {
    const p = path.join(dir, `${base}-${suffix}${i ? `-${i + 1}` : ""}${ext}`);
    if (!fs.existsSync(p)) return p;
  }
  throw new Error("muitos arquivos com o mesmo nome");
}

const X264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
const AAC = ["-c:a", "aac", "-b:a", "160k"];
const atempo = (f) => { const parts = []; while (f > 2) { parts.push("atempo=2"); f /= 2; } while (f < 0.5) { parts.push("atempo=0.5"); f /= 0.5; } parts.push(`atempo=${f}`); return parts.join(","); };

/** Trechos com som, a partir da saída do filtro silencedetect */
export function keepSegments(log, duration, pad = 0.08) {
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const keep = [];
  let cursor = 0;
  starts.forEach((s, i) => {
    if (s + pad - cursor > 0.15) keep.push([cursor, Math.min(duration, s + pad)]);
    cursor = Math.max(0, (ends[i] ?? duration) - pad);
  });
  if (duration - cursor > 0.15) keep.push([cursor, duration]);
  return keep;
}

export async function videoEdit(input) {
  const op = input.operation;
  if (op === "concat") return concat(input);
  const src = resolveSafe(input.input);
  const info = await probe(src);
  switch (op) {
    case "info":
      return { file: src, ...info };
    case "trim": {
      const start = input.start === undefined ? 0 : parseTime(input.start);
      const end = input.end === undefined ? info.duration : parseTime(input.end);
      if (!(end > start)) throw new Error("o fim precisa ser depois do começo");
      const out = await encode(["-ss", String(start), "-i", src, "-t", String(end - start), ...X264, ...AAC], outPath(src, "corte"));
      return { output: out, duration: Math.round((end - start) * 100) / 100 };
    }
    case "vertical": {
      // 1080x1920 para Reels/Stories: "crop" corta as laterais; "blur" mantém tudo com fundo desfocado
      const vf = input.mode === "blur"
        ? "split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1"
        : "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1";
      return { output: await encode(["-i", src, "-vf", vf, ...X264, ...AAC], outPath(src, "reels")) };
    }
    case "speed": {
      const f = Number(input.factor);
      if (!(f >= 0.25 && f <= 4)) throw new Error("factor deve ficar entre 0.25 e 4");
      const args = ["-i", src, "-vf", `setpts=PTS/${f}`, ...X264];
      if (info.has_audio) args.push("-af", atempo(f), ...AAC);
      return { output: await encode(args, outPath(src, `${f}x`)) };
    }
    case "remove_silence": {
      if (!info.has_audio) throw new Error("esse vídeo não tem áudio");
      const { err } = await ffmpeg(["-i", src, "-vn", "-af", "silencedetect=noise=-35dB:d=0.6", "-f", "null", "-"]);
      const keep = keepSegments(err, info.duration);
      const kept = keep.reduce((n, [a, b]) => n + b - a, 0);
      if (info.duration - kept < 0.5) return { note: "não achei pausas para cortar", duration: info.duration };
      if (keep.length > 200) throw new Error("vídeo com pausas demais para cortar de uma vez; corte em partes menores antes");
      const expr = keep.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join("+");
      const out = await encode(["-i", src, "-vf", `select='${expr}',setpts=N/FRAME_RATE/TB`,
        "-af", `aselect='${expr}',asetpts=N/SR/TB`, ...X264, ...AAC], outPath(src, "sem-pausas"));
      return { output: out, duration_before: info.duration, duration_after: Math.round(kept * 100) / 100, cuts: keep.length - 1 };
    }
    case "extract_audio":
      if (!info.has_audio) throw new Error("esse vídeo não tem áudio");
      return { output: await encode(["-i", src, "-vn", "-c:a", "libmp3lame", "-q:a", "2"], outPath(src, "audio", ".mp3")) };
    case "mute":
      return { output: await encode(["-i", src, "-an", "-c:v", "copy"], outPath(src, "mudo", path.extname(src) || ".mp4")) };
    case "compress": {
      const out = await encode(["-i", src, "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k"], outPath(src, "leve"));
      return { output: out, size_mb_before: info.size_mb, size_mb_after: Math.round(fs.statSync(out).size / 10485.76) / 100 };
    }
    default:
      throw new Error("operação desconhecida");
  }
}

async function concat({ inputs }) {
  if (!Array.isArray(inputs) || inputs.length < 2 || inputs.length > 20) throw new Error("inputs deve ter de 2 a 20 vídeos");
  const files = inputs.map((p) => resolveSafe(p));
  const infos = [];
  for (const f of files) infos.push(await probe(f));
  const { width: W, height: H } = infos[0];
  if (!W || !H) throw new Error("o primeiro arquivo não é um vídeo");
  const audio = infos.every((i) => i.has_audio);
  const parts = files.map((_f, i) =>
    `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]` +
    (audio ? `;[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]` : ""));
  const labels = files.map((_f, i) => `[v${i}]${audio ? `[a${i}]` : ""}`).join("");
  const graph = `${parts.join(";")};${labels}concat=n=${files.length}:v=1:a=${audio ? 1 : 0}[v]${audio ? "[a]" : ""}`;
  const args = [...files.flatMap((f) => ["-i", f]), "-filter_complex", graph, "-map", "[v]", ...(audio ? ["-map", "[a]"] : []), ...X264, ...(audio ? AAC : [])];
  const out = await encode(args, outPath(files[0], "juntos"));
  return { output: out, note: audio ? undefined : "um dos vídeos não tinha áudio, então o resultado ficou sem som" };
}
