/**
 * lib/caja/bitacora-cambios.ts — «Quién tocó la caja» con ANTES → DESPUÉS
 * (auditoría 15-10, M28).
 *
 * El registro de actividad sólo guarda un texto (`ActivityLog.detail`, sin
 * campo Json). Las rutas de la caja lo escriben siempre con el mismo molde;
 * esto lo lee de vuelta y devuelve los cambios por campo (medio, esperado,
 * estado, fondo, conteo) y el motivo, para dibujarlos como chips en vez de
 * una frase larga. Lo que no reconoce sale sin cambios: la frase queda igual.
 *
 * Moldes (quien cambie uno en la ruta, cambia el test):
 *  - `[id]/movements/[movementId]` Editar: «Medio corregido · <qué>: Efectivo → Yape (esperado S/184.90 → S/162.90) — motivo: …»
 *  - `[id]` y `close-shift` Cerrar: «Cierre con S/180.00 (esperado S/184.90, diferencia S/-4.90) — notas»
 *    o «Cierre sin conteo desde Cerrar turno (esperado S/184.90)»
 *  - `route` Abrir: «Apertura de caja con S/200.00 — notas»
 *  - `[id]` y `movements` Crear: «Ingreso manual de S/50.00 por Yape — desc»
 *  - `[id]` Arquear: «Arqueo con S/160.00 (esperado S/162.90, diferencia S/-2.90) — notas»
 *
 * PURO y client-safe.
 */

export interface CambioDeBitacora {
  campo: string;
  /** `null` = no había antes (una apertura, un ingreso nuevo). */
  antes: string | null;
  despues: string;
  /** Pinta el «después»: falta plata (rojo) o sobra (ámbar). */
  tono?: "faltante" | "sobrante";
}

export interface EntradaLeida {
  /** Qué se tocó, en pocas palabras (sin el antes/después, que va en los chips). */
  resumen: string | null;
  cambios: CambioDeBitacora[];
  /** Motivo o nota que dejó quien lo hizo. */
  motivo: string | null;
}

const MONTO = String.raw`S\/\s?-?[\d.,]+`;

/** «S/-4.90» → «−S/ 4.90»; «S/180.00» → «S/ 180.00». */
export function dineroDeBitacora(s: string): string {
  const m = /^S\/\s?(-?)([\d.,]+)$/.exec(s.trim());
  if (!m) return s.trim();
  return `${m[1] ? "−" : ""}S/ ${m[2]}`;
}

const numero = (s: string) => Number(s.replace(/[^\d.-]/g, ""));
const tonoDe = (dif: string): CambioDeBitacora["tono"] => {
  const n = numero(dif);
  return n < -0.004 ? "faltante" : n > 0.004 ? "sobrante" : undefined;
};
const vacio = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

export function leerEntradaDeCaja(action: string, detail: string): EntradaLeida {
  const texto = (detail ?? "").trim();

  const medio = new RegExp(
    String.raw`^Medio corregido · (.+): ([^:→]+?) → ([^:→(]+?) \(esperado (${MONTO}) → (${MONTO})\)(?: — motivo: ([\s\S]+))?$`,
  ).exec(texto);
  if (medio) {
    return {
      resumen: medio[1],
      cambios: [
        { campo: "Medio", antes: medio[2], despues: medio[3] },
        { campo: "Esperado", antes: dineroDeBitacora(medio[4]), despues: dineroDeBitacora(medio[5]) },
      ],
      motivo: vacio(medio[6]),
    };
  }

  const conteo = new RegExp(
    String.raw`^(Cierre|Arqueo) con (${MONTO}) \(esperado (${MONTO}), diferencia (${MONTO})\)(?: — ([\s\S]+))?$`,
  ).exec(texto);
  if (conteo) {
    const esCierre = conteo[1] === "Cierre";
    const dif = conteo[4];
    const cambios: CambioDeBitacora[] = [
      ...(esCierre ? [{ campo: "Estado", antes: "Abierta", despues: "Cerrada" }] : []),
      { campo: "Efectivo", antes: `Esperado ${dineroDeBitacora(conteo[3])}`, despues: `Contado ${dineroDeBitacora(conteo[2])}` },
    ];
    const tono = tonoDe(dif);
    if (tono) cambios.push({ campo: tono === "faltante" ? "Faltante" : "Sobrante", antes: null, despues: dineroDeBitacora(dif).replace("−", ""), tono });
    return { resumen: esCierre ? "Cierre de caja" : "Arqueo", cambios, motivo: vacio(conteo[5]) };
  }

  const sinConteo = new RegExp(String.raw`^Cierre sin conteo desde Cerrar turno \(esperado (${MONTO})\)$`).exec(texto);
  if (sinConteo) {
    return {
      resumen: "Cierre sin conteo (al cerrar el turno)",
      cambios: [
        { campo: "Estado", antes: "Abierta", despues: "Cerrada" },
        { campo: "Efectivo", antes: `Esperado ${dineroDeBitacora(sinConteo[1])}`, despues: "Nadie contó" },
      ],
      motivo: null,
    };
  }

  const apertura = new RegExp(String.raw`^Apertura de caja con (${MONTO})(?: — ([\s\S]+))?$`).exec(texto);
  if (apertura) {
    return {
      resumen: "Apertura de caja",
      cambios: [
        { campo: "Estado", antes: "Cerrada", despues: "Abierta" },
        { campo: "Fondo", antes: null, despues: dineroDeBitacora(apertura[1]) },
      ],
      motivo: vacio(apertura[2]),
    };
  }

  const manual = new RegExp(String.raw`^(Ingreso|Egreso) manual de (${MONTO})(?: por ([^—]+?))? —\s*([\s\S]*)$`).exec(texto);
  if (manual) {
    const entra = manual[1] === "Ingreso";
    return {
      resumen: vacio(manual[4]) ?? `${manual[1]} a mano`,
      cambios: [
        { campo: manual[1], antes: null, despues: `${entra ? "+" : "−"}${dineroDeBitacora(manual[2])}` },
        ...(manual[3] ? [{ campo: "Medio", antes: null, despues: manual[3].trim() }] : []),
      ],
      motivo: null,
    };
  }

  void action;
  return { resumen: texto || null, cambios: [], motivo: null };
}
