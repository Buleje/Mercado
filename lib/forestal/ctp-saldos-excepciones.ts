/**
 * ctp-saldos-excepciones — todo lo que está mal en las existencias, en UNA lista.
 *
 * La pantalla avisaba de a pedazos y en tres alturas distintas: un banner rojo
 * arriba por las especies en negativo, la misma noticia otra vez a media página
 * escrita de otra forma, y el stock de producto en negativo —que es el mismo
 * error del otro lado del aserradero— sin aviso ninguno: aparecía como un
 * número rojo en la fila 8 de una tabla, donde nadie lo busca.
 *
 * Acá se juntan en una sola lista ordenada por gravedad, cada una con su
 * magnitud y con los nombres involucrados. La regla: si algo merece un aviso,
 * merece decir CUÁL y CUÁNTO. Un «1 especie tiene saldo negativo» obliga a
 * recorrer la tabla para averiguar cuál — el aviso da el trabajo en vez de
 * ahorrarlo.
 *
 * PURO y client-safe: sin React, sin fetch, sin Prisma.
 */

import { claveEspecie } from "@/lib/forestal/loth-constants";

export type TonoExcepcion = "error" | "warning" | "info";

export type ClaveExcepcion =
  | "mp-negativa"
  | "stock-negativo"
  | "valle-negativo"
  | "sin-declarar"
  | "sin-validar"
  | "por-agotarse";

export interface Excepcion {
  clave: ClaveExcepcion;
  tono: TonoExcepcion;
  /** Titular con el número: se lee sin abrir nada. */
  titulo: string;
  /** Qué significa y qué hacer. Sin esto un aviso es sólo un color. */
  detalle: string;
  /** Los nombres involucrados — para no mandar a buscarlos a la tabla. */
  items: string[];
  /** Magnitud en m³ (o unidades de producto); `null` cuando no aplica. */
  magnitud: number | null;
  /** A dónde lleva el aviso. `null` = se resuelve en esta misma pantalla. */
  ir: "ingresos" | "produccion" | "despacho" | null;
}

export interface EntradaExcepciones {
  materiaPrima: {
    pendienteM3: number;
    /** m³ consumidos en corridas sin ninguna guía atribuida. */
    consumoSinOrigenM3?: number;
    consumoSinOrigenCount?: number;
    /** m³ consumidos en corridas que todavía no declararon qué salió. */
    consumoSinDeclararM3?: number;
    consumoSinDeclararCount?: number;
  };
  porEspecie: ReadonlyArray<{ especie: string; saldoM3: number; ingresoM3: number; consumidoM3: number }>;
  productos: ReadonlyArray<{ producto: string; stock: number }>;
  /**
   * Existencia FINAL por especie —apertura heredada + movimiento del período—,
   * de la conciliación (ADR-139).
   *
   * Sin esto, «especie en negativo» se juzgaba sólo con el movimiento del
   * período, y eso es falso para cualquier planta con stock heredado: un patio
   * que arranca el mes con 150 m³, recibe 32 y asierra 114 termina con 68 m³ y
   * el libro perfecto — pero la pantalla gritaba «no cuadra ante SERFOR». Un
   * rojo que se equivoca enseña a ignorar la lista entera.
   *
   * `undefined` mientras la conciliación no llegó o el período no tiene inicio:
   * ahí el movimiento es todo lo que se sabe, y se usa ese.
   */
  existenciaFinal?: ReadonlyArray<{ especie: string; final: number }>;
  /**
   * Mínimo que alcanzó el saldo durante el período. Sólo la curva lo sabe: los
   * totales del cierre pueden dar positivos habiendo estado en rojo el martes,
   * y eso es exactamente lo que un fiscalizador reconstruye.
   */
  valleDelPeriodo?: { fecha: string; saldo: number } | null;
}

/** Debajo de esto un volumen es ruido de coma flotante, no un problema. */
const EPS = 1e-4;
/** Con más de esto consumido, la especie se agota antes de lo que uno cree. */
const UMBRAL_AGOTARSE = 90;
/** Cuántos nombres se listan antes de resumir en «y N más». */
export const TOPE_NOMBRES = 6;

const m3 = (v: number) => `${v.toFixed(2)} m³`;
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * Las excepciones del período, de la más grave a la más leve.
 *
 * Dentro de un mismo tono manda la magnitud: dos errores no valen lo mismo si
 * uno son 40 m³ y el otro 0.05.
 */
export function excepcionesDeSaldo(input: EntradaExcepciones): Excepcion[] {
  const fuera: Excepcion[] = [];

  // ── Materia prima consumida sin respaldo ────────────────────────────────
  /* La existencia que se juzga: la FINAL si la conciliación la trajo, y si no
     el movimiento del período. Ver `existenciaFinal` arriba: son cosas
     distintas y confundirlas inventa un rojo en toda planta con stock heredado. */
  const finalPorEspecie = new Map(
    (input.existenciaFinal ?? []).map((e) => [claveEspecie(e.especie), e.final] as const),
  );
  const existenciaDe = (especie: string, saldoM3: number) =>
    finalPorEspecie.get(claveEspecie(especie)) ?? saldoM3;
  /* Que la conciliación haya llegado no significa que haya apertura: un libro
     que arranca en cero devuelve una final idéntica al movimiento, y hablar de
     «lo heredado del cierre anterior» ahí nombra algo que no existe. */
  const conApertura = input.porEspecie.some(
    (e) => Math.abs(existenciaDe(e.especie, e.saldoM3) - e.saldoM3) > EPS,
  );

  const negativas = input.porEspecie
    .map((e) => ({ ...e, existencia: existenciaDe(e.especie, e.saldoM3) }))
    .filter((e) => e.existencia < -EPS)
    .sort((a, b) => a.existencia - b.existencia);
  if (negativas.length > 0) {
    const total = negativas.reduce((a, e) => a + Math.abs(e.existencia), 0);
    fuera.push({
      clave: "mp-negativa",
      tono: "error",
      titulo: `${negativas.length} ${plural(negativas.length, "especie", "especies")} en negativo · ${m3(total)} sin respaldo`,
      /* El detalle enumeraba dos hipótesis y mandaba a buscar cuál. Cuando el
         desglose viene, se dice dónde está el volumen sin guía: es el dato que
         convierte el aviso en una tarea. */
      detalle: detalleNegativo(input.materiaPrima, conApertura),
      items: negativas.map((e) => `${e.especie} (${m3(e.existencia)})`),
      magnitud: Number(total.toFixed(4)),
      ir: "ingresos",
    });
  }

  // ── Producto despachado sin haberlo producido ───────────────────────────
  const stockNeg = input.productos.filter((p) => p.stock < -EPS).sort((a, b) => a.stock - b.stock);
  if (stockNeg.length > 0) {
    const total = stockNeg.reduce((a, p) => a + Math.abs(p.stock), 0);
    fuera.push({
      clave: "stock-negativo",
      tono: "error",
      titulo: `${stockNeg.length} ${plural(stockNeg.length, "producto despachado", "productos despachados")} de más`,
      detalle:
        "Salió más producto del que declaran las corridas de producción. Revisá si falta registrar una corrida o si un despacho duplicó la cantidad.",
      items: stockNeg.map((p) => `${p.producto} (${p.stock.toFixed(2)})`),
      magnitud: Number(total.toFixed(4)),
      ir: "produccion",
    });
  }

  // ── El saldo estuvo en rojo aunque hoy esté verde ───────────────────────
  const valle = input.valleDelPeriodo;
  if (valle && valle.saldo < -EPS) {
    fuera.push({
      clave: "valle-negativo",
      tono: "warning",
      titulo: `El patio estuvo en ${m3(valle.saldo)} el ${fechaCorta(valle.fecha)}`,
      detalle:
        "Aunque el saldo de hoy cierre bien, hubo días con más consumo declarado que ingreso disponible. Suele ser una corrida fechada antes que la guía que la alimenta.",
      items: [],
      magnitud: Number(Math.abs(valle.saldo).toFixed(4)),
      ir: "produccion",
    });
  }

  // ── Madera que ya entró a la sierra y todavía no declaró qué salió ──────
  /* La corrida abierta (ADR-364) resta del saldo desde que consume, pero su
     producto no existe hasta que se declara. En Saldos eso se veía sólo como un
     consumo más grande de lo esperado, sin nombre. Es warning, no error: a
     media jornada es lo normal — deja de serlo cuando se olvida. */
  const sinDeclarar = input.materiaPrima.consumoSinDeclararM3 ?? 0;
  const corridasAbiertas = input.materiaPrima.consumoSinDeclararCount ?? 0;
  if (sinDeclarar > EPS && corridasAbiertas > 0) {
    fuera.push({
      clave: "sin-declarar",
      tono: "warning",
      titulo: `${m3(sinDeclarar)} en ${corridasAbiertas} ${plural(corridasAbiertas, "corrida sin declarar", "corridas sin declarar")}`,
      detalle:
        "Esa madera ya bajó del patio y por eso resta del saldo, pero todavía no dice qué salió de ella. Declarale la producción para que el libro tenga las dos mitades.",
      items: [],
      magnitud: Number(sinDeclarar.toFixed(4)),
      ir: "produccion",
    });
  }

  // ── Volumen en el limbo: está en el patio, no cuenta como saldo ─────────
  const pendiente = input.materiaPrima.pendienteM3;
  if (pendiente > EPS) {
    fuera.push({
      clave: "sin-validar",
      tono: "warning",
      titulo: `${m3(pendiente)} sin validar`,
      detalle:
        "Madera cargada que todavía no computa como existencia y no se puede consumir en producción. Validá los ingresos para que entre al saldo.",
      items: [],
      magnitud: Number(pendiente.toFixed(4)),
      ir: "ingresos",
    });
  }

  // ── Las que se están por acabar ─────────────────────────────────────────
  const agotarse = input.porEspecie
    .filter((e) => e.saldoM3 > EPS && e.ingresoM3 > 0 && (e.consumidoM3 / e.ingresoM3) * 100 >= UMBRAL_AGOTARSE)
    .sort((a, b) => a.saldoM3 - b.saldoM3);
  if (agotarse.length > 0) {
    fuera.push({
      clave: "por-agotarse",
      tono: "info",
      titulo: `${agotarse.length} ${plural(agotarse.length, "especie está", "especies están")} por agotarse`,
      detalle: `Más del ${UMBRAL_AGOTARSE} % de lo ingresado ya se transformó. Si se siguen vendiendo, hay que reponer antes de comprometer despachos.`,
      items: agotarse.map((e) => `${e.especie} (queda ${m3(e.saldoM3)})`),
      magnitud: Number(agotarse.reduce((a, e) => a + e.saldoM3, 0).toFixed(4)),
      ir: null,
    });
  }

  const peso: Record<TonoExcepcion, number> = { error: 0, warning: 1, info: 2 };
  return fuera.sort((a, b) => peso[a.tono] - peso[b.tono] || (b.magnitud ?? 0) - (a.magnitud ?? 0));
}

/**
 * `YYYY-MM-DD` a "23 jul". En UTC a propósito: las fechas del libro son
 * date-only guardadas a medianoche UTC y leerlas en hora de Lima las corre un
 * día para atrás.
 */
function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Los nombres visibles y cuántos quedaron afuera — sin cortar en silencio. */
export function nombresVisibles(items: readonly string[], tope = TOPE_NOMBRES): { visibles: string[]; resto: number } {
  return { visibles: items.slice(0, tope), resto: Math.max(0, items.length - tope) };
}

/**
 * Por qué el saldo quedó negativo, con el número que lo explica cuando se sabe.
 *
 * «O falta validar un ingreso, o una corrida cargó de más» es cierto y no sirve:
 * describe el universo de causas. Con el desglose del consumo se puede decir
 * cuántos m³ se transformaron sin ninguna guía atribuida, que es donde vive el
 * faltante en la práctica.
 */
function detalleNegativo(
  mp: EntradaExcepciones["materiaPrima"],
  conApertura: boolean,
): string {
  const base = conApertura
    ? "La existencia final —lo heredado del cierre anterior más el movimiento del período— quedó bajo cero."
    : "Se transformó más volumen del que ingresó validado.";
  const sinOrigen = mp.consumoSinOrigenM3 ?? 0;
  const cuantas = mp.consumoSinOrigenCount ?? 0;
  const causa =
    sinOrigen > EPS && cuantas > 0
      ? ` ${m3(sinOrigen)} salieron de ${cuantas} ${plural(cuantas, "corrida", "corridas")} que declararon consumo sin ninguna guía atribuida: ahí está el faltante. Cargá el ingreso que las respalda, o corregí el volumen que consumieron.`
      : " O falta validar un ingreso, o una corrida cargó de más.";
  return `${base}${causa} Hasta corregirlo, el libro no cuadra ante SERFOR.`;
}
