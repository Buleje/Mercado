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
 * > «de comercial para reprocesar a paquetería, corta, larga angosta se pueda
 * > poner con la cantidad aumentada pero el volumen menos […] pero de
 * > paquetería a comercial no se pueda, ni paquetería a corta ni tabla; pero sí
 * > paquetería larga a paquetería corta eso sí se pueda».
 *
 * En una frase: **la comercial es la madera de la que sale todo lo demás**, y
 * **la paquetería sólo se recorta de largo** (larga → corta). Nada vuelve a
 * comercial, a tabla ni a «Otro».
 *
 * | De ↓ · a → | Comercial | Paq. larga | Paq. corta | Tabla | L. angosta | Corta |
 * |---|---|---|---|---|---|---|
 * | **Comercial**   | — | ✅ | ✅ | ✖ | ✅ | ✅ |
 * | **Paq. larga**  | ✖ | — | ✅ | ✖ | ✖ | ✖ |
 * | **Paq. corta**  | ✖ | ✖ | — | ✖ | ✖ | ✖ |
 * | **Tabla**       | ✖ | ✖ | ✖ | — | ✖ | ✖ |
 * | **L. angosta**  | ✖ | ✖ | ✖ | ✖ | — | ✖ |
 * | **Corta**       | ✖ | ✖ | ✖ | ✖ | ✖ | — |
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

import type { TipoComercial } from "./cubicacion-tipo";

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
  /* La comercial es sección plena y larga: de ahí sale lo que se necesite. */
  comercial: ["Paquetería larga", "Paquetería corta", "Larga angosta", "Corta"],
  /* La paquetería es 6×6 vendida como tal: sólo se recorta de largo. */
  "paqueteria larga": ["Paquetería corta"],
  /* Final de su línea. */
  "paqueteria corta": [],
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
  if (h === "comercial") {
    return `La comercial es la escuadría más grande: no sale de ${De} — la sierra recorta, no agranda.`;
  }
  if (d === "paqueteria larga") {
    return `La paquetería sólo se recorta de largo: de ${De} sale paquetería corta y nada más.`;
  }
  if (d === "paqueteria corta") {
    return `La paquetería corta ya es el final de su línea: no se convierte en ${A}.`;
  }
  if (d === "comercial") {
    return `De comercial no se declara ${A}: la conversión no está entre las que hace el aserradero.`;
  }
  return `De ${De} no sale ${A}: es un producto terminado, no un origen de reproceso.`;
}

/**
 * La regla en una línea, para el pie de la pantalla. Se arma del mapa —no a
 * mano— así no se puede desincronizar de lo que el cálculo aplica.
 */
export const FRASE_REGLA = (() => {
  const partes = Object.entries(SALIDAS_DE_REPROCESO)
    .filter(([, salidas]) => salidas.length > 0)
    .map(([desde, salidas]) => {
      const nombre = desde === "comercial" ? "comercial" : desde.replace("paqueteria", "paquetería");
      return `de ${nombre} sale ${salidas.map((s) => s.toLowerCase()).join(", ")}`;
    });
  return `${partes.join("; ")}. Nada vuelve a comercial ni a tabla: la sierra recorta, no agranda.`;
})();
