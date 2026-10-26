# MultiChat para OBS

Junta o chat do **TikTok, Twitch, YouTube e Kick** em um overlay só para o OBS — sem login em nenhuma plataforma.

## Instalação fácil (recomendado)

Rode **`MultiChat-OBS-Setup.exe`** (com o OBS fechado), escolha a pasta e pronto:
- não precisa instalar Node.js (já vem junto);
- o OBS fica configurado sozinho: o MultiChat liga escondido quando o OBS abre, e aparecem os docks **MultiChat - Chat** e **MultiChat - Painel** (menu *Docks*);
- falta só adicionar a Fonte de Navegador `http://localhost:8787/overlay.html` na sua cena.

Para remover: *Configurações do Windows → Aplicativos → MultiChat para OBS → Desinstalar* (desfaz a configuração do OBS).
As configurações originais do OBS ficam salvas com a extensão `.multichat-backup`.

Para gerar o instalador a partir do código: `npm install`, baixe o `node.exe` para `installer\node\` e rode o Inno Setup 6 em `installer\multichat.iss`.

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
2. Clique no **+** e selecione `obs-multichat.lua` (nesta pasta).

Pronto: a partir daí o MultiChat liga escondido (sem janela) sempre que o OBS abre e desliga quando o OBS fecha — você não precisa mais abrir o `iniciar.bat`.
Se trocar de *Coleção de cenas* no OBS, adicione o script nela também (o OBS guarda scripts por coleção).
Erros ficam em `multichat.log`.

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

## Problemas comuns
- **TikTok: erro de "rate limit"** — a conexão do TikTok usa um serviço de assinatura gratuito (Euler Stream) com limite de uso. Crie uma API key grátis em eulerstream.com e cole em *TikTok → Avançado*.
- **Kick parou de conectar com erro de "chave"** — a Kick troca a chave do chat de vez em quando. Atualize o projeto ou preencha *Kick → Pusher key*.
- **Overlay vazio no OBS** — confira se a janela do `iniciar.bat` está aberta.
- **Trocar a porta** — edite `port` em `config.json` e reinicie.

As configurações ficam em `config.json` (criado ao salvar no painel).
