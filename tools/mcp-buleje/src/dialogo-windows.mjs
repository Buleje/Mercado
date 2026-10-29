// Ventana «Claude pide tu OK» en la PC de Brandon (contrato §10). Desde WSL lanza powershell.exe con WinForms:
// encima de todo, el negocio y el dato clave (monto, nombre o código) en etiquetas fijas, el resumen, y 3 botones en
// orden al azar: el dato real y 2 señuelos parecidos (revisión de seguridad 29-10, hallazgo 4). Solo el correcto
// aprueba; un señuelo, «No», Esc o cerrar = «no». Devuelve "si" | "no" | "vencio". Cualquier falla = "no".
// Los botones se habilitan 2 s después de mostrarse y se vuelven a apagar 1,5 s cada vez que la ventana gana el foco
// (un clic que la activa no aprueba). Solo un clic de MOUSE aprueba (29-10: la 1.ª prueba real volvió "si" a los 9 s
// por un clic suelto; Enter/espacio/UI Automation no disparan MouseClick).
// Los textos viajan en base64 dentro de un -EncodedCommand: nunca se interpolan en el comando
// (el resumen sale de datos del negocio y podría traer comillas o código).
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
  static readonly Proc proc = new Proc(Llamada);
  static IntPtr gancho = IntPtr.Zero;
  static IntPtr ventana = IntPtr.Zero;
  static int inyectados = 0;
  static int fisicoTick = 0;
  static bool hayFisico = false;
  public static int Inyectados { get { return inyectados; } }
  public static bool EsBoton(int msg) { return (msg >= 0x201 && msg <= 0x209) || (msg >= 0x20B && msg <= 0x20D); }
  public static bool Descartar(int msg, uint flags) { return EsBoton(msg) && (flags & 0x3u) != 0; }
  static IntPtr Llamada(int code, IntPtr w, IntPtr l) {
    try {
      if (code >= 0 && ventana != IntPtr.Zero) {
        int msg = w.ToInt32();
        if (EsBoton(msg)) {
          Msll info = (Msll)Marshal.PtrToStructure(l, typeof(Msll));
          if (GetAncestor(WindowFromPoint(info.Pt), 2) == ventana) {
            if (Descartar(msg, info.Flags)) { inyectados++; return (IntPtr)1; }
            if (msg == 0x202) { fisicoTick = Environment.TickCount; hayFisico = true; }
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
  public static bool TomarFisico(int ms) { bool ok = hayFisico && unchecked(Environment.TickCount - fisicoTick) <= ms; hayFisico = false; return ok; }
  public static void Anotar() { inyectados++; }
}`;

/** Nombre que ve Brandon (sin claves de código). */
export const ETIQUETAS = {
  bodega: "Bodega San Martín",
  blas: "Blas — aserradero",
  "qa-forestal": "QA forestal (pruebas)",
};

/** @param {string} negocio */
export const etiquetaNegocio = (negocio) => ETIQUETAS[/** @type {keyof typeof ETIQUETAS} */ (negocio)] ?? linea60(negocio || "¿negocio?");

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
  $f.ClientSize = New-Object System.Drawing.Size(660, 566)
  $f.Font = New-Object System.Drawing.Font('Segoe UI', 10)

  function Etiqueta($texto, $x, $y, $w, $h, $tam, $negrita) {
    $l = New-Object System.Windows.Forms.Label
    $l.UseMnemonic = $false
    $l.AutoEllipsis = $true
    $l.Text = [string]$texto
    $estilo = if ($negrita) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $l.Font = New-Object System.Drawing.Font('Segoe UI', $tam, $estilo)
    $l.SetBounds($x, $y, $w, $h)
    return $l
  }

  # Etiquetas fijas, una línea cada una (Node ya las dejó en ≤60 caracteres sin saltos).
  $controles = New-Object System.Collections.ArrayList
  [void]$controles.Add((Etiqueta $d.negocio 20 10 620 44 20 $true))
  [void]$controles.Add((Etiqueta ([string]$d.etiqueta + ':') 22 56 620 20 10 $false))
  [void]$controles.Add((Etiqueta $d.valor 20 76 620 38 18 $true))
  $y = 118
  foreach ($fila in @($d.filas)) {
    if ($null -eq $fila) { continue }
    [void]$controles.Add((Etiqueta ([string]$fila.etiqueta + ': ' + [string]$fila.valor) 22 $y 620 22 11 $true))
    $y += 22
  }

  $txt = New-Object System.Windows.Forms.TextBox
  $txt.Multiline = $true
  $txt.ReadOnly = $true
  $txt.WordWrap = $true
  $txt.ScrollBars = 'Vertical'
  $txt.TabStop = $false
  $txt.Font = New-Object System.Drawing.Font('Segoe UI', 12)
  $txt.Text = ([string]$d.resumen) -replace "\`r?\`n", "\`r\`n"
  $txt.SetBounds(20, 210, 620, 140)
  [void]$controles.Add($txt)

  $instr = Etiqueta $d.instruccion 22 356 620 40 10 $true
  $instr.AutoEllipsis = $false
  [void]$controles.Add($instr)
  $lblReloj = Etiqueta '' 22 398 620 20 10 $false
  [void]$controles.Add($lblReloj)

  $ops = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt 3; $i++) {
    $b = New-Object System.Windows.Forms.Button
    $b.UseMnemonic = $false
    $b.AutoEllipsis = $true
    $b.Text = [string]$d.botones[$i]
    $b.Tag = $i
    $b.TabStop = $false
    $b.Enabled = $false
    $b.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
    $b.SetBounds(20, (424 + 46 * $i), 466, 40)
    # Solo un clic de MOUSE aprueba: Enter/espacio (tecleo que cae en la ventana) o un Invoke de UI Automation no.
    $b.Add_MouseClick({ param($s, $e)
      $ms = $script:sw.ElapsedMilliseconds
      if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left -and $s.Enabled -and $ms -ge $script:bloqueoHasta) {
        # Sin un LBUTTONUP físico visto por el gancho = clic armado por programa (PostMessage, gancho caído): no vale.
        if (-not [CandadoMouse]::TomarFisico(${FISICO_MS})) {
          [CandadoMouse]::Anotar()
          [Console]::Error.Write("clic en el boton $($s.Tag) sin rastro de mouse fisico: descartado")
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

  $no = New-Object System.Windows.Forms.Button
  $no.UseMnemonic = $false
  $no.Text = 'No'
  $no.Font = New-Object System.Drawing.Font('Segoe UI', 12)
  $no.SetBounds(500, 424, 140, 132)
  $no.Add_Click({ $script:resp = 'no'; [Console]::Error.Write("no a los $([int]($script:sw.ElapsedMilliseconds / 1000)) s"); $f.Close() })
  $f.CancelButton = $no
  [void]$controles.Add($no)
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
 * @param {{ negocio: string, resumen: string, ventana?: any, segundos: number, aleatorio?: (n: number) => number }} a
 */
export function armarDatos(a) {
  const ventana = sanearVentana(a.ventana, a.aleatorio);
  const { textos, correcto } = armarBotones(ventana.clave, a.aleatorio);
  let resumen = String(a.resumen ?? "");
  if (resumen.length > MAX_RESUMEN) resumen = `${resumen.slice(0, MAX_RESUMEN)}\n… (texto recortado: pídele a Claude el detalle antes de decir que sí)`;
  return {
    correcto,
    datos: {
      negocio: etiquetaNegocio(a.negocio),
      etiqueta: ventana.clave.etiqueta,
      valor: conMarca(ventana.clave.valor), // la etiqueta de arriba lleva la marca; los botones no (delataría al real)
      filas: ventana.filas,
      resumen,
      instruccion: `Para hacerlo, aprieta el botón con el ${ventana.clave.palabra} correcto. Claude no contesta esta ventana por su cuenta.`,
      botones: textos,
      segundos: a.segundos,
    },
  };
}

/**
 * Abre la ventana y espera. Vuelve "si" | "no" | "vencio", o {respuesta:"no", inyectados:N} si llegaron clics
 * inyectados (el servidor lo registra como intento). Al vencer o cancelarse mata el proceso (taskkill por PID de Windows
 * + kill del lado WSL) y vuelve recién cuando cerró (≤4 s): la fila no abre la siguiente encima de ésta.
 * @param {{ negocio: string, resumen: string, ventana?: any, segundos?: number, vence?: number, signal?: AbortSignal,
 *   spawn?: typeof spawnReal, powershell?: string, taskkill?: string, ahora?: () => number, log?: (m: string) => void,
 *   aleatorio?: (n: number) => number }} a
 * @returns {Promise<"si"|"no"|"vencio"|{ respuesta: "no", inyectados: number }>}
 */
export function preguntarEnWindows(a) {
  const ahora = a.ahora ?? Date.now;
  const crudo = a.segundos ?? (a.vence ? Math.round((a.vence - ahora()) / 1000) : SEGUNDOS_POR_DEFECTO);
  const segundos = Math.min(300, Math.max(5, Number.isFinite(crudo) ? Math.round(crudo) : SEGUNDOS_POR_DEFECTO));
  const { correcto, datos: paraVentana } = armarDatos({ negocio: a.negocio, resumen: a.resumen, ventana: a.ventana, segundos, aleatorio: a.aleatorio });
  const datos = Buffer.from(JSON.stringify(paraVentana), "utf8").toString("base64");
  const args = ["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", comandoCodificado(armarScript(datos))];
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
      hijo = spawn(a.powershell ?? rutaPowershell(), args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: false });
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
      const bitacora = errores.replace(/^pid=\d+\r?\n?/m, "").trim();
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
