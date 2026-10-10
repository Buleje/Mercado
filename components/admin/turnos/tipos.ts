/**
 * Tipos y cuentas puras de la pestaña Turnos (Ventas & Caja › Turnos).
 *
 * Partido de `TurnosModule.tsx` (2.244 líneas) el 08-10. Lo que estaba copiado
 * dos veces dentro del módulo (estadísticas por cajero en «Cajeros» y en
 * «Productividad») vive aquí una sola vez. Sin React: se prueba con vitest.
 */

export type TurnoStatus = "ABIERTO" | "CERRADO";

export type Turno = {
  id: string;
  tenantId?: string;
  adminUserId: string;
  cashRegisterId?: string;
  inicioEfectivo: number;
  cierreEfectivo?: number;
  ventasTotal: number;
  status: TurnoStatus;
  abrioEn: string;
  cerroEn?: string;
  notas?: string;
  createdAt?: string;
  /** Nombre de quien atendió (lo pone el servidor; no depende de /api/admin-users). */
  cajeroNombre?: string;
  /** Contado − esperado del cierre, calculado por el servidor; null = turno sin caja vinculada. */
  diferencia?: number | null;
  esperado?: number | null;
  /** Lo cerró el cron de turnos olvidados, sin conteo. */
  cerradoPorSistema?: boolean;
};

export type Cajero = { id: string; username: string; name: string; role: string; active: boolean };

export type MetodoPago = { metodo: string; total: number };

/** Lo que devuelve GET /api/turnos/[id]/summary (sirve con el turno abierto o cerrado). */
export type ResumenServidor = {
  cantidadVentas: number;
  totalVendido: number;
  totalDescuentos: number;
  metodosPago: MetodoPago[];
  topProductos: { nombre: string; cantidad: number }[];
};

export type TurnoSummary = {
  turnoId: string;
  cajeroNombre: string;
  abrioEn: string;
  cerroEn?: string;
  totalVentas: number;
  cantidadVentas: number;
  ticketPromedio: number;
  inicioEfectivo: number;
  /** null = nadie contó (lo cerró el sistema): se muestra «sin conteo», nunca S/ 0.00. */
  cierreEfectivo: number | null;
  /** null = sin caja vinculada: no hay diferencia que mostrar. */
  diferencia: number | null;
  metodosPago: MetodoPago[];
  topProductos: { nombre: string; cantidad: number }[];
  ventasPorHora?: { hora: string; total: number }[];
  totalDescuentos: number;
};

// ── Reglas del negocio ───────────────────────────────────────────────────────

/** Diferencia «alta»: más de S/ 20 o más del 5 % de lo esperado (pide nota al cerrar). */
export const DIFF_ANORMAL_ABS = 20;
export const DIFF_ANORMAL_PCT = 0.05;
/** El cron `turnos-zombie-close` cierra solo, sin conteo, a las 12 h. Avisamos 2 h antes. */
export const HORAS_CIERRE_SISTEMA = 12;
export const HORAS_AVISO_TURNO = 10;
export const PER_PAGE = 10;

export function esDiferenciaAnormal(diff: number, esperado: number): boolean {
  const abs = Math.abs(diff);
  const pct = esperado > 0 ? abs / esperado : 0;
  return abs > DIFF_ANORMAL_ABS || pct > DIFF_ANORMAL_PCT;
}

// ── Denominaciones del Sol (PEN), de mayor a menor ───────────────────────────

export const DENOMINACIONES_PEN: { valor: number; label: string; tipo: "billete" | "moneda" }[] = [
  { valor: 200, label: "S/ 200", tipo: "billete" },
  { valor: 100, label: "S/ 100", tipo: "billete" },
  { valor: 50, label: "S/ 50", tipo: "billete" },
  { valor: 20, label: "S/ 20", tipo: "billete" },
  { valor: 10, label: "S/ 10", tipo: "billete" },
  { valor: 5, label: "S/ 5", tipo: "moneda" },
  { valor: 2, label: "S/ 2", tipo: "moneda" },
  { valor: 1, label: "S/ 1", tipo: "moneda" },
  { valor: 0.5, label: "S/ 0.50", tipo: "moneda" },
  { valor: 0.2, label: "S/ 0.20", tipo: "moneda" },
  { valor: 0.1, label: "S/ 0.10", tipo: "moneda" },
];

export function calcularDesdeDenominaciones(counts: Record<string, number>): number {
  let total = 0;
  for (const d of DENOMINACIONES_PEN) total += d.valor * (counts[String(d.valor)] || 0);
  return Math.round(total * 100) / 100;
}

// ── Tiempo y nombres ─────────────────────────────────────────────────────────

export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function horasDesde(iso: string, ahora = Date.now()): number {
  return (ahora - new Date(iso).getTime()) / 3_600_000;
}

export function elapsedTime(iso: string, ahora = Date.now()): string {
  const diff = ahora - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return hrs > 0 ? `${hrs} h ${mins} min` : `${mins} min`;
}

/** «jueves 10/09» (formato del negocio, días escritos a mano). */
export function diaConFecha(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${DIAS_LARGOS[d.getDay()]} ${dd}/${mm}`;
}

/**
 * Comparativo de un turno contra el día ANTERIOR AL TURNO y el promedio de los 7
 * días previos. La fecha es la del turno, no la de hoy: abierto desde el
 * historial, un turno de ayer ya no se compara consigo mismo. El propio turno
 * nunca entra en la cuenta.
 */
export function comparativoDelTurno(
  historial: Turno[],
  turno: { turnoId: string; abrioEn: string; totalVentas: number },
) {
  const inicioDia = new Date(turno.abrioEn); inicioDia.setHours(0, 0, 0, 0);
  const diaAnterior = new Date(inicioDia); diaAnterior.setDate(diaAnterior.getDate() - 1);
  const hace7 = new Date(inicioDia); hace7.setDate(hace7.getDate() - 7);
  const otros = historial.filter((t) => t.id !== turno.turnoId);
  const ventasDiaAnterior = otros
    .filter((t) => new Date(t.abrioEn).toDateString() === diaAnterior.toDateString())
    .reduce((s, t) => s + t.ventasTotal, 0);
  const ult7 = otros.filter((t) => {
    const d = new Date(t.abrioEn).getTime();
    return d >= hace7.getTime() && d < inicioDia.getTime();
  });
  const prom7 = ult7.length > 0 ? ult7.reduce((s, t) => s + t.ventasTotal, 0) / ult7.length : 0;
  return {
    diaAnterior: diaAnterior.toISOString(),
    ventasDiaAnterior,
    prom7,
    pctDiaAnterior: ventasDiaAnterior > 0 ? ((turno.totalVentas - ventasDiaAnterior) / ventasDiaAnterior) * 100 : 0,
    pctProm: prom7 > 0 ? ((turno.totalVentas - prom7) / prom7) * 100 : 0,
  };
}

export function duracionHoras(t: Pick<Turno, "abrioEn" | "cerroEn">): number {
  if (!t.abrioEn || !t.cerroEn) return 0;
  return (new Date(t.cerroEn).getTime() - new Date(t.abrioEn).getTime()) / 3_600_000;
}

export function nombreCajero(t: Pick<Turno, "adminUserId" | "cajeroNombre">, cajeros: Cajero[]): string {
  if (t.cajeroNombre && t.cajeroNombre !== "—") return t.cajeroNombre;
  const c = cajeros.find((x) => x.id === t.adminUserId || x.username === t.adminUserId);
  return c ? c.name || c.username : "Yo mismo";
}

function hashNombre(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}
export const cajeroColor = (name: string) => `hsl(${hashNombre(name)}, 50%, 90%)`;
export const cajeroColorText = (name: string) => `hsl(${hashNombre(name)}, 60%, 30%)`;

export function esMesActual(iso: string, ahora = new Date()): boolean {
  const d = new Date(iso);
  return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
}

/** Turno que pide revisión: diferencia alta o cerrado por el sistema sin conteo. */
export function turnoConAlerta(t: Turno): boolean {
  if (t.cerradoPorSistema) return true;
  if (t.diferencia == null) return false;
  return esDiferenciaAnormal(t.diferencia, t.esperado ?? 0);
}

// ── Estadística por cajero (una sola fuente para «Cajeros» y «Por cajero») ───

export type StatCajero = {
  id: string;
  name: string;
  turnos: number;
  ventasTotal: number;
  horasTotales: number;
  /** Suma de las diferencias del servidor (los turnos sin dato no suman). */
  difCaja: number;
  ventasPorHora: number;
  ticketPromedio: number;
};

export function statsPorCajero(historial: Turno[], cajeros: Cajero[]): StatCajero[] {
  const mapa = new Map<string, StatCajero>();
  for (const t of historial) {
    const id = t.adminUserId || "Desconocido";
    const prev = mapa.get(id) ?? {
      id, name: nombreCajero(t, cajeros), turnos: 0, ventasTotal: 0, horasTotales: 0, difCaja: 0, ventasPorHora: 0, ticketPromedio: 0,
    };
    prev.turnos += 1;
    prev.ventasTotal += t.ventasTotal;
    prev.horasTotales += duracionHoras(t);
    if (t.diferencia != null) prev.difCaja += t.diferencia;
    mapa.set(id, prev);
  }
  return [...mapa.values()]
    .map((c) => ({
      ...c,
      ventasPorHora: c.horasTotales > 0 ? c.ventasTotal / c.horasTotales : 0,
      ticketPromedio: c.turnos > 0 ? c.ventasTotal / c.turnos : 0,
    }))
    .sort((a, b) => b.ventasPorHora - a.ventasPorHora);
}

// ── Filtros del historial (pegados a la tabla) ───────────────────────────────

export type PeriodoHistorial = "todo" | "7d" | "mes";
export type FiltrosHistorial = { periodo: PeriodoHistorial; cajero: string; soloAlertas: boolean };
export const FILTROS_INICIALES: FiltrosHistorial = { periodo: "todo", cajero: "", soloAlertas: false };

export function filtrarHistorial(historial: Turno[], f: FiltrosHistorial, ahora = new Date()): Turno[] {
  const hace7 = ahora.getTime() - 7 * 86_400_000;
  return historial.filter((t) => {
    if (f.cajero && t.adminUserId !== f.cajero) return false;
    if (f.soloAlertas && !turnoConAlerta(t)) return false;
    if (f.periodo === "7d" && new Date(t.abrioEn).getTime() < hace7) return false;
    if (f.periodo === "mes" && !esMesActual(t.abrioEn, ahora)) return false;
    return true;
  });
}

// ── Avisos de la pestaña ─────────────────────────────────────────────────────

export type AvisoTurnos =
  | { tipo: "turno-largo"; horas: number }
  | { tipo: "cerrados-por-sistema"; cantidad: number }
  | { tipo: "diferencias-altas"; cantidad: number };

/** Avisos que piden acción, del más urgente al menos (los turnos cerrados, de los últimos 30 días). */
export function avisosDeTurnos(activo: Turno | null, historial: Turno[], ahora = Date.now()): AvisoTurnos[] {
  const avisos: AvisoTurnos[] = [];
  if (activo) {
    const horas = horasDesde(activo.abrioEn, ahora);
    if (horas >= HORAS_AVISO_TURNO) avisos.push({ tipo: "turno-largo", horas: Math.floor(horas) });
  }
  const recientes = historial.filter((t) => ahora - new Date(t.abrioEn).getTime() <= 30 * 86_400_000);
  const porSistema = recientes.filter((t) => t.cerradoPorSistema).length;
  if (porSistema > 0) avisos.push({ tipo: "cerrados-por-sistema", cantidad: porSistema });
  const altas = recientes.filter((t) => !t.cerradoPorSistema && turnoConAlerta(t)).length;
  if (altas > 0) avisos.push({ tipo: "diferencias-altas", cantidad: altas });
  return avisos;
}
