/**
 * Ficha del permiso — lo que ampara todo el tablero del Libro TH, en una tarjeta.
 *
 * La banda de «Control del permiso» leía SÓLO la carátula del libro. Medido en
 * el tenant real (2026-09-30): 0 carátulas cargadas → seis guiones, y el plan
 * con resolución, parcela y vigencia (Tornillo, 20/03/2026 → 20/03/2028) ya
 * estaba en la base sin que la banda lo mirara. La pregunta que la tarjeta
 * contesta es «¿con qué papel trabajo y cuánto le queda?», y eso sale de los
 * DOS registros: la carátula (registro, tomo, RUC) y el plan (parcela, vigencia).
 *
 * Reglas:
 *  · La carátula manda en lo que es suyo (registro, tomo, RUC, titular); el plan
 *    llena el hueco de lo que ambos guardan (título, resolución, titular,
 *    documento de gestión). Nunca se inventa un dato: vacío es `null`.
 *  · La cuenta de días es la de `estadoVigencia` (mismo umbral de 90 días que la
 *    cabecera del Plan y los avisos de vigencia): dos pantallas no pueden
 *    contar distinto el mismo vencimiento.
 *  · «Hoy» es el día de Lima (`hoyDelLibro`), las fechas date-only se leen en UTC.
 *  · Lo que falta se dice con qué pantalla lo completa (`completar`), para que la
 *    tarjeta ofrezca el camino y no sólo el reproche.
 *
 * PURA: sin fetch ni reloj propio. `ahora` entra por parámetro.
 */

import { avanceDelPeriodo, estadoVigencia, type NivelVigencia } from "./loth-plan-vigencia";
import { hoyDelLibro } from "./vigencia-avisos";

type Fecha = string | Date | null | undefined;

/** Lo que la ficha lee de `ForestLothCaratula` (lo que devuelve `/loth/caratula`). */
export interface CaratulaFicha {
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
  titularName?: string | null;
  representanteLegal?: string | null;
  ruc?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  resolucionNumber?: string | null;
  resolucionDate?: Fecha;
}

/** Lo que la ficha lee de `ForestPlan` (lo que devuelve `/plan?active=1`). */
export interface PlanFicha {
  planType?: string | null;
  planNumber?: string | null;
  tituloHabilitante?: string | null;
  resolucionNumber?: string | null;
  resolucionDate?: Fecha;
  titularName?: string | null;
  parcelaCorta?: string | null;
  vigenciaDesde?: Fecha;
  vigenciaHasta?: Fecha;
  /** `vigente | vencido | cerrado | suspendido`, tal como lo guarda la base. */
  estado?: string | null;
}

/**
 * Los cuatro estados que pidió la ficha, más los dos que el plan puede tener
 * DECLARADOS (cerrado / suspendido): ésos son decisiones administrativas y le
 * ganan al calendario, igual que en la cabecera del Plan.
 */
export type EstadoFicha = "vigente" | "por_vencer" | "vencido" | "sin_vigencia" | "cerrado" | "suspendido";

export type DondeCompletar = "caratula" | "plan";

export interface FaltanteFicha {
  clave: string;
  texto: string;
  completar: DondeCompletar;
}

export interface FichaPermiso {
  titulo: string | null;
  resolucion: string | null;
  /** «viernes 20/03/2026». */
  resolucionFecha: string | null;
  titular: string | null;
  representante: string | null;
  ruc: string | null;
  /** «PO Zafra 2026» — tipo + nombre/número. */
  documentoGestion: string | null;
  registro: string | null;
  tomo: string | null;
  parcelaCorta: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  /** Días hasta el fin, en día de Lima. Negativo = venció hace N. `null` sin fecha. */
  diasQuedan: number | null;
  estado: EstadoFicha;
  /** Una línea ya redactada («Vigente · quedan 537 días»). */
  estadoTexto: string;
  /** % del período ya corrido (para la barra). `null` si falta una de las fechas. */
  avancePct: number | null;
  faltantes: FaltanteFicha[];
}

/* Escritos a mano y no con `Intl`: el nombre del día cambia según la versión de
   ICU (regla ui-components). */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** La clave `AAAA-MM-DD` de una fecha date-only, leída en UTC. */
function claveUtc(v: Fecha): string | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(typeof v === "string" && v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * «viernes 20/03/2026». Con año: una vigencia se cuenta en años y «20/03» solo
 * no dice cuál de los dos marzos.
 */
export function fechaDelPermiso(v: Fecha): string | null {
  const k = claveUtc(v);
  if (!k) return null;
  const [a, m, d] = k.split("-");
  const dia = DIAS[new Date(`${k}T00:00:00Z`).getUTCDay()];
  return `${dia} ${d}/${m}/${a}`;
}

const limpio = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

const juntar = (...partes: (string | null | undefined)[]): string | null =>
  limpio(partes.map(limpio).filter(Boolean).join(" "));

const ESTADO_DE_NIVEL: Record<NivelVigencia, EstadoFicha> = {
  vigente: "vigente",
  por_vencer: "por_vencer",
  vencido: "vencido",
  sin_fecha: "sin_vigencia",
  cerrado: "cerrado",
  suspendido: "suspendido",
};

/** Arma la ficha. `ahora` se convierte al día de Lima antes de contar. */
export function construirFichaPermiso(
  caratula: CaratulaFicha | null | undefined,
  plan: PlanFicha | null | undefined,
  ahora: Date | number = Date.now(),
): FichaPermiso {
  const c = caratula ?? null;
  const p = plan ?? null;

  const faltantes: FaltanteFicha[] = [];
  if (!c) {
    faltantes.push({ clave: "caratula", texto: "Falta la carátula del libro", completar: "caratula" });
  }
  if (!p) {
    faltantes.push({ clave: "plan", texto: "Falta el plan de manejo", completar: "plan" });
  } else {
    if (!claveUtc(p.vigenciaHasta) || !claveUtc(p.vigenciaDesde)) {
      faltantes.push({ clave: "plan-vigencia", texto: "El plan no tiene vigencia", completar: "plan" });
    }
    if (!limpio(p.parcelaCorta)) {
      faltantes.push({ clave: "plan-parcela", texto: "El plan no tiene parcela de corta", completar: "plan" });
    }
  }

  const titulo = limpio(c?.tituloHabilitante) ?? limpio(p?.tituloHabilitante);
  // Sin carátula ya se reclamó la carátula entera: no se repite el mismo hueco.
  if (c && !titulo) {
    faltantes.push({ clave: "caratula-titulo", texto: "La carátula no tiene el título habilitante", completar: "caratula" });
  }

  // La resolución y su fecha viajan juntas: no mezclar el número de un papel con la fecha del otro.
  const resDeCaratula = limpio(c?.resolucionNumber);
  const resolucion = resDeCaratula ?? limpio(p?.resolucionNumber);
  const resolucionFecha = fechaDelPermiso(resDeCaratula ? c?.resolucionDate : p?.resolucionDate);

  const hoy = hoyDelLibro(ahora);
  const vigencia = p ? estadoVigencia(claveUtc(p.vigenciaHasta), p.estado, hoy) : null;
  // Sin fecha pero DECLARADO vencido: manda lo declarado (misma regla que la cabecera del Plan).
  const vencidoSinFecha = vigencia?.nivel === "sin_fecha" && vigencia.tono === "danger";

  return {
    titulo,
    resolucion,
    resolucionFecha,
    titular: limpio(c?.titularName) ?? limpio(p?.titularName),
    representante: limpio(c?.representanteLegal),
    ruc: limpio(c?.ruc),
    documentoGestion: juntar(c?.docGestionType, c?.docGestionName) ?? juntar(p?.planType, p?.planNumber),
    registro: limpio(c?.registroNumber),
    tomo: limpio(c?.tomo),
    parcelaCorta: limpio(p?.parcelaCorta),
    vigenciaDesde: fechaDelPermiso(p?.vigenciaDesde),
    vigenciaHasta: fechaDelPermiso(p?.vigenciaHasta),
    diasQuedan: vigencia?.diasRestantes ?? null,
    estado: !vigencia ? "sin_vigencia" : vencidoSinFecha ? "vencido" : ESTADO_DE_NIVEL[vigencia.nivel],
    estadoTexto: !vigencia
      ? "Sin plan de manejo"
      : vigencia.nivel === "sin_fecha" && !vencidoSinFecha ? "Sin vigencia cargada" : vigencia.texto,
    avancePct: p ? avanceDelPeriodo(claveUtc(p.vigenciaDesde), claveUtc(p.vigenciaHasta), hoy) : null,
    faltantes,
  };
}
