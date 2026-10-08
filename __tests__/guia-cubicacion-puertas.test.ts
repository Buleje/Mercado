/**
 * Una guía, una sola plata (ADR-478 §7) — test ESTRUCTURAL preventivo.
 *
 * Si la madera de una guía ya se pagó con una cubicación de trozas aplicada,
 * ponerle costo la paga otra vez. La consulta que lo frena es una sola
 * (`cubicacionQuePagoLaGuia`, lib/db/guia-cubicacion.db.ts), pero cada puerta
 * tiene que llamarla: el commit 631b2f729 cerró tres y quedaron abiertas el
 * alta de un ingreso y la mudanza de guía (revisión 08-10).
 *
 * Qué exige: en todo archivo de `lib/db/` que escribe la tabla `WoodEntry`,
 * cada función que escribe `costoTotal` CON valor llama a
 * `cubicacionQuePagoLaGuia` en su cuerpo — o está en `EXCEPCIONES` con su
 * razón. «Con valor» es cualquier cosa distinta de `null`/`undefined` en lo que
 * llega a un `data:` (o `create:`/`update:`) de Prisma: `new Prisma.Decimal(…)`,
 * `new Decimal(…)`, `input.costoTotal`, `{ costoTotal }`, una variable armada
 * antes (`const data = {…}`, `data.costoTotal = …`, `Object.assign`) — o un
 * `"costoTotal" = …` en SQL crudo distinto de NULL. Quitar el costo
 * (`costoTotal: null`) no pone plata y no cuenta. Los comentarios no cuentan
 * (ni para escribir ni para «llamar» a la consulta).
 *
 * Revisión 08-10 (b): antes sólo veía `new Prisma.Decimal(` y no cortaba las
 * funciones `const x = async () =>`: los casos de `detector` fijan lo que se
 * escapaba. Además fija que toda puerta toma el candado de la guía por la
 * MISMA función (`ForestCuentaDB.bloquearGuiasEnTx`, clave canónica).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..");
const DB = join(RAIZ, "lib", "db");

/** Escribe la tabla de ingresos (Prisma o SQL crudo). */
const ESCRIBE_WOOD_ENTRY = /woodEntry\.(create|createMany|update|updateMany|upsert)\b|UPDATE\s+"WoodEntry"|INSERT\s+INTO\s+"WoodEntry"/;

/**
 * Las funciones que escriben costo SIN pasar por la consulta, con su razón.
 * Clave `archivo › función`. Vacía hoy: una entrada nueva necesita una razón
 * que un revisor pueda refutar (p. ej. «escribe en una guía recién creada en la
 * misma tx, que no puede tener cubicación»).
 */
const EXCEPCIONES: Record<string, string> = {};

// ── Lectura del fuente ──────────────────────────────────────────────────────

/**
 * El fuente sin comentarios, con las mismas líneas (los saltos se conservan:
 * el corte por funciones va por línea). Respeta strings: un `"//"` o un
 * `"/*"` dentro de comillas no abre comentario. Las comillas simples y dobles
 * no cruzan de línea (una regex con comillas no se come el archivo).
 */
function sinComentarios(texto: string): string {
  let out = "";
  let i = 0;
  let modo: "codigo" | "linea" | "bloque" | "'" | '"' | "`" = "codigo";
  while (i < texto.length) {
    const c = texto[i];
    const d = texto[i + 1];
    if (modo === "codigo") {
      if (c === "/" && d === "/") { modo = "linea"; i += 2; continue; }
      if (c === "/" && d === "*") { modo = "bloque"; i += 2; continue; }
      if (c === "'" || c === '"' || c === "`") modo = c;
      out += c;
    } else if (modo === "linea") {
      if (c === "\n") { modo = "codigo"; out += c; }
    } else if (modo === "bloque") {
      if (c === "*" && d === "/") { modo = "codigo"; i += 2; continue; }
      if (c === "\n") out += c;
    } else {
      if (c === "\\") { out += c + (d ?? ""); i += 2; continue; }
      if (c === modo || (c === "\n" && modo !== "`")) modo = "codigo";
      out += c;
    }
    i++;
  }
  return out;
}

/** Abre una unidad a nivel de archivo: `function`, `const/let/var`, `class`, `type`/`interface`/`enum` (con `export`/`async`/`declare`). */
const TOP =
  /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?\s+(\w+)|(?:const|let|var)\s+(\w+)|(?:abstract\s+)?class\s+(\w+)|(?:type|interface|enum)\s+(\w+))/;
/** La unidad de archivo es un contenedor de métodos: una clase o un objeto `const XDB = {`. */
const CONTENEDOR = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+\w+|^(?:export\s+)?const\s+\w+\s*(?::[^=]+)?=\s*\{\s*$/;
/**
 * Un miembro de un contenedor, a 2 espacios: `static async x(`, `async x(`,
 * `x(`, `x: async (`, `x: function`, `x: y => …`. Fuera de un contenedor, las
 * líneas a 2 espacios son cuerpo de la función de arriba.
 */
const MIEMBRO =
  /^ {2}(?:(?:private|public|protected|readonly|override)\s+)*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?(\w+)\s*(?:[<(]|:\s*(?:async\s+)?(?:\(|function\b|\w+\s*=>))/;

interface Funcion {
  archivo: string;
  nombre: string;
  cuerpo: string;
}

/** Corta el fuente (ya sin comentarios) en funciones de archivo y métodos de contenedor. */
function funcionesDe(archivo: string, fuente: string): Funcion[] {
  const lineas = fuente.split("\n");
  const inicios: { nombre: string; desde: number }[] = [];
  let enContenedor = false;
  for (const [i, l] of lineas.entries()) {
    const top = TOP.exec(l);
    if (top) {
      inicios.push({ nombre: top[1] ?? top[2] ?? top[3] ?? top[4], desde: i });
      enContenedor = CONTENEDOR.test(l);
      continue;
    }
    const miembro = enContenedor ? MIEMBRO.exec(l) : null;
    if (miembro) inicios.push({ nombre: miembro[1], desde: i });
  }
  return inicios.map((f, k) => ({
    archivo,
    nombre: f.nombre,
    cuerpo: lineas.slice(f.desde, inicios[k + 1]?.desde ?? lineas.length).join("\n"),
  }));
}

// ── ¿Escribe costo con valor? ───────────────────────────────────────────────

const ABRE = "([{";
const CIERRA = ")]}";

/**
 * La expresión que empieza en `desde` hasta la coma, `;` o cierre de su nivel.
 * Los strings se saltan enteros (una coma adentro no corta).
 */
function expresionDesde(texto: string, desde: number): string {
  let nivel = 0;
  let i = desde;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "'" || c === '"' || c === "`") {
      const fin = texto.indexOf(c, i + 1);
      i = fin < 0 ? texto.length : fin + 1;
      continue;
    }
    if (ABRE.includes(c)) nivel++;
    else if (CIERRA.includes(c)) {
      if (nivel === 0) break;
      nivel--;
    } else if ((c === "," || c === ";") && nivel === 0) break;
    i++;
  }
  return texto.slice(desde, i);
}

/** Bloques que leen, no escriben: `select`, `where`, `orderBy`, agregados. Se sacan antes de mirar las claves. */
const LECTURA = /\b(?:select|where|orderBy|include|distinct|cursor|_sum|_avg|_min|_max|_count)\s*:/g;
function sinLecturas(expr: string): string {
  let out = expr;
  for (let m = LECTURA.exec(out); m; m = LECTURA.exec(out)) {
    const resto = expresionDesde(out, m.index + m[0].length);
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length + resto.length);
    LECTURA.lastIndex = m.index;
  }
  return out;
}

const SIN_VALOR = /^\s*(?:null|undefined|Prisma\.(?:DbNull|JsonNull))\s*$/;

/** ¿La expresión (un objeto, un arreglo, un ternario…) trae `costoTotal` con valor? */
function traeCosto(expr: string): boolean {
  const e = sinLecturas(expr);
  // `costoTotal: <valor>` / `"costoTotal": <valor>` como CLAVE (no `x.costoTotal ? … : …`).
  const clave = /(?<![.\w$?])["']?costoTotal["']?\s*:/g;
  for (let m = clave.exec(e); m; m = clave.exec(e)) {
    if (!SIN_VALOR.test(expresionDesde(e, m.index + m[0].length))) return true;
  }
  // `{ costoTotal }` / `{ a, costoTotal, b }`: la abreviada siempre trae valor.
  return /[{,]\s*costoTotal\s*(?=[,}])/.test(e);
}

/** Identificadores que FLUYEN a la expresión: ella misma, `...x`, `...(c ? x : {})`, `x ?? {}` (no `x.y` ni `x(`). */
function identificadoresQueFluyen(expr: string): string[] {
  const ids = new Set<string>();
  // `...x` es un spread (fluye), `a.x` es una lectura (no).
  for (const m of expr.replaceAll("...", " ").matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)(?![\w$])(?!\s*[.(\[])/g)) ids.add(m[1]);
  return [...ids];
}

const escapar = (s: string) => s.replace(/[$]/g, "\\$&");

/** Lo que una variable del cuerpo llega a valer: su inicializador y lo que se le asigna después. */
function valoresDe(nombre: string, cuerpo: string): string[] {
  const n = escapar(nombre);
  const out: string[] = [];
  const decl = new RegExp(`\\b(?:const|let|var)\\s+${n}\\b\\s*(?::[^=;]+)?=(?![=>])`, "g");
  for (const m of cuerpo.matchAll(decl)) out.push(expresionDesde(cuerpo, (m.index ?? 0) + m[0].length));
  const asig = new RegExp(`(?<![.\\w$])${n}\\s*(?:\\.\\s*costoTotal|\\[\\s*["']costoTotal["']\\s*\\])\\s*=(?!=)`, "g");
  for (const m of cuerpo.matchAll(asig)) out.push(`{ costoTotal: ${expresionDesde(cuerpo, (m.index ?? 0) + m[0].length)} }`);
  const assign = new RegExp(`Object\\.assign\\(\\s*${n}\\s*,`, "g");
  for (const m of cuerpo.matchAll(assign)) {
    const desde = (m.index ?? 0) + m[0].length;
    out.push(`[${expresionDesde(cuerpo, desde)}]`);
  }
  return out;
}

/** ¿Lo que llega a un `data:` de Prisma trae costo con valor? Sigue variables hasta 3 saltos. */
function escribeCostoPrisma(cuerpo: string): boolean {
  const destinos: string[] = [];
  for (const m of cuerpo.matchAll(/(?<![.\w$])(?:data|create|update)\s*:/g)) destinos.push(expresionDesde(cuerpo, (m.index ?? 0) + m[0].length));
  for (const m of cuerpo.matchAll(/[{,]\s*(data)\s*(?=[,}])/g)) destinos.push(m[1]);
  const vistos = new Set<string>();
  let pendientes = destinos.map((expr) => ({ expr, salto: 0 }));
  while (pendientes.length > 0) {
    const siguientes: typeof pendientes = [];
    for (const { expr, salto } of pendientes) {
      if (traeCosto(expr)) return true;
      if (salto >= 3) continue;
      for (const id of identificadoresQueFluyen(expr)) {
        if (vistos.has(id)) continue;
        vistos.add(id);
        for (const v of valoresDe(id, cuerpo)) siguientes.push({ expr: v, salto: salto + 1 });
      }
    }
    pendientes = siguientes;
  }
  return false;
}

/** SQL crudo: `"costoTotal" = <no NULL>` o un INSERT con la columna. */
const ESCRIBE_COSTO_SQL = [/"costoTotal"\s*=(?!=)(?!\s*NULL\b)/i, /INSERT\s+INTO\s+"WoodEntry"\s*\([^)]*"costoTotal"/i];

function escribeCosto(cuerpo: string): boolean {
  return ESCRIBE_COSTO_SQL.some((re) => re.test(cuerpo)) || escribeCostoPrisma(cuerpo);
}

const llamaLaConsulta = (f: Funcion) => /\bcubicacionQuePagoLaGuia\(/.test(f.cuerpo);
const clave = (f: Funcion) => `${f.archivo} › ${f.nombre}`;

/** Las funciones de un fuente que escriben costo con valor. */
function escritorasDe(archivo: string, texto: string): Funcion[] {
  return funcionesDe(archivo, sinComentarios(texto)).filter((f) => escribeCosto(f.cuerpo));
}

// ── El repo ─────────────────────────────────────────────────────────────────

const leer = (n: string) => ({ archivo: n, texto: readFileSync(join(DB, n), "utf8") });
const archivos = readdirSync(DB)
  .filter((n) => n.endsWith(".ts"))
  .map(leer)
  .filter((a) => ESCRIBE_WOOD_ENTRY.test(a.texto));

const funciones = archivos.flatMap((a) => funcionesDe(a.archivo, sinComentarios(a.texto)));
const escritoras = archivos.flatMap((a) => escritorasDe(a.archivo, a.texto));
const buscar = (lista: Funcion[], archivo: string, nombre: string) => lista.find((f) => f.archivo === archivo && f.nombre === nombre);

describe("detector: lo que se escapaba se ve (casos del propio test)", () => {
  const archivo = (cuerpo: string) => `export const XDB = {\n  async puerta(tenantId: string, input: { costoTotal: number }) {\n${cuerpo}\n  },\n};\n`;
  const escribe = (cuerpo: string) => escritorasDe("x.db.ts", archivo(cuerpo)).map((f) => f.nombre);

  it.each([
    ["new Prisma.Decimal(", "    await tx.woodEntry.update({ where: { id }, data: { costoTotal: new Prisma.Decimal(input.costoTotal) } });"],
    ["new Decimal(", "    await tx.woodEntry.update({ where: { id }, data: { costoTotal: new Decimal(input.costoTotal) } });"],
    ["el valor pelado", "    await tx.woodEntry.update({ where: { id }, data: { costoTotal: input.costoTotal } });"],
    ["la abreviada", "    const { costoTotal } = input;\n    await tx.woodEntry.update({ where: { id }, data: { moneda: \"PEN\", costoTotal } });"],
    ["una variable", "    const costo = input.costoTotal;\n    await tx.woodEntry.update({ where: { id }, data: { costoTotal: costo } });"],
    ["el data armado antes", "    const data = { costoTotal: input.costoTotal, moneda: \"PEN\" };\n    await tx.woodEntry.update({ where: { id }, data });"],
    ["data.costoTotal = …", "    const data: Record<string, unknown> = {};\n    data.costoTotal = input.costoTotal;\n    await tx.woodEntry.update({ where: { id }, data });"],
    ["un spread de otra variable", "    const plata = { costoTotal: input.costoTotal };\n    await tx.woodEntry.update({ where: { id }, data: { ...plata, moneda: \"PEN\" } });"],
    ["un ternario con valor", "    await tx.woodEntry.update({ where: { id }, data: { costoTotal: input.costoTotal > 0 ? input.costoTotal : null } });"],
    ["createMany con arreglo", "    await tx.woodEntry.createMany({ data: filas.map((f) => ({ id: f.id, costoTotal: f.costo })) });"],
    ["SQL crudo", "    await tx.$executeRaw`UPDATE \"WoodEntry\" SET \"costoTotal\" = ${input.costoTotal} WHERE \"id\" = ${id}`;"],
  ])("%s → escribe costo", (_caso, cuerpo) => {
    expect(escribe(cuerpo)).toEqual(["puerta"]);
  });

  it.each([
    ["quitar el costo", "    await tx.woodEntry.updateMany({ where: { id, costoTotal: { not: null } }, data: { costoTotal: null, costoDetalle: Prisma.DbNull } });"],
    ["leer el costo", "    const r = await tx.woodEntry.findFirst({ where: { id }, select: { costoTotal: true } });\n    await tx.woodEntry.update({ where: { id }, data: { moneda: r?.moneda ?? \"PEN\" } });"],
    ["un DTO de salida", "    await tx.woodEntry.update({ where: { id }, data: { moneda: \"PEN\" } });\n    return { costoTotal: Number(r.costoTotal) };"],
    ["SQL que limpia", "    await tx.$executeRaw`UPDATE \"WoodEntry\" SET \"costoTotal\" = NULL WHERE \"id\" = ${id}`;"],
    ["un comentario", "    // data: { costoTotal: input.costoTotal }\n    /* data: { costoTotal } */\n    await tx.woodEntry.update({ where: { id }, data: { moneda: \"PEN\" } });"],
  ])("%s → no escribe", (_caso, cuerpo) => {
    expect(escribe(cuerpo)).toEqual([]);
  });

  it("corta en `const x = async () =>` de archivo: la consulta de la función de arriba no tapa a la de abajo", () => {
    const fuente = [
      "async function conFreno(tx: Tx, tenantId: string, gtf: string) {",
      "  await cubicacionQuePagoLaGuia(tx, tenantId, gtf);",
      "  await tx.woodEntry.update({ where: { id }, data: { costoTotal: new Prisma.Decimal(1) } });",
      "}",
      "const sinFreno = async (tx: Tx, input: { costoTotal: number }) => {",
      "  await tx.woodEntry.update({ where: { id }, data: { costoTotal: input.costoTotal } });",
      "};",
      "export const XDB = {",
      "  otra: async (tx: Tx) => {",
      "    await tx.woodEntry.update({ where: { id }, data: { costoTotal } });",
      "  },",
      "};",
    ].join("\n");
    const sin = escritorasDe("x.db.ts", fuente).filter((f) => !llamaLaConsulta(f)).map((f) => f.nombre);
    expect(sin).toEqual(["sinFreno", "otra"]);
  });

  it("nombrar la consulta en un comentario no cuenta como llamarla", () => {
    const fuente = archivo("    // cubicacionQuePagoLaGuia(tx, tenantId, gtf)\n    await tx.woodEntry.update({ where: { id }, data: { costoTotal: input.costoTotal } });");
    expect(escritorasDe("x.db.ts", fuente).filter((f) => !llamaLaConsulta(f)).map((f) => f.nombre)).toEqual(["puerta"]);
  });
});

describe("una guía, una sola plata: toda puerta que pone costo consulta la cubicación (ADR-478 §7)", () => {
  it("encuentra las cuatro escrituras conocidas (si el patrón se pudre, el test se queda ciego: esto lo avisa)", () => {
    expect(escritoras.map(clave)).toEqual(
      expect.arrayContaining([
        "guia-plata.db.ts › guardarCompra",
        "wood-entries-precio.db.ts › ponerPrecio",
        "wood-entries.db.ts › create",
        "wood-entries.db.ts › setCosto",
      ]),
    );
  });

  it("cada función que escribe costoTotal con valor llama a cubicacionQuePagoLaGuia (o es una excepción justificada)", () => {
    const sinFreno = escritoras.filter((f) => !llamaLaConsulta(f) && !EXCEPCIONES[clave(f)]).map(clave);
    expect(sinFreno, `Puertas a la plata de la guía sin cubicacionQuePagoLaGuia: ${sinFreno.join(", ")}`).toEqual([]);
  });

  it("las excepciones siguen existiendo y tienen razón (una excepción vieja no tapa una puerta nueva)", () => {
    for (const [k, razon] of Object.entries(EXCEPCIONES)) {
      expect(escritoras.map(clave), k).toContain(k);
      expect(razon.trim().length, k).toBeGreaterThan(20);
    }
  });

  it("mudar un asiento a otra guía consulta la guía de DESTINO (el costo viaja con el asiento)", () => {
    const update = buscar(funciones, "wood-entries.db.ts", "update");
    expect(update).toBeDefined();
    expect(update!.cuerpo).toMatch(/cubicacionQuePagoLaGuia\(tx, tenantId, gtfNuevo\)/);
  });

  it("validar no revive un asiento rechazado o anulado (su costo volvería a contar en la guía)", () => {
    const validate = buscar(funciones, "wood-entries.db.ts", "validate");
    expect(validate).toBeDefined();
    expect(validate!.cuerpo).toMatch(/status: \{ notIn: \["rechazado", "anulado"\] \}/);
  });
});

describe("un solo candado por guía: todas las puertas pasan por ForestCuentaDB.bloquearGuiasEnTx", () => {
  const cub = funcionesDe("forest-cubicacion-trozas.db.ts", sinComentarios(leer("forest-cubicacion-trozas.db.ts").texto));
  const puertas: [Funcion[], string, string][] = [
    [funciones, "guia-plata.db.ts", "guardarCompra"],
    [funciones, "wood-entries.db.ts", "setCosto"],
    [funciones, "wood-entries-precio.db.ts", "ponerPrecio"],
    [funciones, "wood-entries.db.ts", "create"],
    [funciones, "wood-entries.db.ts", "update"],
    [cub, "forest-cubicacion-trozas.db.ts", "aplicar"],
    [cub, "forest-cubicacion-trozas.db.ts", "anular"],
  ];

  it.each(puertas.map(([lista, a, n]) => [`${a} › ${n}`, lista, a, n] as const))("%s toma el candado de la guía", (_k, lista, a, n) => {
    const f = buscar(lista, a, n);
    expect(f, `${a} › ${n}`).toBeDefined();
    // `lockGuia` (guia-plata) es la envoltura que llama a la misma función.
    expect(f!.cuerpo).toMatch(/ForestCuentaDB\.bloquearGuiasEnTx\(|\blockGuia\(/);
  });

  it("`lockGuia` es la misma función, y nadie arma la clave `guia-plata:` a mano fuera de ForestCuentaDB", () => {
    const lockGuia = buscar(funciones, "guia-plata.db.ts", "lockGuia");
    expect(lockGuia?.cuerpo).toMatch(/ForestCuentaDB\.bloquearGuiasEnTx\(/);
    const aMano = readdirSync(DB)
      .filter((n) => n.endsWith(".ts") && n !== "forest-cuenta.db.ts")
      .filter((n) => /guia-plata:/.test(sinComentarios(leer(n).texto)));
    expect(aMano).toEqual([]);
  });

  it("setCosto no toma un segundo candado fuera de orden: si la guía cambió, CAMBIO_DE_GUIA", () => {
    const setCosto = buscar(funciones, "wood-entries.db.ts", "setCosto")!;
    expect(setCosto.cuerpo.match(/bloquearGuiasEnTx\(/g)).toHaveLength(1);
    expect(setCosto.cuerpo).toMatch(/guiaCambiadaAlGuardar\(/);
  });
});
