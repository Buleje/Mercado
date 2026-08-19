/**
 * Orden y filtros de la libreta de personas.
 *
 * Fuera del componente porque son preguntas del negocio —«¿a quién ya no le
 * puedo fiar?», «¿quién no me devuelve?»— y se prueban sin montar React.
 */

import { estadoDeCredito, requiereAtencion } from "@/lib/adelantos/limite-credito";
import { cumplimientoDe, type ResumenPersona } from "@/lib/adelantos/saldo-persona";

/** Lo mínimo para ordenar y filtrar: no hace falta el registro entero. */
export type PersonaOrdenable = ResumenPersona & {
  nombre: string;
  limiteCredito?: number | null;
};

export const ORDENES = ["saldo", "riesgo", "nombre", "adelantado", "cumplimiento", "reciente"] as const;
export type OrdenPersonas = (typeof ORDENES)[number];

export const FILTROS = ["todas", "deben", "al-dia", "riesgo"] as const;
export type FiltroPersonas = (typeof FILTROS)[number];

export function cumpleFiltro(p: PersonaOrdenable, filtro: FiltroPersonas): boolean {
  switch (filtro) {
    case "deben": return p.saldoPendiente > 0;
    case "al-dia": return p.saldoPendiente <= 0;
    case "riesgo": return requiereAtencion(estadoDeCredito(p.limiteCredito, p.saldoPendiente));
    case "todas": return true;
  }
}

/** Qué proporción de su tope tiene usada. −1 = sin tope, va al final. */
function usoDelTope(p: PersonaOrdenable): number {
  const e = estadoDeCredito(p.limiteCredito, p.saldoPendiente);
  if (e.estado === "sin-limite" || !(e.limite > 0)) return -1;
  return e.usado / e.limite;
}

/**
 * Ordena sin mutar. El desempate SIEMPRE es alfabético: sin él, dos personas
 * con el mismo saldo se intercambian entre renders y la grilla parpadea.
 */
export function ordenarPersonas<T extends PersonaOrdenable>(personas: readonly T[], orden: OrdenPersonas): T[] {
  const porNombre = (a: T, b: T) => a.nombre.localeCompare(b.nombre, "es");
  return [...personas].sort((a, b) => {
    switch (orden) {
      case "nombre":
        return porNombre(a, b);
      case "adelantado":
        return b.totalAdelantado - a.totalAdelantado || porNombre(a, b);
      case "riesgo":
        /* Primero quien está más cerca de su tope: es la pregunta del mostrador
           —«¿a quién ya no le puedo fiar más?»— que por saldo no se contesta.
           Quien debe 400 de un tope de 500 está peor que quien debe 900 de
           5.000. Los que no tienen tope no es que estén bien: es que no hay
           nada que medir, y por eso van al final. */
        return usoDelTope(b) - usoDelTope(a) || porNombre(a, b);
      case "cumplimiento": {
        /* Primero el que MENOS devolvió. Quien nunca sacó nada no tiene nota y
           va al final: no se lo puede acusar de incumplido. */
        const ca = cumplimientoDe(a);
        const cb = cumplimientoDe(b);
        if (ca == null && cb == null) return porNombre(a, b);
        if (ca == null) return 1;
        if (cb == null) return -1;
        return ca - cb || porNombre(a, b);
      }
      case "reciente": {
        /* Quien nunca sacó no tiene fecha: al final, no arriba con el epoch. */
        const fa = a.ultimoAdelanto ?? "";
        const fb = b.ultimoAdelanto ?? "";
        if (!fa && !fb) return porNombre(a, b);
        if (!fa) return 1;
        if (!fb) return -1;
        return fb.localeCompare(fa) || porNombre(a, b);
      }
      case "saldo":
        return b.saldoPendiente - a.saldoPendiente || porNombre(a, b);
    }
  });
}
