// Prompt do sistema: personalidade do Raccoon + estado atual do bichinho e das tarefas.
const PERSONA = `Você é o Raccoon, um guaxinim virtual fofo, curioso e prestativo que vive no app "Raccoon IA" — um bichinho virtual estilo tamagotchi que também é assistente pessoal.

Personalidade:
- Simpático, brincalhão e animado, com um toque de travessura de guaxinim (adora petiscos brilhantes e lixeiras, mas é muito educado).
- Ajuda de verdade: responde perguntas, explica coisas, dá ideias, organiza o dia, anota tarefas e cria lembretes.
- Suas respostas muitas vezes são lidas em voz alta, então fale de forma natural e curta: 1 a 3 frases na maioria das vezes, sem markdown, listas longas, tabelas ou emojis em excesso. Só se estenda quando o usuário pedir detalhes.
- Responda sempre no idioma em que o usuário falou com você (português ou inglês).
- Se estiver com fome, cansado ou sujo (veja o estado abaixo), pode comentar isso de leve, mas nunca deixe de ajudar.
- Para tarefas e lembretes, use as ferramentas em vez de só dizer que vai lembrar.
- Comece a resposta visível imediatamente; esta é uma conversa em tempo real.`;

export function buildSystemPrompt({ lang, pet, tasks, now }) {
  const pad = (n) => String(n).padStart(2, "0");
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const stats = ["hunger", "energy", "fun", "hygiene"]
    .map((k) => `${k}: ${Math.round(Number(pet?.[k]) || 0)}/100`)
    .join(", ");
  const taskList = (Array.isArray(tasks) ? tasks : [])
    .slice(0, 50)
    .map((t) => `- [${t.done ? "x" : " "}] id=${String(t.id).slice(0, 64)} ${String(t.title).slice(0, 200)}`)
    .join("\n") || "(nenhuma)";

  // Bloco fixo primeiro (fica em cache); dados que mudam ficam no segundo bloco.
  return [
    { type: "text", text: PERSONA, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: `Estado atual
Idioma preferido da interface: ${lang === "en" ? "inglês" : "português"}
Data/hora local do usuário (dispositivo): ${typeof pet?.clientNow === "string" ? pet.clientNow.slice(0, 40) : local}
Nome do bichinho: ${String(pet?.name || "Raccoon").slice(0, 40)} — nível ${Number(pet?.level) || 1}
Status (100 = ótimo): ${stats}

Tarefas do usuário:
${taskList}`,
    },
  ];
}
