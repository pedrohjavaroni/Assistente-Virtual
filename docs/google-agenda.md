# Conectar o Jarvis ao Google Agenda

Com a agenda conectada, o Jarvis:
- responde "o que eu tenho hoje?", "tô livre sexta à tarde?"
- cria compromissos: "marca dentista quinta às 15h", "coloca a prova de física dia 12"
- apaga compromissos quando você pede
- avisa (balão, voz e notificação) uns 10 minutos antes de cada compromisso
- mostra os próximos compromissos em **Tarefas e agenda**

O Google exige que cada app tenha sua própria "chave" (Client ID). Dá pra criar de graça, e só precisa fazer uma vez (~5 min):

## 1. Criar o projeto e ativar a API
1. Entre em https://console.cloud.google.com/ com sua conta Google.
2. No topo, clique em **Selecionar projeto → Novo projeto**, coloque o nome `Jarvis` e clique em **Criar**.
3. Abra https://console.cloud.google.com/apis/library/calendar-json.googleapis.com e clique em **Ativar**.

## 2. Tela de consentimento
1. Vá em **APIs e serviços → Tela de permissão OAuth** (ou "Google Auth Platform → Branding").
2. Tipo de usuário: **Externo**. Preencha o nome do app (`Jarvis`) e seu e-mail.
3. Em **Público-alvo / Usuários de teste**, clique em **Adicionar usuários** e coloque **o seu e-mail do Gmail**.
   (Enquanto o app estiver "em teste", só os e-mails dessa lista conseguem entrar. Para uso pessoal, é o suficiente.)

## 3. Criar a chave
1. Vá em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Tipo de aplicativo: **App para computador** (Desktop app). Nome: `Jarvis`.
3. Copie o **Client ID** e o **Client Secret**.

## 4. Conectar no Jarvis
1. No computador onde o Jarvis roda, abra **Configurações → Google Agenda**.
2. Cole o Client ID e o Client Secret e clique em **Salvar**.
3. Clique em **Conectar com o Google** e entre com sua conta.
   - O Google pode avisar "O Google não verificou este app". Isso é normal para apps pessoais:
     clique em **Avançado → Acessar Jarvis (não seguro)**.
   - Marque a permissão de ver e editar eventos.
4. Pronto. Pergunte: *"Jarvis, o que eu tenho amanhã?"*

## Privacidade
- O acesso (token) fica salvo só no seu computador: na pasta `data/` do projeto, ou na pasta de dados do app desktop.
- Para desconectar: **Configurações → Google Agenda → Desconectar** (isso também revoga o acesso no Google).

Opcional: em vez de colar no app, dá pra definir `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no arquivo `.env`.
