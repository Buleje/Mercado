#!/usr/bin/env node
/**
 * Mantiene la pantalla encendida mientras Claude Code está trabajando.
 *
 * Acá corre Ubuntu sobre WSL2, sin sesión gráfica propia: `DISPLAY` está vacío
 * y no hay `xset`. La pantalla que se apaga es la de **Windows**, así que
 * `systemd-inhibit` del lado Linux no serviría de nada — hay que pedírselo a
 * Windows.
 *
 * Windows tiene una función justo para esto (`SetThreadExecutionState`): un
 * proceso declara "no apagues la pantalla mientras yo esté vivo". Se lanza un
 * PowerShell chiquito que hace esa declaración y se queda esperando; cuando
 * Claude termina, se borra el archivo de traba y ese PowerShell se apaga solo,
 * devolviéndole a Windows el control de siempre.
 *
 *   node mantener-pantalla-despierta.mjs iniciar
 *   node mantener-pantalla-despierta.mjs soltar
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";

const PS = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

/**
 * La traba tiene que vivir en un lugar que PowerShell pueda mirar, o sea del
 * lado de Windows. Se guardan las dos vistas de la misma carpeta: la de Linux
 * para crear y borrar el archivo, y la de Windows para pasársela al script.
 */
const USUARIO_WIN = process.env.BSM_WIN_USER ?? "Usuario";
const TRABA_LINUX = `/mnt/c/Users/${USUARIO_WIN}/AppData/Local/Temp/claude-pantalla-despierta.lock`;
const TRABA_WIN = `C:\\Users\\${USUARIO_WIN}\\AppData\\Local\\Temp\\claude-pantalla-despierta.lock`;
const GUION_LINUX = `/mnt/c/Users/${USUARIO_WIN}/AppData/Local/Temp/claude-pantalla-despierta.ps1`;
const GUION_WIN = `C:\\Users\\${USUARIO_WIN}\\AppData\\Local\\Temp\\claude-pantalla-despierta.ps1`;

/**
 * Tope de seguridad: si algo sale mal y nunca se suelta la traba, la máquina no
 * puede quedarse despierta para siempre. A las 8 horas se rinde sola.
 */
const HORAS_MAXIMO = 8;

/**
 * El script de PowerShell se copia al lado de Windows y se ejecuta por ARCHIVO,
 * no por línea de comandos: pasar el código como argumento obliga a escapar
 * comillas tres veces (bash → node → PowerShell) y ahí es donde se rompe.
 */
function prepararGuion() {
  const origen = new URL("./mantener-pantalla-despierta.ps1", import.meta.url).pathname;
  copyFileSync(origen, GUION_LINUX);
}

function iniciar() {
  if (!existsSync(PS)) return; // No estamos sobre Windows: no hay nada que hacer.
  if (existsSync(TRABA_LINUX)) return; // Ya hay una sesión cuidando la pantalla.

  try {
    mkdirSync(dirname(TRABA_LINUX), { recursive: true });
    // El guion se copia ANTES de poner la traba: si la copia falla (el archivo
    // puede estar tomado por un guardián anterior que todavía no murió), no
    // queremos dejar una traba puesta sin nadie que la cuide — eso hacía que
    // los intentos siguientes se dieran por satisfechos y la pantalla se
    // apagara igual.
    prepararGuion();
    writeFileSync(TRABA_LINUX, `${process.pid}\n${new Date().toISOString()}\n`);

    const hijo = spawn(
      PS,
      [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden",
        "-File", GUION_WIN,
        "-Traba", TRABA_WIN,
        "-HorasMaximo", String(HORAS_MAXIMO),
      ],
      { detached: true, stdio: "ignore" },
    );
    hijo.on("error", () => rmSync(TRABA_LINUX, { force: true }));
    hijo.unref();
  } catch {
    // Que no se pueda mantener la pantalla encendida no puede romper la sesión.
    rmSync(TRABA_LINUX, { force: true });
  }
}

function soltar() {
  // Borrar la traba es la señal: el PowerShell la mira cada 3 segundos y se
  // apaga solo, devolviéndole a Windows su comportamiento normal.
  rmSync(TRABA_LINUX, { force: true });
}

/** Para poder comprobar a mano que Windows realmente tomó el pedido. */
function estado() {
  const trabaPuesta = existsSync(TRABA_LINUX);
  let pedidos = "(no se pudo consultar)";
  try {
    pedidos = execFileSync(PS, ["-NoProfile", "-Command", "powercfg /requests"], {
      encoding: "utf8",
      timeout: 20_000,
    });
  } catch {
    /* powercfg necesita permisos de administrador en algunas máquinas */
  }
  console.log(`traba puesta: ${trabaPuesta ? "sí" : "no"}`);
  console.log(pedidos.trim());
}

const accion = process.argv[2];
if (accion === "iniciar") iniciar();
else if (accion === "soltar") soltar();
else if (accion === "estado") estado();
