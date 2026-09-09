/**
 * Qué se puede reprocesar en qué — la regla del aserradero, no del cálculo
 * (ADR-407, pedido de Brandon 2026-09-09).
 *
 * Hasta acá el sugeridor de reprocesos (ADR-404) cruzaba **cualquier** tipo
 * contra cualquier otro: si sobraba paquetería y faltaba comercial, ofrecía
 * «reprocesá paquetería en comercial». Eso en el patio no existe: la sierra
 * recorta, no agranda. Declararlo sería afirmar ante SERFOR una transformación
 * que la máquina no puede hacer.
 *
 * ## La regla, como la dictó Brandon
 *
 * Primero (2026-09-09, mañana):
 *
 * > «de comercial para reprocesar a paquetería, corta, larga angosta se pueda
 * > poner con la cantidad aumentada pero el volumen menos».
 *
 * Y después se corrigió a sí mismo sobre la pantalla, el mismo día:
 *
 * > «me equivoqué, ponele que sí se pueda de la paquetería poder reprocesar a
 * > comercial, tabla, larga angosta, corta y paquetería larga y corta».
 *
 * Así que los dos productos de sección plena —**comercial** y **paquetería**—
 * son origen de cualquier otro tipo. Los productos terminados (tabla, larga
 * angosta, corta) no son origen de nada: lo que sale de ellos ya salió.
 *
 * | De ↓ · a → | Comercial | Paq. larga | Paq. corta | Tabla | L. angosta | Corta |
 * |---|---|---|---|---|---|---|
 * | **Comercial**   | — | ✅ | ✅ | ✅ | ✅ | ✅ |
 * | **Paq. larga**  | ✅ | — | ✅ | ✅ | ✅ | ✅ |
 * | **Paq. corta**  | ✅ | ✅ | — | ✅ | ✅ | ✅ |
 * | **Tabla**       | ✖ | ✖ | ✖ | — | ✖ | ✖ |
 * | **L. angosta**  | ✖ | ✖ | ✖ | ✖ | — | ✖ |
 * | **Corta**       | ✖ | ✖ | ✖ | ✖ | ✖ | — |
 *
 * ⚠️ Queda una pregunta abierta que Brandon todavía no respondió: de una pieza
 * **corta** (largo < 6') salen tipos que se definen por ser **largos**
 * (comercial, tabla, larga angosta, paquetería larga). La sierra no alarga una
 * tabla. Se deja como él lo pidió —él conoce el patio— pero está anotado acá
 * para preguntarlo, no para "arreglarlo" por cuenta propia.
 *
 * Lo que la regla NO dice se prohíbe: una sugerencia de más manda madera a la
 * sierra sin necesidad y ensucia el papel; una de menos sólo no aparece.
 *
 * ⚠️ **Es la única fuente.** La usan el sugeridor (`reproceso-sugerido.ts`) y
 * la revisión previa a firmar el papel. Si mañana el aserradero suma una
 * conversión, se agrega UNA fila acá y no hay que buscarla en la UI.
 *
 * PURO y client-safe: sólo strings.
 */

import { ORDEN_TIPO, type TipoComercial } from "./cubicacion-tipo";

/** Sin tildes, sin mayúsculas: «Paquetería larga» y «PAQUETERIA LARGA» son lo mismo. */
const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Lo que sale de cada tipo cuando vuelve a la sierra. La clave va normalizada
 * (sin tilde) y los valores con la grafía del cubicador, que es la que se
 * muestra.
 */
export const SALIDAS_DE_REPROCESO: Readonly<Record<string, readonly TipoComercial[]>> = {
  /* Los dos de sección plena son origen de cualquier otro tipo. */
  comercial: ["Paquetería larga", "Paquetería corta", "Tabla", "Larga angosta", "Corta"],
  "paqueteria larga": ["Comercial", "Paquetería corta", "Tabla", "Larga angosta", "Corta"],
  "paqueteria corta": ["Comercial", "Paquetería larga", "Tabla", "Larga angosta", "Corta"],
  /* Productos terminados: de acá no sale nada más. */
  tabla: [],
  "larga angosta": [],
  corta: [],
  otro: [],
};

/** En qué se puede convertir este tipo. Vacío = de acá no sale nada. */
export function salidasDeReproceso(desde: string | null | undefined): readonly TipoComercial[] {
  return SALIDAS_DE_REPROCESO[norm(desde ?? "")] ?? [];
}

/**
 * ¿La sierra puede convertir `desde` en `hacia`?
 *
 * Un tipo hacia sí mismo devuelve `false`: eso no es un reproceso, es capacidad
 * sin usar. Un tipo que el catálogo no conoce también: adivinar una conversión
 * sobre una etiqueta desconocida sería inventar trazabilidad.
 */
export function puedeReprocesarse(
  desde: string | null | undefined,
  hacia: string | null | undefined,
): boolean {
  const d = norm(desde ?? "");
  const h = norm(hacia ?? "");
  if (!d || !h || d === h) return false;
  return salidasDeReproceso(d).some((t) => norm(t) === h);
}

/**
 * Por qué NO se puede, en la lengua del patio — para que la pantalla explique
 * en vez de esconder la fila. `null` cuando sí se puede.
 */
export function porQueNoSePuede(
  desde: string | null | undefined,
  hacia: string | null | undefined,
): string | null {
  const d = norm(desde ?? "");
  const h = norm(hacia ?? "");
  if (!d || !h) return "Falta saber de qué tipo es la madera: sin eso no se puede decir en qué se convierte.";
  if (d === h) return "Es el mismo tipo: no hay reproceso que hacer.";
  if (puedeReprocesarse(d, h)) return null;

  const De = (desde ?? "").toLowerCase();
  const A = (hacia ?? "").toLowerCase();
  if (h === "otro") {
    return "«Otro» no es un producto del Libro: corregí la medida o el tipo de esas piezas antes de ampararlas.";
  }
  if (salidasDeReproceso(d).length === 0) {
    return `De ${De} no sale ${A}: es un producto terminado, no un origen de reproceso.`;
  }
  return `De ${De} no se declara ${A}: la conversión no está entre las que hace el aserradero.`;
}

/** «a, b y c» — para que la frase de ayuda se lea como la diría una persona. */
function lista(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/**
 * La regla en una línea, para el pie de la pantalla. Se arma del mapa —no a
 * mano— así no se puede desincronizar de lo que el cálculo aplica.
 */
export const FRASE_REGLA = (() => {
  const nombre = (k: string) => k.replace("paqueteria", "paquetería");
  /* Un origen que puede dar TODOS los demás tipos no se enumera: la lista
     completa cinco veces es ilegible y dice lo mismo que «cualquier otro». */
  const universales: string[] = [];
  const puntuales: string[] = [];
  const terminados: string[] = [];
  for (const [desde, salidas] of Object.entries(SALIDAS_DE_REPROCESO)) {
    if (desde === "otro") continue;
    if (salidas.length === 0) {
      terminados.push(nombre(desde));
      continue;
    }
    const otros = ORDEN_TIPO.filter((t) => t !== "Otro" && norm(t) !== desde);
    if (otros.every((t) => salidas.some((sa) => norm(sa) === norm(t)))) universales.push(nombre(desde));
    else puntuales.push(`de ${nombre(desde)} sale ${lista(salidas.map((sa) => sa.toLowerCase()))}`);
  }
  const partes: string[] = [];
  if (universales.length > 0) partes.push(`de ${lista(universales)} sale cualquier otro tipo`);
  partes.push(...puntuales);
  if (terminados.length > 0) {
    partes.push(`de ${lista(terminados)} no sale nada: ya son producto terminado`);
  }
  return `${partes.join("; ")}.`;
})();
