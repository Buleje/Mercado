# Le pide a Windows que no apague la pantalla mientras Claude Code trabaja.
#
# Se ejecuta del lado de Windows a propósito: acá Ubuntu corre sobre WSL2 sin
# sesión gráfica propia, así que la pantalla que se apaga es la de Windows y
# `systemd-inhibit` del lado Linux no cambiaría nada.
#
# El pedido dura mientras este proceso viva. Se queda mirando un archivo de
# traba: cuando Claude termina y lo borra, este script suelta el pedido y sale.
param(
  [Parameter(Mandatory = $true)][string]$Traba,
  [int]$HorasMaximo = 8
)

$ErrorActionPreference = 'SilentlyContinue'

$firma = @'
[DllImport("kernel32.dll", SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
'@

$api = Add-Type -MemberDefinition $firma -Name Energia -Namespace ClaudeCode -PassThru

# ES_CONTINUOUS      0x80000000 — vale mientras este proceso esté vivo
# ES_SYSTEM_REQUIRED 0x00000001 — no suspendas la máquina
# ES_DISPLAY_REQUIRED 0x00000002 — no apagues la pantalla
[void]$api::SetThreadExecutionState([uint32]"0x80000000" -bor 0x00000001 -bor 0x00000002)

# Tope de seguridad: si algo falla y la traba nunca se borra, la máquina no
# puede quedar despierta para siempre.
# Se mira seguido para que soltar la pantalla sea inmediato: si el intervalo es
# largo, Claude termina y la pantalla sigue encendida medio minuto de más.
$limite = (Get-Date).AddHours($HorasMaximo)
while ((Test-Path -LiteralPath $Traba) -and ((Get-Date) -lt $limite)) {
  Start-Sleep -Seconds 3
}

# Devolverle a Windows su comportamiento de siempre.
[void]$api::SetThreadExecutionState([uint32]"0x80000000")
