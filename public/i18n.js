// Textos da interface em português e inglês
export const I18N = {
  pt: {
    hunger: "Fome", energy: "Energia", fun: "Diversão", hygiene: "Higiene",
    feed: "Alimentar", play: "Brincar", sleep: "Dormir", wake_up: "Acordar", clean: "Limpar",
    speak: "Falar respostas", wake: 'Modo "Ei Raccoon"', tasks: "Tarefas", reminders: "Lembretes",
    hint: 'Dica: diga "me lembre de beber água às 15h" ou "adicione comprar pão na lista".',
    placeholder: "Pergunte algo ao Raccoon...", newTask: "Nova tarefa...", lvl: "Nv.",
    yum: "Nhac nhac! Que delícia! 😋", full: "Tô cheio! Não cabe mais nada...",
    fun_yay: "Iuhuu! Mais uma vez!", tooTired: "Tô cansadinho demais pra brincar...",
    clean_yay: "Cheirosinho e brilhando! ✨", goodnight: "Boa noite... zzz", wokeUp: "Acordei! Pronto pra ajudar!",
    shh: "Shhh... o Raccoon está dormindo 💤", levelUp: "Subi para o nível {n}! 🎉",
    offline: "Não consegui falar com meu cérebro de IA agora. O servidor está rodando?",
    listening: "Tô ouvindo! 👂", noVoice: "Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.",
    wakeOn: 'Modo mãos-livres ligado: diga "Ei Raccoon" e depois seu pedido.', wakeOff: "Modo mãos-livres desligado.",
    langChanged: "Agora vou falar português!", noTasks: "Nenhuma tarefa ainda", noReminders: "Nenhum lembrete",
    delete: "Apagar", taskDone: "Tarefa feita! Mandou bem! 🎉", reminder: "Lembrete",
    goodMorning: "Bom dia!", goodAfternoon: "Boa tarde!", goodEvening: "Boa noite!",
    howHelp: "Como posso te ajudar hoje?", needCare: "Tô precisando de um carinho... cuida de mim?",
    micDenied: "Permissão do microfone negada.", micError: "Erro no microfone",
    days: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
  },
  en: {
    hunger: "Food", energy: "Energy", fun: "Fun", hygiene: "Hygiene",
    feed: "Feed", play: "Play", sleep: "Sleep", wake_up: "Wake up", clean: "Clean",
    speak: "Speak replies", wake: '"Hey Raccoon" mode', tasks: "Tasks", reminders: "Reminders",
    hint: 'Tip: say "remind me to drink water at 3pm" or "add buy bread to my list".',
    placeholder: "Ask Raccoon anything...", newTask: "New task...", lvl: "Lv.",
    yum: "Nom nom! Delicious! 😋", full: "I'm stuffed! No more room...",
    fun_yay: "Wheee! Again, again!", tooTired: "I'm too tired to play...",
    clean_yay: "Squeaky clean and shiny! ✨", goodnight: "Good night... zzz", wokeUp: "I'm awake! Ready to help!",
    shh: "Shhh... Raccoon is sleeping 💤", levelUp: "Level up! I'm level {n}! 🎉",
    offline: "I couldn't reach my AI brain right now. Is the server running?",
    listening: "I'm listening! 👂", noVoice: "Your browser doesn't support speech recognition. Try Chrome, Edge or Safari.",
    wakeOn: 'Hands-free mode on: say "Hey Raccoon" and then your request.', wakeOff: "Hands-free mode off.",
    langChanged: "Now I'll speak English!", noTasks: "No tasks yet", noReminders: "No reminders",
    delete: "Delete", taskDone: "Task done! Great job! 🎉", reminder: "Reminder",
    goodMorning: "Good morning!", goodAfternoon: "Good afternoon!", goodEvening: "Good evening!",
    howHelp: "How can I help you today?", needCare: "I could use some care... will you look after me?",
    micDenied: "Microphone permission denied.", micError: "Microphone error",
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
};

// Adivinha se um texto está em português ou inglês (para escolher a voz)
const PT = /\b(você|voce|não|nao|é|está|que|como|para|pra|uma|um|meu|minha|por|favor|obrigad\w|olá|oi|qual|quando|onde|hoje|amanhã|de|do|da|com|eu|tem)\b/gi;
const EN = /\b(you|the|what|how|is|are|please|thanks|hello|hi|my|when|where|today|tomorrow|with|i|have|can|do|to|of|and)\b/gi;
export function detectLang(text, fallback = "pt") {
  const pt = (text.match(PT) || []).length + (/[ãõçáéíóúâê]/i.test(text) ? 2 : 0);
  const en = (text.match(EN) || []).length;
  if (pt === en) return fallback;
  return pt > en ? "pt" : "en";
}
