#!/usr/bin/env node
// Vista previa de la ventana «Claude pide tu OK» (diseño 04-11) SIN aprobar nada: abre la misma ventana, por el mismo
// arranque y tubo que el servidor, con datos de muestra; a los 2,7 s le saca una foto y se cierra sola (respuesta «no»).
// Uso: node tools/mcp-buleje/vista-ventana-ok.mjs [anular|plata|nombre] [salida.png]   (por defecto: anular → scratch)
// La ventana aparece ~3 s en la pantalla de Brandon: avisarle antes si está trabajando.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { claveMonto, claveNombre } from "./src/clave-ok.mjs";
import { armarDatos, armarScript, ARGS_POWERSHELL, rutaPowershell } from "./src/dialogo-windows.mjs";

const [caso = "anular", destino] = process.argv.slice(2);
const INSTR = "\n\nPara hacerlo, aprieta el botón con el monto correcto.";
const CASOS = {
  anular: { negocio: "blas", herramienta: "adelanto_anular", resumen: `Anular el adelanto ADL-2026-0007 de S/ 7.203,80 de César Julio Aliaga Orellana. La caja NO se toca.${INSTR}`,
    ventana: { clave: claveMonto(7203.8, { etiqueta: "Monto del adelanto a anular" }), filas: [{ etiqueta: "De quién", valor: "César Julio Aliaga Orellana" }, { etiqueta: "DNI (últimos 4)", valor: "4471" }, { etiqueta: "Caja", valor: "no se toca" }] } },
  plata: { negocio: "bodega", herramienta: "caja_movimiento", resumen: `Sacar S/ 350,00 de la caja (efectivo) para pagar el flete de gaseosas a Transportes Ucayali.${INSTR}`,
    ventana: { clave: claveMonto(350, { etiqueta: "Monto que sale de la caja" }), filas: [{ etiqueta: "OJO", valor: "no se pudo verificar a quién" }, { etiqueta: "Para", valor: "Transportes Ucayali" }] } },
  nombre: { negocio: "qa-forestal", herramienta: "trabajador_cesar", resumen: "Dar de baja a un trabajador de prueba.\n\nPara hacerlo, aprieta el botón con el nombre correcto.",
    ventana: { clave: claveNombre("Juan Carlos Ríos Panduro", ["Juan Carlos Ríos Pinedo", "Juan Carlos Rojas Panduro"]), filas: [{ etiqueta: "Puesto", valor: "Ayudante de aserrío" }] } },
};
if (!CASOS[caso]) { console.error(`caso desconocido: ${caso} (anular | plata | nombre)`); process.exit(2); }

const { datos } = armarDatos({ ...CASOS[caso], segundos: 120 });
let script = armarScript(Buffer.from(JSON.stringify(datos), "utf8").toString("base64"));
const gancho = "$script:sw.Start(); $f.Activate(); $no.Focus(); $t.Start()";
if (!script.includes(gancho)) { console.error("no encontré el arranque de la ventana (¿cambió armarScript?)"); process.exit(1); }
const winTemp = `C:\\Users\\Usuario\\AppData\\Local\\Temp\\vista-ok-${caso}.png`;
script = script.replace(gancho, `${gancho}
    $script:cap = New-Object System.Windows.Forms.Timer; $script:cap.Interval = 2700
    $script:cap.Add_Tick({ $script:cap.Stop(); $t.Stop(); foreach ($o in $ops) { $o.Enabled = $true }; $f.Refresh(); [System.Windows.Forms.Application]::DoEvents()
      $bmp = New-Object System.Drawing.Bitmap($f.Width, $f.Height); $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($f.Location, [System.Drawing.Point]::Empty, $f.Size); $bmp.Save('${winTemp}'); $script:resp = 'no'; $f.Close() })
    $script:cap.Start()`);

const hijo = spawn(rutaPowershell(), [...ARGS_POWERSHELL], { stdio: ["pipe", "pipe", "pipe"] });
let salida = "", errores = "";
hijo.stdout.on("data", (b) => (salida += b));
hijo.stderr.on("data", (b) => (errores += b));
hijo.stdin.end(Buffer.from(script, "utf8").toString("base64"));
const corte = setTimeout(() => { console.error("la vista no cerró en 30 s"); hijo.kill(); }, 30_000);
hijo.on("close", (codigo) => {
  clearTimeout(corte);
  const wsl = `/mnt/c/Users/Usuario/AppData/Local/Temp/vista-ok-${caso}.png`;
  if (!existsSync(wsl)) { console.error(`sin foto (código ${codigo}): ${errores.replace(/^pid=\d+\s*/m, "").slice(0, 300)}`); process.exit(1); }
  if (destino) copyFileSync(wsl, destino);
  console.log(`foto: ${destino ?? wsl} · ventana respondió ${salida.trim()}`);
});
