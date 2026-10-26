-- UltraChat para OBS: liga o servidor do chat quando o OBS abre e desliga quando fecha.
-- Funciona no Windows, macOS e Linux.
-- Instalação manual: OBS → Ferramentas → Scripts → "+" → selecione este arquivo.

obs = obslua

local PORT = 8787
local IS_WINDOWS = package.config:sub(1, 1) == "\\"

local function folder()
  return script_path():gsub("[/\\]$", "")
end

function script_description()
  return [[<h3>UltraChat para OBS</h3>
<p>Liga o chat unificado (TikTok, Twitch, YouTube, Kick) junto com o OBS.</p>
<p>Painel: <a href="http://localhost:8787/">http://localhost:8787/</a><br>
Overlay: <code>http://localhost:8787/overlay.html</code></p>]]
end

function script_load(settings)
  local dir = folder()
  -- Se o servidor já estiver rodando, a cópia nova apenas sai.
  if IS_WINDOWS then
    dir = dir:gsub("/", "\\")
    os.execute('start "" wscript.exe "' .. dir .. '\\iniciar-oculto.vbs"')
  else
    os.execute('sh "' .. dir .. '/start.sh" >/dev/null 2>&1 &')
  end
end

function script_unload()
  local url = 'http://127.0.0.1:' .. PORT .. '/api/shutdown'
  if IS_WINDOWS then
    os.execute('start "" /b curl -s -X POST ' .. url .. ' >nul 2>nul')
  else
    os.execute('curl -s -X POST ' .. url .. ' >/dev/null 2>&1 &')
  end
end
