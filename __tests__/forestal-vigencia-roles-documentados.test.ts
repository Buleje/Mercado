/**
 * La cabecera de `…/tarifas-cliente/vigencia` dice QUIÉN puede leer y quién
 * escribir. Es lo que lee seguridad para auditar un endpoint que carga deuda.
 *
 * Seguridad (P3, 23-09): decía «Escribir: admin/owner» y entraba `manager`,
 * porque `requireAdmin` deja pasar SIEMPRE al tier de gestión, lo liste la
 * ruta o no. Este test cruza lo documentado con lo que de verdad entra: los
 * roles de la ruta + `managementTier` de `lib/require-admin.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const ruta = readFileSync(path.join(RAIZ, "app/api/admin/forestal/tarifas-cliente/vigencia/route.ts"), "utf8");
const auth = readFileSync(path.join(RAIZ, "lib/require-admin.ts"), "utf8");

const lista = (txt: string) =>
  txt
    .split(/[/,]/)
    .map((r) => r.replace(/["'\s]/g, ""))
    .filter(Boolean);

/** La cabecera sin los ` * ` de cada renglón, en una sola línea. */
const cabecera = (/\/\*\*([\s\S]*?)\*\//.exec(ruta.slice(ruta.indexOf("/**\n * /api/admin")))?.[1] ?? "")
  .replace(/\n\s*\*\s?/g, " ")
  .replace(/\s+/g, " ");

const documentados = (verbo: "Leer" | "Escribir") =>
  lista(new RegExp(`${verbo}:\\s*([a-z/\\s]+?)(?:\\s[(—]|\\.|$)`).exec(cabecera)?.[1] ?? "");

const constante = (nombre: string) => lista(new RegExp(`const ${nombre} = \\[([^\\]]*)\\]`).exec(ruta)?.[1] ?? "");
const tier = lista(/managementTier: readonly AdminRole\[\] = \[([^\]]*)\]/.exec(auth)?.[1] ?? "");

describe("vigencia — los roles de la cabecera son los que entran", () => {
  it("el tier de gestión de requireAdmin es el que se cree (si cambia, este test lo avisa)", () => {
    expect(tier).toEqual(["admin", "owner", "manager"]);
  });

  it("Escribir: todo lo que entra al POST está nombrado (incluido `manager`)", () => {
    const entran = new Set([...constante("ESCRIBIR"), ...tier]);
    expect(documentados("Escribir").sort()).toEqual([...entran].sort());
  });

  it("Leer: todo lo que entra al GET está nombrado", () => {
    const entran = new Set([...constante("LEER"), ...tier]);
    expect(documentados("Leer").sort()).toEqual([...entran].sort());
  });
});
