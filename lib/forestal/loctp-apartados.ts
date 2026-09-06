/**
 * loctp-apartados.ts — los dos APARTADOS del Libro de Operaciones del CTP.
 *
 * El formato oficial (RDE N° D000025-2023-MIDAGRI-SERFOR-DE) no son sólo las
 * cuatro secciones de movimientos y los tres cuadros resumen: además pide dos
 * apartados que hasta ahora el libro declaraba vacíos.
 *
 * - **Apartado 1 · Fuente de origen o procedencia de la madera.** El registro
 *   NUMERADO de las fuentes que amparan la materia prima. La columna (5) de la
 *   Sección 1 —"N° de fuente de origen/procedencia"— apunta a este registro: sin
 *   él, ese casillero es un número que no referencia nada.
 * - **Apartado 2 · Retrozado.** El seccionado de trozas dentro de la planta
 *   (ADR-313). El dato YA se registra —`WoodEntryTroza.trozaOrigenId`—, pero el
 *   export lo declaraba como "no registrado en este módulo".
 *
 * PURO y client-safe (sin prisma, sin fetch): lo consumen el export a Excel y la
 * pantalla de Cuadros SERFOR con los MISMOS números.
 */

import { tomar } from "./serfor-gtf";

// ═══════════════════════════════════════════════════════════════════════════
// Apartado 1 — Fuente de origen o procedencia de la madera
// ═══════════════════════════════════════════════════════════════════════════

/** Un ingreso, con lo que hace falta para saber de qué fuente vino. */
export interface IngresoParaFuente {
  id?: string | null;
  originType?: string | null;
  originSourceNumber?: string | null;
  originCode?: string | null;
  providerName?: string | null;
  providerDocument?: string | null;
  originRegion?: string | null;
  originDistrict?: string | null;
  volumeM3?: number | string | null;
  /** Fecha del ingreso: define el ORDEN del registro (ver `derivarFuentes`). */
  entryDate?: string | Date | null;
  /** La ficha oficial de SERFOR tal como se guardó (`WoodEntry.serforGtf`). */
  serforGtf?: unknown;
}

/** Una fila del Apartado 1 — los 7 casilleros del formato. */
export interface FuenteOrigen {
  /** (1) N° de registro: el que la Sección 1 referencia en su casillero (5). */
  nro: number;
  /** (2) Fuente de origen/procedencia: concesión, permiso, plantación… */
  fuente: string;
  /** (3) Titular de la fuente. */
  titular: string;
  /** (4) Código del título habilitante. */
  codigoTitulo: string;
  /** (5) N° de resolución que aprueba el plan de manejo (PO/PMFI/DEMA). */
  resolucion: string;
  /** (6) RUC del titular. */
  ruc: string;
  /** (7) Procedencia: dónde queda la fuente. */
  procedencia: string;
  /** Lo que el N° declarado en la guía dice, cuando lo dice. No es del formato. */
  numeroDeclarado: string;
  /** Cuántos ingresos ampara — para la pantalla, no para el formato. */
  ingresos: number;
  /** m³ que entraron por esta fuente en el período. */
  volumenM3: number;
}

/** Lo que devuelve `derivarFuentes`: el registro y el índice ingreso → N°. */
export interface RegistroFuentes {
  fuentes: FuenteOrigen[];
  /** ingresoId → N° de registro del Apartado 1. */
  numeroPorIngreso: Map<string, number>;
}

/** `originType` del libro → nombre de la fuente tal como la nombra el formato. */
const FUENTE_POR_ORIGEN: Record<string, string> = {
  concesion: "Concesión forestal",
  predio_privado: "Predio privado",
  comunidad_nativa: "Comunidad nativa (permiso)",
  reforestacion: "Plantación forestal registrada",
  retroaserradero: "Re-entrada de otro CTP",
  otro: "Otro",
};

/** Fecha date-only en ISO, en UTC (bug off-by-one de Lima). */
function fechaIso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const txt = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clave = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** La ficha de SERFOR guardada en el ingreso, si se puede leer como objeto. */
function fichaDe(ingreso: IngresoParaFuente): Record<string, unknown> | null {
  const f = ingreso.serforGtf;
  return f && typeof f === "object" && !Array.isArray(f) ? (f as Record<string, unknown>) : null;
}

/**
 * El RUC del titular de la fuente.
 *
 * OJO: `rucInstancia` de la ficha es el de la **ARFFS que registra la guía**, no
 * el del titular — ponerlo acá declararía que el bosque es de la autoridad. El
 * dato real vive en el campo crudo "RUC del titular" cuando SERFOR lo publica; si
 * no está, se cae al documento del proveedor de la guía.
 */
function rucTitular(ingreso: IngresoParaFuente, ficha: Record<string, unknown> | null): string {
  const campos = ficha?.campos;
  if (campos && typeof campos === "object") {
    const crudo = tomar(campos as Record<string, string>, "RUC del titular", "RUC titular");
    if (crudo) return crudo.trim();
  }
  return txt(ingreso.providerDocument);
}

/**
 * Deriva el Apartado 1 de los ingresos del período.
 *
 * Se agrupa por **lo que identifica la fuente** —resolución + título + titular—,
 * no por proveedor: el mismo aserradero puede comprarle al mismo titular madera
 * de dos concesiones distintas, y en el libro son dos fuentes.
 *
 * ## El N° tiene que ser ESTABLE
 *
 * Se numera por la fecha del PRIMER ingreso de cada fuente, no por el orden en
 * que el listado devuelve las filas. El listado viene por `entryDate desc`, así
 * que numerar por aparición hacía que un ingreso nuevo de una fuente nueva se
 * llevara el N° 1 y corriera a todas las demás: el libro de julio y el de agosto
 * se contradecían sobre quién es la fuente 1.
 *
 * Cronológico es lo que un folio significa —la fuente que entró primero es la
 * primera— y no depende de cómo llegue el array. Desempate por clave para que
 * dos fuentes del mismo día tampoco dependan del orden (auditoría 2026-08-01).
 */
export function derivarFuentes(ingresos: readonly IngresoParaFuente[]): RegistroFuentes {
  const porClave = new Map<string, FuenteOrigen>();
  const numeroPorIngreso = new Map<string, number>();
  /** clave → fecha del ingreso más viejo de esa fuente. */
  const primerIngreso = new Map<string, string>();
  /** ingresoId → clave de su fuente, para numerar al final. */
  const porIngreso = new Map<string, string>();

  for (const i of ingresos) {
    const ficha = fichaDe(i);
    const titular = txt(ficha?.titular) || txt(i.providerName);
    const codigoTitulo = txt(ficha?.numeroTitulo);
    const resolucion = txt(ficha?.numeroResolucion);
    const fuente =
      txt(ficha?.origenRecurso) || FUENTE_POR_ORIGEN[txt(i.originType)] || txt(i.originType) || "";
    const procedencia =
      [txt(ficha?.departamento) || txt(i.originRegion), txt(ficha?.distrito) || txt(i.originDistrict)]
        .filter(Boolean)
        .join(" · ");

    // Sin NADA que identifique la fuente no se inventa una fila: el ingreso queda
    // sin N° y el chequeo de completitud lo va a marcar (que es lo correcto).
    const id = clave([resolucion, codigoTitulo, titular].join("|"));
    if (id === "||") continue;

    const previa = porClave.get(id);
    const fila: FuenteOrigen = previa ?? {
      // Provisional: el definitivo se asigna al final, por fecha (ver arriba).
      nro: 0,
      fuente,
      titular,
      codigoTitulo,
      resolucion,
      ruc: rucTitular(i, ficha),
      procedencia,
      numeroDeclarado: txt(i.originSourceNumber),
      ingresos: 0,
      volumenM3: 0,
    };
    if (!previa) porClave.set(id, fila);
    else {
      // Se completa con el primer ingreso que traiga cada dato: una guía puede
      // venir sin resolución y la siguiente de la misma fuente sí traerla.
      if (!fila.fuente && fuente) fila.fuente = fuente;
      if (!fila.ruc) fila.ruc = rucTitular(i, ficha);
      if (!fila.procedencia && procedencia) fila.procedencia = procedencia;
      if (!fila.numeroDeclarado && i.originSourceNumber) fila.numeroDeclarado = txt(i.originSourceNumber);
    }
    fila.ingresos += 1;
    fila.volumenM3 = Number((fila.volumenM3 + num(i.volumeM3)).toFixed(4));
    // La fecha más VIEJA de la fuente: es la que define su lugar en el registro.
    const fecha = fechaIso(i.entryDate);
    if (fecha && (!primerIngreso.get(id) || fecha < primerIngreso.get(id)!)) {
      primerIngreso.set(id, fecha);
    }
    if (i.id) porIngreso.set(i.id, id);
  }

  // Recién acá se numera: hasta no ver todos los ingresos no se sabe cuál fue el
  // primero de cada fuente. Las que no declaran fecha van al final, alfabéticas.
  const ordenadas = [...porClave.entries()].sort(([ca, _a], [cb, _b]) => {
    const fa = primerIngreso.get(ca) ?? "9999";
    const fb = primerIngreso.get(cb) ?? "9999";
    return fa !== fb ? fa.localeCompare(fb) : ca.localeCompare(cb);
  });
  const nroPorClave = new Map<string, number>();
  ordenadas.forEach(([clave_, fuente], i) => {
    fuente.nro = i + 1;
    nroPorClave.set(clave_, i + 1);
  });
  for (const [ingresoId, clave_] of porIngreso) {
    const n = nroPorClave.get(clave_);
    if (n) numeroPorIngreso.set(ingresoId, n);
  }

  return { fuentes: ordenadas.map(([, f]) => f), numeroPorIngreso };
}

// ═══════════════════════════════════════════════════════════════════════════
// Apartado 2 — Retrozado
// ═══════════════════════════════════════════════════════════════════════════

/** Un pedazo cortado en planta, con su madre (ADR-313). */
export interface RetrozoParaApartado {
  id: string;
  codificacion?: string | null;
  especieComun?: string | null;
  especieCientifica?: string | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  largoM?: number | null;
  volumenM3?: number | null;
  fechaRetrozo?: string | Date | null;
  descarte?: boolean | null;
  observaciones?: string | null;
  /** La troza de la que salió. */
  madre?: {
    id?: string | null;
    codificacion?: string | null;
    volumenM3?: number | null;
    especieComun?: string | null;
    especieCientifica?: string | null;
    /** Código con el que la madre salió del bosque / el que le puso el CTP. */
    originCode?: string | null;
    ctpProductCode?: string | null;
    gtfNumber?: string | null;
  } | null;
}

/** Una fila del Apartado 2 — los 11 casilleros del formato. */
export interface FilaRetrozado {
  /** (1) N° de registro. */
  nro: number;
  /** (2) Fecha del retrozado. */
  fecha: string | null;
  /** (3) Código de origen/procedencia/CTP de la troza madre. */
  codigoOrigen: string;
  /** (4) Volumen inicial (m³) — el de la troza madre, tal como lo declara la guía. */
  volumenInicial: number | null;
  /** (5) Código del retrozado — hereda el de la madre: `52/A` → `52/A-1`. */
  codigoRetrozado: string;
  /** (6) Nombre común. */
  nombreComun: string;
  /** (7) Nombre científico. */
  nombreCientifico: string;
  /** (8) Diámetro mayor (cm) — SERFOR publica los diámetros en centímetros. */
  diametroMayorCm: number | null;
  /** (9) Diámetro menor (cm). */
  diametroMenorCm: number | null;
  /** (10) Longitud (m). */
  longitudM: number | null;
  /** (11) Volumen final (m³) del pedazo. */
  volumenFinal: number | null;
  /** El pedazo que no sirve. Ocupa volumen de la madre pero no es producto. */
  descarte: boolean;
  observaciones: string;
  /** Con qué guía entró la madre — para poder rastrearlo, no es del formato. */
  gtf: string;
}


const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Arma el Apartado 2 a partir de los retrozos del período.
 *
 * Los pedazos se ordenan por fecha y después por código: el libro se lee en el
 * orden en que pasaron las cosas, no en el que la base los devuelve.
 */
export function filasRetrozado(retrozos: readonly RetrozoParaApartado[]): FilaRetrozado[] {
  const ordenados = [...retrozos].sort((a, b) => {
    const fa = fechaIso(a.fechaRetrozo) ?? "";
    const fb = fechaIso(b.fechaRetrozo) ?? "";
    if (fa !== fb) return fa.localeCompare(fb);
    return txt(a.codificacion).localeCompare(txt(b.codificacion), "es", { numeric: true });
  });

  return ordenados.map((r, i) => {
    const d1 = r.d1Cm ?? null;
    const d2 = r.d2Cm ?? null;
    const mayor = d1 != null && d2 != null ? Math.max(d1, d2) : (d1 ?? d2);
    const menor = d1 != null && d2 != null ? Math.min(d1, d2) : (d1 ?? d2);
    return {
      nro: i + 1,
      fecha: fechaIso(r.fechaRetrozo),
      codigoOrigen:
        txt(r.madre?.codificacion) || txt(r.madre?.originCode) || txt(r.madre?.ctpProductCode) || "—",
      volumenInicial: r.madre?.volumenM3 != null ? r4(Number(r.madre.volumenM3)) : null,
      codigoRetrozado: txt(r.codificacion) || "—",
      nombreComun: txt(r.especieComun) || txt(r.madre?.especieComun) || "—",
      nombreCientifico: txt(r.especieCientifica) || txt(r.madre?.especieCientifica) || "—",
      diametroMayorCm: mayor,
      diametroMenorCm: menor,
      longitudM: r.largoM ?? null,
      volumenFinal: r.volumenM3 != null ? r4(Number(r.volumenM3)) : null,
      descarte: Boolean(r.descarte),
      observaciones: txt(r.observaciones),
      gtf: txt(r.madre?.gtfNumber),
    };
  });
}

/** Lo que el Cuadro Resumen 1 pide del retrozado, por especie. */
export interface RetrozadoEspecie {
  especie: string;
  /** Volumen de las trozas MADRE que se cortaron y cuántas fueron. */
  retrozado: { volumen: number; piezas: number };
  /** Volumen de los pedazos que SALIERON del corte y cuántos fueron. */
  deRetrozado: { volumen: number; piezas: number };
  /** Lo marcado como descarte (subconjunto de `deRetrozado`). */
  descartado: number;
}

/**
 * Agrega el retrozado por especie para los casilleros (7)/(8) y (9)/(10) del
 * Cuadro Resumen 1.
 *
 * Una madre cortada en tres pedazos cuenta **una vez** en `retrozado` (es una
 * troza que dejó de existir como tal) y **tres** en `deRetrozado`. Contarla una
 * vez por pedazo inflaría el volumen retrozado × 3.
 */
export function retrozadoPorEspecie(retrozos: readonly RetrozoParaApartado[]): RetrozadoEspecie[] {
  const porEspecie = new Map<string, RetrozadoEspecie>();
  const madresVistas = new Set<string>();

  const filaDe = (especie: string): RetrozadoEspecie => {
    const previa = porEspecie.get(especie);
    if (previa) return previa;
    const nueva: RetrozadoEspecie = {
      especie,
      retrozado: { volumen: 0, piezas: 0 },
      deRetrozado: { volumen: 0, piezas: 0 },
      descartado: 0,
    };
    porEspecie.set(especie, nueva);
    return nueva;
  };

  for (const r of retrozos) {
    const especie = txt(r.especieComun) || txt(r.madre?.especieComun) || "—";
    const f = filaDe(especie);
    f.deRetrozado.volumen = r4(f.deRetrozado.volumen + Number(r.volumenM3 ?? 0));
    f.deRetrozado.piezas += 1;
    if (r.descarte) f.descartado = r4(f.descartado + Number(r.volumenM3 ?? 0));

    const madreId = txt(r.madre?.id);
    if (madreId && !madresVistas.has(madreId)) {
      madresVistas.add(madreId);
      f.retrozado.volumen = r4(f.retrozado.volumen + Number(r.madre?.volumenM3 ?? 0));
      f.retrozado.piezas += 1;
    }
  }

  return [...porEspecie.values()].sort((a, b) => a.especie.localeCompare(b.especie, "es"));
}
