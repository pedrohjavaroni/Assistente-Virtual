// Voz em PT-BR e EN-US.
// Três "motores" de reconhecimento, escolhidos automaticamente:
//   - Android (app nativo): SpeechRecognizer do sistema, via ponte window.RaccoonAndroid
//   - PC (app desktop/Electron): Whisper rodando localmente (o Electron não tem a API de voz do Chrome)
//   - Navegador (Chrome, Edge, Safari): Web Speech API
// A lógica de "Ei Raccoon" e do botão do microfone fica na classe Voice, igual para todos.

const LOCALE = { pt: "pt-BR", en: "en-US" };
// "Raccoon" costuma ser transcrito de vários jeitos
const WAKE = /\b(?:ei|hey|oi|olá|hi|ok)?[\s,]*(?:raccoon|racoon|raccon|racun|rakun|rácun|guaxinim|raccoons?)\b[,.!]?\s*/i;
const isElectron = /Electron/i.test(navigator.userAgent);

// ---------- motor: Web Speech API (navegador) ----------
class WebSpeechEngine {
  static available() {
    return !isElectron && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
  constructor(emit) { this.emit = emit; this.rec = null; }
  start(lang, continuous) {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    try { this.rec?.abort(); } catch {}
    const rec = new R();
    rec.lang = LOCALE[lang];
    rec.interimResults = true;
    rec.continuous = continuous;
    this.rec = rec;
    rec.onstart = () => this.emit("start");
    rec.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
      }
      if (interim) this.emit("interim", interim.trim());
      if (final) this.emit("final", final.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      this.emit("error", e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : e.error);
    };
    rec.onend = () => { if (this.rec === rec) this.emit("end"); };
    try { rec.start(); } catch {}
  }
  stop() { const r = this.rec; this.rec = null; try { r?.stop(); } catch {} this.emit("end"); }
}

// ---------- motor: Android nativo ----------
class AndroidEngine {
  static available() { return Boolean(window.RaccoonAndroid?.startListening); }
  constructor(emit) {
    this.emit = emit;
    window.__raccoonSpeech = (ev) => {
      if (ev.type === "error" && ev.text === "denied") return emit("error", "denied");
      emit(ev.type, ev.text || "");
    };
  }
  start(lang, continuous) { window.RaccoonAndroid.startListening(LOCALE[lang], Boolean(continuous)); }
  stop() { window.RaccoonAndroid.stopListening(); }
}

// ---------- motor: Whisper local (app desktop) ----------
// Grava o microfone, detecta quando você fala (por volume), e transcreve com o
// modelo Whisper em WebAssembly. O modelo (~80 MB) é baixado uma vez e fica em cache.
class WhisperEngine {
  static available() { return isElectron && Boolean(navigator.mediaDevices?.getUserMedia); }
  constructor(emit) { this.emit = emit; this.running = false; this.asr = null; }

  async loadModel() {
    if (this.asr) return this.asr;
    if (!this.loading) {
      this.emit("status", "loading");
      this.loading = import("./vendor/transformers/transformers.min.js").then(async (tf) => {
        tf.env.allowLocalModels = false;
        tf.env.backends.onnx.wasm.wasmPaths = new URL("./vendor/ort/", location.href).href;
        this.asr = await tf.pipeline("automatic-speech-recognition", "onnx-community/whisper-base", { dtype: "q8" });
        this.emit("status", "ready");
        return this.asr;
      });
    }
    return this.loading;
  }

  async start(lang, continuous) {
    this.stop(true);
    this.lang = lang;
    this.continuous = continuous;
    this.running = true;
    try {
      await this.loadModel();
      if (!this.running) return;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      this.running = false;
      this.emit("error", err?.name === "NotAllowedError" ? "denied" : String(err?.message || err));
      return;
    }
    this.ctx = new AudioContext({ sampleRate: 16000 });
    const src = this.ctx.createMediaStreamSource(this.stream);
    const proc = this.ctx.createScriptProcessor(2048, 1, 1);
    this.proc = proc;
    let chunks = [], speaking = false, silentMs = 0, spokenMs = 0, noiseFloor = 0.01;
    const frameMs = (2048 / 16000) * 1000;
    proc.onaudioprocess = (e) => {
      if (!this.running || this.paused) return;
      const data = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      if (!speaking) noiseFloor = noiseFloor * 0.95 + rms * 0.05;
      const loud = rms > Math.max(0.02, noiseFloor * 3);
      if (loud) {
        if (!speaking) { speaking = true; chunks = []; spokenMs = 0; this.emit("interim", "…"); }
        silentMs = 0;
      } else if (speaking) silentMs += frameMs;
      if (speaking) { chunks.push(new Float32Array(data)); spokenMs += frameMs; }
      if (speaking && (silentMs > 800 || spokenMs > 12000)) {
        speaking = false;
        const audio = concat(chunks);
        chunks = [];
        if (spokenMs > 400) this.transcribe(audio);
      }
    };
    src.connect(proc);
    proc.connect(this.ctx.destination);
    this.emit("start");
  }

  async transcribe(audio) {
    this.paused = true;
    try {
      const out = await this.asr(audio, { language: this.lang === "en" ? "english" : "portuguese", task: "transcribe" });
      const text = (out?.text || "").trim();
      // descarta ruído e "alucinações" típicas do Whisper em silêncio
      if (text.replace(/[^\p{L}]/gu, "").length >= 3 && !/^\[.*\]$|^\(.*\)$/.test(text)) this.emit("final", text);
      if (!this.continuous) this.stop();
    } catch (err) {
      this.emit("error", String(err?.message || err));
    } finally {
      this.paused = false;
    }
  }

  stop(silent = false) {
    const wasRunning = this.running;
    this.running = false;
    try { this.proc?.disconnect(); } catch {}
    try { this.ctx?.close(); } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.proc = this.ctx = this.stream = null;
    if (wasRunning && !silent) this.emit("end");
  }
}

function concat(chunks) {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// ---------- fachada usada pelo app ----------
export class Voice {
  constructor(handlers) {
    this.h = handlers;
    const Engine = [AndroidEngine, WhisperEngine, WebSpeechEngine].find((E) => E.available());
    this.supported = Boolean(Engine);
    this.engineName = Engine?.name;
    this.engine = Engine ? new Engine((type, text) => this.onEngine(type, text)) : null;
    this.lang = "pt";
    this.wakeMode = false;
    this.active = false;          // botão do microfone apertado
    this.awaitingCommand = false; // ouviu "Ei Raccoon", esperando o pedido
    this.speaking = false;
    this.voices = [];
    if ("speechSynthesis" in window) {
      const load = () => { this.voices = speechSynthesis.getVoices(); };
      load();
      speechSynthesis.addEventListener?.("voiceschanged", load);
    }
  }

  setLang(lang) {
    this.lang = lang;
    if (this.wakeMode && !this.active) this.engine?.start(lang, true);
  }

  toggle() {
    if (!this.engine) return;
    if (this.active) { this.active = false; this.engine.stop(); return; }
    this.stopSpeaking();
    this.active = true;
    this.engine.start(this.lang, false);
  }

  setWakeMode(on) {
    this.wakeMode = on && this.supported;
    if (this.wakeMode) this.engine.start(this.lang, true);
    else if (!this.active) this.engine?.stop();
  }

  onEngine(type, text) {
    switch (type) {
      case "start":
        this.h.onListening(this.active || this.awaitingCommand);
        break;
      case "status":
        this.h.onStatus?.(text);
        break;
      case "interim":
        if (this.speaking) return;
        if (this.active || this.awaitingCommand) this.h.onInterim(text);
        break;
      case "final":
        if (this.speaking) return; // ignora o eco da própria voz
        this.handleFinal(text);
        break;
      case "error":
        if (text === "denied") { this.wakeMode = false; this.active = false; }
        this.h.onError(text);
        break;
      case "end":
        this.active = false;
        this.h.onListening(this.awaitingCommand);
        // o reconhecimento contínuo é encerrado pelo sistema de tempos em tempos: reabre
        if (this.wakeMode) setTimeout(() => this.wakeMode && !this.active && this.engine.start(this.lang, true), 300);
        break;
    }
  }

  handleFinal(text) {
    if (this.active) {
      this.active = false;
      this.h.onFinal(text);
      if (this.engineName !== "WhisperEngine") this.engine.stop();
      return;
    }
    if (!this.wakeMode) return;
    if (this.awaitingCommand) {
      this.awaitingCommand = false;
      this.h.onListening(false);
      this.h.onFinal(text.replace(WAKE, "").trim() || text);
      return;
    }
    const m = text.match(WAKE);
    if (!m) return;
    const after = text.slice(m.index + m[0].length).trim();
    if (after.length > 2) this.h.onFinal(after);
    else { this.awaitingCommand = true; this.h.onWake(); this.h.onListening(true); }
  }

  pickVoice(lang) {
    const loc = LOCALE[lang];
    return (
      this.voices.find((v) => v.lang === loc && /natural|neural|google|online/i.test(v.name)) ||
      this.voices.find((v) => v.lang === loc) ||
      this.voices.find((v) => v.lang?.replace("_", "-").startsWith(loc.slice(0, 2)))
    );
  }

  speak(text, lang = this.lang, { onStart, onEnd } = {}) {
    const clean = String(text || "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
      .replace(/[*_#`>]/g, "")
      .trim();
    if (!clean) return;
    const done = () => { this.speaking = false; onEnd?.(); };
    if (window.RaccoonAndroid?.speak) {
      this.speaking = true; onStart?.();
      window.__raccoonSpeechDone = done;
      window.RaccoonAndroid.speak(clean, LOCALE[lang]);
      return;
    }
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = LOCALE[lang];
    const v = this.pickVoice(lang);
    if (v) u.voice = v;
    u.pitch = 0.95; // voz mais grave e tranquila
    u.rate = 1.05;
    u.onstart = () => { this.speaking = true; onStart?.(); };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  }

  stopSpeaking() {
    if (window.RaccoonAndroid?.stopSpeaking) window.RaccoonAndroid.stopSpeaking();
    else if ("speechSynthesis" in window) speechSynthesis.cancel();
    this.speaking = false;
  }
}
