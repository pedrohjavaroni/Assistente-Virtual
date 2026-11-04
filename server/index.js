// Raccoon IA — servidor
// Serve o app (PWA) e faz a ponte com a API do Claude, transmitindo a resposta
// por Server-Sent Events. A chave da API fica só aqui no servidor, nunca no navegador.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, validateToolInput } from "./tools.js";
import { buildSystemPrompt } from "./prompt.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, "..", ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.RACCOON_MODEL || "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 5;

const client = new Anthropic();
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(here, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

/**
 * POST /api/chat
 * body: { messages: MessageParam[], lang: "pt"|"en", pet: {...}, tasks: [...] }
 * resposta: text/event-stream com eventos
 *   {type:"text", text}        pedaço da fala do guaxinim
 *   {type:"action", name, input}  ação para o app executar (tarefa, lembrete, humor)
 *   {type:"done", messages}    histórico atualizado (para o próximo turno)
 *   {type:"error", message}
 */
app.post("/api/chat", async (req, res) => {
  const { messages, lang = "pt", pet = {}, tasks = [] } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages obrigatório" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  let aborted = false;
  res.on("close", () => { aborted = true; });

  // Histórico só cresce (append-only): mandamos de volta o conteúdo completo
  // de cada resposta, incluindo blocos de thinking, para manter o contexto válido.
  const history = [...messages];
  const system = buildSystemPrompt({ lang, pet, tasks, now: new Date() });

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS && !aborted; round++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system,
        tools: TOOLS,
        messages: history,
      });

      stream.on("text", (text) => { if (!aborted) send({ type: "text", text }); });
      const message = await stream.finalMessage();
      history.push({ role: "assistant", content: message.content });

      if (message.stop_reason === "refusal") {
        send({
          type: "text",
          text: lang === "en"
            ? "Hmm, I can't help with that one. Let's try something else!"
            : "Hmm, com isso eu não posso ajudar. Vamos tentar outra coisa!",
        });
        break;
      }
      if (message.stop_reason !== "tool_use") break;

      // Executa as ferramentas: o servidor valida e repassa a ação ao app,
      // que guarda as tarefas/lembretes no próprio aparelho.
      const results = [];
      for (const block of message.content) {
        if (block.type !== "tool_use") continue;
        const error = validateToolInput(block.name, block.input);
        if (error) {
          results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: error });
          continue;
        }
        send({ type: "action", name: block.name, input: block.input });
        results.push({ type: "tool_result", tool_use_id: block.id, content: "ok" });
      }
      history.push({ role: "user", content: results });
    }
    send({ type: "done", messages: history });
  } catch (err) {
    console.error(err);
    let message = process.env.ANTHROPIC_API_KEY ? "Erro ao falar com a IA." : "Falta a ANTHROPIC_API_KEY no arquivo .env do servidor.";
    if (err instanceof Anthropic.AuthenticationError) message = "Chave da API inválida ou ausente (ANTHROPIC_API_KEY).";
    else if (err instanceof Anthropic.RateLimitError) message = "Muitas perguntas seguidas — espere um pouquinho.";
    else if (err instanceof Anthropic.APIConnectionError) message = "Sem conexão com a API do Claude.";
    else if (err instanceof Anthropic.APIError) message = `Erro da API (${err.status}).`;
    send({ type: "error", message });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`🦝 Raccoon IA rodando em http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️  ANTHROPIC_API_KEY não definida — crie um arquivo .env (veja .env.example).");
  }
});
