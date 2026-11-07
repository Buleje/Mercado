#!/usr/bin/env bash
# Compila el asistente de voz con el csc.exe que ya trae Windows, lo deja en
# %LOCALAPPDATA%\AsistenteClaude, lo pone a arrancar con Windows y lo (re)lanza.
#   .claude/asistente-voz/instalar.sh            → compilar + instalar + arrancar
#   .claude/asistente-voz/instalar.sh --probar X → reconoce el .wav X (16 kHz mono) y muestra qué oyó
set -euo pipefail
aqui="$(cd "$(dirname "$0")" && pwd)"
cd /mnt/c
local_win="$(powershell.exe -NoProfile -Command '$env:LOCALAPPDATA' | tr -d '\r')"
dest="$(wslpath "$local_win")/AsistenteClaude"
mkdir -p "$dest"

if [[ "${1:-}" == "--probar" ]]; then
  cp "$2" "$dest/prueba.wav"
  powershell.exe -NoProfile -Command "Start-Process -Wait '$local_win\\AsistenteClaude\\AsistenteClaude.exe' -ArgumentList '--probar','$local_win\\AsistenteClaude\\prueba.wav',${3:-0.5}"
  cat "$dest/prueba.txt"
  exit 0
fi

cp "$aqui/AsistenteClaude.cs" "$dest/AsistenteClaude.cs"
powershell.exe -NoProfile -Command "
\$d = '$local_win\\AsistenteClaude'
Get-Process AsistenteClaude -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 300
\$fw = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319'
& \"\$fw\\csc.exe\" /nologo /codepage:65001 /target:winexe /optimize+ /out:\"\$d\\AsistenteClaude.exe\" \`
  /r:\"\$fw\\WPF\\System.Speech.dll\" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Core.dll \"\$d\\AsistenteClaude.cs\"
if (\$LASTEXITCODE -ne 0) { exit 1 }
\$inicio = [Environment]::GetFolderPath('Startup') + '\\Asistente Claude.lnk'
\$ws = New-Object -ComObject WScript.Shell
\$lnk = \$ws.CreateShortcut(\$inicio); \$lnk.TargetPath = \"\$d\\AsistenteClaude.exe\"; \$lnk.WorkingDirectory = \$d; \$lnk.Save()
Start-Process \"\$d\\AsistenteClaude.exe\"
'instalado y arrancado'
" | tr -d '\r'
