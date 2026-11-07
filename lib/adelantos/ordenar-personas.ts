/**
 * Orden y filtros de la libreta de personas.
 *
 * Fuera del componente porque son preguntas del negocio —«¿a quién ya no le
 * puedo fiar?», «¿quién no me devuelve?»— y se prueban sin montar React.
 */

import { estadoDeCredito, requiereAtencion, saldoParaLimite } from "@/lib/adelantos/limite-credito";
import { cumplimientoDe, type ResumenPersona } from "@/lib/adelantos/saldo-persona";
import { faltaTelefono, faltanDatos } from "@/lib/adelantos/datos-persona";
import { TIPOS_RELACION, type TipoRelacion } from "@/lib/adelantos/persona-campos";

/** Lo mínimo para ordenar y filtrar: no hace falta el registro entero. */
export type PersonaOrdenable = ResumenPersona & {
  nombre: string;
  limiteCredito?: number | null;
  telefono?: string | null;
  documento?: string | null;
  tipoRelacion?: string | null;
};

export const ORDENES = ["saldo", "riesgo", "nombre", "adelantado", "cumplimiento", "reciente"] as const;
export type OrdenPersonas = (typeof ORDENES)[number];

export const FILTROS = ["todas", "deben", "al-dia", "riesgo", "sin-telefono", "faltan-datos"] as const;
export type FiltroPersonas = (typeof FILTROS)[number];

/** Total crudo cruzando monedas — SÓLO para comparar/ordenar, nunca para mostrar: sin tipo de cambio cargado, es la mejor aproximación disponible (misma idea que "% de la cartera" en Cobranza). */
const sumaTotal = (m: Record<string, number>) => Object.values(m).reduce((s, v) => s + v, 0);
const debeAlgo = (p: PersonaOrdenable) => sumaTotal(p.saldoPendiente) > 0;

export function cumpleFiltro(p: PersonaOrdenable, filtro: FiltroPersonas): boolean {
  switch (filtro) {
    case "deben": return debeAlgo(p);
    case "al-dia": return !debeAlgo(p);
    case "riesgo": return requiereAtencion(estadoDeCredito(p.limiteCredito, saldoParaLimite(p.saldoPendiente)));
    case "sin-telefono": return faltaTelefono(p);
    case "faltan-datos": return faltanDatos(p);
    case "todas": return true;
  }
}

/** Los chips de «qué es para el negocio» (ADR-525): los seis tipos y quien todavía no tiene. */
export const FILTROS_TIPO = [...TIPOS_RELACION, "sin-tipo"] as const;
export type FiltroTipo = (typeof FILTROS_TIPO)[number];

/** Sin tipo, o uno que ya no está en la lista, cuenta como «sin-tipo». */
export function tipoDePersona(p: Pick<PersonaOrdenable, "tipoRelacion">): FiltroTipo {
  const t = (p.tipoRelacion ?? "").trim();
  return (TIPOS_RELACION as readonly string[]).includes(t) ? (t as TipoRelacion) : "sin-tipo";
}

/** `null` = todos los tipos. */
export function cumpleTipo(p: Pick<PersonaOrdenable, "tipoRelacion">, tipo: FiltroTipo | null): boolean {
  return tipo == null || tipoDePersona(p) === tipo;
}

/** Cuántas personas hay de cada tipo (para el número de cada chip). */
export function cuentasPorTipo(personas: readonly Pick<PersonaOrdenable, "tipoRelacion">[]): Record<FiltroTipo, number> {
  const out = Object.fromEntries(FILTROS_TIPO.map((t) => [t, 0])) as Record<FiltroTipo, number>;
  for (const p of personas) out[tipoDePersona(p)] += 1;
  return out;
}

/** Igual que `sinTildes` de la pantalla (components/admin/adelantos/shared): «maria» encuentra a «María». */
const sinTildes = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Se busca por nombre, documento Y teléfono, sin tildes: un número a mano
 * («987 654 321») encuentra al que lo tiene guardado sin espacios.
 */
export function coincideBusqueda(p: Pick<PersonaOrdenable, "nombre" | "documento" | "telefono">, q: string): boolean {
  const t = sinTildes(q);
  if (!t) return true;
  const soloDigitos = t.replace(/\D/g, "");
  return (
    sinTildes(p.nombre).includes(t) ||
    (p.documento ?? "").includes(t) ||
    (!!soloDigitos && (p.telefono ?? "").replace(/\D/g, "").includes(soloDigitos))
  );
}

/** El tipo, la situación y el buscador juntos (AND): lo que muestra la tabla de Personas. */
export function filtrarPersonas<T extends PersonaOrdenable>(
  personas: readonly T[],
  f: { filtro: FiltroPersonas; tipo: FiltroTipo | null; q: string },
): T[] {
  return personas.filter((p) => cumpleTipo(p, f.tipo) && cumpleFiltro(p, f.filtro) && coincideBusqueda(p, f.q));
}

/** Qué proporción de su tope tiene usada. −1 = sin tope, va al final. */
function usoDelTope(p: PersonaOrdenable): number {
  const e = estadoDeCredito(p.limiteCredito, saldoParaLimite(p.saldoPendiente));
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
        return sumaTotal(b.totalAdelantado) - sumaTotal(a.totalAdelantado) || porNombre(a, b);
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
        return sumaTotal(b.saldoPendiente) - sumaTotal(a.saldoPendiente) || porNombre(a, b);
    }
  });
}

/**
 * El sentido del primer clic en el encabezado de cada columna (30-10: el
 * desplegable «Orden: …» se fue a los encabezados, como en Adelantos › Lista).
 * Es el sentido en que `ordenarPersonas` ya devuelve cada orden.
 */
export const SENTIDO_NATURAL: Record<OrdenPersonas, "asc" | "desc"> = {
  saldo: "desc",
  riesgo: "desc",
  nombre: "asc",
  adelantado: "desc",
  cumplimiento: "asc",
  reciente: "desc",
};

/**
 * El mismo orden, o al revés (segundo clic en la columna). Al revés, quien no
 * tiene el dato —nunca sacó, sin tope— sigue al final: arriba no dice nada.
 */
export function ordenarPersonasEnSentido<T extends PersonaOrdenable>(personas: readonly T[], orden: OrdenPersonas, invertido: boolean): T[] {
  const ordenadas = ordenarPersonas(personas, orden);
  if (!invertido) return ordenadas;
  const tieneDato = (p: T) =>
    orden === "cumplimiento" ? cumplimientoDe(p) != null : orden === "reciente" ? !!p.ultimoAdelanto : orden === "riesgo" ? usoDelTope(p) >= 0 : true;
  return [...ordenadas.filter(tieneDato).reverse(), ...ordenadas.filter((p) => !tieneDato(p))];
}
