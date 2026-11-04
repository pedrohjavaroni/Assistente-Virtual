// Ferramentas que o Raccoon pode usar. Elas não rodam no servidor: o servidor
// valida a entrada e repassa a ação para o app, que guarda tudo no aparelho.
const obj = (properties, required) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const TOOLS = [
  {
    name: "add_task",
    description:
      "Adiciona uma tarefa à lista de tarefas do usuário. Use quando o usuário pedir para anotar, lembrar de fazer ou adicionar algo à lista.",
    input_schema: obj({ title: { type: "string", description: "Texto curto da tarefa" } }, ["title"]),
  },
  {
    name: "complete_task",
    description:
      "Marca como concluída uma tarefa existente. Use o id exato da lista de tarefas atual informada no prompt do sistema.",
    input_schema: obj({ id: { type: "string", description: "id da tarefa" } }, ["id"]),
  },
  {
    name: "set_reminder",
    description:
      "Agenda um lembrete com notificação. 'at' é data/hora local no formato ISO 8601 sem fuso (ex: 2026-11-04T18:30). Calcule a partir da data/hora atual informada.",
    input_schema: obj(
      {
        text: { type: "string", description: "O que lembrar" },
        at: { type: "string", description: "Data e hora local, ISO 8601, ex: 2026-11-04T18:30" },
      },
      ["text", "at"],
    ),
  },
  {
    name: "set_mood",
    description:
      "Muda a expressão do guaxinim na tela para combinar com a conversa. Use de vez em quando, não em toda resposta.",
    input_schema: obj(
      { mood: { type: "string", enum: ["happy", "excited", "thinking", "sad", "sleepy", "love"] } },
      ["mood"],
    ),
  },
].map((tool) => ({ ...tool, strict: true, eager_input_streaming: true }));

const MOODS = new Set(["happy", "excited", "thinking", "sad", "sleepy", "love"]);
const isText = (v, max = 300) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Retorna uma mensagem de erro, ou null se a entrada for válida. */
export function validateToolInput(name, input) {
  if (!input || typeof input !== "object") return "entrada inválida";
  switch (name) {
    case "add_task":
      return isText(input.title) ? null : "title deve ser um texto curto";
    case "complete_task":
      return isText(input.id, 64) ? null : "id inválido";
    case "set_reminder":
      if (!isText(input.text)) return "text deve ser um texto curto";
      if (!isText(input.at, 40) || Number.isNaN(Date.parse(input.at))) return "at deve ser data/hora ISO 8601";
      return null;
    case "set_mood":
      return MOODS.has(input.mood) ? null : "mood inválido";
    default:
      return `ferramenta desconhecida: ${name}`;
  }
}
