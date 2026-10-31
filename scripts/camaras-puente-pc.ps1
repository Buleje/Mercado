<#
.SYNOPSIS
  Puente de pantalla para camaras Hik-Connect (ADR-466): captura la ventana de
  BlueStacks (o del iVMS-4200) y la manda al panel de Buleje cada segundo.

.DESCRIPTION
  La camara de la oficina (DS-2CFSP4-4G) va solo por 4G y la unica que la ve es
  la app Hik-Connect. En la PC, Hik-Connect corre dentro de BlueStacks (o en el
  iVMS-4200); este script busca esa ventana por su titulo, la fotografia, la
  achica a ~1280 px, la convierte en JPEG y la manda al webhook de la camara con
  `?modo=vivo`. El panel muestra el ultimo cuadro casi en vivo y guarda una foto
  (que la IA lee) solo cuando la imagen cambia.

  PowerShell 5.1 de Windows, sin instalar nada. La imagen se le pide a la
  ventana misma (PrintWindow), asi que puede quedar DETRAS de otras ventanas
  mientras usas la PC, pero no minimizada. Si algun programa la devuelve negra,
  el script avisa.

  Si no le pasas -Url ni -Token, los lee de `camaras-puente-pc.json` en la misma
  carpeta (el boton «Descargar configuracion» del panel lo arma).

.PARAMETER Url
  La direccion del webhook: https://tu-panel/api/webhooks/camara

.PARAMETER Token
  La clave de la camara (en el panel: Camaras > Conectar > Puente desde la PC).

.PARAMETER Ventana
  Texto que tiene el titulo de la ventana. Por defecto «BlueStacks».

.PARAMETER CadaSeg
  Cada cuantos segundos manda un cuadro. Por defecto 1.

.PARAMETER Probar
  Captura UNA vez, guarda la imagen en `camaras-puente-prueba.jpg` y sale sin
  mandar nada. Sirve para ver que agarra la ventana correcta.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File camaras-puente-pc.ps1 -Url "https://buleje.pe/api/webhooks/camara" -Token "abc123"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File camaras-puente-pc.ps1 -Ventana "iVMS-4200"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File camaras-puente-pc.ps1 -Probar
#>
[CmdletBinding()]
param(
  [string]$Url,
  [string]$Token,
  [string]$Ventana,
  [double]$CadaSeg,
  [int]$Ancho,
  [int]$Calidad,
  [string]$Config,
  [switch]$Probar,
  [string]$Salida
)

$ErrorActionPreference = "Stop"

# ── Configuración: parámetro > archivo .json > valor por defecto ─────────────

$carpeta = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
if (-not $Config) { $Config = Join-Path $carpeta "camaras-puente-pc.json" }

$deArchivo = $null
if (Test-Path -LiteralPath $Config) {
  try {
    $deArchivo = Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Write-Host "No pude leer $Config (¿está bien escrito?): $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

# Dentro de una función, $PSBoundParameters es el de la función: se guarda el del script.
$enLinea = $PSBoundParameters
function Valor([string]$nombre, $actual, $porDefecto) {
  if ($enLinea.ContainsKey($nombre)) { return $actual }
  if ($deArchivo -and $deArchivo.PSObject.Properties[$nombre] -and "$($deArchivo.$nombre)" -ne "") {
    return $deArchivo.$nombre
  }
  return $porDefecto
}

$Url     = [string](Valor "Url" $Url "")
$Token   = [string](Valor "Token" $Token "")
$Ventana = [string](Valor "Ventana" $Ventana "BlueStacks")
$CadaSeg = [double](Valor "CadaSeg" $CadaSeg 1)
$Ancho   = [int](Valor "Ancho" $Ancho 1280)
$Calidad = [int](Valor "Calidad" $Calidad 70)
if (-not $Salida) { $Salida = Join-Path $carpeta "camaras-puente-prueba.jpg" }

# El panel acepta hasta 20 cuadros cada 10 s por cámara: más rápido que 1/s no suma nada.
if ($CadaSeg -lt 1) { $CadaSeg = 1 }
if ($CadaSeg -gt 60) { $CadaSeg = 60 }
if ($Ancho -lt 320) { $Ancho = 320 }
if ($Ancho -gt 1920) { $Ancho = 1920 }
if ($Calidad -lt 30) { $Calidad = 30 }
if ($Calidad -gt 95) { $Calidad = 95 }

if (-not $Probar -and (-not $Url -or -not $Token)) {
  Write-Host ""
  Write-Host "Falta la dirección o la clave del panel." -ForegroundColor Red
  Write-Host "En el panel: Cámaras > Conectar > «Puente desde la PC» > Copiar comando,"
  Write-Host "o «Descargar configuración» y deja el archivo junto a este script:"
  Write-Host "  $Config"
  exit 1
}

# ── Windows: ventanas y pantalla ─────────────────────────────────────────────

Add-Type -AssemblyName System.Drawing

if (-not ("PuenteVentana" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class PuenteVentana {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attr, out RECT r, int size);

  public static string Titulo(IntPtr h) {
    int n = GetWindowTextLength(h);
    if (n <= 0) return "";
    StringBuilder sb = new StringBuilder(n + 1);
    GetWindowText(h, sb, sb.Capacity);
    return sb.ToString();
  }

  // Las ventanas visibles cuyo título contiene el texto, sin la consola de este script.
  public static List<IntPtr> Buscar(string texto) {
    List<IntPtr> lista = new List<IntPtr>();
    IntPtr consola = GetConsoleWindow();
    EnumWindows(delegate (IntPtr h, IntPtr p) {
      if (h == consola || !IsWindowVisible(h)) return true;
      string t = Titulo(h);
      if (t.Length > 0 && t.IndexOf(texto, StringComparison.OrdinalIgnoreCase) >= 0) lista.Add(h);
      return true;
    }, IntPtr.Zero);
    return lista;
  }

  // El borde que se ve. GetWindowRect en Windows 10/11 incluye una sombra
  // invisible de ~7 px que saldría como franja negra en la foto.
  public static RECT Visible(IntPtr h) {
    RECT r;
    if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(RECT))) == 0 && r.Right > r.Left) return r;
    GetWindowRect(h, out r);
    return r;
  }

  public static RECT Completo(IntPtr h) {
    RECT r;
    GetWindowRect(h, out r);
    return r;
  }
}
"@
}

# Con la pantalla al 125 % o 150 % (lo normal en un laptop), sin esto Windows le
# miente al script sobre el tamaño de la ventana y la foto sale corrida o cortada.
[void][PuenteVentana]::SetProcessDPIAware()

function Buscar-Ventana([string]$texto) {
  # Entre varias (BlueStacks abre más de una ventana), la más grande que no esté minimizada.
  $mejor = [IntPtr]::Zero
  $mejorArea = 0
  $hayMinimizada = $false
  foreach ($h in [PuenteVentana]::Buscar($texto)) {
    if ([PuenteVentana]::IsIconic($h)) { $hayMinimizada = $true; continue }
    $r = [PuenteVentana]::Visible($h)
    $area = [long]($r.Right - $r.Left) * [long]($r.Bottom - $r.Top)
    if (($r.Right - $r.Left) -lt 200 -or ($r.Bottom - $r.Top) -lt 150) { continue }
    if ($area -gt $mejorArea) { $mejor = $h; $mejorArea = $area }
  }
  return [pscustomobject]@{ Ventana = $mejor; HayMinimizada = $hayMinimizada }
}

<#
  La imagen de la ventana, pedida a la ventana misma con PrintWindow y
  PW_RENDERFULLCONTENT (2): así también salen los programas que dibujan con la
  placa de video (BlueStacks, el video del iVMS) y la ventana puede estar
  tapada por otras. Se usa el rectángulo completo y después se corta al borde
  que se ve: Windows 10/11 le suma una sombra invisible de ~7 px por lado que
  saldría como franja negra.
#>
function Capturar([IntPtr]$h) {
  $r = [PuenteVentana]::Completo($h)
  $w = $r.Right - $r.Left
  $alto = $r.Bottom - $r.Top
  if ($w -lt 50 -or $alto -lt 50) { throw "La ventana es demasiado chica para fotografiarla." }
  $bmp = New-Object System.Drawing.Bitmap $w, $alto
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  try { $ok = [PuenteVentana]::PrintWindow($h, $hdc, 2) } finally { $g.ReleaseHdc($hdc); $g.Dispose() }
  if (-not $ok) { $bmp.Dispose(); throw "La ventana no quiso dar su imagen. Ciérrala y ábrela de nuevo." }

  $v = [PuenteVentana]::Visible($h)
  $x = [Math]::Max(0, $v.Left - $r.Left)
  $y = [Math]::Max(0, $v.Top - $r.Top)
  $vw = [Math]::Min($w - $x, $v.Right - $v.Left)
  $vh = [Math]::Min($alto - $y, $v.Bottom - $v.Top)
  if ($vw -lt 50 -or $vh -lt 50 -or ($x -eq 0 -and $y -eq 0 -and $vw -eq $w -and $vh -eq $alto)) { return $bmp }
  $recorte = $bmp.Clone((New-Object System.Drawing.Rectangle $x, $y, $vw, $vh), $bmp.PixelFormat)
  $bmp.Dispose()
  return $recorte
}

# ¿Salió negra? Se miran 64 puntos repartidos: casi todos oscuros = negra.
function Es-Negra([System.Drawing.Bitmap]$bmp) {
  $oscuros = 0
  for ($i = 1; $i -le 8; $i++) {
    for ($j = 1; $j -le 8; $j++) {
      $p = $bmp.GetPixel([int]($bmp.Width * $i / 9), [int]($bmp.Height * $j / 9))
      if (($p.R + $p.G + $p.B) -lt 24) { $oscuros++ }
    }
  }
  return ($oscuros -ge 62)
}

function Achicar([System.Drawing.Bitmap]$bmp, [int]$ancho) {
  if ($bmp.Width -le $ancho) { return $bmp }
  $alto = [int][Math]::Round($bmp.Height * $ancho / $bmp.Width)
  $nuevo = New-Object System.Drawing.Bitmap $ancho, $alto
  $g = [System.Drawing.Graphics]::FromImage($nuevo)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($bmp, 0, 0, $ancho, $alto)
  $g.Dispose()
  $bmp.Dispose()
  return $nuevo
}

$codecJpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" } | Select-Object -First 1

function A-Jpeg([System.Drawing.Bitmap]$bmp, [int]$calidad) {
  $parametros = New-Object System.Drawing.Imaging.EncoderParameters 1
  $parametros.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$calidad)
  $ms = New-Object System.IO.MemoryStream
  try {
    $bmp.Save($ms, $codecJpeg, $parametros)
    return , $ms.ToArray()
  } finally {
    $ms.Dispose()
    $parametros.Dispose()
  }
}

# ── Red ──────────────────────────────────────────────────────────────────────

# PowerShell 5.1 arranca sin TLS 1.2 en algunas PC: sin esto, https falla.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
# Sin el «Expect: 100-continue» cada envío espera una respuesta que no hace falta.
[Net.ServicePointManager]::Expect100Continue = $false

function Enviar([byte[]]$bytes, [string]$destino) {
  $req = [System.Net.HttpWebRequest]::Create($destino)
  $req.Method = "POST"
  $req.ContentType = "image/jpeg"
  $req.ContentLength = $bytes.Length
  $req.Timeout = 15000
  $req.ReadWriteTimeout = 15000
  $req.UserAgent = "camaras-puente-pc/1"
  $flujo = $req.GetRequestStream()
  try { $flujo.Write($bytes, 0, $bytes.Length) } finally { $flujo.Close() }
  try {
    $resp = $req.GetResponse()
  } catch {
    # Un 4xx/5xx llega como excepción, pero trae la respuesta: se lee igual.
    $ex = $_.Exception
    while ($ex -and -not ($ex -is [System.Net.WebException])) { $ex = $ex.InnerException }
    if ($ex -and $ex.Response) { $resp = $ex.Response } else { throw }
  }
  try {
    $codigo = [int]$resp.StatusCode
    $espera = $resp.Headers["Retry-After"]
    $lector = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $texto = $lector.ReadToEnd()
    $lector.Close()
  } finally {
    $resp.Close()
  }
  $json = $null
  try { $json = $texto | ConvertFrom-Json } catch { $json = $null }
  return [pscustomobject]@{ Codigo = $codigo; Json = $json; RetryAfter = $espera }
}

function Hora { (Get-Date).ToString("HH:mm:ss") }

# El mensaje de adentro: «No es posible conectar con el servidor remoto», no
# «Exception calling GetRequestStream with 0 argument(s)…».
function Mensaje($ex) {
  while ($ex.InnerException) { $ex = $ex.InnerException }
  return $ex.Message
}

# Una línea que se reescribe («sin cambio» cada segundo no llena la consola) y
# las que quedan (lo guardado, los avisos).
$script:lineaViva = $false
function Escribir-Viva([string]$texto, [string]$color = "DarkGray") {
  $ancho = 78
  try { $ancho = [Math]::Max(40, $Host.UI.RawUI.WindowSize.Width - 2) } catch { $ancho = 78 }
  if ($texto.Length -gt $ancho) { $texto = $texto.Substring(0, $ancho) }
  Write-Host ("`r" + $texto.PadRight($ancho)) -NoNewline -ForegroundColor $color
  $script:lineaViva = $true
}
function Escribir([string]$texto, [string]$color = "Gray") {
  if ($script:lineaViva) { Write-Host ""; $script:lineaViva = $false }
  Write-Host $texto -ForegroundColor $color
}

# Un aviso que se repite cada pocos segundos se escribe una sola vez.
$script:ultimoAviso = ""
function Avisar([string]$texto, [string]$color = "Yellow") {
  if ($texto -ne $script:ultimoAviso) { Escribir "$(Hora) $texto" $color; $script:ultimoAviso = $texto }
}

# ── Una captura de prueba ────────────────────────────────────────────────────

if ($Probar) {
  $hallada = Buscar-Ventana $Ventana
  if ($hallada.Ventana -eq [IntPtr]::Zero) {
    if ($hallada.HayMinimizada) { Escribir "La ventana «$Ventana» está minimizada: ábrela y vuelve a probar." "Red" }
    else { Escribir "No encuentro ninguna ventana con «$Ventana» en el título." "Red" }
    exit 1
  }
  $bmp = Achicar (Capturar $hallada.Ventana) $Ancho
  try {
    $negra = Es-Negra $bmp
    $jpeg = A-Jpeg $bmp $Calidad
    [System.IO.File]::WriteAllBytes($Salida, $jpeg)
    Escribir ("Ventana: «{0}» · {1}×{2} px · {3} KB" -f [PuenteVentana]::Titulo($hallada.Ventana), $bmp.Width, $bmp.Height, [int]($jpeg.Length / 1024)) "Green"
    Escribir "Guardada en $Salida (no se mandó nada al panel)."
    if ($negra) { Escribir "Ojo: la imagen salió negra. En BlueStacks prueba otro motor de gráficos (Configuración > Gráficos)." "Yellow" }
  } finally {
    $bmp.Dispose()
  }
  exit 0
}

# ── El puente ────────────────────────────────────────────────────────────────

# En Windows, «localhost» prueba primero ::1, y con el panel corriendo en WSL esa
# vía se cuelga ~20 s antes de caer a 127.0.0.1 (medido 2026-10-03): cada
# cuadro tardaba 20 s. Con la dirección IPv4 directa, sale al toque.
$Url = $Url -replace '^(https?://)localhost(?=[:/]|$)', '${1}127.0.0.1'
$separador = if ($Url.Contains("?")) { "&" } else { "?" }
$destino = "{0}{1}k={2}&modo=vivo" -f $Url, $separador, [Uri]::EscapeDataString($Token)
$tokenVisible = if ($Token.Length -gt 6) { $Token.Substring(0, 4) + "…" } else { "…" }

try { $Host.UI.RawUI.WindowTitle = "Puente de cámaras > panel" } catch { Write-Verbose "sin título de consola" }

Escribir ""
Escribir "Puente de cámaras · Hik-Connect > panel" "Cyan"
Escribir "  Ventana : $Ventana"
Escribir "  Panel   : $Url (clave $tokenVisible)"
Escribir "  Ritmo   : un cuadro cada $CadaSeg s, $Ancho px, JPEG $Calidad"
Escribir "  La ventana puede quedar detrás de otras, pero no minimizada. Ctrl+C para parar."
Escribir ""

$fallos = 0
$enviados = 0
$sinCambio = 0
$negras = 0

try {
  while ($true) {
    $inicio = Get-Date
    try {
      $hallada = Buscar-Ventana $Ventana
      if ($hallada.Ventana -eq [IntPtr]::Zero) {
        if ($hallada.HayMinimizada) {
          Avisar "La ventana «$Ventana» está minimizada: ábrela (puede quedar detrás de otras, minimizada no)."
        } else {
          Avisar "No encuentro ninguna ventana con «$Ventana» en el título. Abre BlueStacks con Hik-Connect en la cámara."
        }
        Start-Sleep -Seconds 3
        continue
      }

      $bmp = Achicar (Capturar $hallada.Ventana) $Ancho
      try {
        if (Es-Negra $bmp) {
          $negras++
          if ($negras -ge 3) { Avisar "La captura sale negra. En BlueStacks prueba otro motor de gráficos (Configuración > Gráficos)." }
        } else {
          $negras = 0
        }
        $calidadAhora = $Calidad
        $jpeg = A-Jpeg $bmp $calidadAhora
        # El panel acepta hasta 1 MB: si una pantalla muy cargada se pasa, se baja la calidad.
        while ($jpeg.Length -gt 1000000 -and $calidadAhora -gt 30) {
          $calidadAhora -= 15
          $jpeg = A-Jpeg $bmp $calidadAhora
        }
      } finally {
        $bmp.Dispose()
      }

      $r = Enviar $jpeg $destino
      $kb = [int]($jpeg.Length / 1024)
      if ($r.Codigo -ge 200 -and $r.Codigo -lt 300 -and $r.Json -and $r.Json.ok) {
        if ($fallos -gt 0) { Escribir "$(Hora) Volvió la conexión con el panel." "Green" }
        $fallos = 0
        $script:ultimoAviso = ""
        $enviados++
        switch ([string]$r.Json.motivo) {
          "cambio" { Escribir "$(Hora) enviado · guardada (cambio) · $kb KB" "Green"; $sinCambio = 0 }
          "intervalo" { Escribir "$(Hora) enviado · guardada (intervalo) · $kb KB" "Green"; $sinCambio = 0 }
          "tope_del_dia" { Escribir-Viva "$(Hora) enviado · se ve en vivo, pero hoy ya se guardó el máximo de fotos" "Yellow" }
          default { $sinCambio++; Escribir-Viva "$(Hora) enviado · sin cambio ($sinCambio seguidos) · $kb KB" }
        }
      } elseif ($r.Codigo -eq 401 -or $r.Codigo -eq 404) {
        Avisar "El panel no reconoce la clave. Cópiala de nuevo en Cámaras > Conectar (¿le cambiaste la dirección a la cámara?)." "Red"
        Start-Sleep -Seconds 30
        continue
      } elseif ($r.Codigo -eq 429) {
        $seg = 10
        if ($r.RetryAfter) { [void][int]::TryParse([string]$r.RetryAfter, [ref]$seg) }
        Avisar "El panel pide ir más despacio: espero $seg s."
        Start-Sleep -Seconds ([Math]::Max(1, $seg))
        continue
      } elseif ($r.Codigo -eq 413) {
        Avisar "La imagen pesa demasiado para el panel: prueba con -Ancho 960." "Red"
      } else {
        # Ojo: `$error` es una variable automática de PowerShell; no se usa ese nombre.
        $motivoPanel = if ($r.Json -and $r.Json.error) { $r.Json.error } else { "sin detalle" }
        throw "el panel respondió $($r.Codigo) ($motivoPanel)."
      }
    } catch {
      $fallos++
      $espera = [Math]::Min(30, [Math]::Pow(2, [Math]::Min(5, $fallos - 1)))
      Escribir "$(Hora) No llegó: $((Mensaje $_.Exception).TrimEnd(".")). Reintento en $espera s." "Red"
      Start-Sleep -Seconds $espera
      continue
    }

    $resto = [int]($CadaSeg * 1000 - ((Get-Date) - $inicio).TotalMilliseconds)
    if ($resto -gt 0) { Start-Sleep -Milliseconds $resto }
  }
} finally {
  Escribir ""
  Escribir "Puente detenido. Cuadros enviados: $enviados." "Cyan"
}
