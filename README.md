# 🦝 Raccoon IA

Assistente virtual em formato de guaxinim, estilo **tamagotchi** + **inteligência artificial** (Claude).
<img src="docs/screenshot-celular.png" alt="Raccoon IA no celular" width="280" align="right" />

Funciona no **PC e no celular** (é um PWA: dá para instalar como app) e entende **comandos de voz em português e inglês**.

## O que ele faz

- **Bichinho virtual 2D animado** — pisca, balança a cauda, fala, dorme, fica feliz, triste, pensativo ou apaixonado.
- **Cuidados estilo tamagotchi** — fome, energia, diversão e higiene caem com o tempo (inclusive com o app fechado).
  Alimente, brinque, coloque para dormir e dê banho. Ganha XP e sobe de nível.
- **IA de verdade** — responde perguntas, dá ideias e ajuda no dia a dia, com personalidade de guaxinim.
- **Tarefas e lembretes** — "adicione comprar pão na lista", "me lembre de beber água às 15h".
  O Raccoon usa ferramentas para criar a tarefa/lembrete e avisa com notificação + voz na hora certa.
- **Voz em PT-BR e EN-US**
  - 🎤 botão do microfone: fale uma frase e ela é enviada.
  - Modo **"Ei Raccoon"** (mãos-livres): fica ouvindo e responde quando você chama pelo nome.
  - Respostas lidas em voz alta, no idioma em que você falou.
  - Comandos curtos ("alimentar", "brincar", "dormir", "banho", "feed", "play"...) funcionam na hora, sem gastar IA.

## Como rodar

Precisa de **Node.js 20+** e uma chave da API do Claude (https://console.anthropic.com).

```bash
npm install
cp .env.example .env        # e coloque sua ANTHROPIC_API_KEY
npm start
```

Abra **http://localhost:3000** no Chrome, Edge ou Safari.

### No celular

1. Rode o servidor no PC e acesse pelo IP da rede (ex: `http://192.168.0.10:3000`) — ou publique o servidor
   (Render, Railway, Fly.io etc.). Microfone e instalação exigem **HTTPS** fora do `localhost`.
2. No navegador do celular: menu → **"Adicionar à tela inicial" / "Instalar app"**.

## Estrutura

```
server/
  index.js    servidor Express + ponte com a API do Claude (streaming via SSE)
  prompt.js   personalidade do Raccoon + estado do bichinho e das tarefas
  tools.js    ferramentas da IA: add_task, complete_task, set_reminder, set_mood
public/
  index.html  tela e o guaxinim em SVG
  style.css   visual e animações (claro/escuro)
  app.js      lógica do tamagotchi, chat, tarefas e lembretes
  voice.js    reconhecimento e síntese de voz (Web Speech API)
  i18n.js     textos em português e inglês
  sw.js, manifest.webmanifest   PWA (instalável / offline)
```

- A chave da API fica só no servidor. Tarefas, lembretes e o estado do bichinho ficam salvos no aparelho (localStorage).
- Modelo padrão: `claude-opus-5-5` com esforço baixo (respostas rápidas para conversa por voz).
  Troque com `RACCOON_MODEL` no `.env`. Se o modelo recusar um pedido, a API tenta um modelo alternativo automaticamente.

## Limitações conhecidas

- Reconhecimento de voz depende do navegador: Chrome/Edge (PC e Android) e Safari (iOS 14.5+). O Firefox não suporta.
- Lembretes disparam com o app aberto (ou em segundo plano recente). Para notificações com o app totalmente fechado
  seria preciso push no servidor — um próximo passo.

## Próximos passos sugeridos

- Empacotar como app nativo: **Capacitor** (Android/iOS) e **Tauri/Electron** (Windows/Mac).
- Notificações push pelo servidor, integração com Google Agenda, mini-games para o guaxinim, roupinhas/acessórios.
