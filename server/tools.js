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
      { mood: { type: "string", enum: ["happy", "excited", "thinking", "sad", "sleepy", "cool", "love"] } },
      ["mood"],
    ),
  },
].map((tool) => ({ ...tool, strict: true, eager_input_streaming: true }));

// Ferramentas do Google Agenda: estas rodam no servidor (só entram quando a agenda está conectada)
const LOCAL_DT = "Data/hora local no fuso do usuário, ISO 8601 sem fuso, ex: 2026-11-04T18:30";
export const CALENDAR_TOOLS = [
  {
    name: "calendar_list_events",
    description:
      "Lista os compromissos do Google Agenda do usuário entre duas datas/horas locais. Use para perguntas como 'o que tenho hoje?', 'estou livre sexta à tarde?' ou para achar o id de um evento antes de apagar.",
    input_schema: obj(
      {
        start: { type: "string", description: LOCAL_DT },
        end: { type: "string", description: LOCAL_DT },
        query: { type: "string", description: "Texto para filtrar (opcional)" },
      },
      ["start", "end"],
    ),
  },
  {
    name: "calendar_create_event",
    description:
      "Cria um compromisso no Google Agenda do usuário. Se o usuário não disser a duração, use 1 hora. Para eventos de dia inteiro, use all_day=true e datas AAAA-MM-DD. Confirme em uma frase o que foi criado.",
    input_schema: obj(
      {
        title: { type: "string", description: "Título do evento" },
        start: { type: "string", description: LOCAL_DT + " (ou AAAA-MM-DD se all_day)" },
        end: { type: "string", description: LOCAL_DT + " (opcional)" },
        all_day: { type: "boolean", description: "Evento de dia inteiro" },
        location: { type: "string", description: "Local (opcional)" },
        description: { type: "string", description: "Detalhes (opcional)" },
      },
      ["title", "start"],
    ),
  },
  {
    name: "calendar_delete_event",
    description:
      "Apaga um compromisso do Google Agenda pelo id (obtido com calendar_list_events). Só apague se o usuário pediu claramente, e diga qual evento foi apagado.",
    input_schema: obj({ id: { type: "string", description: "id do evento" } }, ["id"]),
  },
].map((tool) => ({ ...tool, strict: true, eager_input_streaming: true }));

export const SERVER_TOOL_NAMES = new Set(CALENDAR_TOOLS.map((t) => t.name));

const MOODS = new Set(["happy", "excited", "thinking", "sad", "sleepy", "cool", "love"]);
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
    case "calendar_list_events":
      if (!isText(input.start, 40) || !isText(input.end, 40)) return "start e end são obrigatórios";
      if (Number.isNaN(Date.parse(input.start)) || Number.isNaN(Date.parse(input.end))) return "datas inválidas";
      return input.query === undefined || isText(input.query, 200) ? null : "query inválida";
    case "calendar_create_event":
      if (!isText(input.title)) return "title deve ser um texto curto";
      if (!isText(input.start, 40) || Number.isNaN(Date.parse(input.start))) return "start inválido";
      if (input.end !== undefined && (!isText(input.end, 40) || Number.isNaN(Date.parse(input.end)))) return "end inválido";
      if (input.all_day !== undefined && typeof input.all_day !== "boolean") return "all_day deve ser booleano";
      if (input.location !== undefined && !isText(input.location, 300)) return "location inválido";
      if (input.description !== undefined && typeof input.description !== "string") return "description inválido";
      return null;
    case "calendar_delete_event":
      return isText(input.id, 1024) ? null : "id inválido";
    default:
      return `ferramenta desconhecida: ${name}`;
  }
}
