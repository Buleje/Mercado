/**
 * trozas-disponibles — la madera rolliza viva, en cifras (pestaña «Trozas
 * disponibles», Brandon 2026-09-27).
 *
 * «Quiero saber de ese permiso qué especies hay: volumen, cantidad de trozas,
 * m³, pies tablares». Consumos ya contestaba «¿cuánto por permiso?»; esta
 * pestaña suma «¿de qué especie?» y «¿qué troza?», sin cargar la pantalla de la
 * sierra.
 *
 * UN criterio en toda la pantalla (revisión 2026-09-27): las cifras principales
 * son EN EL PATIO —lo recibido, lo que se puede aserrar—:
 *  · libre — recibida y sin lote: puede ir hoy a la sierra;
 *  · en lote — recibida y apartada en un lote de aserrío.
 * Lo SIN RECEPCIONAR (anotado, con la guía en la bandeja) va SIEMPRE aparte, en
 * su columna o su indicador, y nunca se suma a lo de arriba. Antes la fila de
 * un permiso decía 0 trozas y al abrirla mostraba 31: contaban cosas distintas.
 * Lo sin recepcionar no cuenta días en el patio (ADR-431, C7): su única fecha
 * es la del asiento.
 *
 * El pt es el aserrable al 56 % (`pieTablarAserrableDe`): de una troza no se
 * saca m³ × 424 (memoria `pt-de-rolliza-es-aserrable-no-424`). Se redondea en
 * CADA nivel desde sus m³, igual que «Por permiso»: la suma de las filas puede
 * diferir del total en unos pt de redondeo, nunca en m³ ni en trozas.
 *
 * PURO y client-safe.
 */

import type { HojaExcel } from "@/lib/export-excel";
import { formatDateNumeric } from "@/lib/format";
import { estaDisponible, type TrozaConsumible } from "./consumo-trozas";
import { pieTablarAserrableDe } from "./cubicacion";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { grafiaPreferida } from "./especies-catalogo";
import {
  TRAMOS_DIAS_PATIO,
  diasEnPatio,
  tramoDeDias,
  tramosEnCero,
  type TramoDias,
} from "./patio-dias";
import { filtrarPatio, type RangoPatio } from "./patio-filtros";
import type { FechaConDias, VolumenPatio } from "./patio-por-permiso";

export type EstadoDisponible = "libre" | "en-lote" | "sin-recepcionar";
export const ESTADOS_DISPONIBLE: readonly EstadoDisponible[] = [
  "libre",
  "en-lote",
  "sin-recepcionar",
];
export const ETIQUETA_ESTADO_DISPONIBLE: Record<EstadoDisponible, string> = {
  libre: "Libre",
  "en-lote": "En lote",
  "sin-recepcionar": "Sin recepcionar",
};

/** Días desde los que una troza del patio es «añeja» (el primer borde de la escala única). */
export const DIAS_ANEJA: number = TRAMOS_DIAS_PATIO[0];
/** El nombre de lo que no declara especie o permiso: nunca una fila vacía. */
export const SIN_ESPECIE = "Sin especie";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const vol = (t: TrozaConsumible) => {
  const v = Number(t.volumenM3 ?? 0);
  return Number.isFinite(v) ? v : 0;
};
const clave = (v: string | null | undefined) => (v ?? "").trim();
export const ptDe = (m3: number) => pieTablarAserrableDe(m3, RENDIMIENTO_META);

const isoDe = (v: string | Date | null | undefined): string | null => {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Las trozas vivas: en el patio (libre o en lote) o con la guía por recepcionar. */
export function trozasDisponibles(trozas: readonly TrozaConsumible[]): TrozaConsumible[] {
  return trozas.filter(estaDisponible);
}

export function estadoDisponible(t: TrozaConsumible): EstadoDisponible {
  if (t.guiaRecepcionada === false) return "sin-recepcionar";
  return t.loteAserrioId ? "en-lote" : "libre";
}

/** La fecha desde la que cuenta la pieza en el patio, con sus días. `null` si no está en el patio. */
function fechaEnPatio(t: TrozaConsumible, ahora: Date): FechaConDias | null {
  const dias = diasEnPatio(t, ahora);
  const fecha = isoDe(t.fechaRecepcion) ?? isoDe(t.fechaIngreso);
  return dias != null && fecha ? { fecha, dias } : null;
}
const masViejaEntre = (a: FechaConDias | null, b: FechaConDias | null) =>
  b == null ? a : a == null || b.dias > a.dias ? b : a;

// ── Filtro cruzado ───────────────────────────────────────────────────────────

export interface FiltroDisponibles {
  texto: string;
  permiso: readonly string[];
  especie: readonly string[];
  guia: readonly string[];
  estado: readonly EstadoDisponible[];
  tramos: readonly TramoDias[];
  largo?: RangoPatio;
  diametro?: RangoPatio;
}
export type CampoFiltroDisponibles = keyof FiltroDisponibles;

export const FILTRO_DISPONIBLES_VACIO: FiltroDisponibles = {
  texto: "",
  permiso: [],
  especie: [],
  guia: [],
  estado: [],
  tramos: [],
};

/**
 * Acota las trozas. `excepto` deja fuera UN campo: la tabla por permiso se
 * cuenta sin el filtro de permiso (si no, elegir uno escondería los demás y no
 * se podría cambiar de permiso desde la misma tabla). Igual la de especie.
 * OR adentro de un campo, AND entre campos: el autofiltro de Excel.
 */
export function filtrarDisponibles(
  trozas: readonly TrozaConsumible[],
  f: FiltroDisponibles,
  ahora: Date,
  excepto?: CampoFiltroDisponibles,
): TrozaConsumible[] {
  const usa = <K extends CampoFiltroDisponibles>(c: K): FiltroDisponibles[K] | undefined =>
    c === excepto ? undefined : f[c];
  const base = filtrarPatio(
    trozas,
    {
      texto: usa("texto"),
      permiso: usa("permiso"),
      especie: usa("especie"),
      guia: usa("guia"),
      tramos: usa("tramos"),
      largoM: usa("largo"),
      diametroCm: usa("diametro"),
    },
    ahora,
  );
  const estados = usa("estado") ?? [];
  return estados.length > 0 ? base.filter((t) => estados.includes(estadoDisponible(t))) : base;
}

// ── Resumen (los indicadores) ────────────────────────────────────────────────

export interface ResumenDisponibles {
  /** EN EL PATIO (libres + en lote): las cifras principales de toda la página. */
  enPatio: VolumenPatio & { pt: number };
  libres: VolumenPatio;
  enLote: VolumenPatio;
  /**
   * APARTE: su guía sigue en la bandeja. No suma a `enPatio` ni a nada de
   * arriba. `permisosSolo`/`especiesSolo` = los que tienen TODO sin recepcionar
   * (no aparecen en `permisos`/`especies`, que son del patio).
   */
  sinRecepcionar: VolumenPatio & { guias: number; permisosSolo: number; especiesSolo: number };
  /** Todo lo que sigue es del PATIO (lo recibido). */
  permisos: number;
  /** Trozas en el patio que no declaran permiso. */
  sinPermiso: number;
  especies: number;
  guias: number;
  proveedores: number;
  /** Promedio y mayor m³ por troza: dicen si la pila es de palo grueso o menudo. */
  promedioM3: number | null;
  mayorM3: number | null;
  /** En el patio desde hace `DIAS_ANEJA` días o más. */
  anejas: VolumenPatio;
  masVieja: FechaConDias | null;
}

export function resumenDisponibles(
  trozas: readonly TrozaConsumible[],
  ahora: Date,
): ResumenDisponibles {
  const cubeta = () => ({ trozas: 0, m3: 0 });
  const acc = {
    libre: cubeta(),
    "en-lote": cubeta(),
    "sin-recepcionar": cubeta(),
    anejas: cubeta(),
  };
  const permisos = new Set<string>();
  const permisosPend = new Set<string>();
  const especies = new Set<string>();
  const especiesPend = new Set<string>();
  const guias = new Set<string>();
  const guiasPend = new Set<string>();
  const proveedores = new Set<string>();
  let sinPermiso = 0;
  let mayor: number | null = null;
  let masVieja: FechaConDias | null = null;

  for (const t of trozas) {
    const v = vol(t);
    const estado = estadoDisponible(t);
    acc[estado].trozas += 1;
    acc[estado].m3 += v;
    const guia = clave(t.gtfNumber) || t.woodEntryId;
    const permiso = clave(t.permiso);
    const esp = claveEspecie(t.especieComun);
    if (estado === "sin-recepcionar") {
      guiasPend.add(guia);
      if (permiso) permisosPend.add(permiso);
      if (esp) especiesPend.add(esp);
      continue;
    }
    guias.add(guia);
    if (permiso) permisos.add(permiso);
    else sinPermiso += 1;
    if (esp) especies.add(esp);
    if (clave(t.proveedor)) proveedores.add(clave(t.proveedor));
    if (v > 0 && (mayor == null || v > mayor)) mayor = v;
    const f = fechaEnPatio(t, ahora);
    masVieja = masViejaEntre(masVieja, f);
    if (f && f.dias >= DIAS_ANEJA) {
      acc.anejas.trozas += 1;
      acc.anejas.m3 += v;
    }
  }

  const cerrar = (x: VolumenPatio): VolumenPatio => ({ trozas: x.trozas, m3: r4(x.m3) });
  const enPatioTrozas = acc.libre.trozas + acc["en-lote"].trozas;
  const enPatioM3 = acc.libre.m3 + acc["en-lote"].m3;
  return {
    enPatio: { trozas: enPatioTrozas, m3: r4(enPatioM3), pt: ptDe(enPatioM3) },
    libres: cerrar(acc.libre),
    enLote: cerrar(acc["en-lote"]),
    sinRecepcionar: {
      ...cerrar(acc["sin-recepcionar"]),
      guias: guiasPend.size,
      permisosSolo: [...permisosPend].filter((p) => !permisos.has(p)).length,
      especiesSolo: [...especiesPend].filter((e) => !especies.has(e)).length,
    },
    permisos: permisos.size,
    sinPermiso,
    especies: especies.size,
    guias: guias.size,
    proveedores: proveedores.size,
    promedioM3: enPatioTrozas > 0 ? r4(enPatioM3 / enPatioTrozas) : null,
    mayorM3: mayor == null ? null : r4(mayor),
    anejas: cerrar(acc.anejas),
    masVieja,
  };
}

// ── Por especie ──────────────────────────────────────────────────────────────

export interface FilaEspecieDisponible {
  /** `claveEspecie` («» = sin especie): es el valor que filtra. */
  clave: string;
  especie: string;
  /** EN EL PATIO (libres + en lote), igual que la fila de «Por permiso». */
  trozas: number;
  m3: number;
  pt: number;
  /** Cuánto del m³ EN EL PATIO de la tabla es de esta especie (0-100, un decimal). */
  pctM3: number;
  libres: number;
  enLote: number;
  /** APARTE: no suma a `trozas`/`m3`. */
  sinRecepcionar: VolumenPatio;
  /** Permisos distintos con esta especie en el patio. */
  permisos: number;
  masVieja: FechaConDias | null;
}

/**
 * Una fila por especie (por su clave, con la grafía que más se usa). Lo sin
 * recepcionar va en su columna: una especie con TODO sin recepcionar sale con
 * 0 en el patio, no desaparece. Orden: más m³ en el patio primero.
 */
export function porEspecieDisponible(
  trozas: readonly TrozaConsumible[],
  ahora: Date,
): FilaEspecieDisponible[] {
  type Acc = {
    grafias: Map<string, number>;
    libres: VolumenPatio;
    enLote: VolumenPatio;
    sinRec: VolumenPatio;
    permisos: Set<string>;
    masVieja: FechaConDias | null;
  };
  const m = new Map<string, Acc>();
  let totalM3 = 0;
  for (const t of trozas) {
    const k = claveEspecie(t.especieComun);
    const a: Acc = m.get(k) ?? {
      grafias: new Map(),
      libres: { trozas: 0, m3: 0 },
      enLote: { trozas: 0, m3: 0 },
      sinRec: { trozas: 0, m3: 0 },
      permisos: new Set<string>(),
      masVieja: null,
    };
    const texto = clave(t.especieComun);
    if (texto) a.grafias.set(texto, (a.grafias.get(texto) ?? 0) + 1);
    const v = vol(t);
    const estado = estadoDisponible(t);
    const cubeta =
      estado === "sin-recepcionar" ? a.sinRec : estado === "en-lote" ? a.enLote : a.libres;
    cubeta.trozas += 1;
    cubeta.m3 += v;
    if (estado !== "sin-recepcionar") {
      totalM3 += v;
      if (clave(t.permiso)) a.permisos.add(clave(t.permiso));
      a.masVieja = masViejaEntre(a.masVieja, fechaEnPatio(t, ahora));
    }
    m.set(k, a);
  }
  return [...m.entries()]
    .map(([k, a]) => {
      const m3 = a.libres.m3 + a.enLote.m3;
      return {
        clave: k,
        especie: k
          ? grafiaPreferida([...a.grafias.entries()].map(([texto, usos]) => ({ texto, usos })))
          : SIN_ESPECIE,
        trozas: a.libres.trozas + a.enLote.trozas,
        m3: r4(m3),
        pt: ptDe(m3),
        pctM3: totalM3 > 0 ? Math.round((m3 / totalM3) * 1000) / 10 : 0,
        libres: a.libres.trozas,
        enLote: a.enLote.trozas,
        sinRecepcionar: { trozas: a.sinRec.trozas, m3: r4(a.sinRec.m3) },
        permisos: a.permisos.size,
        masVieja: a.masVieja,
      };
    })
    .sort(
      (x, y) =>
        y.m3 - x.m3 ||
        y.sinRecepcionar.m3 - x.sinRecepcionar.m3 ||
        y.trozas - x.trozas ||
        x.especie.localeCompare(y.especie, "es"),
    );
}

/** Las especies de UN permiso (`null` = lo que no declara permiso). Suman la fila del permiso. */
export function especiesDelPermiso(
  trozas: readonly TrozaConsumible[],
  permiso: string | null,
  ahora: Date,
): FilaEspecieDisponible[] {
  const k = clave(permiso);
  return porEspecieDisponible(
    trozas.filter((t) => clave(t.permiso) === k),
    ahora,
  );
}

// ── Gráficos ─────────────────────────────────────────────────────────────────

export interface BarraAntiguedad {
  tramo: TramoDias;
  trozas: number;
  m3: number;
}

/** Cuántas trozas del patio hay en cada tramo de días. Lo sin recepcionar va aparte. */
export function antiguedadDisponible(
  trozas: readonly TrozaConsumible[],
  ahora: Date,
): { tramos: BarraAntiguedad[]; sinFecha: number; sinRecepcionar: VolumenPatio } {
  const cuenta = tramosEnCero();
  const m3 = tramosEnCero();
  let sinFecha = 0;
  const sinRec = { trozas: 0, m3: 0 };
  for (const t of trozas) {
    if (estadoDisponible(t) === "sin-recepcionar") {
      sinRec.trozas += 1;
      sinRec.m3 += vol(t);
      continue;
    }
    const tramo = tramoDeDias(diasEnPatio(t, ahora));
    if (!tramo) {
      sinFecha += 1;
      continue;
    }
    cuenta[tramo] += 1;
    m3[tramo] += vol(t);
  }
  return {
    tramos: (Object.keys(cuenta) as TramoDias[]).map((tramo) => ({
      tramo,
      trozas: cuenta[tramo],
      m3: r4(m3[tramo]),
    })),
    sinFecha,
    sinRecepcionar: { trozas: sinRec.trozas, m3: r4(sinRec.m3) },
  };
}

export interface PilaPermisoEspecie {
  /** Las especies que tienen tramo propio (las de más m³ en el patio); el resto va en «Otras». */
  especies: { clave: string; especie: string }[];
  hayOtras: boolean;
  /** Sólo los permisos con madera EN EL PATIO (lo sin recepcionar no entra al gráfico). */
  filas: {
    permiso: string | null;
    m3: number;
    porEspecie: Record<string, number>;
    otras: number;
  }[];
}

/** m³ EN EL PATIO de cada permiso, partido por especie, para las barras apiladas. */
export function pilaPermisoEspecie(
  trozas: readonly TrozaConsumible[],
  ahora: Date,
  tope = 6,
): PilaPermisoEspecie {
  const ranking = porEspecieDisponible(trozas, ahora).filter((e) => e.m3 > 0);
  const propias = ranking.slice(0, tope);
  const conTramo = new Set(propias.map((e) => e.clave));
  const filas = new Map<string, PilaPermisoEspecie["filas"][number]>();
  for (const t of trozas) {
    if (estadoDisponible(t) === "sin-recepcionar") continue;
    const p = clave(t.permiso);
    const fila = filas.get(p) ?? { permiso: p || null, m3: 0, porEspecie: {}, otras: 0 };
    const k = claveEspecie(t.especieComun);
    const v = vol(t);
    fila.m3 += v;
    if (conTramo.has(k)) fila.porEspecie[k] = (fila.porEspecie[k] ?? 0) + v;
    else fila.otras += v;
    filas.set(p, fila);
  }
  return {
    especies: propias.map((e) => ({ clave: e.clave, especie: e.especie })),
    hayOtras: ranking.length > tope,
    filas: [...filas.values()]
      .map((f) => ({
        ...f,
        m3: r4(f.m3),
        otras: r4(f.otras),
        porEspecie: Object.fromEntries(Object.entries(f.porEspecie).map(([k, v]) => [k, r4(v)])),
      }))
      .sort((a, b) => b.m3 - a.m3),
  };
}

// ── Excel ────────────────────────────────────────────────────────────────────

export const HOJA_POR_ESPECIE = "Por especie";

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const diaNumerico = (iso: string | undefined) =>
  iso ? formatDateNumeric(iso, { soloFecha: true }) : null;

/**
 * La hoja «Por especie» del Excel del patio. Mismo criterio y MISMAS
 * cabeceras que la hoja «Por permiso» (`patio-excel`): en el patio primero,
 * lo por recepcionar en columnas aparte. Números como número.
 */
export function hojaPorEspecie(filas: readonly FilaEspecieDisponible[]): HojaExcel {
  return {
    nombre: HOJA_POR_ESPECIE,
    filas: filas.map((f) => ({
      Especie: f.especie,
      "Trozas en patio": f.trozas,
      "m³ en patio": r3(f.m3),
      "≈pt aserrable (derivado 56 %)": f.pt,
      Libres: f.libres,
      "En lote": f.enLote,
      "Por recepcionar (trozas)": f.sinRecepcionar.trozas,
      "Por recepcionar (m³)": r3(f.sinRecepcionar.m3),
      Permisos: f.permisos,
      "Más vieja en patio": diaNumerico(f.masVieja?.fecha),
      "Días en patio": f.masVieja?.dias ?? null,
    })),
  };
}

/**
 * El permiso en corto, para el eje de un gráfico: la zona y el año-número
 * («10-HUA-PUE/PER-FMP-2026-007» → «10-HUA-PUE · 2026-007»). El código entero
 * va en el tooltip y en las tablas.
 */
export function permisoCorto(permiso: string | null): string {
  if (!permiso) return "Sin permiso";
  const partes = permiso.split("/");
  const cola = partes[partes.length - 1]?.match(/(\d{4}-\d+)$/)?.[1];
  if (partes.length > 1 && cola) return `${partes[0]} · ${cola}`;
  return permiso.length > 22 ? `${permiso.slice(0, 21)}…` : permiso;
}
