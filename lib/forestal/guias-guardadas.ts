/**
 * Guías guardadas antes del ingreso (Libro CTP, ADR-442) — lógica PURA y el
 * contrato que comparten la API y la pantalla.
 *
 * Pedido de Brandon (2026-09-27): «un apartado para guardar la guía con su N°
 * de registro, su N° de GTF y sus documentos (factura, guías de remisión, lista
 * de trozas…), y que al hacer el ingreso de madera se pongan solos según el N°
 * de registro; en Documentos, carpetas con el nombre del titular y su permiso;
 * si se elimina el ingreso, la guía y sus documentos se quedan».
 *
 * Cómo se sostiene cada parte:
 *   · los papeles son documentos del Drive con las etiquetas de ADR-438
 *     (`gtf:<N°>` + `casillero:<clave>`): el ingreso con esa GTF los ve solos;
 *   · «¿ya entró al libro?» se DEDUCE (hay un ingreso vivo con esa GTF o ese
 *     N° de registro), nunca se guarda: borrar el ingreso la devuelve a «por
 *     ingresar» sin tocar nada;
 *   · la ficha de SERFOR la pide el SERVIDOR; con ella la GTF, el titular, el
 *     permiso y la fecha salen del papel oficial, no de lo tipeado.
 */

import { z } from "zod";
import type { GtfSerfor } from "./serfor-gtf";
import { normalizarNumeroRegistro } from "./serfor-gtf";
import type { VinculoLibroTh } from "./guia-th-al-ctp";
import { mismoNumeroGtf } from "./gtf-talonario";

/* ── Lo que manda la pantalla ─────────────────────────────────────────────── */

const textoOpc = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

/**
 * Alta y edición usan el MISMO esquema, sin `.default()` (Zod 4: `.partial()`
 * aplica los defaults y un PATCH parcial pisaría campos — memoria
 * `zod4-partial-aplica-defaults`). Campo ausente = no se toca; `null` = vaciar.
 */
/** ¿`AAAA-MM-DD` es un día que existe? (`2026-02-31` no: Date lo corre a marzo). */
export function esFechaReal(v: string): boolean {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return (
    d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 1990
  );
}

/**
 * El N° de GTF es la LLAVE de los papeles (etiqueta `gtf:<N°>`), y el legado de
 * ADR-438 también reconoce el N° suelto como etiqueta humana: una «GTF»
 * llamada «Tornillo» se quedaba con todo lo archivado de esa especie. Un N° de
 * guía siempre lleva dígitos.
 */
export const esGtfValida = (v: string) => /\d/.test(v);

export const GuiaGuardadaInput = z.object({
  numeroRegistro: textoOpc(30),
  gtfNumber: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .max(60)
      .refine(esGtfValida, "El N° de GTF lleva números, como lo imprime la guía (ej. 019-001-0000003).")
      .nullable()
      .optional(),
  ),
  /** `AAAA-MM-DD` (fecha del papel, sin hora). */
  gtfDate: z.preprocess(
    (v) => (v === "" ? null : v),
    z
      .string()
      .refine(esFechaReal, "La fecha no existe o no va como AAAA-MM-DD")
      .nullable()
      .optional(),
  ),
  titularNombre: textoOpc(200),
  titularDoc: textoOpc(20),
  permisoCodigo: textoOpc(80),
  contratoId: textoOpc(40),
  notas: textoOpc(1000),
  /** Pedir la ficha a SERFOR con el N° de registro y guardar lo que dice. */
  consultarSerfor: z.boolean().optional(),
});
export type GuiaGuardadaInput = z.infer<typeof GuiaGuardadaInput>;

/* ── Lo que devuelve la API ───────────────────────────────────────────────── */

export interface ResumenDeFicha {
  especies: string[];
  volumenM3: number | null;
  trozas: number;
  /** Vence la guía (dd/mm/aaaa, como la publica SERFOR). */
  fechaVencimiento: string | null;
  transportista: string | null;
  placa: string | null;
}

export interface GuiaGuardadaVista {
  id: string;
  numeroRegistro: string | null;
  gtfNumber: string;
  /** ISO `AAAA-MM-DD` o null. */
  gtfDate: string | null;
  titularNombre: string | null;
  titularDoc: string | null;
  permisoCodigo: string | null;
  contratoId: string | null;
  notas: string | null;
  /** Tiene la ficha que SERFOR le devolvió al servidor. */
  verificadaEnSerfor: boolean;
  serforConsultadaEn: string | null;
  resumen: ResumenDeFicha | null;
  /** Ruta de su carpeta en el Drive (Documentos). */
  carpeta: string[];
  /** Deducido: el ingreso vivo que la usa, o null (= por ingresar). */
  ingreso: { en: string; asientos: number } | null;
  /** Casilleros con archivo, de 6. */
  docsLlenos: number;
  /**
   * La guía que emitió tu Libro TH con este mismo N° (deducido tramo a tramo,
   * 28-09-2026), o null. Con ella, «Recibir» registra el ingreso con sus
   * trozas sin tipear.
   */
  libroTh: VinculoLibroTh | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuiaGuardadaDetalle extends GuiaGuardadaVista {
  serforGtf: GtfSerfor | null;
}

export interface ListaGuiasGuardadas {
  guias: GuiaGuardadaVista[];
  porIngresar: number;
  total: number;
}

export type EstadoLista = "por_ingresar" | "ingresadas" | "todas";

/* ── Reglas ───────────────────────────────────────────────────────────────── */

/** `dd/mm/aaaa` de SERFOR → `AAAA-MM-DD`, o null. */
export function fechaDeSerfor(f: string | null | undefined): string | null {
  const m = (f ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Lo que la guía guardada muestra de la ficha, sin cargar la ficha entera. */
export function resumenDeFicha(g: GtfSerfor | null | undefined): ResumenDeFicha | null {
  if (!g) return null;
  const especies = [
    ...new Set(
      [...(g.productos ?? []), ...(g.trozas ?? [])]
        .map((p) => (p.comun ?? p.cientifico ?? "").trim())
        .filter(Boolean),
    ),
  ];
  return {
    especies,
    volumenM3: typeof g.volumenTotal === "number" ? g.volumenTotal : null,
    trozas: g.trozas?.length ?? 0,
    fechaVencimiento: g.fechaVencimiento ?? null,
    transportista: g.transportista ?? null,
    placa: g.placa ?? null,
  };
}

export interface CamposDeGuia {
  numeroRegistro: string | null;
  gtfNumber: string | null;
  gtfDate: string | null;
  titularNombre: string | null;
  titularDoc: string | null;
  permisoCodigo: string | null;
}

/**
 * Lo tipeado + la ficha de SERFOR → lo que se guarda.
 *
 * Con ficha, el PAPEL OFICIAL manda en GTF, titular, permiso y fecha: el alta
 * desde SERFOR registra el ingreso con esos mismos datos (`desde-serfor`), y si
 * la guía guardada dijera otra GTF sus papeles no aparecerían en el ingreso.
 * Lo tipeado sólo llena lo que la ficha no trae. Devuelve también qué se
 * corrigió, para decírselo a la persona en vez de cambiarlo callado.
 */
export function fusionarConFicha(
  tipeado: CamposDeGuia,
  ficha: GtfSerfor | null,
  docDelTitular?: string | null,
): { campos: CamposDeGuia; corregidos: string[] } {
  if (!ficha) return { campos: tipeado, corregidos: [] };
  const corregidos: string[] = [];
  const elegir = (
    etiqueta: string,
    oficial: string | null | undefined,
    escrito: string | null,
  ): string | null => {
    const o = oficial?.trim() || null;
    if (!o) return escrito;
    if (escrito && escrito.trim().toUpperCase() !== o.toUpperCase())
      corregidos.push(`${etiqueta}: «${escrito}» → «${o}»`);
    return o;
  };
  return {
    campos: {
      numeroRegistro: ficha.numeroRegistro?.trim() || tipeado.numeroRegistro,
      gtfNumber: elegir("N° de GTF", ficha.gtfNumber, tipeado.gtfNumber),
      gtfDate: elegir("Fecha de la guía", fechaDeSerfor(ficha.fechaExpedicion), tipeado.gtfDate),
      titularNombre: elegir("Titular", ficha.titular, tipeado.titularNombre),
      titularDoc: tipeado.titularDoc ?? docDelTitular ?? null,
      permisoCodigo: elegir("Permiso", ficha.numeroTitulo, tipeado.permisoCodigo),
    },
    corregidos,
  };
}

/** Cómo se compara un N° de registro (sin espacios; con y sin guiones es otro número). */
export const claveRegistro = (v: string | null | undefined): string | null => {
  const n = normalizarNumeroRegistro(v ?? "");
  return n || null;
};

/** Cómo se compara un N° de GTF: tal cual lo escribe el libro, sin espacios al borde. */
export const claveGtf = (v: string | null | undefined): string | null => {
  const n = (v ?? "").trim();
  return n || null;
};

/**
 * ¿Este ingreso usa esta guía guardada? Por la GTF (la llave de los
 * casilleros) o por el N° de registro (el que Brandon usa para reconocerla).
 */
export function ingresoEsDeGuia(
  ingreso: { gtfNumber: string | null; serforNumeroRegistro: string | null },
  guia: { gtfNumber: string; numeroRegistro: string | null },
): boolean {
  /* Tramo a tramo (`019-001-…` ≡ `19-001-…`): el mismo papel escrito por
     SERFOR y por el talonario (28-09-2026). */
  const g = claveGtf(guia.gtfNumber);
  if (g && mismoNumeroGtf(ingreso.gtfNumber, g)) return true;
  const r = claveRegistro(guia.numeroRegistro);
  return Boolean(r && claveRegistro(ingreso.serforNumeroRegistro) === r);
}

/** Por ingresar primero (lo que falta hacer), después lo más nuevo arriba. */
export function ordenarGuias<T extends { ingreso: unknown; createdAt: string }>(g: T[]): T[] {
  return [...g].sort((a, b) => {
    const pa = a.ingreso ? 1 : 0;
    const pb = b.ingreso ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
