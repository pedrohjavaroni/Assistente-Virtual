// Voz: reconhecimento (Web Speech API) e fala (speechSynthesis), em PT-BR e EN-US.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const LOCALE = { pt: "pt-BR", en: "en-US" };
// "Raccoon" costuma ser transcrito de vários jeitos pelo reconhecedor
const WAKE = /\b(?:ei|hey|oi|olá|hi|ok)?\s*(?:raccoon|racoon|raccon|racun|rakun|rácun|háckun|guaxinim|raccoons?)\b[,.!]?\s*/i;

export class Voice {
  constructor(handlers) {
    this.h = handlers;
    this.supported = Boolean(Recognition);
    this.lang = "pt";
    this.wakeMode = false;
    this.active = false;       // push-to-talk em andamento
    this.awaitingCommand = false;
    this.speaking = false;
    this.rec = null;
    this.voices = [];
    if ("speechSynthesis" in window) {
      const load = () => { this.voices = speechSynthesis.getVoices(); };
      load();
      speechSynthesis.addEventListener?.("voiceschanged", load);
    }
  }

  setLang(lang) {
    this.lang = lang;
    if (this.rec) { this.rec.lang = LOCALE[lang]; this.restart(); }
  }

  /** Botão do microfone: escuta uma frase e envia */
  toggle() {
    if (this.active) { this.active = false; this.rec?.stop(); return; }
    this.stopSpeaking();
    this.active = true;
    this.start(false);
  }

  /** Modo mãos-livres: escuta sempre e reage a "Ei Raccoon" */
  setWakeMode(on) {
    this.wakeMode = on && this.supported;
    if (this.wakeMode) this.start(true);
    else if (!this.active) this.rec?.stop();
  }

  start(continuous) {
    if (!this.supported) return;
    try { this.rec?.abort(); } catch {}
    const rec = new Recognition();
    rec.lang = LOCALE[this.lang];
    rec.interimResults = true;
    rec.continuous = continuous;
    rec.maxAlternatives = 1;
    this.rec = rec;

    rec.onstart = () => this.h.onListening(this.active || this.awaitingCommand);
    rec.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
      }
      if (this.speaking) return; // ignora o eco da própria voz
      if (this.active) {
        if (interim) this.h.onInterim(interim);
        if (final) { this.active = false; this.h.onFinal(final.trim()); }
        return;
      }
      // modo mãos-livres
      const text = (final || interim).trim();
      if (!final) {
        if (this.awaitingCommand && interim) this.h.onInterim(interim);
        return;
      }
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
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.wakeMode = false; this.active = false;
        this.h.onError(this.lang === "pt" ? "Permissão do microfone negada." : "Microphone permission denied.");
        return;
      }
      this.h.onError((this.lang === "pt" ? "Erro no microfone: " : "Microphone error: ") + e.error);
    };
    rec.onend = () => {
      if (this.rec !== rec) return; // uma escuta antiga que foi substituída
      this.active = false;
      this.h.onListening(false);
      // o navegador encerra a escuta contínua de tempos em tempos: reabre
      if (this.wakeMode) setTimeout(() => this.wakeMode && this.start(true), 300);
    };
    try { rec.start(); } catch { /* já iniciado */ }
  }

  restart() {
    if (this.wakeMode) this.start(true);
  }

  pickVoice(lang) {
    const loc = LOCALE[lang];
    const base = loc.slice(0, 2);
    return (
      this.voices.find((v) => v.lang === loc && /natural|google|neural|luciana|francisca|samantha/i.test(v.name)) ||
      this.voices.find((v) => v.lang === loc) ||
      this.voices.find((v) => v.lang?.startsWith(base))
    );
  }

  speak(text, lang = this.lang, { onStart, onEnd } = {}) {
    if (!("speechSynthesis" in window) || !text) return;
    const clean = text
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
      .replace(/[*_#`>]/g, "")
      .trim();
    if (!clean) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = LOCALE[lang];
    const v = this.pickVoice(lang);
    if (v) u.voice = v;
    u.pitch = 1.35; // vozinha de guaxinim
    u.rate = 1.05;
    u.onstart = () => { this.speaking = true; onStart?.(); };
    const done = () => { this.speaking = false; onEnd?.(); };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  }

  stopSpeaking() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    this.speaking = false;
  }
}
