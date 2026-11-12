// IA local e gratuita: conversa com um modelo rodando no próprio computador pelo Ollama (https://ollama.com).
// Nada sai da máquina e não há custo nem limite de uso; a qualidade depende do modelo e da placa de vídeo.
import { getConfig } from "./config.js";

const base = () => (process.env.OLLAMA_HOST_URL || getConfig().ai.ollamaUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
export const model = () => getConfig().ai.localModel;
const NUM_CTX = 12288; // cabe o prompt, as ferramentas e uma conversa curta numa placa de 8 GB

async function get(pathname, timeout = 3000) {
  const res = await fetch(base() + pathname, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`Ollama respondeu ${res.status}`);
  return res.json();
}

// ---------- instalação do modelo ----------
let pull = { busy: false, percent: 0, error: "" };
const sameModel = (a, b) => a === b || a === `${b}:latest` || `${a}:latest` === b;

export async function status() {
  const wanted = model();
  try {
    const tags = await get("/api/tags");
    const installed = (tags.models || []).map((m) => m.name || m.model);
    return { running: true, model: wanted, hasModel: installed.some((n) => sameModel(n, wanted)), installed, pull };
  } catch {
    return { running: false, model: wanted, hasModel: false, installed: [], pull };
  }
}

/** Baixa o modelo configurado se o Ollama estiver aberto e ele ainda não existir. */
export async function ensure() {
  const st = await status();
  if (!st.running || st.hasModel || pull.busy) return st;
  pull = { busy: true, percent: 0, error: "" };
  (async () => {
    try {
      const res = await fetch(base() + "/api/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: st.model, stream: true }) });
      if (!res.ok || !res.body) throw new Error(`Ollama respondeu ${res.status}`);
      for await (const ev of ndjson(res.body)) {
        if (ev.error) throw new Error(ev.error);
        if (ev.total && ev.completed) pull.percent = Math.max(pull.percent, Math.floor((ev.completed / ev.total) * 100));
      }
      pull = { busy: false, percent: 100, error: "" };
    } catch (err) {
      pull = { busy: false, percent: 0, error: String(err.message || err) };
    }
  })();
  return { ...st, pull };
}

async function* ndjson(body) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf);
}

// ---------- conversa ----------
// Histórico neutro: {role:"user", text, images?} | {role:"assistant", text, calls:[{name,input}]} | {role:"tool", name, text}
const toWire = (m) => {
  if (m.role === "assistant") return { role: "assistant", content: m.text || "", ...(m.calls?.length ? { tool_calls: m.calls.map((c) => ({ function: { name: c.name, arguments: c.input } })) } : {}) };
  if (m.role === "tool") return { role: "tool", content: m.text, tool_name: m.name };
  return { role: "user", content: m.text, ...(m.images?.length ? { images: m.images } : {}) };
};
export const toFunctionTools = (tools) => tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));

/** Remove o raciocínio que alguns modelos escrevem entre <think>…</think> antes da resposta. */
export function thinkFilter(emit) {
  let buf = "", inside = false;
  return {
    push(text) {
      buf += text;
      for (;;) {
        const tag = inside ? "</think>" : "<think>", i = buf.indexOf(tag);
        if (i >= 0) { if (!inside && i > 0) emit(buf.slice(0, i)); buf = buf.slice(i + tag.length); inside = !inside; continue; }
        // segura o final se ele puder ser o começo de uma tag
        let keep = 0;
        for (let k = Math.min(tag.length - 1, buf.length); k > 0; k--) if (tag.startsWith(buf.slice(-k))) { keep = k; break; }
        if (!inside && buf.length > keep) emit(buf.slice(0, buf.length - keep));
        buf = keep ? buf.slice(-keep) : "";
        return;
      }
    },
    end() { if (!inside && buf) emit(buf); buf = ""; },
  };
}

let noThink = true; // pede resposta direta, sem "pensar em voz alta" (mais rápido para conversa por voz)
export class LocalError extends Error {}

/** Uma rodada de conversa. Retorna { text, calls } e transmite o texto por onText. */
export async function chat({ system, history, tools, onText, signal }) {
  const body = {
    model: model(), stream: true, keep_alive: "30m", options: { num_ctx: NUM_CTX },
    messages: [{ role: "system", content: system }, ...history.map(toWire)],
    tools: toFunctionTools(tools),
  };
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(base() + "/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify(noThink ? { ...body, think: false } : body),
      });
    } catch {
      throw new LocalError("Não encontrei o Ollama neste computador. Instale em ollama.com (é grátis) e deixe ele aberto.");
    }
    if (res.ok) break;
    const detail = (await res.json().catch(() => ({}))).error || `erro ${res.status}`;
    if (noThink && attempt === 0 && /think/i.test(detail)) { noThink = false; continue; } // modelo sem modo de raciocínio
    if (res.status === 404 || /not found/i.test(detail)) {
      ensure().catch(() => {});
      throw new LocalError(`O modelo ${model()} ainda não está instalado. Estou baixando; acompanhe em Configurações.`);
    }
    if (/image|vision|multimodal/i.test(detail)) throw new LocalError("Esse modelo local não enxerga imagens. Escolha um modelo com visão em Configurações.");
    throw new LocalError("O Ollama recusou o pedido: " + String(detail).slice(0, 200));
  }
  let text = "";
  const calls = [];
  const filter = thinkFilter((t) => { text += t; onText(t); });
  for await (const ev of ndjson(res.body)) {
    if (ev.error) throw new LocalError("O modelo local falhou: " + String(ev.error).slice(0, 200));
    const m = ev.message || {};
    if (m.content) filter.push(m.content);
    for (const c of m.tool_calls || []) {
      let input = c.function?.arguments ?? {};
      if (typeof input === "string") { try { input = JSON.parse(input); } catch { input = null; } }
      calls.push({ name: c.function?.name || "", input });
    }
  }
  filter.end();
  return { text, calls };
}
