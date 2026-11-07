/**
 * Espejo del celular (Cámaras › Espejo del celular, 24-10).
 *
 * Una página web abierta EN el celular no puede compartir su pantalla (Chrome
 * de Android no tiene `getDisplayMedia`). El camino es al revés: el celular se
 * duplica en la PC con scrcpy (gratis, por cable USB o Wi-Fi) y el panel,
 * abierto en esa PC, captura la VENTANA de scrcpy con `getDisplayMedia`.
 *
 * El lanzador vive dos veces, a propósito: `scripts/espejo-celular.cmd` (en el
 * repo, CRLF por `.gitattributes`) y `LANZADOR_ESPEJO_CMD`, que es lo que baja
 * el botón «Bajar el lanzador». Un test los compara para que no se separen.
 */

/** El título fijo de la ventana de scrcpy: es lo que se elige en el selector del navegador. */
export const TITULO_VENTANA_ESPEJO = "Celular de Brandon";

/** Página oficial de descargas de scrcpy (zip portable para Windows). */
export const URL_SCRCPY = "https://github.com/Genymobile/scrcpy/releases/latest";

/** Nombre del archivo que baja el panel. */
export const NOMBRE_LANZADOR = "espejo-celular.cmd";

/*
 * Sin acentos: cmd.exe lee el archivo en la página de códigos de la consola
 * (850/437) y un «á» sale como basura. Líneas con paréntesis DENTRO de un
 * bloque `( … )` lo cerrarían antes de tiempo: los avisos con paréntesis van
 * fuera de los bloques.
 */
const LINEAS = [
  "@echo off",
  "rem Espejo del celular: abre scrcpy con un titulo fijo para que el panel lo muestre",
  'rem (Camaras > Espejo del celular > "Mostrar mi celular aqui"). Doble clic para abrirlo.',
  "rem Sin cable: con el cable puesto, abrelo una vez como  espejo-celular.cmd --tcpip",
  "rem y desconecta el cable. Apagar la pantalla del celular y seguir viendolo: Alt+O.",
  "setlocal EnableExtensions",
  "title Espejo del celular",
  'set "SCRCPY="',
  'if exist "%~dp0scrcpy.exe" set "SCRCPY=%~dp0scrcpy.exe"',
  'if not defined SCRCPY if exist "%USERPROFILE%\\scrcpy\\scrcpy.exe" set "SCRCPY=%USERPROFILE%\\scrcpy\\scrcpy.exe"',
  'if not defined SCRCPY for /d %%D in ("%USERPROFILE%\\scrcpy*" "%USERPROFILE%\\Downloads\\scrcpy*" "%USERPROFILE%\\Desktop\\scrcpy*" "C:\\scrcpy*") do (',
  '  if exist "%%~D\\scrcpy.exe" set "SCRCPY=%%~D\\scrcpy.exe"',
  '  for /d %%E in ("%%~D\\scrcpy*") do if exist "%%~E\\scrcpy.exe" set "SCRCPY=%%~E\\scrcpy.exe"',
  ")",
  'if not defined SCRCPY for /f "delims=" %%P in (\'where scrcpy 2^>nul\') do if not defined SCRCPY set "SCRCPY=%%P"',
  "if not defined SCRCPY goto :falta",
  'echo Abriendo el celular con "%SCRCPY%"',
  `echo Deja esta ventana abierta. En el panel toca "Mostrar mi celular aqui" y elige "${TITULO_VENTANA_ESPEJO}".`,
  `"%SCRCPY%" --window-title "${TITULO_VENTANA_ESPEJO}" --stay-awake %*`,
  "if errorlevel 1 goto :fallo",
  "exit /b 0",
  ":fallo",
  "echo.",
  'echo No se pudo abrir el celular. Revisa: cable conectado, "Depuracion USB" activada',
  'echo y que aceptaste "Permitir depuracion USB" en la pantalla del celular.',
  "pause",
  "exit /b 1",
  ":falta",
  "echo No encontre scrcpy.exe.",
  "echo Bajalo de la pagina que se abre (el zip scrcpy-win64), descomprimelo en",
  "echo %USERPROFILE%\\scrcpy  y vuelve a abrir este archivo.",
  `start "" "${URL_SCRCPY}"`,
  "pause",
  "exit /b 1",
];

/** El lanzador para Windows, con CRLF (cmd.exe se confunde con LF en etiquetas y goto). */
export const LANZADOR_ESPEJO_CMD = `${LINEAS.join("\r\n")}\r\n`;

/** «celular-2026-10-24-15-32-08.png»: ordena solo en el Archivo y en Descargas. */
export function nombreFotoEspejo(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const dia = `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
  return `celular-${dia}-${p(fecha.getHours())}-${p(fecha.getMinutes())}-${p(fecha.getSeconds())}.png`;
}
