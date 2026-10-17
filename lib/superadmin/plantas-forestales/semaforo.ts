/**
 * El semáforo de una planta (superadmin, 17-10). Puro: decide con lo que ya
 * leyó el resumen, sin leer nada.
 *
 * Se juzga por la EXISTENCIA FINAL (apertura + movimiento), no por el
 * movimiento del período: con stock heredado se puede consumir más de lo que
 * entró sin que el libro esté mal (falso rojo n.º 1, memoria
 * `ctp-sobreconsumo-anatomia-y-falsos-rojos`). Y el negativo que el propio
 * libro explica —madera consumida en corridas sin guía atribuida, o guías
 * cargadas que esperan recepción (`detalleNegativo`, `cubrePendiente`)— es
 * trabajo pendiente, amarillo, no un faltante: rojo es sólo lo que nada explica.
 *
 * Orden: rojo (aunque otra lectura falle: lo que se vio ya es grave) → gris
 * (alguna lectura falló: no se afirma «todo bien» sin haberlo visto) →
 * amarillo → verde.
 */
import type { EspecieExistencia, EstadoLectura, FuenteLectura, GravedadIncoherencia, Semaforo } from "./tipos";

/** La misma tolerancia que `cuadre-trozas`: menos de 1 dm³ no es madera. */
export const TOLERANCIA_SEMAFORO_M3 = 0.001;

const NOMBRE_FUENTE: Record<FuenteLectura, string> = {
  saldos: "el saldo",
  conciliacion: "la existencia final",
  disponibles: "la aserrada disponible",
  patio: "el patio",
  lotes: "los lotes",
  pendientes: "los pendientes",
  rendimiento: "el rendimiento",
  cumplimiento: "el cumplimiento",
};

export interface EntradaSemaforo {
  lecturas: Record<FuenteLectura, EstadoLectura>;
  /** Especies con existencia final bajo cero (de `conciliacionPeriodo`). */
  especiesNegativas: readonly EspecieExistencia[];
  /** De `saldos().materiaPrima`; `null` si el saldo no se leyó. */
  materiaPrima: {
    pendienteM3: number;
    consumoSinOrigenM3: number;
    consumoSinOrigenCount: number;
    consumoSinDeclararM3: number;
    consumoSinDeclararCount: number;
  } | null;
  incoherencias: Record<GravedadIncoherencia, number>;
}

const m3 = (n: number): string => `${n.toLocaleString("es-PE", { maximumFractionDigits: 3 })} m³`;
const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

export function semaforoDePlanta(e: EntradaSemaforo): { semaforo: Semaforo; motivo: string } {
  const tol = TOLERANCIA_SEMAFORO_M3;
  const negativas = e.especiesNegativas.filter((x) => x.existenciaFinalM3 < -tol);
  const faltante = negativas.reduce((a, x) => a + Math.abs(x.existenciaFinalM3), 0);
  const mp = e.materiaPrima;
  const sinOrigen = mp?.consumoSinOrigenM3 ?? 0;
  const pendiente = mp?.pendienteM3 ?? 0;
  const explicado = sinOrigen + pendiente;

  /* Rojo sólo con las dos lecturas que lo prueban: sin el saldo no se sabe
     cuánto explican las corridas sin guía, y sin la conciliación no hay
     existencia final que juzgar. */
  const verSaldo = e.lecturas.saldos === "ok" && e.lecturas.conciliacion === "ok" && mp != null;
  if (verSaldo && negativas.length > 0 && faltante > explicado + tol) {
    return {
      semaforo: "rojo",
      motivo: `${plural(negativas.length, "especie", "especies")} con existencia final negativa (${m3(faltante)}): faltan ${m3(
        faltante - explicado,
      )} que ni el consumo sin guía ni lo pendiente de recepcionar explican`,
    };
  }

  const fallidas = (Object.keys(e.lecturas) as FuenteLectura[]).filter((k) => e.lecturas[k] === "error");
  if (fallidas.length > 0) {
    return { semaforo: "gris", motivo: `No se pudo leer ${fallidas.map((k) => NOMBRE_FUENTE[k]).join(", ")}` };
  }

  const avisos: string[] = [];
  if (negativas.length > 0) {
    avisos.push(
      `${plural(negativas.length, "especie", "especies")} en negativo (${m3(faltante)}), explicado por ${
        sinOrigen > tol && pendiente > tol
          ? "consumo sin guía y guías por recepcionar"
          : sinOrigen > tol
            ? "consumo sin guía"
            : "guías por recepcionar"
      }`,
    );
  }
  if (mp && sinOrigen > tol) {
    avisos.push(`${m3(sinOrigen)} consumidos en ${plural(mp.consumoSinOrigenCount, "corrida", "corridas")} sin guía atribuida`);
  }
  if (mp && mp.consumoSinDeclararM3 > tol) {
    avisos.push(`${plural(mp.consumoSinDeclararCount, "corrida abierta", "corridas abiertas")} sin declarar lo producido`);
  }
  const graves = e.incoherencias.error + e.incoherencias.warning;
  if (graves > 0) avisos.push(`${plural(graves, "incoherencia", "incoherencias")} por revisar`);
  if (avisos.length > 0) return { semaforo: "amarillo", motivo: avisos.join(" · ") };

  return { semaforo: "verde", motivo: "Existencia al día y sin incoherencias" };
}
