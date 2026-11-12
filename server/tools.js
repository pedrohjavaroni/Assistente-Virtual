// Ferramentas que o Argos pode usar.
//  - APP_TOOLS: o servidor valida e repassa a ação para a interface (tarefas, lembretes, cartões).
//  - As demais rodam aqui no servidor (no seu computador): PC, vídeo, memória, agenda, Instagram.
const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const finish = (tools) => tools.map((tool) => ({ ...tool, strict: true, eager_input_streaming: true }));

export const APP_TOOLS = finish([
  {
    name: "add_task",
    description: "Adiciona uma tarefa à lista de tarefas do usuário. Use quando ele pedir para anotar ou lembrar de fazer algo sem hora marcada.",
    input_schema: obj({ title: str("Texto curto da tarefa") }, ["title"]),
  },
  {
    name: "complete_task",
    description: "Marca como concluída uma tarefa existente. Use o id exato da lista de tarefas informada no contexto.",
    input_schema: obj({ id: str("id da tarefa") }, ["id"]),
  },
  {
    name: "set_reminder",
    description: "Agenda um lembrete falado com notificação. 'at' é data/hora local ISO 8601 sem fuso (ex: 2026-11-04T18:30), calculada a partir da data/hora atual do contexto.",
    input_schema: obj({ text: str("O que lembrar"), at: str("Data e hora local, ISO 8601") }, ["text", "at"]),
  },
  {
    name: "show_card",
    description: "Mostra um texto longo na janela do Argos, num cartão que o usuário pode ler e copiar: roteiros de Reels, legendas, listas de ideias, hashtags, calendários de conteúdo, resumos. Use sempre que a resposta for longa demais para ser falada; depois diga em uma frase curta que o conteúdo está na tela. Pode usar markdown simples (títulos com #, listas com -).",
    input_schema: obj({ title: str("Título do cartão"), content: str("Conteúdo completo") }, ["title", "content"]),
  },
]);

export const MEMORY_TOOLS = finish([
  {
    name: "remember",
    description: "Guarda um fato na memória permanente do Argos (ele volta em todas as conversas futuras). Use quando o usuário pedir para lembrar de algo sobre ele, ou quando contar algo duradouro e útil: nicho, tom e público do canal do Instagram, preferências, nomes, rotinas. Um fato curto por chamada.",
    input_schema: obj({ fact: str("O fato, em uma frase completa") }, ["fact"]),
  },
  {
    name: "forget",
    description: "Apaga um fato da memória permanente pelo id (mostrado na lista de memórias).",
    input_schema: obj({ id: str("id da memória") }, ["id"]),
  },
]);

const LOCAL_DT = "Data/hora local no fuso do usuário, ISO 8601 sem fuso, ex: 2026-11-04T18:30";
export const CALENDAR_TOOLS = finish([
  {
    name: "calendar_list_events",
    description: "Lista os compromissos do Google Agenda entre duas datas/horas locais. Use para 'o que tenho hoje?', 'estou livre sexta à tarde?' ou para achar o id de um evento antes de apagar.",
    input_schema: obj({ start: str(LOCAL_DT), end: str(LOCAL_DT), query: str("Texto para filtrar (opcional)") }, ["start", "end"]),
  },
  {
    name: "calendar_create_event",
    description: "Cria um compromisso no Google Agenda. Sem duração informada, use 1 hora. Para dia inteiro, all_day=true e datas AAAA-MM-DD. Confirme em uma frase o que foi criado.",
    input_schema: obj({
      title: str("Título do evento"), start: str(LOCAL_DT + " (ou AAAA-MM-DD se all_day)"), end: str(LOCAL_DT + " (opcional)"),
      all_day: { type: "boolean", description: "Evento de dia inteiro" }, location: str("Local (opcional)"), description: str("Detalhes (opcional)"),
    }, ["title", "start"]),
  },
  {
    name: "calendar_delete_event",
    description: "Apaga um compromisso do Google Agenda pelo id (obtido com calendar_list_events). Só apague se o usuário pediu claramente, e diga qual evento foi apagado.",
    input_schema: obj({ id: str("id do evento") }, ["id"]),
  },
]);

// Só entram quando o pedido vem do próprio computador (nunca de outro aparelho da rede)
export const PC_TOOLS = finish([
  {
    name: "open_app",
    description: "Abre um programa instalado no computador pelo nome (ex: Spotify, Chrome, Bloco de Notas, CapCut, Photoshop). Se o app não existir e for um serviço online, abra o site com open_url.",
    input_schema: obj({ name: str("Nome do programa como aparece no menu Iniciar") }, ["name"]),
  },
  {
    name: "open_url",
    description: "Abre um endereço no navegador padrão. Para pesquisar, monte a URL: Google https://www.google.com/search?q=..., YouTube https://www.youtube.com/results?search_query=..., perfil do Instagram https://www.instagram.com/usuario/.",
    input_schema: obj({ url: str("URL completa começando com https://") }, ["url"]),
  },
  {
    name: "system_control",
    description: "Controla o computador: volume (volume_up/volume_down mudam 10%; volume_set usa value de 0 a 100; mute alterna), mídia (play_pause, next_track, previous_track), lock (bloqueia a tela), sleep (suspende), screenshot (salva um print em Imagens/Argos), shutdown e restart (o sistema pede a confirmação do usuário antes), cancel_shutdown.",
    input_schema: obj({
      action: { type: "string", enum: ["volume_up", "volume_down", "volume_set", "mute", "play_pause", "next_track", "previous_track", "lock", "sleep", "screenshot", "shutdown", "restart", "cancel_shutdown"] },
      value: { type: "number", description: "Só para volume_set: 0 a 100" },
    }, ["action"]),
  },
  {
    name: "look_at_screen",
    description: "Tira uma foto da tela do usuário agora e devolve a imagem para você analisar. Use quando ele pedir para olhar a tela, ou falar de algo que está vendo ('o que é esse erro?', 'resume isso aqui', 'o que você acha desse post?'). Não use sem o pedido envolver a tela.",
    input_schema: obj({}),
  },
  {
    name: "find_files",
    description: "Procura arquivos e pastas pelo nome dentro das pastas liberadas (mais recentes primeiro). Sem query e com kind, lista os arquivos mais recentes daquele tipo (ex: últimos vídeos gravados).",
    input_schema: obj({
      query: str("Palavras do nome do arquivo (opcional se kind for informado)"),
      kind: { type: "string", enum: ["any", "video", "image", "audio", "document"] },
      folder: str("Pasta onde procurar (opcional; padrão: todas as liberadas)"),
    }),
  },
  {
    name: "list_folder",
    description: "Lista o conteúdo de uma pasta liberada (mais recentes primeiro). Aceita caminho completo ou apelidos como 'Downloads', 'Área de Trabalho/Projetos'.",
    input_schema: obj({ path: str("Pasta") }, ["path"]),
  },
  {
    name: "read_file",
    description: "Lê um arquivo de texto pequeno (notas, roteiros, legendas .srt, .csv) de uma pasta liberada.",
    input_schema: obj({ path: str("Caminho do arquivo") }, ["path"]),
  },
  {
    name: "write_file",
    description: "Cria um arquivo de texto novo (.txt, .md, .csv, .srt, .json, .html) ou uma pasta nova dentro das pastas liberadas. Nunca sobrescreve nem apaga nada. Só um nome solto (ex: 'ideias-reels.md') vai para Documentos/Argos.",
    input_schema: obj({
      path: str("Nome ou caminho do arquivo/pasta"), content: str("Conteúdo do arquivo (vazio para pasta)"),
      folder: { type: "boolean", description: "true para criar uma pasta em vez de arquivo" },
    }, ["path"]),
  },
  {
    name: "open_path",
    description: "Abre um arquivo ou pasta com o programa padrão do computador. reveal=true mostra o arquivo selecionado dentro da pasta.",
    input_schema: obj({ path: str("Caminho"), reveal: { type: "boolean", description: "Mostrar na pasta em vez de abrir" } }, ["path"]),
  },
  {
    name: "video_edit",
    description: "Edita vídeos com ffmpeg, sempre criando um arquivo novo ao lado do original (o original nunca muda). operation: info (duração, resolução), trim (corta de start até end), vertical (deixa 1080x1920 para Reels; mode crop corta as laterais, blur mantém tudo com fundo desfocado), remove_silence (tira as pausas sem fala), concat (junta os vídeos de inputs na ordem), speed (factor 0.25 a 4), extract_audio (mp3), mute (tira o som), compress (deixa leve para enviar). Tempos em segundos ou mm:ss. Vídeos longos podem levar alguns minutos. Encontre o arquivo antes com find_files se o usuário não deu o caminho.",
    input_schema: obj({
      operation: { type: "string", enum: ["info", "trim", "vertical", "remove_silence", "concat", "speed", "extract_audio", "mute", "compress"] },
      input: str("Caminho do vídeo (todas as operações menos concat)"),
      inputs: { type: "array", items: { type: "string" }, description: "Só para concat: caminhos na ordem" },
      start: str("trim: início, ex 0:05"), end: str("trim: fim, ex 1:30"),
      mode: { type: "string", enum: ["crop", "blur"] },
      factor: { type: "number", description: "speed: 2 = dobro da velocidade" },
    }, ["operation"]),
  },
]);

export const INSTAGRAM_TOOLS = finish([
  {
    name: "instagram_overview",
    description: "Dados da conta do Instagram do usuário: seguidores, número de posts e os posts mais recentes com curtidas e comentários (e os ids para instagram_post_insights).",
    input_schema: obj({ limit: { type: "number", description: "Quantos posts recentes (padrão 10, máx 25)" } }),
  },
  {
    name: "instagram_account_insights",
    description: "Métricas da conta nos últimos N dias (até 30): alcance, visualizações, contas engajadas, interações, curtidas, comentários, compartilhamentos, salvamentos. Os dados podem atrasar até 48 h.",
    input_schema: obj({ days: { type: "number", description: "Período em dias (padrão 7)" } }),
  },
  {
    name: "instagram_post_insights",
    description: "Métricas detalhadas de um post ou Reels pelo id (obtido com instagram_overview): alcance, visualizações, salvamentos, compartilhamentos, tempo médio assistido.",
    input_schema: obj({ media_id: str("id do post") }, ["media_id"]),
  },
  {
    name: "instagram_publish",
    description: "Publica no Instagram do usuário, agora ou agendado. kind reel: vídeo .mp4/.mov do computador (caminho) ou link https; kind image: só link https público de um JPEG. Antes de chamar, mostre a legenda final ao usuário. O sistema exige a confirmação dele: a primeira chamada só registra o pedido; depois que ele confirmar, chame de novo com os mesmos dados. schedule_at agenda (o computador precisa estar ligado na hora).",
    input_schema: obj({
      kind: { type: "string", enum: ["reel", "image"] }, source: str("Caminho do vídeo no computador ou link https"),
      caption: str("Legenda completa, com hashtags"), schedule_at: str("Opcional: " + LOCAL_DT),
    }, ["kind", "source", "caption"]),
  },
  {
    name: "instagram_scheduled",
    description: "Lista os posts agendados (action list) ou cancela um agendamento pelo id (action cancel).",
    input_schema: obj({ action: { type: "string", enum: ["list", "cancel"] }, id: str("id do agendamento (para cancel)") }, ["action"]),
  },
]);

// Busca na internet (roda nos servidores da Anthropic): notícias, clima, tendências, fatos recentes
export const WEB_SEARCH = { type: "web_search_20260209", name: "web_search", max_uses: 3 };

export const APP_TOOL_NAMES = new Set(APP_TOOLS.map((t) => t.name));

/** Valida a entrada contra o schema da ferramenta. Retorna mensagem de erro ou null. */
export function validateToolInput(tool, input) {
  if (!tool) return "ferramenta desconhecida";
  if (!input || typeof input !== "object" || Array.isArray(input)) return "entrada inválida";
  const { properties, required } = tool.input_schema;
  for (const key of required) if (input[key] === undefined) return `falta o campo ${key}`;
  for (const [key, value] of Object.entries(input)) {
    const spec = properties[key];
    if (!spec) return `campo desconhecido: ${key}`;
    if (spec.type === "array") {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) return `${key} deve ser uma lista de textos`;
    } else if (typeof value !== spec.type || (spec.type === "number" && !Number.isFinite(value))) return `${key} deve ser ${spec.type}`;
    if (spec.enum && !spec.enum.includes(value)) return `${key} deve ser um de: ${spec.enum.join(", ")}`;
    if (spec.type === "string" && value.length > 20_000) return `${key} é longo demais`;
  }
  if ((tool.name === "set_reminder" || tool.name.startsWith("calendar_")) &&
    ["at", "start", "end"].some((k) => input[k] !== undefined && Number.isNaN(Date.parse(input[k])))) return "data/hora inválida";
  return null;
}
