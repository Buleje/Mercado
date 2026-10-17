/**
 * fix-csrf-cliente — pone el header `x-csrf-token` en las mutaciones del
 * cliente que lo tenían faltando (las que `audit-csrf-cliente.mjs` marca).
 *
 * Sólo aplica las tres formas seguras y deja anotado lo que no encaja, para
 * revisarlo a mano:
 *   1. `headers: { … }`         → `headers: csrfHeaders({ … })`
 *   2. sin `headers`            → agrega `headers: csrfHeaders(),`
 *   3. `headers: <identificador>` → `headers: csrfHeaders(<identificador>)`
 *
 * Uso: node scripts/fix-csrf-cliente.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const DRY = process.argv.includes("--dry");

/** Las mismas rutas exentas del auditor: se reusa su salida. */
let salida = "";
try {
  salida = execSync("node scripts/audit-csrf-cliente.mjs", { encoding: "utf8" });
} catch (e) {
  salida = e.stdout ?? "";
}
const hallazgos = salida
  .split("\n")
  .map((l) => l.match(/^\s{2}(\S+):(\d+)\s+(POST|PUT|PATCH|DELETE)\s+(\S+)/))
  .filter(Boolean)
  .map((m) => ({ archivo: m[1], linea: Number(m[2]), metodo: m[3], url: m[4] }));

/** Archivo → líneas (desc, para que editar no corra las de arriba). */
const porArchivo = new Map();
for (const h of hallazgos) {
  if (!porArchivo.has(h.archivo)) porArchivo.set(h.archivo, []);
  porArchivo.get(h.archivo).push(h);
}

let tocados = 0;
let saltados = 0;
for (const [archivo, items] of porArchivo) {
  let src = readFileSync(archivo, "utf8");
  const lineas = src.split("\n");
  items.sort((a, b) => b.linea - a.linea);

  for (const it of items) {
    // El objeto de opciones arranca en la línea del fetch y cierra con `});`.
    const inicio = it.linea - 1;
    let fin = inicio;
    while (fin < lineas.length && fin < inicio + 30 && !/^\s*\}\);?\s*$/.test(lineas[fin])) fin++;
    const bloque = lineas.slice(inicio, fin + 1).join("\n");
    if (/csrf/i.test(bloque)) continue;

    // Un ejemplo dentro de un JSDoc no es una llamada: se saltea sin ruido.
    if (/^\s*\*/.test(lineas[inicio])) continue;

    // a) Todo el objeto de opciones en una línea: `{ method: "POST" }`.
    const enUnaLinea = lineas[inicio].match(/^(.*\{)\s*method:\s*"(POST|PUT|PATCH|DELETE)"(.*)$/);
    if (enUnaLinea && !/headers:/.test(lineas[inicio])) {
      lineas[inicio] = `${enUnaLinea[1]} method: "${enUnaLinea[2]}", headers: csrfHeaders()${enUnaLinea[3]}`;
      tocados++;
      continue;
    }

    const iHeaders = lineas.slice(inicio, fin + 1).findIndex((l) => /^\s*headers:/.test(l));
    if (iHeaders === -1) {
      // Sin headers: se agrega la línea justo después del `method:`.
      const iMetodo = lineas.slice(inicio, fin + 1).findIndex((l) => /^\s*method:/.test(l));
      if (iMetodo === -1) {
        saltados++;
        console.log(`  ⚠ revisar a mano  ${archivo}:${it.linea} (no encontré 'method:')`);
        continue;
      }
      const abs = inicio + iMetodo;
      const sangria = lineas[abs].match(/^\s*/)[0];
      lineas.splice(abs + 1, 0, `${sangria}headers: csrfHeaders(),`);
      tocados++;
      continue;
    }

    const abs = inicio + iHeaders;
    const l = lineas[abs];
    // b) `headers: <lo que sea>,` en una línea — objeto, identificador o llamada.
    const unaLinea = l.match(/^(\s*headers:\s*)(.+?)(,?)\s*$/);
    // c) `headers: {` multilínea: se cierra con `}` a la misma sangría.
    const abre = l.match(/^(\s*)headers:\s*\{\s*$/);
    if (abre) {
      let cierre = abs + 1;
      const sangria = abre[1];
      while (cierre < lineas.length && !new RegExp(`^${sangria}\\},?\\s*$`).test(lineas[cierre])) cierre++;
      if (cierre >= lineas.length) {
        saltados++;
        console.log(`  ⚠ revisar a mano  ${archivo}:${it.linea} (no encontré el cierre de headers)`);
        continue;
      }
      lineas[abs] = `${sangria}headers: csrfHeaders({`;
      lineas[cierre] = lineas[cierre].replace(/^(\s*)\}(,?)\s*$/, "$1})$2");
      tocados++;
    } else if (unaLinea && !unaLinea[2].startsWith("csrfHeaders")) {
      lineas[abs] = `${unaLinea[1]}csrfHeaders(${unaLinea[2]})${unaLinea[3]}`;
      tocados++;
    } else {
      saltados++;
      console.log(`  ⚠ revisar a mano  ${archivo}:${it.linea} → ${l.trim()}`);
      continue;
    }
  }

  src = lineas.join("\n");
  if (!src.includes("csrfHeaders")) continue;
  if (!/from "@\/lib\/csrf-client"/.test(src)) {
    // El import va después del último import del bloque de cabecera (y por
    // tanto siempre después de "use client", que va primero).
    const imports = [...src.matchAll(/^import .*?;$/gm)];
    if (imports.length === 0) {
      console.log(`  ⚠ sin imports: ${archivo}`);
    } else {
      const ultimo = imports[imports.length - 1];
      const pos = ultimo.index + ultimo[0].length;
      src = `${src.slice(0, pos)}\nimport { csrfHeaders } from "@/lib/csrf-client";${src.slice(pos)}`;
    }
  }
  if (!DRY) writeFileSync(archivo, src);
  console.log(`${DRY ? "(dry) " : ""}${archivo}`);
}

console.log(`\n${tocados} llamada(s) arregladas · ${saltados} para revisar a mano`);
