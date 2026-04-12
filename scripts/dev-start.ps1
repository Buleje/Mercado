# Buleje — Iniciar servidor de desarrollo
# Abre el navegador en la página de SuperAdmin cuando el servidor esté listo

$ProjectDir = Split-Path -Parent $PSScriptRoot

Set-Location $ProjectDir

# Matar procesos Node viejos (igual que npm run dev:clean)
Write-Host "Cerrando procesos anteriores de Node.js..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Abrir el navegador cuando el servidor esté disponible (en paralelo)
Start-Job -ScriptBlock {
    $url = "http://localhost:3000/superadmin"
    Write-Host "Esperando que el servidor arranque en $url..." -ForegroundColor Cyan
    $intentos = 0
    while ($intentos -lt 60) {
        Start-Sleep -Seconds 2
        try {
            $resp = Invoke-WebRequest -Uri $url -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
            if ($resp.StatusCode -lt 500) {
                Start-Process $url
                break
            }
        } catch { }
        $intentos++
    }
} | Out-Null

# Iniciar servidor de desarrollo
Write-Host "Iniciando Buleje en localhost:3000..." -ForegroundColor Green
npm run dev
