/**
 * ADR-448 §4.11 — el barrido: toda consulta que SUMA o LISTA adelantos sabe de
 * qué lado está la plata.
 *
 * La regla de diseño es «por defecto se lee sólo DADO». Un lector nuevo que
 * haga `prisma.adelanto.aggregate({ where: { status: "ABIERTO" } })` sin la
 * dirección volvería a contar un pago adelantado por el aserrío como «te debe».
 *
 * Qué se recorre (`lib/` y `app/`):
 * - `<cualquier cliente>.adelanto.(aggregate|groupBy|findMany|count|findFirst|findUnique)`
 *   — `prisma`, `tx`, `db` o el alias que sea;
 * - el acceso por corchetes (`prisma["adelanto"]`) y los alias (`const q = prisma.adelanto`);
 * - la relación leída desde otro modelo (`include: { adelantos: … }`, `_count`);
 * - el SQL crudo sobre «Adelanto», también por `$queryRawUnsafe`.
 *
 * «Sabe de qué lado está» = la dirección aparece en el `where` (o el `groupBy`
 * agrupa por ella). Un `select` que sólo NOMBRA `direccion` no filtra nada:
 * cuenta sólo si la excepción verifica que el código la usa para separar.
 * `findFirst`/`findUnique` por `id` pasan solos: leen UNA fila y el DTO lleva
 * su dirección. Los `FOR UPDATE` también: bloquean, no suman.
 * Todo lo demás, a la lista de excepciones con su motivo (que se verifica).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = join(__dirname, "..");
const LLAMADA = /\b\w+\.adelanto\.(aggregate|groupBy|findMany|count|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow)\s*\(/g;
/** Acceso por corchetes a un objeto (`x["adelanto"]`), no un texto suelto en un arreglo. */
const CORCHETES = /[\w)\]]\s*\[\s*["'`]adelanto["'`]\s*\]/g;
/** Un alias del MODELO sacado de un cliente (no un campo `adelanto` de un DTO). */
const CLIENTE = "(?:prisma|tx|db|client|cliente|trx)";
const ALIAS = new RegExp(`(?:=\\s*${CLIENTE}\\.adelanto\\s*[;,)\\n]|\\{\\s*adelanto\\s*(?:,[^}]*)?\\}\\s*=\\s*${CLIENTE}\\b)`, "g");
const RELACION = /\badelantos\s*:\s*(?:true\b|\{\s*(?:select|where|include|orderBy|take|skip)\b)/g;
const SQL = /\b(?:FROM|JOIN|UPDATE|INTO)\s+"Adelanto"/g;
const SQL_UNSAFE = /\$(?:queryRawUnsafe|executeRawUnsafe)\s*(?:<[^>]*>)?\s*\(/g;
const DIRECCION = /\bdireccion\b|\bSOLO_DADOS\b|\bwhereDireccion\b/;

type Tipo = "llamada" | "corchetes" | "alias" | "relacion" | "sql";
interface Hallazgo {
  archivo: string;
  linea: number;
  tipo: Tipo;
  metodo?: string;
  texto: string;
}

/** Desde `desde` hasta el cierre que balancea el primer `abre` que aparece. */
function balanceado(src: string, desde: number, abre = "(", cierra = ")"): string {
  const ini = src.indexOf(abre, desde);
  if (ini < 0) return src.slice(desde, desde + 200);
  let nivel = 0;
  for (let i = ini; i < src.length; i++) {
    if (src[i] === abre) nivel++;
    else if (src[i] === cierra && --nivel === 0) return src.slice(desde, i + 1);
  }
  return src.slice(desde);
}

/** El texto del `where` de una llamada, o `null` si no hay; `"?"` si es una variable o una función (opaco). */
function whereDe(texto: string): string | null {
  const i = texto.search(/\bwhere\s*:/);
  if (i < 0) {
    // `{ where, include }` — el where se arma afuera.
    return /[{,]\s*where\s*[,}]/.test(texto) ? "?" : null;
  }
  const resto = texto.slice(i).replace(/^where\s*:\s*/, "");
  return resto.startsWith("{") ? balanceado(resto, 0, "{", "}") : "?";
}

/** ¿Esta lectura sabe de qué lado está la plata? */
function sabeDireccion(h: Hallazgo): boolean {
  if (h.tipo === "corchetes" || h.tipo === "alias") return false;
  if (h.tipo === "sql") return DIRECCION.test(h.texto) || /FOR UPDATE/.test(h.texto);
  const where = whereDe(h.texto);
  if (where && where !== "?" && DIRECCION.test(where)) return true;
  if (h.metodo === "groupBy" && /\bby\s*:\s*\[[^\]]*["']direccion["']/.test(h.texto)) return true;
  // Una sola fila por su id: el DTO lleva la dirección.
  if (h.metodo && /^find(First|Unique)/.test(h.metodo) && where && where !== "?" && /[{,]\s*id\s*[:,}]/.test(where)) return true;
  return false;
}

/** El núcleo del barrido, puro: lo que un archivo tiene sin dirección. */
function barrer(archivo: string, src: string): Hallazgo[] {
  const out: Hallazgo[] = [];
  const linea = (i: number) => src.slice(0, i).split("\n").length;
  const anotar = (h: Hallazgo) => {
    if (!sabeDireccion(h)) out.push(h);
  };
  for (const m of src.matchAll(LLAMADA)) {
    anotar({ archivo, linea: linea(m.index ?? 0), tipo: "llamada", metodo: m[1], texto: balanceado(src, m.index ?? 0) });
  }
  for (const m of src.matchAll(CORCHETES)) {
    anotar({ archivo, linea: linea(m.index ?? 0), tipo: "corchetes", texto: src.slice(m.index ?? 0, (m.index ?? 0) + 80) });
  }
  for (const m of src.matchAll(ALIAS)) {
    anotar({ archivo, linea: linea(m.index ?? 0), tipo: "alias", texto: m[0] });
  }
  for (const m of src.matchAll(RELACION)) {
    const texto = m[0].endsWith("true") ? m[0] : balanceado(src, m.index ?? 0, "{", "}");
    anotar({ archivo, linea: linea(m.index ?? 0), tipo: "relacion", texto });
  }
  const sqlVistos = new Set<number>();
  for (const m of src.matchAll(SQL)) {
    const pos = m.index ?? 0;
    // El literal que lo contiene: comilla invertida, doble o simple, lo que esté más cerca.
    const ini = Math.max(src.lastIndexOf("`", pos), src.lastIndexOf("'", pos));
    const fin = src.indexOf(src[ini] ?? "`", pos + 1);
    sqlVistos.add(ini);
    anotar({ archivo, linea: linea(pos), tipo: "sql", texto: src.slice(ini, fin + 1) });
  }
  for (const m of src.matchAll(SQL_UNSAFE)) {
    const texto = balanceado(src, m.index ?? 0);
    if (/"?Adelanto"?/.test(texto) && ![...sqlVistos].some((i) => i > (m.index ?? 0) && i < (m.index ?? 0) + texto.length)) {
      anotar({ archivo, linea: linea(m.index ?? 0), tipo: "sql", texto });
    }
  }
  return out;
}

/**
 * Lo que NO filtra la dirección en el `where`, y por qué. `contiene` identifica
 * la lectura; `verifica` es lo que tiene que seguir siendo cierto en el archivo
 * para que la excepción valga — si alguien lo borra, el test cae.
 */
const EXCEPCIONES: { archivo: string; contiene: RegExp; motivo: string; verifica?: RegExp }[] = [
  {
    archivo: "lib/db/adelantos.db.ts",
    contiene: /codigoOperacion: \{ startsWith/,
    motivo: "La numeración ADL es una sola por negocio, dado o recibido: un código no se repite entre las dos.",
  },
  {
    archivo: "lib/db/adelantos.db.ts",
    contiene: /where: \{ tenantId, idempotencyKey: clave \}/,
    motivo: "Idempotencia: busca SU propia alta por la clave del intento, de cualquier lado.",
  },
  {
    archivo: "lib/db/adelantos.db.ts",
    contiene: /beneficiarioId: id \}/,
    motivo: "Borrar una persona se bloquea si tiene CUALQUIER adelanto, de cualquier lado.",
  },
  {
    archivo: "lib/db/adelantos.db.ts",
    contiene: /include: INCLUDE_FULL,\s*orderBy: \{ fechaAdelanto: "desc" \}/,
    motivo: "`list`: el where se arma antes con `whereDireccion(filters?.direccion)` (DADO por defecto).",
    verifica: /const where: Prisma\.AdelantoWhereInput = \{ tenantId, \.\.\.whereDireccion\(filters\?\.direccion\) \}/,
  },
  {
    archivo: "lib/db/adelantos.db.ts",
    contiene: /select: \{ montoAdelantado: true, saldoPendiente: true, status: true, moneda: true, direccion: true \}/,
    motivo: "`resumen`: trae todo y separa en memoria — los KPIs de siempre con lo DADO, `recibido` aparte.",
    verifica: /const adelantos = todos\.filter\(\(a\) => direccionDe\(a\.direccion\) === "DADO"\);/,
  },
  {
    archivo: "lib/db/adelantos.db.ts",
    contiene: /select: \{ montoAdelantado: true, saldoPendiente: true, moneda: true, status: true, fechaAdelanto: true, direccion: true \}/,
    motivo: "`listBeneficiarios`: la relación trae la dirección y `resumirPersona` separa lo recibido.",
    verifica: /direccion: a\.direccion,\s*\}\)\),\s*\),\s*\}\)\);/,
  },
  {
    archivo: "lib/db/forest-contrato.db.ts",
    contiene: /count\(\{ where: \{ tenantId, contratoId: id \} \}\)/,
    motivo: "`usos`: cuántos documentos cuelgan del permiso antes de borrarlo, de cualquier lado.",
  },
  {
    archivo: "lib/db/por-cobrar.db.ts",
    contiene: /where: WHERE_ADELANTO\(tenantId\)/,
    motivo: "El filtro vive en la constante WHERE_ADELANTO, que lleva SOLO_DADOS.",
    verifica: /const WHERE_ADELANTO = \(tenantId: string\) => \(\{[\s\S]{0,160}?\.\.\.SOLO_DADOS,\s*\}\)/,
  },
  {
    archivo: "lib/db/liquidacion-cuenta.db.ts",
    contiene: /status: \{ in: \["ABIERTO", "EXCEDIDO"\] \}/,
    motivo: "Liquidar: trae las dos direcciones y `clasificarAdelantos` manda lo RECIBIDO a `fuera`.",
    verifica: /cuotasPactadas: a\._count\.entregasPactadas,\s*direccion: a\.direccion,/,
  },
];

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const p = join(dir, nombre);
    if (nombre === "node_modules" || nombre === "generated" || nombre === "__tests__") continue;
    const st = statSync(p);
    if (st.isDirectory()) out.push(...archivos(p));
    else if (/\.(ts|tsx)$/.test(nombre)) out.push(p);
  }
  return out;
}

describe("barrido de lectores de Adelanto (ADR-448 §4.11)", () => {
  const todos = [...archivos(join(RAIZ, "lib")), ...archivos(join(RAIZ, "app"))];
  const fuentes = new Map(todos.map((p) => [relative(RAIZ, p).replaceAll("\\", "/"), readFileSync(p, "utf8")]));
  const hallazgos = [...fuentes].flatMap(([archivo, src]) => barrer(archivo, src));
  const explicado = (h: Hallazgo) => EXCEPCIONES.some((e) => e.archivo === h.archivo && e.contiene.test(h.texto));

  it("encuentra lectores de verdad (si da pocos, el patrón se rompió, no el código)", () => {
    const llamadas = [...fuentes].reduce((n, [, src]) => n + [...src.matchAll(LLAMADA)].length, 0);
    expect(llamadas).toBeGreaterThanOrEqual(20);
  });

  it("cada lector sin dirección en el where es una excepción con motivo", () => {
    const sinExplicar = hallazgos.filter((h) => !explicado(h));
    expect(sinExplicar.map((h) => `${h.archivo}:${h.linea} [${h.tipo}] ${h.texto.replace(/\s+/g, " ").slice(0, 140)}`)).toEqual([]);
  });

  it("cada excepción sigue haciendo falta y lo que la justifica sigue ahí", () => {
    for (const e of EXCEPCIONES) {
      const usada = hallazgos.some((h) => h.archivo === e.archivo && e.contiene.test(h.texto));
      expect(usada, `excepción sin uso: ${e.archivo} ${e.contiene}`).toBe(true);
      if (e.verifica) expect(fuentes.get(e.archivo), `${e.archivo}: ${e.motivo}`).toMatch(e.verifica);
    }
  });

  it("el cron ya no consulta la tabla desde la ruta", () => {
    expect(fuentes.get("app/api/cron/adelantos-recordatorios/route.ts")).not.toMatch(/\bprisma\b/);
  });

  describe("atrapa lo que DEBE atrapar", () => {
    const uno = (src: string) => barrer("x.ts", src);
    it.each([
      ["una suma sin dirección", `await prisma.adelanto.aggregate({ where: { tenantId, status: "ABIERTO" }, _sum: { saldoPendiente: true } });`],
      ["un alias del cliente (db)", `await db.adelanto.findMany({ where: { tenantId } });`],
      ["un findFirst que no es por id", `await tx.adelanto.findFirst({ where: { tenantId, beneficiarioId } });`],
      ["un select que sólo NOMBRA la dirección", `await prisma.adelanto.findMany({ where: { tenantId }, select: { saldoPendiente: true, direccion: true } });`],
      ["el acceso por corchetes", `await prisma["adelanto"].findMany({ where: { tenantId, direccion: "DADO" } });`],
      ["un alias del modelo", `const q = prisma.adelanto;\nawait q.findMany({ where: { tenantId } });`],
      ["la relación leída desde la persona", `await prisma.adelantoBeneficiario.findMany({ where: { tenantId }, include: { adelantos: { select: { saldoPendiente: true } } } });`],
      ["el conteo de la relación", `select: { _count: { select: { adelantos: true } } }`],
      ["SQL crudo", 'await tx.$queryRaw`SELECT sum("saldoPendiente") FROM "Adelanto" WHERE "tenantId" = ${t}`;'],
      ["SQL por $queryRawUnsafe", `await prisma.$queryRawUnsafe('SELECT sum("saldoPendiente") FROM "Adelanto" WHERE "tenantId" = $1', t);`],
      ["un where armado afuera", `await prisma.adelanto.findMany({ where, take: 10 });`],
    ])("%s", (_n, src) => {
      expect(uno(src).length).toBeGreaterThanOrEqual(1);
    });

    it.each([
      ["SOLO_DADOS en el where", `await prisma.adelanto.aggregate({ where: { tenantId, status: "ABIERTO", ...SOLO_DADOS }, _sum: { saldoPendiente: true } });`],
      ["la dirección en el where", `await tx.adelanto.findMany({ where: { tenantId, direccion: "DADO" } });`],
      ["un groupBy por dirección", `await prisma.adelanto.groupBy({ by: ["contratoId", "direccion"], where: vivos, _count: { _all: true } });`],
      ["un findFirst por id", `await tx.adelanto.findFirst({ where: { id, tenantId }, select: { status: true } });`],
      ["un bloqueo", 'await tx.$queryRaw`SELECT "id" FROM "Adelanto" WHERE "id" = ${id} FOR UPDATE`;'],
      ["un objeto que se llama adelantos pero no es la relación", `const b = { adelantos: { documentos: 0, monto: 0 } };`],
      ["el campo `adelanto` de un DTO", `const { direccion } = hecho.adelanto;`],
      ["la palabra en una lista de alias", `{ key: "adelantos", alias: ["adelanto"], growth: true }`],
    ])("deja pasar %s", (_n, src) => {
      expect(uno(src)).toEqual([]);
    });
  });
});
