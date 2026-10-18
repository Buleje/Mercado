/**
 * Agenda (ADR-501 §3) — el motor: «¿ya está hecho ese día?». Puro: recibe las
 * actividades, las marcas a mano y los «hechos por día» que leyó
 * `AgendaFuentesDB` (una consulta agrupada por fuente y rango) y devuelve una
 * `OcurrenciaDTO` por cada día en que toca.
 *
 * Orden de las reglas (el primero que aplica manda):
 *  1. marca a mano (hecha / omitida / pospuesta);
 *  2. fecha > hoy → `futura` (una fuente con fecha futura no adelanta nada);
 *  3. la fuente dice hecho → `hecha`; a medias → `parcial`;
 *  4. fecha = hoy → `pendiente`;
 *  5. fecha < hoy → `atrasada`.
 * `cuenta_tercero`, `facturas` y `manual` no tienen fuente: sólo se cierran a mano
 * (no existe en ningún modelo un «revisé la cuenta» ni «entregué al contador»).
 *
 * Una pospuesta deja «pospuesta» en su día y aparece de nuevo en `posponerA`.
 */
import { armarAlertasAgenda } from "./alertas-campana";
import { fechasEnRango, sumarDias } from "./recurrencia";
import type {
  ActividadDTO,
  EstadoManual,
  EstadoOcurrencia,
  FechaKey,
  OcurrenciaDTO,
  ReglaAgenda,
  ResumenAgendaHoy,
} from "./tipos";

/** Hasta cuántos días atrás una atrasada sigue en «Hoy» (después queda en el historial). */
export const DIAS_ARRASTRE_ATRASADAS = 7;

export interface MarcaManual {
  actividadId: string;
  fecha: FechaKey;
  estado: EstadoManual;
  posponerA: FechaKey | null;
  nota: string | null;
  marcadoPor: string;
}

export interface PlataDelDia {
  gastos: number;
  ingresos: number;
  cajaCerrada: number;
  cuentaForestal: number;
}

/** Lo que leyó `AgendaFuentesDB`, por día de Lima. Sólo vienen las fuentes que alguna actividad pide. */
export interface FuentesDelRango {
  asistencia?: Record<FechaKey, { marcados: number; total: number }>;
  corridas?: Record<FechaKey, { total: number; terceros: number }>;
  plata?: Record<FechaKey, PlataDelDia>;
  /** fecha → beneficiarioId → gestiones; la clave `*` = de cualquiera. */
  gestionesAdelanto?: Record<FechaKey, Record<string, number>>;
  /** Texto de apoyo del día de HOY por actividad (saldo de adelantos, movimientos de cuenta, ventana del contador). */
  apoyoHoy?: Record<string, string>;
}

/** Reglas cuyo «hecho» sale de una tabla del sistema. */
export const REGLAS_CON_FUENTE: ReadonlySet<ReglaAgenda> = new Set([
  "asistencia",
  "servicio_aserrio",
  "gastos_ingresos",
  "adelantos",
]);

const HREF_HOY = "/admin?tab=administracion&vista=hoy";

/** Dónde se resuelve cada regla (claves de lib/admin/subvistas-modulos.ts). */
export function hrefDeActividad(a: Pick<ActividadDTO, "regla" | "parametros" | "objetivo">): string {
  switch (a.regla) {
    case "asistencia":
      return "/admin?tab=rrhh&vista=asistencia";
    case "servicio_aserrio":
      return "/admin?tab=ctp-libro-operaciones&vista=produccion";
    case "gastos_ingresos": {
      const que = Array.isArray(a.parametros.que) ? a.parametros.que : [];
      return que.includes("gastos") ? "/admin?tab=plata&vista=gastos" : "/admin?tab=ventas-caja&vista=caja-registradora";
    }
    case "adelantos":
      return "/admin?tab=plata&vista=adelantos";
    case "cuenta_tercero":
      /* La cuenta de una parte vive en Plata › Adelantos › «Cuenta por persona»
         (saldoConsolidado + movimientos). `?accion=liquidar&persona=parte:<id>`
         abre ESA cuenta (components/admin/adelantos/cuentas/liquidar-por-url.ts). */
      return a.objetivo?.tipo === "parte"
        ? `/admin?tab=plata&vista=adelantos&accion=liquidar&persona=${encodeURIComponent(`parte:${a.objetivo.id}`)}`
        : "/admin?tab=plata&vista=adelantos";
    case "facturas":
      return a.parametros.modo === "contador" ? "/admin?tab=plata&vista=impuestos" : "/admin?tab=facturacion&vista=facturas";
    case "manual":
      return HREF_HOY;
  }
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

interface Evaluacion {
  hecho: boolean;
  parcial: boolean;
  detalle: string | null;
  avance: { hecho: number; total: number } | null;
}

const SIN_EVALUAR: Evaluacion = { hecho: false, parcial: false, detalle: null, avance: null };

function evaluarFuente(a: ActividadDTO, fecha: FechaKey, f: FuentesDelRango): Evaluacion {
  switch (a.regla) {
    case "asistencia": {
      const dia = f.asistencia?.[fecha] ?? { marcados: 0, total: 0 };
      if (dia.total === 0) {
        return { hecho: false, parcial: false, detalle: "No hay colaboradores activos ese día", avance: null };
      }
      const hecho = a.parametros.minimo === "alguno" ? dia.marcados >= 1 : dia.marcados >= dia.total;
      return {
        hecho,
        parcial: !hecho && dia.marcados > 0,
        detalle: `${dia.marcados} de ${dia.total} marcados`,
        avance: { hecho: Math.min(dia.marcados, dia.total), total: dia.total },
      };
    }
    case "servicio_aserrio": {
      const dia = f.corridas?.[fecha] ?? { total: 0, terceros: 0 };
      const cuenta = a.parametros.soloTerceros === true ? dia.terceros : dia.total;
      const detalle =
        dia.total === 0
          ? "Sin corridas anotadas"
          : plural(dia.total, "corrida", "corridas") + (dia.terceros > 0 ? ` · ${dia.terceros} de tercero` : "");
      return { hecho: cuenta >= 1, parcial: false, detalle, avance: null };
    }
    case "gastos_ingresos": {
      const dia = f.plata?.[fecha] ?? { gastos: 0, ingresos: 0, cajaCerrada: 0, cuentaForestal: 0 };
      const que = (Array.isArray(a.parametros.que) ? a.parametros.que : []) as string[];
      const piezas: Array<[boolean, string]> = que.map((q) => {
        if (q === "gastos") return [dia.gastos > 0, plural(dia.gastos, "gasto", "gastos")];
        if (q === "ingresos") return [dia.ingresos > 0, plural(dia.ingresos, "ingreso", "ingresos")];
        if (q === "caja_cerrada") return [dia.cajaCerrada > 0, dia.cajaCerrada > 0 ? "caja cerrada" : "caja sin cerrar"];
        return [dia.cuentaForestal > 0, plural(dia.cuentaForestal, "movimiento de cuenta", "movimientos de cuenta")];
      });
      const listos = piezas.filter(([ok]) => ok).length;
      return {
        hecho: piezas.length > 0 && listos === piezas.length,
        parcial: listos > 0 && listos < piezas.length,
        detalle: piezas.map(([, t]) => t).join(" · ") || null,
        avance: piezas.length > 1 ? { hecho: listos, total: piezas.length } : null,
      };
    }
    case "adelantos": {
      const dia = f.gestionesAdelanto?.[fecha] ?? {};
      const n = a.objetivo ? (dia[a.objetivo.id] ?? 0) : (dia["*"] ?? 0);
      return {
        hecho: n >= 1,
        parcial: false,
        detalle: n > 0 ? `${plural(n, "gestión anotada", "gestiones anotadas")}` : "Sin gestiones anotadas",
        avance: null,
      };
    }
    default:
      return SIN_EVALUAR;
  }
}

function unirDetalle(...partes: Array<string | null | undefined>): string | null {
  const t = partes.filter((p): p is string => !!p).join(" · ");
  return t || null;
}

function fechaCorta(f: FechaKey): string {
  return `${f.slice(8, 10)}/${f.slice(5, 7)}`;
}

/** Estado de UNA actividad en UN día. */
function ocurrencia(
  a: ActividadDTO,
  fecha: FechaKey,
  hoy: FechaKey,
  marca: MarcaManual | undefined,
  fuentes: FuentesDelRango,
  pospuestaDesde: FechaKey | null,
): OcurrenciaDTO {
  const conFuente = REGLAS_CON_FUENTE.has(a.regla);
  const futura = fecha > hoy;
  const ev = futura ? SIN_EVALUAR : conFuente ? evaluarFuente(a, fecha, fuentes) : SIN_EVALUAR;
  const apoyo = fecha === hoy ? fuentes.apoyoHoy?.[a.id] : undefined;

  let estado: EstadoOcurrencia;
  let origen: OcurrenciaDTO["origen"];
  if (marca) {
    estado = marca.estado;
    origen = "manual";
  } else if (futura) {
    estado = "futura";
    origen = conFuente ? "fuente" : "sin_fuente";
  } else if (ev.hecho) {
    estado = "hecha";
    origen = "fuente";
  } else if (ev.parcial) {
    estado = "parcial";
    origen = "fuente";
  } else {
    estado = fecha === hoy ? "pendiente" : "atrasada";
    origen = conFuente ? "fuente" : "sin_fuente";
  }

  return {
    actividadId: a.id,
    nombre: a.nombre,
    regla: a.regla,
    fecha,
    hora: a.hora,
    estado,
    origen,
    detalle: unirDetalle(pospuestaDesde ? `Pospuesta del ${fechaCorta(pospuestaDesde)}` : null, ev.detalle, apoyo),
    avance: ev.avance,
    href: hrefDeActividad(a),
    nota: marca?.nota ?? null,
    marcadoPor: marca?.marcadoPor ?? null,
    posponerA: marca?.posponerA ?? null,
  };
}

const claveMarca = (actividadId: string, fecha: FechaKey) => `${actividadId}|${fecha}`;

export interface EntradaMotor {
  /** Sólo las activas y visibles para el rol: el filtro es de la DB class. */
  actividades: ActividadDTO[];
  desde: FechaKey;
  hasta: FechaKey;
  hoy: FechaKey;
  /** Marcas cuya `fecha` o `posponerA` cae en el rango. */
  marcas: MarcaManual[];
  fuentes: FuentesDelRango;
}

function ordenar(a: OcurrenciaDTO, b: OcurrenciaDTO): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  if (a.hora !== b.hora) {
    if (a.hora === null) return 1;
    if (b.hora === null) return -1;
    return a.hora < b.hora ? -1 : 1;
  }
  return a.nombre.localeCompare(b.nombre, "es");
}

/** Todas las ocurrencias del rango, ordenadas por día, hora y nombre. */
export function calcularOcurrencias(e: EntradaMotor): OcurrenciaDTO[] {
  const marcas = new Map(e.marcas.map((m) => [claveMarca(m.actividadId, m.fecha), m]));
  const salida: OcurrenciaDTO[] = [];
  for (const a of e.actividades) {
    const fechas = new Set(fechasEnRango(a.recurrencia, e.desde, e.hasta));
    for (const f of fechas) {
      salida.push(ocurrencia(a, f, e.hoy, marcas.get(claveMarca(a.id, f)), e.fuentes, null));
    }
    // Pospuestas: reaparecen en su día nuevo (si ese día no tocaba ya).
    for (const m of e.marcas) {
      if (m.actividadId !== a.id || m.estado !== "pospuesta" || !m.posponerA) continue;
      if (m.posponerA < e.desde || m.posponerA > e.hasta || fechas.has(m.posponerA)) continue;
      fechas.add(m.posponerA);
      salida.push(ocurrencia(a, m.posponerA, e.hoy, marcas.get(claveMarca(a.id, m.posponerA)), e.fuentes, m.fecha));
    }
  }
  return salida.sort(ordenar);
}

/** ¿`fecha` es un día válido para marcar esta actividad? (natural o el nuevo de una pospuesta) */
export function esDiaDeLaActividad(a: ActividadDTO, fecha: FechaKey, marcas: MarcaManual[]): boolean {
  if (fechasEnRango(a.recurrencia, fecha, fecha).length > 0) return true;
  return marcas.some((m) => m.actividadId === a.id && m.estado === "pospuesta" && m.posponerA === fecha);
}

/** Rango que necesita «Hoy»: los días de arrastre de las atrasadas + hoy. */
export function rangoDeHoy(hoy: FechaKey): { desde: FechaKey; hasta: FechaKey } {
  return { desde: sumarDias(hoy, -DIAS_ARRASTRE_ATRASADAS), hasta: hoy };
}

/** «HH:MM» de Lima (UTC−5 fijo, sin horario de verano). */
export function horaDeLima(ahora: Date): string {
  return new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(11, 16);
}

const RESUELTAS: ReadonlySet<EstadoOcurrencia> = new Set(["hecha", "omitida", "pospuesta"]);

/**
 * «Hoy» a partir de las ocurrencias de `rangoDeHoy(hoy)`.
 * `cuenta.hechas` = resueltas (hecha, omitida o pospuesta): lo que hoy ya no pide nada.
 * `atrasadas` = atrasadas o parciales de los últimos 7 días.
 */
export function resumirHoy(ocurrencias: OcurrenciaDTO[], hoy: FechaKey, ahoraHora: string): ResumenAgendaHoy {
  const deHoy = ocurrencias.filter((o) => o.fecha === hoy);
  const desde = sumarDias(hoy, -DIAS_ARRASTRE_ATRASADAS);
  const atrasadas = ocurrencias.filter(
    (o) => o.fecha < hoy && o.fecha >= desde && (o.estado === "atrasada" || o.estado === "parcial"),
  );
  const hechas = deHoy.filter((o) => RESUELTAS.has(o.estado)).length;
  return {
    fecha: hoy,
    hoy: deHoy,
    atrasadas,
    cuenta: { total: deHoy.length, hechas, pendientes: deHoy.length - hechas, atrasadas: atrasadas.length },
    alertas: armarAlertasAgenda({ fecha: hoy, hoy: deHoy, atrasadas }, ahoraHora),
  };
}
