// Textos da interface em português e inglês
export const I18N = {
  pt: {
    hunger: "Fome", energy: "Energia", fun: "Vibe", hygiene: "Estilo",
    feed: "Comer", play: "Jogar", sleep: "Dormir", wake_up: "Acordar", clean: "Banho",
    speak: "Falar respostas", wake: 'Modo "Ei Raccoon"', tasks: "Tarefas", reminders: "Lembretes",
    hint: 'Dica: diga "me lembre de beber água às 15h" ou "adicione comprar pão na lista".',
    placeholder: "Pergunte algo ao Raccoon...", newTask: "Nova tarefa...", lvl: "Nv.",
    yum: "Valeu, tava precisando disso.", full: "Tô de boa, já comi demais.",
    fun_yay: "GG! Mais uma partida?", tooTired: "Tô sem bateria pra isso agora.",
    clean_yay: "Agora sim, no estilo.", goodnight: "Vou dar uma pausa. Me chama se precisar.", wokeUp: "Voltei. Bora?",
    shh: "Modo descanso. Deixa recarregar.", levelUp: "Level up: nível {n}.",
    offline: "Perdi a conexão com o servidor. Ele tá rodando?",
    listening: "Pode falar.", noVoice: "Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.",
    wakeOn: 'Modo mãos-livres ligado: diga "Ei Raccoon" e depois seu pedido.', wakeOff: "Modo mãos-livres desligado.",
    langChanged: "Beleza, falando português.", noTasks: "Nenhuma tarefa ainda", noReminders: "Nenhum lembrete",
    delete: "Apagar", taskDone: "Feito. Mandou bem.", reminder: "Lembrete",
    goodMorning: "Bom dia!", goodAfternoon: "Boa tarde!", goodEvening: "Boa noite!",
    howHelp: "O que vamos resolver hoje?", needCare: "Tô meio largado aqui... dá uma moral?",
    micDenied: "Permissão do microfone negada.", micError: "Erro no microfone",
    voiceLoading: "Baixando o modelo de voz (só na primeira vez, ~80 MB)...", voiceReady: "Voz pronta.",
    apiKey: "Chave da API do Claude", needKey: "Cole sua chave da API do Claude em Tarefas → Chave da API para eu funcionar.", keySaved: "Chave salva. Bora!",
    calendar: "Google Agenda", save: "Salvar", gcalHow: "Como conseguir essas chaves?", gcalConnect: "Conectar Google Agenda",
    gcalDisconnect: "Desconectar", gcalNeedConfig: "Cole o Client ID e o Client Secret do Google (passo a passo no link abaixo).",
    gcalReady: "Tudo pronto. Agora é só entrar com sua conta Google.", gcalConnected: "Conectada: {email}",
    gcalRemote: "A agenda é conectada pelo computador onde o Raccoon roda.", gcalRemoteOn: "Conectada pelo computador: {email}",
    gcalWaiting: "Termine o login na janela do navegador...", gcalNow: "Conectei sua agenda! Pergunta o que você tem hoje.",
    gcalEmpty: "Nada nas próximas 24 h", gcalSoon: "Daqui a {n} min: {title}", gcalNowEvt: "Começando agora: {title}",
    gcalError: "Não consegui falar com o Google Agenda.",
    companion: "Guaxinim na tela", companionOn: "Agora o Raccoon fica andando pela sua tela.", companionOff: "Voltou pro app.",
    days: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
  },
  en: {
    hunger: "Food", energy: "Energy", fun: "Vibe", hygiene: "Style",
    feed: "Eat", play: "Game", sleep: "Sleep", wake_up: "Wake up", clean: "Shower",
    speak: "Speak replies", wake: '"Hey Raccoon" mode', tasks: "Tasks", reminders: "Reminders",
    hint: 'Tip: say "remind me to drink water at 3pm" or "add buy bread to my list".',
    placeholder: "Ask Raccoon anything...", newTask: "New task...", lvl: "Lv.",
    yum: "Thanks, I needed that.", full: "I'm good, already ate way too much.",
    fun_yay: "GG! Run it back?", tooTired: "Battery's too low for that right now.",
    clean_yay: "Fresh. Looking sharp.", goodnight: "Taking a break. Ping me if you need me.", wokeUp: "I'm back. Let's go?",
    shh: "Rest mode. Let the battery recharge.", levelUp: "Level up: level {n}.",
    offline: "Lost connection to the server. Is it running?",
    listening: "Go ahead.", noVoice: "Your browser doesn't support speech recognition. Try Chrome, Edge or Safari.",
    wakeOn: 'Hands-free mode on: say "Hey Raccoon" and then your request.', wakeOff: "Hands-free mode off.",
    langChanged: "Cool, switching to English.", noTasks: "No tasks yet", noReminders: "No reminders",
    delete: "Delete", taskDone: "Done. Nice work.", reminder: "Reminder",
    goodMorning: "Good morning!", goodAfternoon: "Good afternoon!", goodEvening: "Good evening!",
    howHelp: "What are we tackling today?", needCare: "I'm kinda neglected over here... help a raccoon out?",
    micDenied: "Microphone permission denied.", micError: "Microphone error",
    voiceLoading: "Downloading the voice model (first time only, ~80 MB)...", voiceReady: "Voice ready.",
    apiKey: "Claude API key", needKey: "Paste your Claude API key under Tasks → API key so I can work.", keySaved: "Key saved. Let's go!",
    calendar: "Google Calendar", save: "Save", gcalHow: "How do I get these keys?", gcalConnect: "Connect Google Calendar",
    gcalDisconnect: "Disconnect", gcalNeedConfig: "Paste your Google Client ID and Client Secret (step by step in the link below).",
    gcalReady: "All set. Now just sign in with your Google account.", gcalConnected: "Connected: {email}",
    gcalRemote: "The calendar is connected from the computer running Raccoon.", gcalRemoteOn: "Connected from the computer: {email}",
    gcalWaiting: "Finish signing in in the browser window...", gcalNow: "Calendar connected! Ask me what you've got today.",
    gcalEmpty: "Nothing in the next 24 h", gcalSoon: "In {n} min: {title}", gcalNowEvt: "Starting now: {title}",
    gcalError: "Couldn't reach Google Calendar.",
    companion: "Raccoon on screen", companionOn: "Raccoon will hang out on your screen now.", companionOff: "Back in the app.",
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
