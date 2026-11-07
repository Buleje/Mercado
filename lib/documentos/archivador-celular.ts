/**
 * «Ordenar el archivador con el celular» (Brandon 31-10): eliges en qué
 * archivador estás guardando, escaneas el sticker de cada papel y queda
 * registrado (ADR-516); si el papel va en otro archivador, te avisa.
 *
 * El sticker (`etiquetas-qr.ts`) lleva `DOC-000123` y un QR con la dirección
 * del papel (`…/admin?tab=documentos&doc=<id>`). Se lee el id de esa dirección
 * SIN mirar el servidor: los stickers del lote 1 apuntan a producción y el
 * panel que los lee puede ser el de la PC o el túnel.
 *
 * El lugar sale de la ubicación física (ADR-526): «Archivador 1 · Proveedores
 * de madera · separador Ronal» → archivador «Archivador 1 · Proveedores de
 * madera» (se compara por su primer trozo, «Archivador 1») y separador «Ronal».
 * Puro: lo usan el hook del celular, la ruta y las pruebas.
 */

import { leerCodigoDocumento } from "./codigo-documento";

/** Un papel con código, con el lugar donde va su original (el suyo o el de su carpeta). */
export interface PapelDelArchivador {
  id: string;
  codigo: number;
  nombre: string;
  /** «Archivador 1 · … · separador Ronal», o null si su carpeta no tiene lugar. */
  ubicacion: string | null;
  /** Ya se marcó «el código está en el papel físico». */
  registrado: boolean;
}

/** Lo que trae un sticker: el id del papel (del QR) o su número (escrito a mano o leído del texto). */
export type LecturaSticker = { tipo: "id"; id: string } | { tipo: "codigo"; codigo: number };

const ID_VALIDO = /^[A-Za-z0-9_-]{6,64}$/;

/** Lee lo que dio la cámara (o la pistola, o el teclado). `null` = no es un sticker de papel. */
export function leerSticker(texto: string | null | undefined): LecturaSticker | null {
  const t = (texto ?? "").trim();
  if (!t || t.length > 500) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      const id = new URL(t).searchParams.get("doc")?.trim();
      return id && ID_VALIDO.test(id) ? { tipo: "id", id } : null;
    } catch {
      return null;
    }
  }
  const codigo = leerCodigoDocumento(t);
  return codigo ? { tipo: "codigo", codigo } : null;
}

/** Para comparar sin que pesen mayúsculas, tildes ni espacios dobles. */
export function normalizarLugar(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface PartesUbicacion {
  /** «Archivador 1 · Proveedores de madera» (todo menos el separador). */
  archivador: string;
  /** Con qué se compara: el primer trozo normalizado («archivador 1»). */
  clave: string;
  separador: string | null;
  claveSeparador: string | null;
}

const SEPARADOR = /^separador\s+/i;

/** Parte la ubicación física en archivador y separador. Sin archivador (vacía o sólo «separador X») → null. */
export function partesDeUbicacion(texto: string | null | undefined): PartesUbicacion | null {
  const partes = (texto ?? "").split("·").map((s) => s.trim()).filter(Boolean);
  const iSep = partes.findIndex((p) => SEPARADOR.test(p));
  const separador = iSep >= 0 ? partes[iSep].replace(SEPARADOR, "").trim() || null : null;
  const resto = iSep >= 0 ? partes.filter((_, i) => i !== iSep) : partes;
  if (resto.length === 0) return null;
  return {
    archivador: resto.join(" · "),
    clave: normalizarLugar(resto[0]),
    separador,
    claveSeparador: separador ? normalizarLugar(separador) : null,
  };
}

/** Dónde se está guardando: un archivador entero o uno de sus separadores. */
export interface Destino {
  clave: string;
  archivador: string;
  separador: string | null;
  claveSeparador: string | null;
}

export function textoDestino(d: Pick<Destino, "archivador" | "separador">): string {
  return d.separador ? `${d.archivador} · separador ${d.separador}` : d.archivador;
}

/** ¿Este papel va en ese archivador (y en ese separador, si se eligió uno)? */
export function vaEnDestino(ubicacion: string | null | undefined, destino: Destino): boolean {
  const p = partesDeUbicacion(ubicacion);
  if (!p || p.clave !== destino.clave) return false;
  return destino.claveSeparador == null || p.claveSeparador === destino.claveSeparador;
}

export interface Cuenta {
  total: number;
  registrados: number;
}

export interface GrupoArchivador extends Cuenta {
  clave: string;
  archivador: string;
  separadores: (Cuenta & { separador: string; claveSeparador: string })[];
}

const ordenNatural = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/** Los archivadores que aparecen en los papeles, con cuántos tienen y cuántos ya están registrados. */
export function agruparArchivadores(papeles: readonly PapelDelArchivador[]): { grupos: GrupoArchivador[]; sinLugar: number } {
  const grupos = new Map<string, GrupoArchivador>();
  let sinLugar = 0;
  for (const papel of papeles) {
    const p = partesDeUbicacion(papel.ubicacion);
    if (!p) {
      sinLugar++;
      continue;
    }
    let g = grupos.get(p.clave);
    if (!g) {
      g = { clave: p.clave, archivador: p.archivador, total: 0, registrados: 0, separadores: [] };
      grupos.set(p.clave, g);
    }
    g.total++;
    if (papel.registrado) g.registrados++;
    if (p.separador && p.claveSeparador) {
      let s = g.separadores.find((x) => x.claveSeparador === p.claveSeparador);
      if (!s) {
        s = { separador: p.separador, claveSeparador: p.claveSeparador, total: 0, registrados: 0 };
        g.separadores.push(s);
      }
      s.total++;
      if (papel.registrado) s.registrados++;
    }
  }
  const lista = [...grupos.values()].sort((a, b) => ordenNatural(a.archivador, b.archivador));
  for (const g of lista) g.separadores.sort((a, b) => ordenNatural(a.separador, b.separador));
  return { grupos: lista, sinLugar };
}

/** «20 de 67 en su sitio» del destino, y los que faltan (por número). */
export function progresoDelDestino(papeles: readonly PapelDelArchivador[], destino: Destino): Cuenta & { faltan: PapelDelArchivador[] } {
  const delDestino = papeles.filter((p) => vaEnDestino(p.ubicacion, destino));
  const faltan = delDestino.filter((p) => !p.registrado).sort((a, b) => a.codigo - b.codigo);
  return { total: delDestino.length, registrados: delDestino.length - faltan.length, faltan };
}

export interface IndicePapeles {
  porId: Map<string, PapelDelArchivador>;
  porCodigo: Map<number, PapelDelArchivador>;
}

export function indexarPapeles(papeles: readonly PapelDelArchivador[]): IndicePapeles {
  return {
    porId: new Map(papeles.map((p) => [p.id, p])),
    porCodigo: new Map(papeles.map((p) => [p.codigo, p])),
  };
}

/**
 * Qué pasa con un sticker leído:
 *  · `guardar`: va aquí y falta registrarlo → se marca;
 *  · `ya-estaba`: va aquí y ya estaba registrado;
 *  · `otro-lugar`: va en otro archivador o separador (`dondeVa`) → aviso, no se marca solo;
 *  · `sin-lugar`: su carpeta no tiene archivador → aviso;
 *  · `desconocido`: no es un papel de este negocio (o el QR no se entiende).
 */
export type Veredicto =
  | { estado: "guardar"; papel: PapelDelArchivador }
  | { estado: "ya-estaba"; papel: PapelDelArchivador }
  | { estado: "otro-lugar"; papel: PapelDelArchivador; dondeVa: string }
  | { estado: "sin-lugar"; papel: PapelDelArchivador }
  | { estado: "desconocido"; texto: string };

export function juzgarLectura(texto: string, indice: IndicePapeles, destino: Destino): Veredicto {
  const lectura = leerSticker(texto);
  const papel = !lectura ? undefined : lectura.tipo === "id" ? indice.porId.get(lectura.id) : indice.porCodigo.get(lectura.codigo);
  if (!papel) return { estado: "desconocido", texto: texto.trim().slice(0, 80) };
  if (!partesDeUbicacion(papel.ubicacion)) return { estado: "sin-lugar", papel };
  if (!vaEnDestino(papel.ubicacion, destino)) return { estado: "otro-lugar", papel, dondeVa: papel.ubicacion ?? "" };
  return papel.registrado ? { estado: "ya-estaba", papel } : { estado: "guardar", papel };
}
