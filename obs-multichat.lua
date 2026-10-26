-- MultiChat para OBS: liga o servidor do chat quando o OBS abre e desliga quando fecha.
-- Instalação: OBS → Ferramentas → Scripts → "+" → selecione este arquivo.

obs = obslua

local PORT = 8787

local function folder()
  return script_path():gsub("[/\\]$", "")
end

function script_description()
  return [[<h3>MultiChat para OBS</h3>
<p>Liga o chat unificado (TikTok, Twitch, YouTube, Kick) junto com o OBS.</p>
<p>Painel: <a href="http://localhost:8787/">http://localhost:8787/</a><br>
Overlay: <code>http://localhost:8787/overlay.html</code></p>]]
end

function script_load(settings)
  local dir = folder():gsub("/", "\\")
  -- Roda o servidor escondido (sem janela). Se já estiver rodando, o servidor apenas sai.
  os.execute('start "" wscript.exe "' .. dir .. '\\iniciar-oculto.vbs"')
end

function script_unload()
  os.execute('start "" /b curl -s -X POST http://127.0.0.1:' .. PORT .. '/api/shutdown >nul 2>nul')
end
