/**
 * conteo-patio.ts — contar el patio escaneando (ADR-436, Brandon 2026-09-26).
 *
 * La hermana es el conteo físico de Inventario (`ConteoFisicoWizard`): una
 * lista de lo que el sistema cree que hay, y el escáner va marcando lo que de
 * verdad está. Acá «lo que debería haber» es el patio: las trozas vivas que se
 * pueden mandar a la sierra (`motivoBloqueo === null`).
 *
 * Tres listas salen de cruzar las dos cosas:
 *   · Encontradas — esperadas y escaneadas.
 *   · Faltan      — esperadas y NO escaneadas (se agrupan por especie o guía,
 *                   que es como se va a buscarlas a la pila).
 *   · Sorpresas   — escaneadas y NO esperadas: la troza figura consumida,
 *                   despachada, sin llegar… (el motivo es el de T1, ADR-326), o
 *                   el código no es de ninguna troza del patio.
 *
 * Sin escritura en la base: el conteo vive en el equipo (localStorage) hasta
 * que se termina e imprime el acta. PURO y client-safe (el guardado lo hace el
 * hook, con try/catch).
 */

import { fechaIngresoDeTroza, motivoBloqueo, LABEL_BLOQUEO, type MotivoBloqueo, type TrozaConsumible } from "./consumo-trozas";
import { claveDeCodigo } from "./leer-escaneo-troza";

/** Lo que el conteo guarda de cada troza del patio: lo justo para reconocerla y nombrarla. */
export interface TrozaDelConteo {
  id: string;
  codificacion: string | null;
  codigoPlanta: string | null;
  especieComun: string | null;
  gtfNumber: string | null;
  volumenM3: number | null;
  /** `null` = está en el patio y se espera encontrarla. */
  motivo: MotivoBloqueo | null;
  /**
   * Tiene etiqueta QR impresa (`etiquetadaEn`, ADR-436). `undefined` = foto
   * guardada antes del 05-10: no se sabe (el paso «Etiquetas» no inventa).
   */
  etiquetada?: boolean;
  /** La cancha del Mapa de Planta (la de la troza o la de su carga). `null` = sin ubicar. */
  cancha?: string | null;
  /** Desde cuándo está en el patio, AAAA-MM-DD (`fechaIngresoDeTroza`): da los días del acta. */
  desde?: string | null;
}

/** Una lectura aceptada. `trozaId: null` = el código no es de ninguna troza del patio. */
export interface LecturaConteo {
  trozaId: string | null;
  /** Lo que se leyó (para nombrar un código desconocido). */
  codigo: string;
  en: string;
}

export interface ConteoPatio {
  v: 1;
  /** Día del conteo en Lima, AAAA-MM-DD: forma parte de la clave de guardado. */
  fecha: string;
  iniciadoEn: string;
  quien: string;
  /** La foto del patio contra la que se cuenta (esperadas + bloqueadas). */
  trozas: TrozaDelConteo[];
  /** Cuándo se trajo esa foto del servidor. */
  fotoEn: string;
  /** El servidor no mandó todo el patio: puede haber sorpresas falsas. */
  truncado: boolean;
  lecturas: LecturaConteo[];
  terminadoEn: string | null;
}

export function aTrozaDelConteo(t: TrozaConsumible): TrozaDelConteo {
  const v = Number(t.volumenM3);
  return {
    id: t.id,
    codificacion: t.codificacion ?? null,
    codigoPlanta: t.codigoPlanta ?? null,
    especieComun: t.especieComun ?? null,
    gtfNumber: t.gtfNumber ?? null,
    volumenM3: Number.isFinite(v) ? v : null,
    /*
     * `motivoBloqueo` mira si la PIEZA no llegó (`noRecepcionada`, ADR-325),
     * pero no si la GUÍA (el documento entero) todavía está pendiente de
     * recepción (`guiaRecepcionada`, ADR-339): una guía cargada al libro pero
     * sin bajar del camión infla «esperadas» con madera que nunca estuvo en
     * la pila. En Blas eran 38 de 84 esperadas (43,232 m³) de guías así — el
     * conteo las declaraba «Faltan» cuando en realidad no habían llegado.
     * Si de todos modos se escanea un código de esas (alguien contó antes de
     * anotar la recepción), es una sorpresa con el mismo motivo, no un
     * fantasma sin explicar.
     */
    motivo: t.guiaRecepcionada === false ? "no_recepcionada" : motivoBloqueo(t),
    etiquetada: Boolean(t.etiquetadaEn),
    desde: fechaIngresoDeTroza(t),
  };
}

export function nuevoConteo(o: {
  fecha: string;
  quien: string;
  trozas: TrozaDelConteo[];
  ahora: string;
  truncado?: boolean;
}): ConteoPatio {
  return {
    v: 1,
    fecha: o.fecha,
    iniciadoEn: o.ahora,
    quien: o.quien,
    trozas: o.trozas,
    fotoEn: o.ahora,
    truncado: o.truncado ?? false,
    lecturas: [],
    terminadoEn: null,
  };
}

/**
 * Cambia la foto del patio sin perder lo contado. Una troza que se consumió
 * mientras se contaba pasa sola de «encontrada» a «sorpresa»: es la verdad.
 */
export function reemplazarFoto(
  c: ConteoPatio,
  trozas: TrozaDelConteo[],
  ahora: string,
  truncado = false,
): ConteoPatio {
  return { ...c, trozas, fotoEn: ahora, truncado };
}

export function yaContada(c: ConteoPatio, trozaId: string): boolean {
  return c.lecturas.some((l) => l.trozaId === trozaId);
}

/** Anota una troza escaneada. Contarla dos veces no suma dos. */
export function anotarTroza(c: ConteoPatio, t: Pick<TrozaDelConteo, "id" | "codigoPlanta" | "codificacion">, ahora: string): ConteoPatio {
  if (yaContada(c, t.id)) return c;
  return {
    ...c,
    lecturas: [...c.lecturas, { trozaId: t.id, codigo: t.codigoPlanta || t.codificacion || t.id, en: ahora }],
  };
}

/** Anota un código que no es de ninguna troza del patio (una sola vez por código). */
export function anotarDesconocido(c: ConteoPatio, codigo: string, ahora: string): ConteoPatio {
  const clave = claveDeCodigo(codigo);
  if (!clave) return c;
  if (c.lecturas.some((l) => l.trozaId === null && claveDeCodigo(l.codigo) === clave)) return c;
  return { ...c, lecturas: [...c.lecturas, { trozaId: null, codigo: codigo.trim(), en: ahora }] };
}

/** Deshace una lectura (se escaneó por error la pieza de al lado). */
export function quitarLectura(c: ConteoPatio, l: Pick<LecturaConteo, "trozaId" | "codigo">): ConteoPatio {
  return {
    ...c,
    lecturas: c.lecturas.filter((x) =>
      l.trozaId ? x.trozaId !== l.trozaId : !(x.trozaId === null && x.codigo === l.codigo),
    ),
  };
}

export type Sorpresa =
  | { tipo: "bloqueada"; troza: TrozaDelConteo; motivo: MotivoBloqueo; en: string }
  | { tipo: "fuera"; troza: null; trozaId: string; codigo: string; en: string }
  | { tipo: "desconocida"; troza: null; codigo: string; en: string };

export interface ResumenConteo {
  total: number;
  contadas: number;
  esperadas: TrozaDelConteo[];
  /** Más reciente primero: es lo que se acaba de escanear. */
  encontradas: (TrozaDelConteo & { en: string })[];
  faltan: TrozaDelConteo[];
  sorpresas: Sorpresa[];
  m3: { esperado: number; encontrado: number; faltan: number };
}

const sumaM3 = (ts: readonly Pick<TrozaDelConteo, "volumenM3">[]) =>
  ts.reduce((s, t) => s + (t.volumenM3 ?? 0), 0);

export function resumirConteo(c: ConteoPatio): ResumenConteo {
  const porId = new Map(c.trozas.map((t) => [t.id, t]));
  const esperadas = c.trozas.filter((t) => t.motivo === null);
  const encontradas: (TrozaDelConteo & { en: string })[] = [];
  const sorpresas: Sorpresa[] = [];
  const vistas = new Set<string>();

  for (const l of c.lecturas) {
    if (l.trozaId === null) {
      sorpresas.push({ tipo: "desconocida", troza: null, codigo: l.codigo, en: l.en });
      continue;
    }
    const t = porId.get(l.trozaId);
    if (!t) {
      /* Estaba en la foto de cuando se escaneó y ya no está en la nueva. */
      sorpresas.push({ tipo: "fuera", troza: null, trozaId: l.trozaId, codigo: l.codigo, en: l.en });
      continue;
    }
    vistas.add(t.id);
    if (t.motivo === null) encontradas.push({ ...t, en: l.en });
    else sorpresas.push({ tipo: "bloqueada", troza: t, motivo: t.motivo, en: l.en });
  }

  const faltan = esperadas.filter((t) => !vistas.has(t.id));
  encontradas.reverse();
  sorpresas.reverse();
  return {
    total: esperadas.length,
    contadas: encontradas.length,
    esperadas,
    encontradas,
    faltan,
    sorpresas,
    m3: { esperado: sumaM3(esperadas), encontrado: sumaM3(encontradas), faltan: sumaM3(faltan) },
  };
}

/** Por qué una sorpresa no se esperaba, en palabras. */
export function motivoDeSorpresa(s: Sorpresa): string {
  if (s.tipo === "bloqueada") return LABEL_BLOQUEO[s.motivo];
  if (s.tipo === "fuera") return "Ya no figura en el patio";
  return "Código desconocido: no es de ninguna troza";
}

/** El código con que se nombra la troza en las listas y el acta. */
export function codigoDeTroza(t: Pick<TrozaDelConteo, "id" | "codigoPlanta" | "codificacion">): string {
  return t.codigoPlanta?.trim() || t.codificacion?.trim() || `…${t.id.slice(-6)}`;
}

export type AgruparPor = "especie" | "guia" | "cancha";

const SIN_GRUPO: Record<AgruparPor, string> = { especie: "Sin especie", guia: "Sin guía", cancha: "Sin cancha" };
const claveDeGrupo = (t: TrozaDelConteo, por: AgruparPor): string | null | undefined =>
  por === "especie" ? t.especieComun : por === "guia" ? t.gtfNumber : t.cancha;

export interface GrupoFaltan {
  clave: string;
  trozas: TrozaDelConteo[];
  m3: number;
}

/** Lo que falta, agrupado como se va a buscarlo: por especie, guía o cancha. Los grupos más grandes primero. */
export function agruparFaltan(faltan: readonly TrozaDelConteo[], por: AgruparPor): GrupoFaltan[] {
  const grupos = new Map<string, TrozaDelConteo[]>();
  for (const t of faltan) {
    const clave = claveDeGrupo(t, por)?.trim() || SIN_GRUPO[por];
    const g = grupos.get(clave);
    if (g) g.push(t);
    else grupos.set(clave, [t]);
  }
  return [...grupos.entries()]
    .map(([clave, trozas]) => ({
      clave,
      trozas: [...trozas].sort((a, b) =>
        codigoDeTroza(a).localeCompare(codigoDeTroza(b), "es", { numeric: true }),
      ),
      m3: sumaM3(trozas),
    }))
    .sort((a, b) => b.trozas.length - a.trozas.length || a.clave.localeCompare(b.clave, "es"));
}

// ── Guardado en el equipo ─────────────────────────────────────────────────────

const PREFIJO = "conteo-patio:";

/** Un conteo por negocio y por día: dos negocios en la misma tablet no se mezclan. */
export function claveDelConteo(tenant: string, fecha: string): string {
  return `${PREFIJO}${tenant}:${fecha}`;
}

/** Las claves de OTROS días del mismo negocio (para limpiarlas al empezar uno nuevo). */
export function clavesViejas(claves: readonly string[], tenant: string, fecha: string): string[] {
  const propio = `${PREFIJO}${tenant}:`;
  const hoy = claveDelConteo(tenant, fecha);
  return claves.filter((k) => k.startsWith(propio) && k !== hoy);
}

const esTexto = (v: unknown): v is string => typeof v === "string";
const esTextoONulo = (v: unknown): v is string | null => v === null || typeof v === "string";

function esTroza(v: unknown): v is TrozaDelConteo {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    esTexto(t.id) &&
    esTextoONulo(t.codificacion) &&
    esTextoONulo(t.codigoPlanta) &&
    esTextoONulo(t.especieComun) &&
    esTextoONulo(t.gtfNumber) &&
    (t.volumenM3 === null || typeof t.volumenM3 === "number") &&
    (t.motivo === null || (esTexto(t.motivo) && t.motivo in LABEL_BLOQUEO)) &&
    (t.etiquetada === undefined || typeof t.etiquetada === "boolean") &&
    (t.cancha === undefined || esTextoONulo(t.cancha)) &&
    (t.desde === undefined || esTextoONulo(t.desde))
  );
}

function esLectura(v: unknown): v is LecturaConteo {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return esTextoONulo(l.trozaId) && esTexto(l.codigo) && esTexto(l.en);
}

/**
 * Lee un conteo guardado. Cualquier cosa rara (JSON roto, otra versión, un
 * campo que falta) = `null`: mejor empezar de cero que contar sobre basura.
 */
export function leerConteoGuardado(json: string | null | undefined): ConteoPatio | null {
  if (!json) return null;
  let d: unknown;
  try {
    d = JSON.parse(json);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const c = d as Record<string, unknown>;
  if (
    c.v !== 1 ||
    !esTexto(c.fecha) ||
    !esTexto(c.iniciadoEn) ||
    !esTexto(c.quien) ||
    !esTexto(c.fotoEn) ||
    !Array.isArray(c.trozas) ||
    !Array.isArray(c.lecturas) ||
    !esTextoONulo(c.terminadoEn ?? null)
  ) {
    return null;
  }
  if (!c.trozas.every(esTroza) || !c.lecturas.every(esLectura)) return null;
  return {
    v: 1,
    fecha: c.fecha,
    iniciadoEn: c.iniciadoEn,
    quien: c.quien,
    trozas: c.trozas,
    fotoEn: c.fotoEn,
    truncado: c.truncado === true,
    lecturas: c.lecturas,
    terminadoEn: (c.terminadoEn as string | null | undefined) ?? null,
  };
}
