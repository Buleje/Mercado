# Deja el agente de sincronización andando y lo hace arrancar solo con Windows.
#
#   .\instalar.ps1 -Clave "sk_..." -Api "https://tu-dominio.com"
#
# No necesita permisos de administrador: la tarea se registra para el usuario actual.

param(
  [Parameter(Mandatory = $true)][string]$Clave,
  [Parameter(Mandatory = $true)][string]$Api,
  [string]$Carpeta = "$env:USERPROFILE\Buleje-Drive",
  [int]$IntervaloSegundos = 30
)

$ErrorActionPreference = "Stop"
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Node tiene que estar disponible.
try {
  $version = (node --version)
  Write-Host "  Node detectado: $version"
} catch {
  Write-Error "No encontre Node.js. Instalalo desde https://nodejs.org y volve a correr esto."
  exit 1
}

# 2. La carpeta que se va a sincronizar.
if (-not (Test-Path $Carpeta)) {
  New-Item -ItemType Directory -Path $Carpeta -Force | Out-Null
  Write-Host "  Carpeta creada: $Carpeta"
} else {
  Write-Host "  Carpeta: $Carpeta"
}

# 3. Configuracion (queda fuera de git: tiene la clave).
$config = [ordered]@{
  carpeta            = $Carpeta
  api                = $Api.TrimEnd('/')
  clave              = $Clave
  intervaloSegundos  = $IntervaloSegundos
}
$destinoConfig = Join-Path $aqui "buleje-sync.config.json"
$config | ConvertTo-Json | Set-Content -Path $destinoConfig -Encoding UTF8
Write-Host "  Configuracion escrita en: $destinoConfig"

# 4. Anclar la carpeta en el Explorador para tenerla a mano.
$accesoDirecto = Join-Path ([Environment]::GetFolderPath('Desktop')) "Buleje Drive.lnk"
if (-not (Test-Path $accesoDirecto)) {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($accesoDirecto)
  $lnk.TargetPath = $Carpeta
  $lnk.Save()
  Write-Host "  Acceso directo creado en el Escritorio."
}

# 5. Tarea programada: arranca al iniciar sesion y se reintenta si se cae.
$nombreTarea = "Buleje - Sincronizacion del Drive"
$agente = Join-Path $aqui "agente.mjs"

$accion = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$agente`"" -WorkingDirectory $aqui
$disparador = New-ScheduledTaskTrigger -AtLogOn
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

Unregister-ScheduledTask -TaskName $nombreTarea -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $nombreTarea -Action $accion -Trigger $disparador `
  -Settings $ajustes -Description "Mantiene la carpeta Buleje-Drive igual que el Drive del panel." | Out-Null

Write-Host "  Tarea registrada: arranca sola al iniciar sesion."

# 6. Arrancarlo ahora.
Start-ScheduledTask -TaskName $nombreTarea
Write-Host ""
Write-Host "  Listo. Todo lo que pongas en $Carpeta aparece en el panel, y al reves."
Write-Host "  Para apagarlo:  Unregister-ScheduledTask -TaskName '$nombreTarea' -Confirm:`$false"
Write-Host ""
