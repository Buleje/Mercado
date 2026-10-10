/**
 * Galería «Personas» de Cámaras (2026-10-08): las fotos que el detector local
 * del mosaico guardó en el Drive (`Cámaras / Personas / <cámara> / <día>`),
 * vistas donde se vigila y no sólo entrando al Drive.
 *
 * Funciones puras (client-safe): el endpoint
 * `GET /api/admin/camaras/personas/fotos` lee carpetas y documentos con
 * `DocumentsDB` y arma acá la respuesta. Las cifras del día (cuántas, primera
 * y última, por hora, cámara con más) salen de acá: la pantalla no suma nada.
 *
 * El día de una foto es el de su `uploadedAt` en Lima (el servidor pone el
 * mismo instante en el nombre del archivo y en la carpeta del día). La cámara
 * sale de `ocrMetadata.camaraId`; si falta, del nombre de la carpeta de la
 * cámara (una cámara renombrada deja su carpeta vieja con fotos).
 */

import { CARPETA_PERSONAS, MOTIVOS_FOTO_PERSONA, MOTIVO_FOTO_PERSONA_LABEL, type MotivoFotoPersona } from "./personas";
import type { PersonasPorHora } from "./resumen";
import { leerCajasGuardadas, type CajaGuardada } from "./apariencia";

export interface FotoPersonaGaleria {
  id: string;
  /** Clave del filtro: el id de la cámara, o `carpeta:<id>` si no se sabe cuál fue. */
  camara: string;
  camaraNombre: string;
  /** La carpeta del día donde está la foto en el Drive. */
  carpetaId: string | null;
  /** Instante ISO. */
  en: string;
  /** `HH:mm:ss` en Lima. */
  hora: string;
  motivo: MotivoFotoPersona | null;
  personas: number | null;
  confianza: number | null;
}

export interface CamaraGaleria {
  clave: string;
  nombre: string;
  /** Fotos de ESTE día (sin el filtro de cámara: es lo que muestran los chips). */
  fotos: number;
}

export interface GaleriaPersonas {
  ok: true;
  dia: string;
  /** El filtro pedido (`null` = todas). */
  camara: string | null;
  /** «Cámaras / Personas»; `null` si todavía no existe o el rol no la ve. */
  carpetaId: string | null;
  /** La carpeta más precisa para «Abrir en el Drive»: la del día de la cámara elegida, si existe. */
  carpetaAbrir: string | null;
  camaras: CamaraGaleria[];
  /** Fotos del día de todas las cámaras (lo que dice el chip «Todas»). */
  totalDia: number;
  /** Filtradas por cámara, de la más nueva a la más vieja. */
  fotos: FotoPersonaGaleria[];
  porHora: PersonasPorHora[];
  resumen: {
    fotos: number;
    primera: string | null;
    ultima: string | null;
    /** Sólo con «Todas», dos o más cámaras con fotos y sin empate arriba. */
    camaraTop: { nombre: string; fotos: number } | null;
  };
  /** Día (Lima) con fotos más cercano hacia atrás / adelante, para no pasar días vacíos uno a uno. */
  anteriorConFotos: string | null;
  siguienteConFotos: string | null;
  /** Hubo más fotos que el tope: se muestran las más nuevas. */
  truncado: boolean;
}

export interface CarpetaGaleria {
  id: string;
  parentId: string | null;
  name: string;
}

export interface DocGaleria {
  id: string;
  folderId: string | null;
  name: string;
  uploadedAt: string;
  ocrMetadata: Record<string, unknown> | null;
}

const ZONA = "America/Lima";
const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

/** Lima no tiene horario de verano: el día va de las 05:00 UTC a las 05:00 UTC del siguiente. */
export function rangoDiaLima(dia: string): { desde: Date; hasta: Date } {
  const desde = new Date(`${dia}T00:00:00.000-05:00`);
  return { desde, hasta: new Date(desde.getTime() + 86_400_000) };
}

export function diaDeLima(iso: string | Date): string {
  return fmtDia.format(typeof iso === "string" ? new Date(iso) : iso);
}

const mismo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * La carpeta «Cámaras / Personas» y TODO lo que cuelga de ella (cámaras y días).
 * `null` si no existe en las carpetas que el rol ve. No crea nada.
 */
export function arbolPersonas(carpetas: readonly CarpetaGaleria[]): { personasId: string; ids: string[] } | null {
  let actual: string | null = null;
  for (const nombre of CARPETA_PERSONAS) {
    const f = carpetas.find((c) => (c.parentId ?? null) === actual && mismo(c.name, nombre));
    if (!f) return null;
    actual = f.id;
  }
  if (!actual) return null;
  const hijas = new Map<string, string[]>();
  for (const c of carpetas) {
    if (!c.parentId) continue;
    const l = hijas.get(c.parentId) ?? [];
    l.push(c.id);
    hijas.set(c.parentId, l);
  }
  const ids: string[] = [];
  const pila = [actual];
  while (pila.length) {
    const id = pila.pop()!;
    ids.push(id);
    pila.push(...(hijas.get(id) ?? []));
  }
  return { personasId: actual, ids };
}

const LABEL_A_MOTIVO = new Map(
  MOTIVOS_FOTO_PERSONA.map((m) => [MOTIVO_FOTO_PERSONA_LABEL[m].toLowerCase(), m] as const),
);
/** `14-05-33 · Apareció alguien · 2 personas.webp` */
const NOMBRE_FOTO = /^\d{2}-\d{2}-\d{2} · (.+?) · (\d+) personas?\.\w+$/i;

/**
 * Motivo y personas: de la metadata; si falta (la anotación va después de
 * subir), del nombre del archivo. `cajas` = dónde estaba cada persona y la
 * firma de su ropa (ADR-479); `null` en las fotos de antes del 08-10.
 */
export function leerMetaFoto(doc: Pick<DocGaleria, "name" | "ocrMetadata">): {
  motivo: MotivoFotoPersona | null;
  personas: number | null;
  confianza: number | null;
  camaraId: string | null;
  cajas: CajaGuardada[] | null;
} {
  const m = doc.ocrMetadata ?? {};
  const delNombre = NOMBRE_FOTO.exec(doc.name.trim());
  const motivoMeta = typeof m.motivo === "string" && (MOTIVOS_FOTO_PERSONA as readonly string[]).includes(m.motivo)
    ? (m.motivo as MotivoFotoPersona)
    : null;
  const personasMeta = typeof m.personas === "number" && Number.isFinite(m.personas) ? m.personas : null;
  return {
    motivo: motivoMeta ?? (delNombre ? (LABEL_A_MOTIVO.get(delNombre[1].toLowerCase()) ?? null) : null),
    personas: personasMeta ?? (delNombre ? Number(delNombre[2]) : null),
    confianza: typeof m.confianza === "number" && Number.isFinite(m.confianza) ? m.confianza : null,
    camaraId: typeof m.camaraId === "string" && m.camaraId ? m.camaraId : null,
    cajas: leerCajasGuardadas(m),
  };
}

export interface EntradaGaleria {
  dia: string;
  camara: string | null;
  carpetas: readonly CarpetaGaleria[];
  personasId: string | null;
  docs: readonly DocGaleria[];
  /** `carpeta` = `nombreCarpetaCamara(nombre)`: así se llama su carpeta en el Drive. */
  camaras: ReadonlyArray<{ id: string; nombre: string; carpeta: string }>;
  anteriorConFotos?: string | null;
  siguienteConFotos?: string | null;
  truncado?: boolean;
}

export function armarGaleria(e: EntradaGaleria): GaleriaPersonas {
  const porId = new Map(e.carpetas.map((c) => [c.id, c]));
  /** La carpeta de la cámara: la hija directa de «Personas» en la cadena de la foto. */
  const carpetaCamara = (folderId: string | null): CarpetaGaleria | null => {
    let actual = folderId ? porId.get(folderId) : undefined;
    for (let i = 0; actual && i < 20; i++) {
      if (actual.parentId === e.personasId) return actual;
      actual = actual.parentId ? porId.get(actual.parentId) : undefined;
    }
    return null;
  };
  const camaraPorId = new Map(e.camaras.map((c) => [c.id, c]));

  const todas: FotoPersonaGaleria[] = e.docs
    .map((d) => {
      const meta = leerMetaFoto(d);
      const carpeta = carpetaCamara(d.folderId);
      const porCarpeta = carpeta ? e.camaras.find((c) => mismo(c.carpeta, carpeta.name)) : undefined;
      const viva = meta.camaraId ? camaraPorId.get(meta.camaraId) : porCarpeta;
      const clave = meta.camaraId ?? porCarpeta?.id ?? (carpeta ? `carpeta:${carpeta.id}` : "carpeta:suelta");
      return {
        id: d.id,
        camara: clave,
        camaraNombre: viva?.nombre ?? carpeta?.name ?? "Cámara quitada",
        carpetaId: d.folderId,
        en: d.uploadedAt,
        hora: fmtHora.format(new Date(d.uploadedAt)),
        motivo: meta.motivo,
        personas: meta.personas,
        confianza: meta.confianza,
      };
    })
    .sort((a, b) => b.en.localeCompare(a.en));

  const conteo = new Map<string, CamaraGaleria>();
  for (const f of todas) {
    const c = conteo.get(f.camara) ?? { clave: f.camara, nombre: f.camaraNombre, fotos: 0 };
    c.fotos++;
    conteo.set(f.camara, c);
  }
  const camaras = [...conteo.values()].sort((a, b) => b.fotos - a.fotos || a.nombre.localeCompare(b.nombre, "es"));

  const fotos = e.camara ? todas.filter((f) => f.camara === e.camara) : todas;

  const horas = new Map<number, PersonasPorHora>();
  for (const f of fotos) {
    const h = Number(f.hora.slice(0, 2));
    const fila = horas.get(h) ?? { hora: h, max: 0, fotos: 0 };
    fila.fotos++;
    fila.max = Math.max(fila.max, f.personas ?? 1);
    horas.set(h, fila);
  }

  // Con empate no hay «cámara con más».
  const top = !e.camara && camaras.length >= 2 && camaras[0].fotos > camaras[1].fotos ? camaras[0] : null;
  return {
    ok: true,
    dia: e.dia,
    camara: e.camara,
    carpetaId: e.personasId,
    carpetaAbrir: carpetaParaAbrir(e, fotos),
    camaras,
    totalDia: todas.length,
    fotos,
    porHora: [...horas.values()].sort((a, b) => a.hora - b.hora),
    resumen: {
      fotos: fotos.length,
      primera: fotos.length ? fotos[fotos.length - 1].hora.slice(0, 5) : null,
      ultima: fotos.length ? fotos[0].hora.slice(0, 5) : null,
      camaraTop: top ? { nombre: top.nombre, fotos: top.fotos } : null,
    },
    anteriorConFotos: e.anteriorConFotos ?? null,
    siguienteConFotos: e.siguienteConFotos ?? null,
    truncado: e.truncado ?? false,
  };
}

/** Con una cámara elegida: su carpeta del día (o la de la cámara). Con «Todas»: «Personas». */
function carpetaParaAbrir(e: EntradaGaleria, fotos: readonly FotoPersonaGaleria[]): string | null {
  if (!e.personasId || !e.camara) return e.personasId;
  const cam = e.camaras.find((c) => c.id === e.camara);
  const nombre = cam?.carpeta ?? fotos[0]?.camaraNombre;
  const deCamara = nombre
    ? e.carpetas.find((c) => c.parentId === e.personasId && mismo(c.name, nombre))
    : undefined;
  if (!deCamara) return e.personasId;
  return e.carpetas.find((c) => c.parentId === deCamara.id && c.name.trim() === e.dia)?.id ?? deCamara.id;
}
