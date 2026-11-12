// Voz do Jarvis.
// Ouvir:  no app desktop, Whisper rodando localmente (offline); no navegador, Web Speech API.
// Falar:  Piper (voz neural local, servida por /api/tts); se ainda não estiver instalada, a voz do sistema.
// A lógica da palavra de ativação ("Jarvis, ...") e do botão do microfone fica na classe Voice.

const LOCALE = { pt: "pt-BR", en: "en-US" };
const isElectron = /Electron/i.test(navigator.userAgent);

/** Monta a expressão da palavra de ativação, tolerando acentos e os erros comuns do reconhecimento. */
export function wakeRegex(name) {
  const tolerant = (s) => s.toLowerCase().replace(/[aeiouc]/g, (c) => ({ a: "[aáàâã]", e: "[eéê]", i: "[iíy]", o: "[oóôõ]", u: "[uú]", c: "[cç]" })[c]);
  const names = [tolerant(name.trim())];
  if (/^jarvis$/i.test(name.trim())) names.push("d?j[aá]r[vb][iey]s", "j[aá]rv[iey][sz]", "j[aá]rbas", "ch[aá]rv[ie]s", "j[aá]v[ie]s", "g[aá]rv[ie]s", "jarvi");
  return new RegExp(`(?:^|[\\s,.!?])(?:(?:ei|hey|oi|ol[aá]|ok|e a[ií])[\\s,]+)?(?:${names.join("|")})(?=$|[\\s,.!?])[,.!?]?\\s*`, "i");
}

/** Detecta se a frase está em inglês (o resto é tratado como português). */
export function detectLang(text) {
  const t = ` ${text.toLowerCase()} `;
  const en = (t.match(/ (the|is|are|you|what|how|please|and|of|to|it|this|that|my|can|do|with|for) /g) || []).length;
  const pt = (t.match(/ (o|a|os|as|que|é|você|como|por|favor|e|de|para|isso|meu|minha|pode|com|um|uma|não) /g) || []).length;
  return en > pt && en >= 2 ? "en" : "pt";
}

// ---------- ouvir: Web Speech API (navegador) ----------
class WebSpeechEngine {
  static available() { return !isElectron && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition); }
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
  setMuted() {}
}

// ---------- ouvir: Whisper local (app desktop) ----------
// Grava o microfone, detecta quando você fala (por volume) e transcreve com o modelo Whisper
// em WebAssembly. O modelo (~80 MB) é baixado uma vez e fica em cache.
class WhisperEngine {
  static available() { return isElectron && Boolean(navigator.mediaDevices?.getUserMedia); }
  constructor(emit) { this.emit = emit; this.running = false; this.asr = null; this.muted = false; }

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
      this.loading.catch(() => { this.loading = null; });
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
      if (this.muted) { speaking = false; chunks = []; return; } // o Jarvis está falando: não escuta a própria voz
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
      if (speaking && (silentMs > 800 || spokenMs > 15000)) {
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

  setMuted(on) { this.muted = on; }

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

/** Quebra o texto em trechos curtos (por frase) para a fala começar logo. */
export function splitSpeech(text, max = 220) {
  const parts = text.match(/[^.!?…\n]+[.!?…]*\s*/g) || [text];
  const out = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.length + p.length <= max) out[out.length - 1] = last + p;
    else out.push(p);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

// ---------- fachada usada pelo app ----------
export class Voice {
  constructor(handlers) {
    this.h = handlers;
    const Engine = [WhisperEngine, WebSpeechEngine].find((E) => E.available());
    this.supported = Boolean(Engine);
    this.engineName = Engine?.name;
    this.engine = Engine ? new Engine((type, text) => this.onEngine(type, text)) : null;
    this.lang = "pt";
    this.wake = wakeRegex("Jarvis");
    this.wakeMode = false;
    this.active = false;          // botão do microfone apertado
    this.awaitingCommand = false; // ouviu a palavra de ativação, esperando o pedido
    this.speaking = false;
    this.speakId = 0;
    this.effect = true;
    this.voices = [];
    if ("speechSynthesis" in window) {
      const load = () => { this.voices = speechSynthesis.getVoices(); };
      load();
      speechSynthesis.addEventListener?.("voiceschanged", load);
    }
  }

  setName(name) { this.wake = wakeRegex(name || "Jarvis"); }

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

  /** Abre uma janela curta para o usuário responder sem repetir a palavra de ativação. */
  expectReply(ms = 8000) {
    if (!this.wakeMode || this.active) return;
    this.awaitingCommand = true;
    this.h.onListening(true);
    clearTimeout(this.awaitTimer);
    this.awaitTimer = setTimeout(() => {
      if (!this.awaitingCommand) return;
      this.awaitingCommand = false;
      this.h.onListening(false);
    }, ms);
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
    const strip = (s) => s.replace(this.wake, " ").trim();
    if (this.active) {
      this.active = false;
      this.h.onFinal(strip(text) || text);
      this.engine.stop();
      return;
    }
    if (!this.wakeMode) return;
    if (this.awaitingCommand) {
      this.awaitingCommand = false;
      clearTimeout(this.awaitTimer);
      this.h.onListening(false);
      this.h.onFinal(strip(text) || text);
      return;
    }
    const m = text.match(this.wake);
    if (!m) return;
    // o pedido pode vir antes ou depois do nome: "Jarvis, abre o Spotify" / "abre o Spotify, Jarvis"
    const rest = strip(text);
    if (rest.replace(/[^\p{L}\p{N}]/gu, "").length > 2) this.h.onFinal(rest);
    else { this.h.onWake(); this.expectReply(); }
  }

  // ---------- falar ----------
  audio() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      // leve tratamento "de comunicador": corta graves, realça presença e soma um eco curtíssimo
      const hp = new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 120 });
      const presence = new BiquadFilterNode(this.ctx, { type: "peaking", frequency: 2800, Q: 0.9, gain: 3.5 });
      const delay = new DelayNode(this.ctx, { delayTime: 0.011 });
      const wet = new GainNode(this.ctx, { gain: 0.28 });
      const comp = new DynamicsCompressorNode(this.ctx, { threshold: -20, ratio: 3 });
      hp.connect(presence); presence.connect(comp); presence.connect(delay); delay.connect(wet); wet.connect(comp);
      comp.connect(this.ctx.destination);
      this.fxIn = hp;
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  async fetchAudio(text, lang) {
    try {
      const res = await fetch("api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang }) });
      if (!res.ok) return null;
      return await this.audio().decodeAudioData(await res.arrayBuffer());
    } catch { return null; }
  }

  play(buffer) {
    return new Promise((resolve) => {
      const ctx = this.audio();
      const src = new AudioBufferSourceNode(ctx, { buffer });
      src.connect(this.effect ? this.fxIn : ctx.destination);
      src.onended = resolve;
      this.source = src;
      src.start();
    });
  }

  systemSpeak(text, lang) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LOCALE[lang];
      const loc = LOCALE[lang];
      const v = this.voices.find((x) => x.lang === loc && /natural|neural|google|online/i.test(x.name)) || this.voices.find((x) => x.lang === loc);
      if (v) u.voice = v;
      u.pitch = 0.9;
      u.onend = u.onerror = resolve;
      speechSynthesis.speak(u);
    });
  }

  async speak(text, lang = this.lang, { onStart, onEnd } = {}) {
    const clean = String(text || "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[*_#`>]/g, "")
      .trim();
    if (!clean) { onEnd?.(false); return; }
    this.stopSpeaking();
    const id = ++this.speakId;
    this.speaking = true;
    this.engine?.setMuted(true);
    onStart?.();
    const chunks = splitSpeech(clean);
    try {
      let next = this.fetchAudio(chunks[0], lang);
      for (let i = 0; i < chunks.length && id === this.speakId; i++) {
        const buffer = await next;
        if (id !== this.speakId) break;
        next = i + 1 < chunks.length ? this.fetchAudio(chunks[i + 1], lang) : null;
        if (buffer) await this.play(buffer);
        else await this.systemSpeak(chunks[i], lang); // voz neural ainda não instalada
      }
    } finally {
      if (id === this.speakId) {
        // espera o eco da sala morrer antes de voltar a ouvir
        setTimeout(() => { if (id === this.speakId) { this.speaking = false; this.engine?.setMuted(false); onEnd?.(true); } }, 450);
      }
    }
  }

  stopSpeaking() {
    this.speakId++;
    try { this.source?.stop(); } catch {}
    this.source = null;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    this.speaking = false;
    this.engine?.setMuted(false);
  }
}
