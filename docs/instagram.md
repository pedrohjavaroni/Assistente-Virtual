# Conectar o Jarvis ao Instagram

Criar conteúdo (ideias, roteiros de Reels, legendas, hashtags, calendário) funciona **sem conectar nada**.
A conexão serve para o Jarvis **ver as métricas** da sua conta e **publicar/agendar** posts pela API oficial da Meta.

Leva uns 15 minutos, uma vez só. Os nomes dos menus da Meta mudam de vez em quando; se algum estiver diferente, procure o equivalente.

## 1. Conta profissional
A API só funciona com conta **Criador de conteúdo** ou **Empresa** (é grátis e dá para voltar atrás).
No app do Instagram: **Configurações → Tipo de conta e ferramentas → Mudar para conta profissional**.

## 2. Criar um app na Meta
1. Entre em https://developers.facebook.com com a sua conta e clique em **Meus apps → Criar app**.
2. Escolha um app do tipo **Empresa (Business)** e dê um nome, por exemplo `Jarvis`.
3. No painel do app, adicione o produto **Instagram** e abra **Configuração da API com login do Instagram**
   (*API setup with Instagram business login*).

## 3. Gerar o token
1. Nessa tela, em **Gerar tokens de acesso**, adicione a sua conta do Instagram.
   Se pedir, aceite o convite de testador no Instagram: **Configurações → Apps e sites → Convites de testador**.
2. Clique em **Gerar token**, faça login no Instagram e autorize as três permissões:
   - `instagram_business_basic` (ler perfil e posts)
   - `instagram_business_manage_insights` (métricas)
   - `instagram_business_content_publish` (publicar)
3. Copie o token (um texto longo que começa com `IG`).

## 4. Colar no Jarvis
Abra o Jarvis, vá em **Configurações → Instagram**, cole o token e clique em **Conectar**.
Se aparecer `Conectado como @seu_usuario`, está pronto. Experimente:

- *"Jarvis, como foi meu Instagram essa semana?"*
- *"Qual foi meu Reels com mais alcance?"*
- *"Pega o último vídeo da pasta Vídeos, deixa vertical, tira as pausas e posta com uma legenda sobre …"*
- *"Agenda esse Reels para amanhã às 18h."*

## O que vale saber
- **Ele sempre pede sua confirmação antes de publicar ou agendar**, mostrando a legenda final.
- **Reels**: o vídeo pode estar no computador (`.mp4` ou `.mov`, até 300 MB).
- **Fotos**: a API do Instagram só aceita foto por link público (https). Foto que está só no computador precisa ser postada pelo app do Instagram.
- **Agendamento**: quem publica na hora marcada é o seu computador, então ele precisa estar ligado com o Jarvis aberto. Se estiver desligado por mais de 2 horas depois do horário, o post não sai e o Jarvis avisa.
- **Token**: vale 60 dias e o Jarvis renova sozinho toda semana enquanto estiver em uso. Se expirar, gere outro no passo 3.
- **Privacidade**: o token fica salvo só no seu computador (pasta de dados do Jarvis). Para remover: **Configurações → Instagram → Desconectar**.
- A Meta pode atrasar as métricas em até 48 horas, e contas com menos de 100 seguidores não recebem alguns números.
- Também funciona com token do "login do Facebook" (começa com `EAA`), para quem já tem a conta ligada a uma página.
