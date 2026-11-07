// Ventana «Claude pide tu OK» en la PC de Brandon (contrato §10). Desde WSL lanza powershell.exe con WinForms:
// encima de todo, el negocio y el dato clave (monto, nombre o código) en etiquetas fijas, el resumen, y 3 botones en
// orden al azar: el dato real y 2 señuelos parecidos (revisión de seguridad 29-10, hallazgo 4). Solo el correcto
// aprueba; un señuelo, «No», Esc o cerrar = «no». Devuelve "si" | "no" | "vencio". Cualquier falla = "no".
// Los botones se habilitan 2 s después de mostrarse y se vuelven a apagar 1,5 s cada vez que la ventana gana el foco
// (un clic que la activa no aprueba). Solo un clic de MOUSE aprueba (29-10: la 1.ª prueba real volvió "si" a los 9 s
// por un clic suelto; Enter/espacio/UI Automation no disparan MouseClick).
// Los textos viajan en base64 dentro del script, nunca interpolados (el resumen sale de datos del negocio y podría
// traer comillas o código); desde 04-11 el script llega por la entrada del proceso, no por la línea de comando (ARRANQUE).
// 29-10 (2.ª pasada de seguridad, CRÍTICO): desktop-control (nut-js) o un powershell con SendInput generan clics que
// WinForms acepta como de mouse. Mientras la ventana está abierta, un gancho de mouse de bajo nivel (WH_MOUSE_LL)
// DESCARTA los mensajes de botón sobre la ventana que traen LLMHF_INJECTED o LLMHF_LOWER_IL_INJECTED, y además un botón
// solo aprueba si el gancho vio un LBUTTONUP físico sobre la ventana en los últimos 600 ms (cubre PostMessage/BM_CLICK y
// el gancho que Windows quita en silencio si tarda). Si llegó algún clic inyectado, la respuesta es «no» y el resultado
// lo dice: stdout = {"respuesta":"b0|b1|b2|no|vencio","inyectados":N}.
// Al vencer o cancelarse, el proceso se mata (taskkill /T /F por su PID de Windows) y la promesa vuelve recién cuando
// cerró: la ventana siguiente de la fila no se abre encima de una vieja.
import { spawn as spawnReal } from "node:child_process";
import { existsSync } from "node:fs";
import { armarBotones, conMarca, linea60, sanearVentana } from "./clave-ok.mjs";

export const RUTA_POWERSHELL = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
export const SEGUNDOS_POR_DEFECTO = 120;
const HOLGURA_ARRANQUE_S = 25; // powershell + WinForms tarda 1-5 s en abrir; si a segundos+25 no contestó, se mata
const MAX_RESUMEN = 3000;
export const BLOQUEO_INICIAL_MS = 2000;
export const BLOQUEO_AL_ENFOCAR_MS = 1500;
export const RUTA_TASKKILL = "/mnt/c/Windows/System32/taskkill.exe";
export const FISICO_MS = 600; // el clic que aprueba tiene que venir con un LBUTTONUP físico visto por el gancho hace ≤600 ms
const ESPERA_CIERRE_MS = 4000; // tras matar, cuánto se espera el «close» antes de dar el proceso por muerto
const ESPERA_TASKKILL_MS = 2000;

/** Banderas de MSLLHOOKSTRUCT.flags (WinUser.h). */
export const LLMHF_INJECTED = 0x1;
export const LLMHF_LOWER_IL_INJECTED = 0x2;
/** WM_LBUTTONDOWN..WM_MBUTTONDBLCLK (0x201-0x209) y WM_XBUTTON* (0x20B-0x20D). La rueda (0x20A/0x20E) y el movimiento pasan. @param {number} msg */
export const esMensajeDeBoton = (msg) => (msg >= 0x201 && msg <= 0x209) || (msg >= 0x20b && msg <= 0x20d);
/**
 * Lo que decide el gancho para un mensaje de mouse SOBRE la ventana (espejo exacto de CandadoMouse.Descartar en C#).
 * @param {number} msg wParam del gancho @param {number} flags MSLLHOOKSTRUCT.flags
 * @returns {"descartar"|"aceptar"}
 */
export function decidirClic(msg, flags) {
  return esMensajeDeBoton(msg) && ((flags >>> 0) & (LLMHF_INJECTED | LLMHF_LOWER_IL_INJECTED)) !== 0 ? "descartar" : "aceptar";
}

/** C# del gancho (Add-Type). Delegado en campo estático (el GC no lo junta). Exportado para la prueba real. */
export const CANDADO_CS = `using System;
using System.Runtime.InteropServices;
public static class CandadoMouse {
  [StructLayout(LayoutKind.Sequential)] public struct Punto { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Msll { public Punto Pt; public uint MouseData; public uint Flags; public uint Time; public IntPtr Extra; }
  public delegate IntPtr Proc(int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint hilo);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Punto p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint cual);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string nombre);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int L; public int T; public int R; public int B; }
  [DllImport("user32.dll")] static extern bool GetClipCursor(out Rect r);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  static readonly Proc proc = new Proc(Llamada);
  static IntPtr gancho = IntPtr.Zero;
  static IntPtr ventana = IntPtr.Zero;
  static int inyectados = 0;
  static int fisicoTick = 0;
  static bool hayFisico = false;
  static IntPtr bajoDown = IntPtr.Zero;
  static IntPtr bajoUp = IntPtr.Zero;
  public static int Inyectados { get { return inyectados; } }
  public static bool EsBoton(int msg) { return (msg >= 0x201 && msg <= 0x209) || (msg >= 0x20B && msg <= 0x20D); }
  public static bool Descartar(int msg, uint flags) { return EsBoton(msg) && (flags & 0x3u) != 0; }
  static IntPtr Llamada(int code, IntPtr w, IntPtr l) {
    try {
      if (code >= 0 && ventana != IntPtr.Zero) {
        int msg = w.ToInt32();
        if (EsBoton(msg)) {
          Msll info = (Msll)Marshal.PtrToStructure(l, typeof(Msll));
          // Todo DOWN cuenta, caiga donde caiga (4.ª pasada): uno soltado fuera no deja vivo el de un clic anterior.
          if (msg == 0x201) { bajoDown = (info.Flags & 0x3u) == 0 ? WindowFromPoint(info.Pt) : IntPtr.Zero; }
          if (GetAncestor(WindowFromPoint(info.Pt), 2) == ventana) {
            if (Descartar(msg, info.Flags)) { inyectados++; return (IntPtr)1; }
            if (msg == 0x202) { bajoUp = WindowFromPoint(info.Pt); fisicoTick = Environment.TickCount; hayFisico = true; }
          }
        }
      }
    } catch { }
    return CallNextHookEx(gancho, code, w, l);
  }
  public static bool Instalar(IntPtr hwnd) {
    ventana = hwnd;
    gancho = SetWindowsHookEx(14, proc, GetModuleHandle(null), 0);
    return gancho != IntPtr.Zero;
  }
  public static void Quitar() { if (gancho != IntPtr.Zero) { UnhookWindowsHookEx(gancho); gancho = IntPtr.Zero; } ventana = IntPtr.Zero; }
  // 3.ª pasada de security (29-10): no alcanza con que haya habido un clic físico reciente; el DOWN y el UP físicos tienen
  // que haber caído sobre ESTE botón. Si no, un programa podía esperar un clic de Brandon en «No» o en el texto y postear
  // en ese instante un clic al botón correcto.
  public static bool TomarFisico(int ms, IntPtr boton) {
    bool ok = hayFisico && unchecked(Environment.TickCount - fisicoTick) <= ms && boton != IntPtr.Zero && bajoDown == boton && bajoUp == boton && !Encerrado();
    hayFisico = false; bajoDown = IntPtr.Zero; bajoUp = IntPtr.Zero;
    return ok;
  }
  public static void Anotar() { inyectados++; }
  // Un programa que encierra el puntero (ClipCursor) sobre el botón correcto haría que el clic de Brandon caiga ahí:
  // con el puntero encerrado, ningún clic aprueba (4.ª pasada de security, 29-10). Uso normal = nunca encerrado.
  static bool Encerrado() {
    Rect r;
    if (!GetClipCursor(out r)) return false;
    int x = GetSystemMetrics(76), y = GetSystemMetrics(77), w = GetSystemMetrics(78), h = GetSystemMetrics(79);
    return r.L > x || r.T > y || r.R < x + w || r.B < y + h;
  }
}`;

/** Nombre que ve Brandon (sin claves de código). */
export const ETIQUETAS = {
  bodega: "Bodega San Martín",
  blas: "Blas — aserradero",
  "qa-forestal": "QA forestal (pruebas)",
};

/** @param {string} negocio */
export const etiquetaNegocio = (negocio) => ETIQUETAS[/** @type {keyof typeof ETIQUETAS} */ (negocio)] ?? linea60(negocio || "¿negocio?");

// Diseño 04-11 (Brandon: «mejórame el diseño de esta ventana»): franja arriba con el color del negocio y una etiqueta
// con el color de la acción (rojo = anula/borra, ámbar = mueve plata, azul = cambia datos). Colores RGB fijos acá:
// viajan como números en el JSON, nunca como texto que PowerShell interprete.
/** @type {Record<string, [number, number, number]>} */
export const COLOR_NEGOCIO = { blas: [22, 101, 52], bodega: [0, 122, 122], "qa-forestal": [71, 85, 105] };
const COLOR_OTRO = /** @type {[number, number, number]} */ ([51, 65, 85]);
/** @type {Record<"peligro"|"plata"|"cambio", [number, number, number]>} */
export const COLOR_ACCION = { peligro: [185, 28, 28], plata: [180, 83, 9], cambio: [29, 78, 216] };

/** Nombre completo de la herramienta → etiqueta (gana primero). @type {Record<string, [string, "peligro"|"plata"|"cambio"]>} */
const ACCION_POR_NOMBRE = {
  adelanto_dar: ["DAR ADELANTO", "plata"], venta_registrar: ["VENTA", "plata"], venta_devolver: ["DEVOLUCIÓN", "plata"],
  compra_registrar: ["COMPRA", "plata"], caja_movimiento: ["MUEVE PLATA", "plata"], tesoreria_movimiento: ["MUEVE PLATA", "plata"],
  tesoreria_transferir: ["TRANSFERENCIA", "plata"], caja_cerrar_turno: ["CIERRE DE CAJA", "plata"], cierre_diario: ["CIERRE DEL DÍA", "plata"],
  trabajador_cesar: ["DAR DE BAJA", "peligro"], doc_papelera: ["A LA PAPELERA", "peligro"], ctp_declarar_produccion: ["DECLARAR", "cambio"],
  asistencia_masiva: ["ASISTENCIA", "cambio"], gtf_crear: ["GUÍA (GTF)", "cambio"], anexo04_emitir: ["ANEXO 04", "cambio"],
};
/** Verbo (último trozo del nombre) → etiqueta. @type {Record<string, [string, "peligro"|"plata"|"cambio"]>} */
const ACCION_POR_VERBO = {
  anular: ["ANULAR", "peligro"], borrar: ["BORRAR", "peligro"], cancelar: ["CANCELAR", "peligro"], deshacer: ["DESHACER", "peligro"],
  rechazar: ["RECHAZAR", "peligro"], quitar: ["QUITAR", "peligro"],
  validar: ["VALIDAR", "cambio"], recepcionar: ["RECEPCIONAR", "cambio"], consumir: ["CONSUMIR", "cambio"], cerrar: ["CERRAR", "cambio"],
  reabrir: ["REABRIR", "cambio"],
  pago: ["PAGO", "plata"], pagar: ["PAGO", "plata"], cobrar: ["COBRO", "plata"],
  guardar: ["GUARDAR", "cambio"], registrar: ["REGISTRAR", "cambio"], cargar: ["CARGAR", "cambio"], agregar: ["AGREGAR", "cambio"],
  aplicar: ["APLICAR", "cambio"], anotar: ["ANOTAR", "cambio"], subir: ["SUBIR", "cambio"], usado: ["MARCAR", "cambio"],
  marcar: ["MARCAR", "cambio"], ajustar: ["AJUSTAR STOCK", "cambio"], estado: ["CAMBIAR ESTADO", "cambio"], reingresar: ["REINGRESO", "cambio"],
  recibir: ["RECIBIR", "cambio"], costo: ["COSTO", "cambio"], cuadrar: ["CUADRAR", "cambio"], iniciar: ["INICIAR", "cambio"],
  enviar: ["ENVIAR", "cambio"], movimiento: ["MOVIMIENTO", "cambio"],
};

/**
 * Etiqueta y color de la acción a partir del nombre de la herramienta (lo pone el servidor, no Claude).
 * «stock_ajustar_lote» → busca «lote», después «ajustar». Sin nombre o desconocido → «CAMBIO» azul.
 * @param {string} [herramienta] @returns {{ texto: string, tono: "peligro"|"plata"|"cambio" }}
 */
export function accionDe(herramienta) {
  const n = String(herramienta ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  const exacta = Object.hasOwn(ACCION_POR_NOMBRE, n) ? ACCION_POR_NOMBRE[n] : null;
  if (exacta) return { texto: exacta[0], tono: exacta[1] };
  for (const trozo of n.split("_").reverse()) {
    if (Object.hasOwn(ACCION_POR_VERBO, trozo)) { const [texto, tono] = ACCION_POR_VERBO[trozo]; return { texto, tono }; }
  }
  return { texto: "CAMBIO", tono: "cambio" };
}

/**
 * El servidor suma AL FINAL del resumen «Para hacerlo, aprieta el botón con el … correcto.»: en la ventana va una sola
 * vez, junto a los botones. Solo se quita esa última línea; una igual en medio (texto del negocio) se queda.
 */
export const sinInstruccion = (resumen) => String(resumen ?? "").replace(/\n*Para hacerlo, aprieta el botón con el [^\n]{1,40} correcto\.\s*$/, "");

/** @param {(r: string) => boolean} [existe] */
export function rutaPowershell(existe = existsSync) {
  return existe(RUTA_POWERSHELL) ? RUTA_POWERSHELL : "powershell.exe";
}

/**
 * Script de PowerShell 5.1. `datosB64` = base64 de un JSON UTF-8 {negocio, etiqueta, valor, filas, resumen,
 * instruccion, botones[3], segundos}: solo [A-Za-z0-9+/=], así que no puede cerrar la comilla simple ni inyectar nada.
 * Escribe en stdout {"respuesta":"b0|b1|b2|no|vencio","inyectados":N}. Cuál es el correcto lo sabe solo Node.
 * En stderr, la 1.ª línea es «pid=<PID de Windows>» (para taskkill); el resto es bitácora.
 * @param {string} datosB64
 */
export function armarScript(datosB64) {
  if (!/^[A-Za-z0-9+/=]+$/.test(datosB64)) throw new TypeError("datosB64 no es base64");
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::Error.WriteLine("pid=$PID")
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Add-Type -TypeDefinition @'
${CANDADO_CS}
'@
  [System.Windows.Forms.Application]::EnableVisualStyles()
  $d = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${datosB64}')) | ConvertFrom-Json
  $script:resp = 'no'
  $script:total = [int64]$d.segundos * 1000
  $script:sw = New-Object System.Diagnostics.Stopwatch
  $script:bloqueoHasta = [int64]${BLOQUEO_INICIAL_MS}
  $f = New-Object System.Windows.Forms.Form
  $f.Text = 'Claude pide tu OK'
  $f.TopMost = $true
  $f.ShowInTaskbar = $true
  $f.StartPosition = 'CenterScreen'
  $f.FormBorderStyle = 'FixedDialog'
  $f.MaximizeBox = $false
  $f.MinimizeBox = $false
  $f.Font = New-Object System.Drawing.Font('Segoe UI', 10)

  # Diseño 04-11: franja del negocio, una tarjeta con lo que se hace y los datos, el aviso una sola vez, 3 botones
  # iguales, «No» aparte y una barra que se acaba con el tiempo. Los colores llegan como números (RGB) en $d.colores.
  function Color($c) { return [System.Drawing.Color]::FromArgb([int]$c[0], [int]$c[1], [int]$c[2]) }
  function Mezcla($a, $b, $t) { return [System.Drawing.Color]::FromArgb([int]($a.R + ($b.R - $a.R) * $t), [int]($a.G + ($b.G - $a.G) * $t), [int]($a.B + ($b.B - $a.B) * $t)) }
  $cBlanco = [System.Drawing.Color]::White
  $cMarca = Color $d.colores.marca
  $cAccion = Color $d.colores.accion
  $cFondo = [System.Drawing.Color]::FromArgb(243, 245, 248)
  $cBorde = [System.Drawing.Color]::FromArgb(214, 219, 227)
  $cBordeBoton = [System.Drawing.Color]::FromArgb(160, 170, 184)
  $cTexto = [System.Drawing.Color]::FromArgb(17, 24, 39)
  $cGris = [System.Drawing.Color]::FromArgb(88, 98, 114)
  $cRojo = [System.Drawing.Color]::FromArgb(185, 28, 28)
  $f.BackColor = $cFondo
  $W = 620; $M = 24; $AW = $W - 2 * $M

  function Fuente($tam, $negrita) {
    $estilo = if ($negrita) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    return New-Object System.Drawing.Font('Segoe UI', $tam, $estilo)
  }
  function Etiqueta($texto, $x, $y, $w, $h, $tam, $negrita) {
    $l = New-Object System.Windows.Forms.Label
    $l.UseMnemonic = $false
    $l.AutoEllipsis = $true
    $l.Text = [string]$texto
    $l.Font = Fuente $tam $negrita
    $l.SetBounds($x, $y, $w, $h)
    return $l
  }
  # Alto que ocupa un texto con salto de línea en ese ancho: nada se corta ni queda hueco.
  function Alto($texto, $fuente, $ancho) {
    $fl = [System.Windows.Forms.TextFormatFlags]::WordBreak -bor [System.Windows.Forms.TextFormatFlags]::TextBoxControl
    $s = [System.Windows.Forms.TextRenderer]::MeasureText([string]$texto, $fuente, (New-Object System.Drawing.Size($ancho, 100000)), $fl)
    return [int]$s.Height
  }
  function Ancho($texto, $fuente) { return [int][System.Windows.Forms.TextRenderer]::MeasureText([string]$texto, $fuente).Width }
  function Bloque($x, $y, $w, $h, $color) {
    $p = New-Object System.Windows.Forms.Panel
    $p.BackColor = $color
    $p.SetBounds($x, $y, $w, $h)
    return $p
  }

  $controles = New-Object System.Collections.ArrayList

  # 1) Franja de arriba: de qué negocio es (su color) y qué tipo de acción (etiqueta con el color de la acción).
  $cab = Bloque 0 0 $W 76 $cMarca
  $chip = New-Object System.Windows.Forms.Label
  $chip.UseMnemonic = $false
  $chip.AutoSize = $true
  $chip.Text = [string]$d.accion
  $chip.Font = Fuente 9.5 $true
  $chip.Padding = New-Object System.Windows.Forms.Padding(10, 4, 10, 4)
  $chip.BackColor = $cBlanco
  $chip.ForeColor = $cAccion
  $anchoChip = $chip.PreferredSize.Width
  $chip.Location = New-Object System.Drawing.Point(($W - $M - $anchoChip), 24)
  $l1 = Etiqueta $d.negocio $M 10 ($AW - $anchoChip - 12) 34 17 $true
  $l1.ForeColor = $cBlanco
  $l2 = Etiqueta 'Solo tú decides: Claude no puede apretar estos botones.' ($M + 1) 45 ($AW - $anchoChip - 12) 20 9.5 $false
  $l2.ForeColor = Mezcla $cMarca $cBlanco 0.8
  $cab.Controls.AddRange(@($l1, $l2, $chip))
  [void]$controles.Add($cab)

  # 2) Tarjeta blanca: qué se hace (texto suelto, sin caja gris), el dato clave grande y las filas en dos columnas.
  $IW = $AW - 2; $X = 24; $CW = $IW - $X - 20
  $tarjeta = New-Object System.Windows.Forms.Panel
  $tarjeta.BackColor = $cBlanco
  $cy = 16
  $fRes = Fuente 12 $false
  $altoRes = [math]::Min([math]::Max((Alto $d.resumen $fRes $CW) + 4, 24), 136)
  $rt = New-Object System.Windows.Forms.RichTextBox
  $rt.ReadOnly = $true
  $rt.BorderStyle = 'None'
  $rt.BackColor = $cBlanco
  $rt.ForeColor = $cTexto
  $rt.Font = $fRes
  $rt.DetectUrls = $false
  $rt.TabStop = $false
  $rt.ScrollBars = 'Vertical'
  $rt.Cursor = [System.Windows.Forms.Cursors]::Default
  $rt.Text = [string]$d.resumen
  $rt.SetBounds($X, $cy, $CW, $altoRes)
  [void]$tarjeta.Controls.Add($rt)
  $cy += $altoRes + 12
  [void]$tarjeta.Controls.Add((Bloque $X $cy $CW 1 $cBorde))
  $cy += 14
  $et = Etiqueta $d.etiqueta $X $cy $CW 20 9.5 $false
  $et.ForeColor = $cGris
  [void]$tarjeta.Controls.Add($et)
  $cy += 20
  $fValor = Fuente 22 $true
  if ((Ancho $d.valor $fValor) -gt $CW) { $fValor = Fuente 15 $true }
  $altoValor = [math]::Min((Alto $d.valor $fValor $CW), 64)
  $val = Etiqueta $d.valor $X $cy $CW $altoValor 10 $true
  $val.Font = $fValor
  $val.AutoEllipsis = $false
  $val.ForeColor = $cAccion
  [void]$tarjeta.Controls.Add($val)
  $cy += $altoValor + 10
  $fFila = Fuente 10.5 $true
  foreach ($fila in @($d.filas)) {
    if ($null -eq $fila) { continue }
    $ef = Etiqueta $fila.etiqueta $X ($cy + 1) 150 22 10 $false
    $ef.ForeColor = $cGris
    $altoFila = [math]::Min([math]::Max((Alto $fila.valor $fFila ($CW - 156)), 22), 44)
    $vf = Etiqueta $fila.valor ($X + 156) $cy ($CW - 156) $altoFila 10 $true
    $vf.Font = $fFila
    $vf.ForeColor = if (([string]$fila.etiqueta -eq 'OJO') -or ([string]$fila.valor).Contains([string][char]0x26A0)) { $cRojo } else { $cTexto }
    [void]$tarjeta.Controls.Add($ef)
    [void]$tarjeta.Controls.Add($vf)
    $cy += $altoFila + 6
  }
  $cy += 10
  [void]$tarjeta.Controls.Add((Bloque 0 0 5 $cy $cAccion))
  $tarjeta.SetBounds(1, 1, $IW, $cy)
  $borde = Bloque $M 94 $AW ($cy + 2) $cBorde
  [void]$borde.Controls.Add($tarjeta)
  [void]$controles.Add($borde)
  $y = 94 + $cy + 2 + 18

  # 3) El aviso, una sola vez y pegado a los botones.
  $fInstr = Fuente 11 $true
  $altoInstr = Alto $d.instruccion $fInstr $AW
  $instr = Etiqueta $d.instruccion $M $y $AW $altoInstr 11 $true
  $instr.AutoEllipsis = $false
  $instr.ForeColor = $cTexto
  [void]$controles.Add($instr)
  $y += $altoInstr + 8

  # 4) Los 3 botones IGUALES (el real y 2 parecidos, en orden al azar): ninguno se ve distinto del otro.
  $fBoton = Fuente 13 $true
  foreach ($tb in @($d.botones)) { if ((Ancho $tb $fBoton) -gt ($AW - 24)) { $fBoton = Fuente 11 $true } }
  $ops = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt 3; $i++) {
    $b = New-Object System.Windows.Forms.Button
    $b.UseMnemonic = $false
    $b.AutoEllipsis = $true
    $b.Text = [string]$d.botones[$i]
    $b.Tag = $i
    $b.TabStop = $false
    $b.Enabled = $false
    $b.Font = $fBoton
    $b.FlatStyle = 'Flat'
    $b.FlatAppearance.BorderColor = $cBordeBoton
    $b.FlatAppearance.BorderSize = 1
    $b.FlatAppearance.MouseOverBackColor = Mezcla $cAccion $cBlanco 0.9
    $b.FlatAppearance.MouseDownBackColor = Mezcla $cAccion $cBlanco 0.78
    $b.BackColor = $cBlanco
    $b.ForeColor = $cTexto
    $b.Cursor = [System.Windows.Forms.Cursors]::Hand
    $b.SetBounds($M, ($y + 54 * $i), $AW, 46)
    # Solo un clic de MOUSE aprueba: Enter/espacio (tecleo que cae en la ventana) o un Invoke de UI Automation no.
    $b.Add_MouseClick({ param($s, $e)
      $ms = $script:sw.ElapsedMilliseconds
      if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left -and $s.Enabled -and $ms -ge $script:bloqueoHasta) {
        # Sin un DOWN y un UP físicos vistos por el gancho SOBRE este botón = clic armado por programa: no vale.
        if (-not [CandadoMouse]::TomarFisico(${FISICO_MS}, $s.Handle)) {
          [CandadoMouse]::Anotar()
          [Console]::Error.Write("clic en el boton $($s.Tag) sin mouse fisico sobre ese boton: descartado")
          return
        }
        $script:resp = 'b' + [string]$s.Tag
        [Console]::Error.Write("boton $($s.Tag) por clic de mouse a los $([int]($ms / 1000)) s")
        $f.Close()
      }
    })
    [void]$ops.Add($b)
    [void]$controles.Add($b)
  }
  $y += 3 * 54 + 8

  # 5) Abajo: la barra que se acaba con el tiempo, el reloj y «No» aparte (Esc o la X también dicen que no).
  $pista = Bloque $M $y $AW 4 $cBorde
  $script:anchoPista = $AW
  $avance = Bloque 0 0 $AW 4 $cMarca
  [void]$pista.Controls.Add($avance)
  [void]$controles.Add($pista)
  $y += 16
  $lblReloj = Etiqueta '' $M ($y + 12) ($AW - 230) 22 10 $false
  $lblReloj.ForeColor = $cGris
  [void]$controles.Add($lblReloj)

  $no = New-Object System.Windows.Forms.Button
  $no.UseMnemonic = $false
  $no.Text = 'No, no lo hagas'
  $no.Font = Fuente 11 $true
  $no.FlatStyle = 'Flat'
  $no.FlatAppearance.BorderColor = $cBordeBoton
  $no.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(233, 236, 241)
  $no.BackColor = $cBlanco
  $no.ForeColor = $cTexto
  $no.Cursor = [System.Windows.Forms.Cursors]::Hand
  $no.SetBounds(($W - $M - 210), $y, 210, 44)
  $no.Add_Click({ $script:resp = 'no'; [Console]::Error.Write("no a los $([int]($script:sw.ElapsedMilliseconds / 1000)) s"); $f.Close() })
  $f.CancelButton = $no
  [void]$controles.Add($no)
  $y += 44 + 20
  $f.ClientSize = New-Object System.Drawing.Size($W, $y)
  $f.Controls.AddRange($controles.ToArray())

  # Cada vez que la ventana gana el foco, los botones se apagan 1,5 s: el clic que la activa no aprueba.
  $f.Add_Activated({
    $n = $script:sw.ElapsedMilliseconds + ${BLOQUEO_AL_ENFOCAR_MS}
    if ($n -gt $script:bloqueoHasta) { $script:bloqueoHasta = $n }
    foreach ($o in $ops) { $o.Enabled = $false }
  })
  $f.Add_Deactivate({ foreach ($o in $ops) { $o.Enabled = $false } })

  $t = New-Object System.Windows.Forms.Timer
  $t.Interval = 100
  $t.Add_Tick({
    $ms = $script:sw.ElapsedMilliseconds
    if ([CandadoMouse]::Inyectados -gt 0) {
      $script:resp = 'no'; $t.Stop()
      [Console]::Error.Write("$([CandadoMouse]::Inyectados) clic(s) inyectados descartados a los $([int]($ms / 1000)) s: la ventana se cierra con no")
      $f.Close(); return
    }
    if ($ms -ge $script:total) { $script:resp = 'vencio'; $t.Stop(); $f.Close(); return }
    $activa = [System.Windows.Forms.Form]::ActiveForm -eq $f
    $habil = $activa -and ($ms -ge $script:bloqueoHasta)
    foreach ($o in $ops) { if ($o.Enabled -ne $habil) { $o.Enabled = $habil } }
    $quedan = [int][math]::Ceiling(($script:total - $ms) / 1000)
    $texto = "Se cierra sola en $quedan s y no se hace nada."
    if ($lblReloj.Text -ne $texto) { $lblReloj.Text = $texto }
    $largo = [int]($script:anchoPista * [math]::Max(0, $script:total - $ms) / [math]::Max(1, $script:total))
    if ($avance.Width -ne $largo) { $avance.Width = $largo }
    if ($quedan -le 15 -and $lblReloj.ForeColor -ne $cRojo) { $lblReloj.ForeColor = $cRojo; $avance.BackColor = $cRojo }
  })
  $f.Add_Shown({
    # Sin candado no hay ventana: si el gancho no se instala, se cierra con «no» (falla cerrada).
    if (-not [CandadoMouse]::Instalar($f.Handle)) {
      $script:resp = 'no'
      [Console]::Error.Write("no se pudo instalar el candado del mouse (error $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())): no")
      $f.Close(); return
    }
    $script:sw.Start(); $f.Activate(); $no.Focus(); $t.Start()
  })
  [void]$f.ShowDialog()
  $t.Stop()
  [CandadoMouse]::Quitar()
  $n = [int][CandadoMouse]::Inyectados
  if ($n -gt 0) { $script:resp = 'no' }
  [Console]::Out.Write('{"respuesta":"' + $script:resp + '","inyectados":' + [string]$n + '}')
} catch {
  [Console]::Error.Write($_.Exception.Message)
  $n = 0
  try { [CandadoMouse]::Quitar(); $n = [int][CandadoMouse]::Inyectados } catch { }
  [Console]::Out.Write('{"respuesta":"no","inyectados":' + [string]$n + '}')
  exit 1
}
`;
}

/** -EncodedCommand = base64 de UTF-16LE. @param {string} script */
export const comandoCodificado = (script) => Buffer.from(script, "utf16le").toString("base64");

/**
 * 04-11: Windows corta la línea de comando a 32.767 letras y la ventana completa ya medía 28 mil (con un resumen largo
 * no abría → «no»; con el diseño nuevo, 43 mil). La línea lleva solo este arranque fijo, sin datos; el script entero
 * llega por la ENTRADA del proceso (un tubo entre el servidor y powershell.exe, sin archivo que otro pueda cambiar),
 * en base64 para que la página de códigos de la consola no rompa las tildes. Sin script = «no» (falla cerrada).
 */
export const ARRANQUE = `$ErrorActionPreference = 'Stop'
[Console]::Error.WriteLine("pid=$PID")
try {
  $c = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()))
  if ($c.Length -lt 100) { throw 'script vacio' }
} catch {
  [Console]::Error.Write('no llego el script de la ventana: no')
  [Console]::Out.Write('{"respuesta":"no","inyectados":0}')
  exit 1
}
. ([ScriptBlock]::Create($c))
`;

/** Argumentos de powershell.exe (iguales siempre: el script va por la entrada). */
export const ARGS_POWERSHELL = Object.freeze(["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", comandoCodificado(ARRANQUE)]);

/**
 * La última línea tiene que ser el JSON {"respuesta","inyectados"}. Solo «b<correcto>» con 0 inyectados aprueba;
 * un señuelo, «no», texto suelto (el formato viejo «b2» incluido) o cualquier clic inyectado = «no».
 * @param {string} stdout @param {number} correcto índice (0-2) del botón con el dato real
 * @returns {{ respuesta: "si"|"no"|"vencio", inyectados: number }}
 */
export function leerResultado(stdout, correcto) {
  const ultima = String(stdout ?? "").trim().split(/\r?\n/).pop()?.trim() ?? "";
  let o;
  try { o = JSON.parse(ultima); } catch { return { respuesta: "no", inyectados: 0 }; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return { respuesta: "no", inyectados: 0 };
  const inyectados = Number.isSafeInteger(o.inyectados) && o.inyectados > 0 ? o.inyectados : 0;
  if (inyectados > 0) return { respuesta: "no", inyectados };
  if (o.respuesta === "vencio") return { respuesta: "vencio", inyectados: 0 };
  const ok = Number.isInteger(correcto) && correcto >= 0 && correcto <= 2 && o.respuesta === `b${correcto}`;
  return { respuesta: ok ? "si" : "no", inyectados: 0 };
}

/** @param {string} stdout @param {number} correcto @returns {"si"|"no"|"vencio"} */
export const leerRespuesta = (stdout, correcto) => leerResultado(stdout, correcto).respuesta;

/**
 * Datos que viajan a PowerShell (exportado para los tests). La clave y las filas ya saneadas: una línea, ≤60.
 * @param {{ negocio: string, herramienta?: string, resumen: string, ventana?: any, segundos: number, aleatorio?: (n: number) => number }} a
 */
export function armarDatos(a) {
  const ventana = sanearVentana(a.ventana, a.aleatorio);
  const { textos, correcto } = armarBotones(ventana.clave, a.aleatorio);
  let resumen = sinInstruccion(a.resumen);
  if (resumen.length > MAX_RESUMEN) resumen = `${resumen.slice(0, MAX_RESUMEN)}\n… (texto recortado: pídele a Claude el detalle antes de decir que sí)`;
  const accion = accionDe(a.herramienta);
  return {
    correcto,
    datos: {
      negocio: etiquetaNegocio(a.negocio),
      etiqueta: ventana.clave.etiqueta,
      valor: conMarca(ventana.clave.valor), // la etiqueta de arriba lleva la marca; los botones no (delataría al real)
      filas: ventana.filas,
      resumen,
      instruccion: `Para hacerlo, aprieta el botón con el ${ventana.clave.palabra} correcto:`,
      accion: accion.texto,
      colores: { marca: Object.hasOwn(COLOR_NEGOCIO, a.negocio) ? COLOR_NEGOCIO[a.negocio] : COLOR_OTRO, accion: COLOR_ACCION[accion.tono] },
      botones: textos,
      segundos: a.segundos,
    },
  };
}

/**
 * Abre la ventana y espera. Vuelve "si" | "no" | "vencio", o {respuesta:"no", inyectados:N} si llegaron clics
 * inyectados (el servidor lo registra como intento). Al vencer o cancelarse mata el proceso (taskkill por PID de Windows
 * + kill del lado WSL) y vuelve recién cuando cerró (≤4 s): la fila no abre la siguiente encima de ésta.
 * @param {{ negocio: string, herramienta?: string, resumen: string, ventana?: any, segundos?: number, vence?: number, signal?: AbortSignal,
 *   spawn?: typeof spawnReal, powershell?: string, taskkill?: string, ahora?: () => number, log?: (m: string) => void,
 *   aleatorio?: (n: number) => number }} a
 * @returns {Promise<"si"|"no"|"vencio"|{ respuesta: "no", inyectados: number }>}
 */
export function preguntarEnWindows(a) {
  const ahora = a.ahora ?? Date.now;
  const crudo = a.segundos ?? (a.vence ? Math.round((a.vence - ahora()) / 1000) : SEGUNDOS_POR_DEFECTO);
  const segundos = Math.min(300, Math.max(5, Number.isFinite(crudo) ? Math.round(crudo) : SEGUNDOS_POR_DEFECTO));
  const { correcto, datos: paraVentana } = armarDatos({ negocio: a.negocio, herramienta: a.herramienta, resumen: a.resumen, ventana: a.ventana, segundos, aleatorio: a.aleatorio });
  const datos = Buffer.from(JSON.stringify(paraVentana), "utf8").toString("base64");
  const script = Buffer.from(armarScript(datos), "utf8").toString("base64");
  const log = a.log ?? ((m) => process.stderr.write(`[buleje-mcp] ${m}\n`));
  const spawn = a.spawn ?? spawnReal;

  return new Promise((resolver) => {
    /** @type {any} */ let hijo;
    let listo = false, cerrado = false, salida = "", errores = "", pidWin = 0, reloj, gracia, pendiente;
    const entregar = (r) => {
      if (listo) return;
      listo = true;
      clearTimeout(reloj);
      clearTimeout(gracia);
      a.signal?.removeEventListener("abort", alAbortar);
      resolver(r);
    };
    const matarWsl = () => { try { hijo?.kill(); } catch { /* ya terminó */ } };
    // Matar el lado WSL no siempre baja el powershell.exe de Windows: primero taskkill por su PID, después el kill.
    const matar = () => {
      if (cerrado) return;
      if (!(pidWin > 0)) return matarWsl();
      let k, hecho = false;
      const despues = () => { if (hecho) return; hecho = true; matarWsl(); };
      try {
        k = spawn(a.taskkill ?? RUTA_TASKKILL, ["/PID", String(pidWin), "/T", "/F"], { stdio: "ignore" });
        k?.on?.("error", despues);
        k?.on?.("close", despues);
      } catch { /* sin taskkill: queda el kill */ }
      setTimeout(despues, ESPERA_TASKKILL_MS).unref?.();
      if (!k) despues();
    };
    /** Corta la ventana y entrega `r` cuando el proceso cerró (o a los ESPERA_CIERRE_MS). */
    const cortar = (r) => {
      if (listo || pendiente) return;
      pendiente = r;
      matar();
      gracia = setTimeout(() => { log(`la ventana de OK no cerró ${ESPERA_CIERRE_MS / 1000} s después de matarla (pid ${pidWin || "?"})`); entregar(r); }, ESPERA_CIERRE_MS);
    };
    const alAbortar = () => cortar("no");
    if (a.signal?.aborted) return entregar("no");
    try {
      hijo = spawn(a.powershell ?? rutaPowershell(), [...ARGS_POWERSHELL], { stdio: ["pipe", "pipe", "pipe"], windowsHide: false });
      // Si el tubo se rompe (el proceso murió antes de leer), el arranque no recibe script y contesta «no».
      hijo.stdin?.on?.("error", (e) => log(`no se pudo mandar el script a la ventana de OK: ${String(e?.code ?? e?.message ?? e)}`));
      hijo.stdin?.end?.(script);
    } catch (e) {
      log(`no se pudo abrir la ventana de OK: ${String(/** @type {any} */ (e)?.message ?? e)}`);
      return entregar("no");
    }
    a.signal?.addEventListener("abort", alAbortar, { once: true });
    reloj = setTimeout(() => cortar("vencio"), (segundos + HOLGURA_ARRANQUE_S) * 1000);
    hijo.stdout?.on("data", (b) => { if (salida.length < 1024) salida += String(b); });
    hijo.stderr?.on("data", (b) => {
      if (errores.length < 2048) errores += String(b);
      if (!pidWin) {
        const m = /^pid=(\d{1,10})\r?$/m.exec(errores);
        if (m) { pidWin = Number(m[1]); if (pendiente) matar(); } // se mandó a matar antes de saber su PID: ahora sí, taskkill
      }
    });
    hijo.on("error", (e) => { cerrado = true; log(`powershell.exe no disponible (${e?.code ?? e?.message ?? e}): la ventana de OK no se abrió → «no»`); entregar(pendiente ?? "no"); });
    hijo.on("close", (codigo) => {
      cerrado = true;
      const bitacora = errores.replace(/^pid=\d+\r?\n?/gm, "").trim();
      if (bitacora) log(`ventana de OK (código ${codigo}): ${bitacora.slice(0, 300)}`);
      if (pendiente) return entregar(pendiente);
      const r = leerResultado(salida, correcto);
      if (r.inyectados > 0) {
        log(`INTENTO: ${r.inyectados} clic(s) inyectados (no del mouse de Brandon) llegaron a la ventana de OK → «no»`);
        return entregar({ respuesta: "no", inyectados: r.inyectados });
      }
      if (r.respuesta === "no" && /"respuesta":"b[0-2]"/.test(salida)) log("apretó un botón que NO era el del dato correcto → «no»");
      entregar(r.respuesta);
    });
  });
}
