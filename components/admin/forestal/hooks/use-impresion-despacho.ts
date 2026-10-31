"use client";

/**
 * Los papeles de la GTF de SALIDA que se piden desde el menú ⋯ de la fila de
 * Despacho (Brandon 27-10): la hoja SERFOR (guía entera + su lista si salen
 * trozas) y el resumen interno. Todo sale de `RUTA_GUIA_SALIDA`, los mismos
 * valores del talonario y de «con formato».
 *
 * La Ficha del CTP y los permisos se piden ACÁ, en paralelo con la guía, y no
 * con `useFichaCtp`/`usePermisosForestal`: esos hooks no dicen cuándo
 * terminaron de cargar, y la hoja no puede salir con los casilleros (5)(9)(10)
 * en blanco por haber ganado la carrera.
 */

import type { DocumentoImprimible } from "../CtpDocumentoVisor";
import type { GuiaParaArchivar } from "../CtpArchivadorAuto";
import { hojaResumenInternoDespacho } from "@/lib/forestal/despacho-resumen-interno";
import type { CtpFicha, PermisoDeGuia } from "@/lib/forestal/ctp-ficha-types";
import { avisosTipoDeLaGuia } from "@/lib/forestal/ctp-gtf-print";
import { faltantesGtf, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { AvisoTipo } from "@/lib/forestal/gtf-validador-tipo";
import { faltanParaImprimir, type GuiaSalidaImprimible } from "@/lib/forestal/guia-salida-imprimible";
import { despachoDeLaGuiaSalida, papelesGuiaSalida, type PapelesGuiaSalida } from "@/lib/forestal/guia-salida-papeles";
import { limaDateKey } from "@/lib/utils";
import { AvisoGuiaSalida, leerGuiaSalida } from "./use-guia-salida";

/** Lo que la fila sabe del despacho y la guía no trae. */
export interface DespachoParaImprimir {
  id: string;
  gtfNumber: string;
  lineNo: number;
  /** Motivo de la anulación ("" si no lo tiene); `null` = vigente. */
  anulada: string | null;
  createdAt?: string | null;
  /** Ya tiene su Anexo 04 emitido. */
  conAnexo: boolean;
  destino?: string | null;
}

export interface PapelesDelDespacho {
  documentos: DocumentoImprimible[];
  /** Lo que va solo al expediente (la hoja SERFOR de una guía vigente); [] = nada. */
  archivar: GuiaParaArchivar[];
}

async function leerFicha(): Promise<Partial<CtpFicha> | null> {
  try {
    const r = await fetch("/api/admin/forestal/ctp-ficha", { credentials: "include", cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { ficha?: Partial<CtpFicha> | null };
    return j.ficha ?? null;
  } catch (err) {
    console.warn("[impresion-despacho] ficha no leída", err);
    return null;
  }
}

/** Sin acceso a permisos (403) o caídos, la hoja sale con los títulos de la Ficha: `null`, como en el Libro. */
async function leerPermisos(): Promise<PermisoDeGuia[] | null> {
  try {
    const r = await fetch("/api/admin/forestal/contratos", { credentials: "include", cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { contratos?: PermisoDeGuia[] };
    return j.contratos ?? null;
  } catch (err) {
    console.warn("[impresion-despacho] permisos no leídos", err);
    return null;
  }
}

/**
 * La guía ENTERA de un despacho armada para el papel, se pida desde el botón
 * que sea (menú ⋯, ficha del despacho, guía recién registrada, Anexo 04):
 * todas sus líneas con el mismo N°, su cadena y su lista de trozas. Antes la
 * ficha y el Anexo 04 armaban la hoja con SU línea sola: una guía de tres
 * productos salía con uno y declaraba menos carga (27-10). `datos` = lo que
 * hay en el formulario: el papel sale con lo corregido aunque no esté
 * guardado. Lanza con el motivo en palabras (sin N°, casilleros que faltan).
 */
export async function papelesDeLaGuiaEntera(
  despachoId: string,
  o: { ficha: Partial<CtpFicha>; permisos: readonly PermisoDeGuia[] | null; datos?: GtfDatos; anulada?: string | null },
): Promise<{ papeles: PapelesGuiaSalida; guia: GuiaSalidaImprimible; avisosTipo: AvisoTipo[] }> {
  const r = await leerGuiaSalida(despachoId);
  const guia = o.datos ? { ...r.guia, datos: o.datos, faltan: faltantesGtf(o.datos).map((f) => f.campo) } : r.guia;
  const papeles = await papelesGuiaSalida({ guia, entradas: r.entradas }, o.ficha, o.permisos, o.anulada ?? null);
  return { papeles, guia, avisosTipo: avisosTipoDeLaGuia(despachoDeLaGuiaSalida(guia), guia.lineas) };
}

/** Etiquetas y descripción con que la hoja va al expediente (igual que desde la guía del despacho). */
export function fichaDelExpediente(d: DespachoParaImprimir, nombre: string): { etiquetas: string[]; descripcion: string } {
  return {
    etiquetas: ["forestal", "GTF", "salida", d.gtfNumber],
    descripcion: `${nombre} emitida por el CTP — despacho línea #${d.lineNo}${d.destino ? `, destino ${d.destino}` : ""}.`,
  };
}

/** Arma la hoja SERFOR o el resumen interno; el error ya viene en palabras (`AvisoGuiaSalida`). */
export async function papelesDelDespacho(d: DespachoParaImprimir, accion: "hoja" | "resumen"): Promise<PapelesDelDespacho> {
  if (accion === "resumen") {
    const { guia } = await leerGuiaSalida(d.id);
    const hoja = hojaResumenInternoDespacho(guia, { anexo04: d.conAnexo, createdAt: d.createdAt, anulada: d.anulada, hoy: limaDateKey() });
    return { documentos: [hoja], archivar: [] };
  }
  const ficha = leerFicha();
  const permisos = leerPermisos();
  const r = await leerGuiaSalida(d.id);
  const faltan = faltanParaImprimir(r.guia);
  if (faltan) throw new AvisoGuiaSalida(faltan);
  const f = await ficha;
  if (!f) throw new AvisoGuiaSalida("Todavía no se pudo leer la Ficha del CTP. Prueba de nuevo en un momento.");
  const p = await papelesGuiaSalida(r, f, await permisos, d.anulada);
  const documentos: DocumentoImprimible[] = [p.gtf, ...(p.lista ? [p.lista] : [])];
  const vigente = d.anulada == null && !r.guia.anulada;
  return {
    documentos,
    archivar: vigente
      ? documentos.map((doc) => ({
          clave: `${r.guia.despachoId}:${doc.archivo ?? doc.nombre}`,
          nombre: doc.archivo ?? doc.nombre,
          html: doc.html,
          pieCorrido: doc.pieCorrido,
          ...fichaDelExpediente(d, doc.nombre),
        }))
      : [],
  };
}
