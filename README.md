<p align="center"><img src="assets/logo.svg" width="96" alt="UltraChat"></p>

# UltraChat para OBS

Junta o chat do **TikTok, Twitch, YouTube e Kick** em um overlay só para o OBS — sem login em nenhuma plataforma.

**Site:** https://eliezertsilva.github.io/ultrachat/ · **[Baixar o instalador](https://github.com/eliezertsilva/ultrachat/releases/latest/download/UltraChat-Setup.exe)**

## Instalação fácil (recomendado)

Baixe o pacote do seu sistema na [página de releases](https://github.com/eliezertsilva/ultrachat/releases/latest):

| Sistema | Arquivo |
|---|---|
| Windows 10/11 | `UltraChat-Setup.exe` |
| macOS com Apple Silicon (M1–M4) | `UltraChat-darwin-arm64.tar.gz` |
| macOS com Intel | `UltraChat-darwin-x64.tar.gz` |
| Linux (PC comum) | `UltraChat-linux-x64.tar.gz` |
| Linux ARM (ex.: Raspberry Pi 5) | `UltraChat-linux-arm64.tar.gz` |

### macOS
1. Feche o OBS.
2. Dê dois cliques no `.tar.gz` para extrair e abra a pasta **UltraChat**.
3. Clique com o botão direito em **Instalar UltraChat.command → Abrir** (na primeira vez o macOS pede essa confirmação porque o arquivo não é assinado).
4. Abra o OBS — o UltraChat liga sozinho e os docks aparecem.

Instala em `~/Library/Application Support/UltraChat`. Para remover: `sh ~/Library/Application\ Support/UltraChat/uninstall.sh`.

### Linux
```sh
tar -xzf UltraChat-linux-x64.tar.gz
sh UltraChat/install.sh
```
Instala em `~/.local/share/ultrachat` e configura o OBS normal e o OBS via Flatpak. Para remover: `sh ~/.local/share/ultrachat/uninstall.sh`.

### Windows
Rode **`UltraChat-Setup.exe`** (com o OBS fechado), escolha a pasta e pronto:
- não precisa instalar Node.js (já vem junto);
- o OBS fica configurado sozinho: o UltraChat liga escondido quando o OBS abre, e aparecem os docks **UltraChat - Chat** e **UltraChat - Painel** (menu *Docks*);
- falta só adicionar a Fonte de Navegador `http://localhost:8787/overlay.html` na sua cena.

Para remover: *Configurações do Windows → Aplicativos → UltraChat para OBS → Desinstalar* (desfaz a configuração do OBS).
As configurações originais do OBS ficam salvas com a extensão `.ultrachat-backup`.

### Gerar os instaladores a partir do código
- **Windows:** `npm install`, baixe o `node.exe` para `installer\node\` e rode o Inno Setup 6 em `installer\ultrachat.iss`.
- **macOS e Linux:** `npm install` e depois `node tools/build-unix.mjs` (baixa o Node oficial de cada sistema e gera os `.tar.gz` em `installer/Output`).

## Como usar (a partir do código)

1. Instale o [Node.js](https://nodejs.org) (versão 20 ou mais nova).
2. Dê dois cliques em **`iniciar.bat`**. Na primeira vez ele instala as dependências.
3. Abra o painel: **http://localhost:8787/**
4. Ligue as plataformas, preencha seus canais e clique em **Salvar e aplicar**.
5. No OBS: **Fontes → + → Navegador** → URL `http://localhost:8787/overlay.html` (ex.: largura 400, altura 600).

Use o botão **Enviar mensagens de teste** para posicionar o overlay sem estar ao vivo.

### Iniciar junto com o OBS (recomendado)
Faça isso uma vez só:
1. OBS → **Ferramentas → Scripts**.
2. Clique no **+** e selecione `obs-ultrachat.lua` (nesta pasta).

Pronto: a partir daí o UltraChat liga escondido (sem janela) sempre que o OBS abre e desliga quando o OBS fecha — você não precisa mais abrir o `iniciar.bat`.
Se trocar de *Coleção de cenas* no OBS, adicione o script nela também (o OBS guarda scripts por coleção).
Erros ficam em `ultrachat.log`.

### Ver o chat dentro do OBS (Dock)
OBS → **Docks → Docks de navegador personalizados**:
- Chat para você ler: `http://localhost:8787/overlay.html?dock=1`
- Painel de configuração: `http://localhost:8787/`

## Plataformas

| Plataforma | O que preencher | Observações |
|---|---|---|
| TikTok | seu @ | Mostra presentes, seguidores (opcional: entradas e compartilhamentos). Se a live ainda não começou, ele tenta de novo a cada 60s. |
| Twitch | nome do canal | Mostra emotes, subs, bits e raids. Mensagens apagadas/bans somem do overlay. |
| YouTube | `@seucanal` ou link da live | Acha a live atual sozinho. Super Chats e membros aparecem destacados. |
| Kick | nome do canal | A Kick às vezes bloqueia a busca automática. Se aparecer erro, abra `https://kick.com/api/v2/channels/SEUCANAL` no navegador, copie o número em `"chatroom":{"id": ...}` e cole no campo **Chatroom ID**. |

## Ajustes por fonte (URL)
Qualquer opção de aparência pode ser trocada direto no URL, útil para ter overlays diferentes em cenas diferentes:

```
overlay.html?theme=compact&fontSize=22
overlay.html?platforms=tiktok          (só TikTok)
overlay.html?platforms=twitch,youtube
overlay.html?hideAfter=15&align=right
```

Temas: `bubble` (balões), `clean` (só texto), `compact` (uma linha).

## Pontos, ranks e comandos
O chat ganha pontos nas quatro plataformas, sem precisar de TikFinity ou outro programa. Tudo é configurado no painel (seção **Pontos e ranks**):

- **Mensagem** (com intervalo mínimo entre mensagens que pontuam), **follow** (TikTok, só o primeiro), **sub/membro**, **diamantes** (TikTok), **bits** (Twitch) e **Super Chat** (YouTube, por unidade da moeda).
- **Ranks** por faixa de pontos, um por linha: `Veterano = 2000`.
- **Comandos** `!pontos`, `!rank` e `!top`. A resposta aparece no overlay como mensagem do bot (o UltraChat não escreve no chat das plataformas). Funcionam mesmo com "Esconder comandos" ligado.
- Cada pessoa é contada por plataforma (`tiktok:fulano` e `twitch:fulano` são pontuações separadas).
- Os pontos ficam em `loyalty.json`, na pasta do UltraChat. O painel mostra o ranking e tem o botão **Zerar pontos**.

Overlay do ranking (Fonte de Navegador, ex.: 360×420): `http://localhost:8787/top.html`

```
top.html?limit=10                 (top 10)
top.html?title=Top%20da%20live    (título; title= vazio esconde)
top.html?platforms=tiktok         (só TikTok)
top.html?fontSize=24&avatars=0
```

## Alertas
Alertas próprios (vídeo, GIF, imagem, som e texto) para eventos das quatro plataformas, configurados no painel (seção **Alertas**):

- Cada alerta tem **quando** (plataforma + evento, com presente específico ou faixa de diamantes/bits/valor) e **o que mostrar** (mídia, som, texto com `{nome}`, `{quantidade}`, `{presente}`, `{valor}`, `{mensagem}`, `{meses}`, posição, tamanho, cor e duração).
- Os alertas entram numa fila: nunca aparecem um em cima do outro.
- Envie as mídias pelo painel; elas ficam na pasta `media/`. A lista de presentes do TikTok se monta sozinha com os presentes que aparecem na sua live.
- Botão **Testar** em cada alerta.

Overlay: Fonte de Navegador com `http://localhost:8787/alerts.html` no tamanho da tela (1920×1080), com **Controlar áudio via OBS** marcado.

Eventos sem login: TikTok (presentes, follow, compartilhamento, sub), Twitch (sub, subs de presente, bits, raid), YouTube (Super Chat, Super Sticker, membro) e Kick (sub, subs de presente).

**Follow da Twitch:** em *Conexões → Twitch*, clique em **Conectar conta da Twitch** e digite o código que aparece em twitch.tv/activate (use a conta do canal ou de um moderador). O UltraChat nunca vê sua senha; o acesso fica em `auth.json` e pode ser desfeito em **Desconectar**.

## Abrir o UltraChat sem o OBS
O atalho **UltraChat** (menu Iniciar / área de trabalho no Windows, menu de aplicativos no macOS e Linux) abre o painel numa janela própria e liga o servidor se ele estiver desligado. A partir do código: `node tools/app.mjs`.

## Problemas comuns
- **TikTok: erro de "rate limit"** — a conexão do TikTok usa um serviço de assinatura gratuito (Euler Stream) com limite de uso. Crie uma API key grátis em eulerstream.com e cole em *TikTok → Avançado*.
- **Kick parou de conectar com erro de "chave"** — a Kick troca a chave do chat de vez em quando. Atualize o projeto ou preencha *Kick → Pusher key*.
- **Overlay vazio no OBS** — confira se a janela do `iniciar.bat` está aberta.
- **Trocar a porta** — edite `port` em `config.json` e reinicie.

As configurações ficam em `config.json` (criado ao salvar no painel).
