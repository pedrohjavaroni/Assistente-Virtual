# O celular não abre o endereço do Raccoon

Rode `npm start` no PC. O terminal mostra o endereço e um **QR code**: aponte a câmera do celular para ele.
Se mesmo assim não abrir, confira na ordem:

1. **O servidor está rodando?** A janela do terminal com o `npm start` precisa continuar aberta.
   No próprio PC, teste `http://localhost:3000` no navegador.
2. **Você abriu o app desktop (`npm run desktop`) em vez do `npm start`?**
   O app desktop só aceita conexões do próprio PC. Para usar no celular, rode `npm start`.
3. **O celular está no mesmo Wi-Fi do PC?** Não pode estar no 4G/5G nem numa rede "convidados"
   (redes de convidados e algumas redes de faculdade e empresa bloqueiam aparelhos de se enxergarem).
4. **O endereço está certinho?** Tem que começar com `http://` (sem o "s") e ter a porta no final, ex.: `http://192.168.0.10:3000`.
   Se o terminal mostrar mais de um endereço, tente os outros.
5. **Firewall do Windows** (a causa mais comum). Na primeira vez que o Node roda, o Windows pergunta se pode
   liberar a rede. Se você fechou ou negou:
   - Configurações → Rede e Internet → Wi-Fi → sua rede → marque **Rede privada**
   - e abra o **PowerShell como administrador** e rode:
     ```powershell
     netsh advfirewall firewall add rule name="Raccoon IA" dir=in action=allow protocol=TCP localport=3000 profile=private
     ```
   No Mac: Ajustes do Sistema → Rede → Firewall → Opções → permita o `node`.
6. **Antivírus** (Avast, Kaspersky, Norton...) às vezes tem firewall próprio. Libere o Node.js ou a porta 3000 nele.

## iPhone
- Abrir pelo endereço `http://` funciona para chat, tamagotchi, tarefas e agenda.
- **Microfone e "Adicionar à Tela de Início" precisam de `https://`.** Para testar, rode num segundo terminal:
  ```bash
  npx cloudflared tunnel --url http://localhost:3000
  ```
  e abra no Safari o endereço `https://....trycloudflare.com` que aparecer. Esse endereço demora uns 10 a 30 segundos para começar a funcionar.
  Enquanto o túnel estiver ligado, qualquer pessoa com o link consegue usar o Raccoon, então feche com Ctrl+C depois de testar.
