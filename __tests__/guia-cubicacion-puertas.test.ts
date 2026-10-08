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
 * cada función que escribe `costoTotal` CON valor (un `new Prisma.Decimal(…)`
 * en el `data`, o un `"costoTotal" = …` en SQL crudo distinto de NULL) llama a
 * `cubicacionQuePagoLaGuia` en su cuerpo — o está en `EXCEPCIONES` con su
 * razón. Quitar el costo (`costoTotal: null`) no pone plata y no cuenta.
 *
 * Además fija las dos puertas que mueven un costo sin escribirlo: la mudanza de
 * guía de `update` (mira la guía de destino) y `validate` (no revive un asiento
 * rechazado o anulado, cuyo costo volvería a contar en la guía).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DB = join(__dirname, "..", "lib", "db");

/** Escribe la tabla de ingresos (Prisma o SQL crudo). */
const ESCRIBE_WOOD_ENTRY = /woodEntry\.(create|createMany|update|updateMany|upsert)\b|UPDATE\s+"WoodEntry"|INSERT\s+INTO\s+"WoodEntry"/;
/** Escribe un costo con valor. */
const ESCRIBE_COSTO = [/costoTotal:\s*[^,\n]*new Prisma\.Decimal\(/, /"costoTotal"\s*=\s*(?!NULL\b)/i];

/**
 * Las funciones que escriben costo SIN pasar por la consulta, con su razón.
 * Clave `archivo › función`. Vacía hoy: una entrada nueva necesita una razón
 * que un revisor pueda refutar (p. ej. «escribe en una guía recién creada en la
 * misma tx, que no puede tener cubicación»).
 */
const EXCEPCIONES: Record<string, string> = {};

/**
 * Declaraciones que abren una función de nivel de archivo o de clase/objeto:
 * `function x(` a la izquierda, `  static [async] x(` (clases `*DB`) y
 * `  async x(` (objetos `*DB`). Las funciones anidadas (más sangría) son parte
 * del cuerpo de la que las contiene.
 */
const DECLARACION =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^ {2}(?:(?:private|public|protected)\s+)?static\s+(?:async\s+)?(\w+)\s*[<(]|^ {2}async\s+(\w+)\s*[<(]/;

interface Funcion {
  archivo: string;
  nombre: string;
  cuerpo: string;
}

function funcionesDe(archivo: string, texto: string): Funcion[] {
  const lineas = texto.split("\n");
  const inicios: { nombre: string; desde: number }[] = [];
  for (const [i, l] of lineas.entries()) {
    const m = DECLARACION.exec(l);
    if (m) inicios.push({ nombre: m[1] ?? m[2] ?? m[3], desde: i });
  }
  return inicios.map((f, k) => ({
    archivo,
    nombre: f.nombre,
    cuerpo: lineas.slice(f.desde, inicios[k + 1]?.desde ?? lineas.length).join("\n"),
  }));
}

const archivos = readdirSync(DB)
  .filter((n) => n.endsWith(".ts"))
  .map((n) => ({ archivo: n, texto: readFileSync(join(DB, n), "utf8") }))
  .filter((a) => ESCRIBE_WOOD_ENTRY.test(a.texto));

const funciones = archivos.flatMap((a) => funcionesDe(a.archivo, a.texto));
const escritoras = funciones.filter((f) => ESCRIBE_COSTO.some((re) => re.test(f.cuerpo)));
const clave = (f: Funcion) => `${f.archivo} › ${f.nombre}`;
const llamaLaConsulta = (f: Funcion) => /\bcubicacionQuePagoLaGuia\(/.test(f.cuerpo);
const buscar = (archivo: string, nombre: string) => funciones.find((f) => f.archivo === archivo && f.nombre === nombre);

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
    const update = buscar("wood-entries.db.ts", "update");
    expect(update).toBeDefined();
    expect(update!.cuerpo).toMatch(/cubicacionQuePagoLaGuia\(tx, tenantId, gtfNuevo\)/);
  });

  it("validar no revive un asiento rechazado o anulado (su costo volvería a contar en la guía)", () => {
    const validate = buscar("wood-entries.db.ts", "validate");
    expect(validate).toBeDefined();
    expect(validate!.cuerpo).toMatch(/status: \{ notIn: \["rechazado", "anulado"\] \}/);
  });
});
