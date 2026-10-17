/**
 * lib/planificacion/calculos.ts — las cuentas del plan de la empresa (ADR-497).
 *
 * Puro y compartido: lo dibuja la pantalla y lo imprime el plan, así que la
 * participación de un socio o los meses para recuperar la inversión salen de
 * UNA sola fórmula. Fechas `AAAA-MM-DD` en UTC; el «hoy» lo pasa quien llama
 * (`limaDateKey()`).
 */
import type { DatosPlan, DatosSeccion, SeccionPlan } from "@/lib/planificacion/secciones";
import { BLOQUES_LIENZO, CATEGORIAS_INVERSION, CUADRANTES_FODA } from "@/lib/planificacion/secciones";

type Socio = DatosSeccion<"socios">["items"][number];
type Licencia = DatosSeccion<"licencias">["items"][number];
type Objetivo = DatosSeccion<"objetivos">["items"][number];

const redondear2 = (n: number) => Math.round(n * 100) / 100;

// ── Socios ──────────────────────────────────────────────────────────────────

export interface ParticipacionSocio {
  id: string;
  nombre: string;
  porcentaje: number;
  /** `manual` = lo escribiste; `aporte` = sale de lo que puso; `igual` = nadie puso nada. */
  origen: "manual" | "aporte" | "igual";
}

export interface Participacion {
  socios: ParticipacionSocio[];
  total: number;
  /** Suma 100 % (con tolerancia de 0,01 punto). */
  cuadra: boolean;
}

/**
 * Lo escrito a mano manda; el resto se reparte lo que queda según el aporte
 * (y en partes iguales si ninguno de ellos aportó plata).
 */
export function participacion(socios: readonly Socio[]): Participacion {
  if (socios.length === 0) return { socios: [], total: 0, cuadra: true };
  const manuales = socios.filter((s) => s.porcentaje !== null);
  const libres = socios.filter((s) => s.porcentaje === null);
  const sumaManual = manuales.reduce((a, s) => a + (s.porcentaje ?? 0), 0);
  const resto = Math.max(0, 100 - sumaManual);
  const aporteLibres = libres.reduce((a, s) => a + s.aporte, 0);

  const filas = socios.map<ParticipacionSocio>((s) => {
    if (s.porcentaje !== null) return { id: s.id, nombre: s.nombre, porcentaje: redondear2(s.porcentaje), origen: "manual" };
    if (aporteLibres > 0) return { id: s.id, nombre: s.nombre, porcentaje: redondear2((resto * s.aporte) / aporteLibres), origen: "aporte" };
    return { id: s.id, nombre: s.nombre, porcentaje: redondear2(resto / libres.length), origen: "igual" };
  });
  const total = redondear2(filas.reduce((a, f) => a + f.porcentaje, 0));
  return { socios: filas, total, cuadra: Math.abs(total - 100) <= 0.01 * socios.length };
}

// ── Inversión ───────────────────────────────────────────────────────────────

export interface TotalesInversion {
  total: number;
  porCategoria: { categoria: (typeof CATEGORIAS_INVERSION)[number]; monto: number }[];
  /** `socio:<id>` se nombra con el socio; el resto con su palabra. */
  porFuente: { fuente: string; etiqueta: string; monto: number }[];
  aportesSocios: number;
  /** Inversión − aportes de los socios: lo que se cubrió con préstamo, propio u otro. Negativo = sobra aporte. */
  sinCubrirPorSocios: number;
  /** Meses para recuperar la inversión con la ganancia que esperas, o null si no la escribiste. */
  mesesRecupero: number | null;
}

export function etiquetaFuente(fuente: string, socios: readonly Socio[]): string {
  if (fuente.startsWith("socio:")) {
    const s = socios.find((x) => `socio:${x.id}` === fuente);
    return s ? `Aporte de ${s.nombre}` : "Aporte de un socio";
  }
  if (fuente === "prestamo") return "Préstamo";
  if (fuente === "propio") return "Fondos propios";
  return "Otro";
}

export function totalesInversion(inversion: DatosSeccion<"inversion">, socios: readonly Socio[]): TotalesInversion {
  const total = redondear2(inversion.items.reduce((a, i) => a + i.monto, 0));
  const porCategoria = CATEGORIAS_INVERSION.map((categoria) => ({
    categoria,
    monto: redondear2(inversion.items.filter((i) => i.categoria === categoria).reduce((a, i) => a + i.monto, 0)),
  })).filter((c) => c.monto > 0);
  const fuentes = new Map<string, number>();
  for (const i of inversion.items) fuentes.set(i.fuente, (fuentes.get(i.fuente) ?? 0) + i.monto);
  const porFuente = [...fuentes.entries()]
    .map(([fuente, monto]) => ({ fuente, etiqueta: etiquetaFuente(fuente, socios), monto: redondear2(monto) }))
    .sort((a, b) => b.monto - a.monto);
  const aportesSocios = redondear2(socios.reduce((a, s) => a + s.aporte, 0));
  const g = inversion.gananciaMensualEsperada;
  return {
    total,
    porCategoria,
    porFuente,
    aportesSocios,
    sinCubrirPorSocios: redondear2(total - aportesSocios),
    mesesRecupero: g && g > 0 && total > 0 ? Math.ceil(total / g) : null,
  };
}

// ── Fechas ──────────────────────────────────────────────────────────────────

/** Días de `desde` a `hasta` (claves `AAAA-MM-DD`), aritmética en UTC. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// ── Licencias ───────────────────────────────────────────────────────────────

export type EstadoLicencia = "pendiente" | "vencida" | "por-vencer" | "vigente" | "sin-vencimiento";
/** Con cuántos días de anticipación avisa. */
export const DIAS_AVISO_LICENCIA = 30;

export function estadoLicencia(l: Licencia, hoy: string): { estado: EstadoLicencia; dias: number | null } {
  if (!l.tramitada) return { estado: "pendiente", dias: null };
  if (!l.vence) return { estado: "sin-vencimiento", dias: null };
  const dias = diasEntre(hoy, l.vence);
  if (dias < 0) return { estado: "vencida", dias };
  if (dias <= DIAS_AVISO_LICENCIA) return { estado: "por-vencer", dias };
  return { estado: "vigente", dias };
}

// ── Objetivos ───────────────────────────────────────────────────────────────

/** El avance escrito manda; si no, las acciones hechas; sin acciones, hecho = 100. */
export function avanceObjetivo(o: Objetivo): number {
  if (o.avance !== null) return o.avance;
  if (o.acciones.length > 0) return Math.round((o.acciones.filter((a) => a.hecha).length * 100) / o.acciones.length);
  return o.estado === "hecho" ? 100 : 0;
}

export function objetivoAtrasado(o: Objetivo, hoy: string): boolean {
  return Boolean(o.fin) && o.estado !== "hecho" && o.estado !== "pausado" && diasEntre(hoy, o.fin) < 0;
}

/** Trimestre `AAAA-T1..T4` de la fecha de fin (o de inicio); `sin-fecha` si no tiene. */
export function trimestreDe(o: Objetivo): string {
  const f = o.fin || o.inicio;
  if (!f) return "sin-fecha";
  const mes = Number(f.slice(5, 7));
  return `${f.slice(0, 4)}-T${Math.ceil(mes / 3)}`;
}

// ── Cuánto del plan está escrito ────────────────────────────────────────────

const lleno = (v: string) => v.trim().length > 0;
const parte = (hechas: number, total: number) => (total === 0 ? 0 : Math.round((hechas * 100) / total));

/** 0-100: qué tanto de la sección está escrito. Explicable en una línea. */
export function llenado<S extends SeccionPlan>(seccion: S, datos: DatosSeccion<S>): number {
  const d = datos as DatosPlan[SeccionPlan];
  switch (seccion) {
    case "ficha": {
      const f = d as DatosPlan["ficha"];
      const campos = [f.razonSocial, f.tipoSociedad, f.regimenTributario, f.rubro, f.tipoNegocio, f.fechaInicio, f.horario, f.descripcion];
      return parte(campos.filter(lleno).length, campos.length);
    }
    case "identidad": {
      const i = d as DatosPlan["identidad"];
      const partes = [lleno(i.mision), lleno(i.vision), i.valores.length > 0, lleno(i.propuestaValor), lleno(i.clienteIdeal)];
      return parte(partes.filter(Boolean).length, partes.length);
    }
    case "lienzo": {
      const l = d as DatosPlan["lienzo"];
      return parte(BLOQUES_LIENZO.filter((b) => l[b].length > 0).length, BLOQUES_LIENZO.length);
    }
    case "foda": {
      const f = d as DatosPlan["foda"];
      return parte(CUADRANTES_FODA.filter((c) => f[c].length > 0).length, CUADRANTES_FODA.length);
    }
    case "espacios": {
      const e = d as DatosPlan["espacios"];
      return parte(Number(e.croquis.length > 0) + Number(e.zonas.length > 0), 2);
    }
    case "politicas": {
      const p = d as DatosPlan["politicas"];
      return parte(Number(p.items.length > 0) + Number(p.protocolo.length > 0) + Number(p.preguntas.length > 0), 3);
    }
    case "organizacion":
      return (d as DatosPlan["organizacion"]).cargos.length > 0 ? 100 : 0;
    default:
      return ((d as { items: unknown[] }).items?.length ?? 0) > 0 ? 100 : 0;
  }
}

/** Promedio de las secciones que el rol puede ver. */
export function llenadoGeneral(plan: Partial<DatosPlan>): number {
  const filas = (Object.keys(plan) as SeccionPlan[]).map((s) => llenado(s, plan[s] as DatosSeccion<typeof s>));
  return filas.length === 0 ? 0 : Math.round(filas.reduce((a, n) => a + n, 0) / filas.length);
}
