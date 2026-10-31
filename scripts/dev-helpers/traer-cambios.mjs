#!/usr/bin/env node
/**
 * traer-cambios — mientras corre `npm run dev`, trae solo lo que otra sesión
 * (Claude en la nube, la otra PC) subió a GitHub en la MISMA rama. Turbopack
 * recarga y la página ya lo muestra: Brandon sólo mira (pedido 07-10: «quiero
 * que todo lo hagas tú para yo simplemente verlo en la página»; el cambio del
 * censo estaba en GitHub y su localhost seguía con el viejo).
 *
 * Cada minuto: `git fetch` de la rama actual y, si GitHub va adelante,
 *  - sin commits locales propios → `merge --ff-only` (git se niega solo si
 *    un archivo que viene choca con uno editado a mano: nada se pisa);
 *  - con commits locales → `merge` sólo con el árbol limpio, y si hay
 *    conflicto se aborta y se avisa (nunca deja la mezcla a medias).
 * Si llega un `package-lock.json` nuevo corre `npm install`; si llega un
 * schema nuevo corre `prisma generate` y avisa que hay que reiniciar el dev.
 *
 * Uso: lo arranca `scripts/dev-with-canary.mjs`. Apagar: DEV_SIN_TRAER=1.
 * Suelto: `node scripts/dev-helpers/traer-cambios.mjs` (una pasada).
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const CADA_MS = Number(process.env.TRAER_CADA_MS ?? 60_000);
const tag = "\x1b[36m[traer]\x1b[0m";

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8", timeout: 60_000 });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function correr(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", timeout: 15 * 60_000 });
  return r.status === 0;
}

/** Una pasada. Devuelve qué hizo (para logs y tests a mano). */
export function traerUnaVez() {
  const rama = git(["rev-parse", "--abbrev-ref", "HEAD"]).out;
  if (!rama || rama === "HEAD") return "sin-rama";
  if (!git(["fetch", "--quiet", "origin", rama]).ok) return "sin-red";
  const remoto = `origin/${rama}`;
  const detras = Number(git(["rev-list", "--count", `HEAD..${remoto}`]).out || 0);
  if (detras === 0) return "al-dia";
  const adelante = Number(git(["rev-list", "--count", `${remoto}..HEAD`]).out || 0);
  const antes = git(["rev-parse", "HEAD"]).out;

  if (adelante === 0) {
    const r = git(["merge", "--ff-only", "--quiet", remoto]);
    if (!r.ok) {
      console.log(`${tag} ⚠️  GitHub tiene ${detras} commit(s) nuevos pero chocan con archivos editados a mano: ${r.err.split("\n")[0]}`);
      return "choca-con-edicion";
    }
  } else {
    if (git(["status", "--porcelain", "--untracked-files=no"]).out) {
      console.log(`${tag} ⚠️  GitHub tiene ${detras} commit(s) nuevos y hay ${adelante} local(es) + cambios sin commitear: no mezclo con el árbol sucio.`);
      return "arbol-sucio";
    }
    const r = git(["merge", "--no-edit", "--quiet", remoto]);
    if (!r.ok) {
      git(["merge", "--abort"]);
      console.log(`${tag} ⚠️  Mezclar ${detras} commit(s) de GitHub da conflicto: lo dejé como estaba (mezcla abortada).`);
      return "conflicto";
    }
  }

  const cambiados = git(["diff", "--name-only", antes, "HEAD"]).out.split("\n");
  const ultimos = git(["log", "--format=  · %s", `${antes}..HEAD`, "-5"]).out;
  console.log(`\x1b[32m${tag} ✅ ${detras} cambio(s) de GitHub traídos — recarga la página si no se actualizó sola:\x1b[0m\n${ultimos}`);
  if (cambiados.includes("package-lock.json")) {
    console.log(`${tag} cambió package-lock.json → npm install`);
    correr("npm", ["install", "--no-audit", "--no-fund"]);
  }
  if (cambiados.includes("prisma/schema.prisma")) {
    console.log(`${tag} cambió el schema → prisma generate`);
    correr("npx", ["prisma", "generate"]);
    console.log(`\x1b[33m${tag} ⚠️  schema nuevo: reinicia el dev (npm run dev:restart) para que lo tome.\x1b[0m`);
  }
  return "traido";
}

/** Bucle en segundo plano; no frena el cierre del proceso. */
export function iniciarTraerCambios() {
  if (process.env.DEV_SIN_TRAER) return;
  console.log(`${tag} trayendo solo los cambios de GitHub de esta rama cada ${Math.round(CADA_MS / 1000)} s (apagar: DEV_SIN_TRAER=1).`);
  const pasada = () => {
    try { traerUnaVez(); } catch (err) { console.log(`${tag} falló una pasada: ${err.message}`); }
  };
  setTimeout(pasada, 5_000).unref();
  setInterval(pasada, CADA_MS).unref();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(`${tag} ${traerUnaVez()}`);
}
