/**
 * ctp-saldos-avisos — los textos y los avisos de operación de «Qué revisar».
 *
 * Separado de `ctp-saldos-excepciones` para que cada módulo quepa en una
 * lectura: allá vive QUÉ se avisa del saldo y en qué orden; acá, cómo se
 * escribe cada aviso y los cuatro que salen de cómo está la planta (origen
 * incompleto, lotes vencidos, madera varada y sin costo).
 *
 * PURO y client-safe: sin React, sin fetch, sin Prisma.
 */

import type { EntradaExcepciones, Excepcion } from "@/lib/forestal/ctp-saldos-excepciones";

/** Debajo de esto un volumen es ruido de coma flotante, no un problema. */
export const EPS = 1e-4;

export const m3 = (v: number) => `${v.toFixed(2)} m³`;
export const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * Los avisos que no salen del saldo sino de cómo está la planta: lo que no se
 * puede certificar, los lotes que se pasaron de fecha, la madera que lleva dos
 * meses parada y la que no tiene costo. Cada uno dice CUÁNTO y lleva adonde se
 * corrige.
 */
export function avisosDeOperacion(input: EntradaExcepciones): Excepcion[] {
  const fuera: Excepcion[] = [];

  const origen = input.origenIncompleto;
  if (origen && origen.corridas > 0 && origen.m3 > EPS) {
    fuera.push({
      clave: "origen-incompleto",
      tono: "warning",
      titulo: `${m3(origen.m3)} en depósito sin origen certificable · ${origen.corridas} ${plural(origen.corridas, "corrida", "corridas")}`,
      detalle:
        "Ese producto está en el depósito pero no dice de qué guía salió: no puede salir con papeles. Ata la materia prima en cada corrida, o declárala existencia de apertura si es anterior al libro.",
      items: [],
      magnitud: Number(origen.m3.toFixed(4)),
      ir: null,
      seccion: "capacidad",
    });
  }

  const lotes = input.lotes;
  const vencidos = lotes?.vencidos ?? [];
  const anejos = lotes?.anejos ?? [];
  if (vencidos.length + anejos.length > 0) {
    const partes = [
      vencidos.length > 0
        ? `${vencidos.length} ${plural(vencidos.length, "pasó su fin de proceso", "pasaron su fin de proceso")}`
        : "",
      anejos.length > 0
        ? `${anejos.length} ${plural(anejos.length, "lleva", "llevan")} más de ${lotes?.diasAnejo ?? 0} días sin aserrar`
        : "",
    ].filter(Boolean);
    const total = vencidos.length + anejos.length;
    fuera.push({
      clave: "lotes-vencidos",
      tono: "warning",
      titulo: `${total} ${plural(total, "lote abierto", "lotes abiertos")}: ${partes.join(" y ")}`,
      detalle:
        "Mientras un lote siga abierto, su madera figura apartada y no se ofrece para otra corrida. Asiérralo, ciérralo o corrige la fecha que se declaró al SNIFFS.",
      items: [...vencidos, ...anejos],
      magnitud: null,
      ir: "lotes",
    });
  }

  const varadas = input.guiasVaradas;
  if (varadas && varadas.guias > 0 && varadas.m3 > EPS) {
    fuera.push({
      clave: "guias-varadas",
      tono: "warning",
      titulo: `${m3(varadas.m3)} varados · ${varadas.guias} ${plural(varadas.guias, "guía lleva", "guías llevan")} ${varadas.dias} días o más en el patio`,
      detalle:
        "La troza parada se mancha y se raja: pierde precio antes que volumen. Pásala primero por la sierra (lo más viejo primero).",
      items: [],
      magnitud: Number(varadas.m3.toFixed(4)),
      ir: "consumos",
    });
  }

  const sinCosto = input.sinCosto;
  if (sinCosto && sinCosto.guias > 0 && sinCosto.m3 > EPS) {
    fuera.push({
      clave: "sin-costo",
      tono: "info",
      titulo: `${m3(sinCosto.m3)} sin costo cargado · ${sinCosto.guias} ${plural(sinCosto.guias, "guía", "guías")}`,
      detalle:
        "Sin factura no se sabe cuánto vale lo que está parado: el inmovilizado es un piso, no el total. Carga el costo de esas guías.",
      items: [],
      magnitud: Number(sinCosto.m3.toFixed(4)),
      ir: "rentabilidad",
    });
  }
  return fuera;
}

/**
 * `YYYY-MM-DD` a "23 jul". En UTC a propósito: las fechas del libro son
 * date-only guardadas a medianoche UTC y leerlas en hora de Lima las corre un
 * día para atrás.
 */
export function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Por qué el saldo quedó negativo, con el número que lo explica cuando se sabe.
 *
 * «O falta validar un ingreso, o una corrida cargó de más» es cierto y no sirve:
 * describe el universo de causas. Con el desglose del consumo se puede decir
 * cuántos m³ se transformaron sin ninguna guía atribuida, que es donde vive el
 * faltante en la práctica.
 */
/**
 * ¿Lo que espera recepción alcanza para explicar el faltante?
 *
 * Medido en el tenant real (2026-09-12): el libro estaba en −125.709 m³ con
 * 142.262 consumidos sin guía atribuida… y 181.093 m³ en guías cargadas pero
 * sin recepcionar. El ingreso ya estaba; lo que faltaba era cerrar la recepción.
 */
export function cubrePendiente(mp: EntradaExcepciones["materiaPrima"], faltante: number): boolean {
  return (mp.pendienteM3 ?? 0) > EPS && (mp.pendienteM3 ?? 0) >= faltante - EPS;
}

export function detalleNegativo(
  mp: EntradaExcepciones["materiaPrima"],
  conApertura: boolean,
  faltante = 0,
): string {
  const base = conApertura
    ? "La existencia final —lo heredado del cierre anterior más el movimiento del período— quedó bajo cero."
    : "Se transformó más volumen del que ingresó validado.";
  const sinOrigen = mp.consumoSinOrigenM3 ?? 0;
  const cuantas = mp.consumoSinOrigenCount ?? 0;
  /* El desenlace cambia si la madera que falta YA está cargada esperando
     recepción: mandar a «cargar el ingreso» sería pedir de nuevo algo hecho. */
  const pendiente = mp.pendienteM3 ?? 0;
  const alcanza = cubrePendiente(mp, faltante);
  const causa =
    sinOrigen > EPS && cuantas > 0
      ? ` ${m3(sinOrigen)} salieron de ${cuantas} ${plural(cuantas, "corrida", "corridas")} que declararon consumo sin ninguna guía atribuida: ahí está el faltante.`
      : " O falta validar un ingreso, o una corrida cargó de más.";
  const salida = alcanza
    ? ` Tienes ${m3(pendiente)} cargados en guías que todavía no se recepcionaron: alcanzan para cubrirlo. Recepciónalas y el saldo se acomoda solo.`
    : pendiente > EPS
      ? ` Hay ${m3(pendiente)} esperando recepción, pero no alcanzan: recepciónalos y revisa el volumen que consumieron esas corridas.`
      : " Carga el ingreso que las respalda, o corrige el volumen que consumieron.";
  return `${base}${causa}${salida} Hasta corregirlo, el libro no cuadra ante SERFOR.`;
}
