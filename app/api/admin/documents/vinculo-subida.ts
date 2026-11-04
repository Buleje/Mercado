/**
 * Campos opcionales de `POST /api/admin/documents` (ADR-524 §3.1): carpeta por
 * ruta, categoría, etiquetas, vencimiento, «a qué se cuelga» y qué hacer si el
 * archivo ya está. Sin ninguno de ellos la subida es la de siempre.
 *
 * El vínculo se resuelve ANTES de subir (la entidad tiene que ser de este
 * negocio: si no, 404 y no queda un archivo huérfano) y se aplica DESPUÉS
 * (tag de máquina + el efecto de cada tipo). Si el efecto falla el archivo
 * queda subido y atado por el tag, con `vinculado: false`.
 */
import { z } from "zod";
import { VINCULOS_DOCUMENTO, type VinculoDocumento } from "@/lib/admin/fichas-tramites-alquileres";
import { diaSchema } from "@/lib/forestal/directorio";
import { esTagDeEntidad, ROLES_PAPEL_SENSIBLE, tagEntidad } from "@/lib/documentos/enlaces-entidad";
import { pareceClave } from "@/lib/admin/sin-claves";
import { esTagDeVinculo } from "@/lib/documentos/terceros-vinculo";
import { PROFUNDIDAD_MAX } from "@/lib/documentos/importar-arbol";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { TramitesDB } from "@/lib/db/tramites.db";
import { AlquileresDB } from "@/lib/db/alquileres.db";

/** Quién puede colgar un papel de una ficha, trámite o alquiler. */
export const ROLES_VINCULO: readonly string[] = ["admin", "owner"];
/** Papeles de fichas, trámites y alquileres: solo dueños (vive en `enlaces-entidad`, ADR-524). */
export { ROLES_PAPEL_SENSIBLE };

const TOPE_TAGS = 20;
const TOPE_TAG = 40;
const TOPE_SEGMENTO = 80;

const camposSchema = z
  .object({
    carpetaRuta: z.string().trim().max(500).optional(),
    category: z.string().trim().min(1).max(40).optional(),
    tags: z.string().max(4000).optional(),
    expiresAt: diaSchema.optional(),
    vinculoTipo: z.enum(VINCULOS_DOCUMENTO).optional(),
    vinculoId: z.string().trim().min(1).max(90).optional(),
    siExiste: z.enum(["saltar", "subir"]).optional(),
  })
  .refine((o) => !o.vinculoTipo === !o.vinculoId, { message: "vinculoTipo y vinculoId van juntos" });

const CLAVES = ["carpetaRuta", "category", "tags", "expiresAt", "vinculoTipo", "vinculoId", "siExiste"] as const;

export interface MetadatosSubida {
  /** Segmentos de `carpetaRuta` («Trámites/Agrobanco 2026-10»); null = usar `folderId`. */
  ruta: string | null;
  category?: string;
  tags: string[];
  expiresAt?: Date;
  vinculo: { tipo: VinculoDocumento; id: string } | null;
  saltarSiExiste: boolean;
}

type Malo = { ok: false; status: number; body: { error: string; message: string; campo?: string } };
const malo = (message: string): Malo => ({ ok: false, status: 400, body: { error: "invalid_body", message } });
/** Mismo contrato que `respuestaInvalida` (ADR-524): una clave no se guarda ni en una carpeta ni en una etiqueta. */
const conClave = (campo: string): Malo => ({
  ok: false,
  status: 422,
  body: {
    error: "parece_clave",
    campo,
    message: "Eso parece una clave o un usuario SOL. Las claves no se guardan en el panel: anota solo quién la tiene.",
  },
});

function leerRuta(cruda: string): { ok: true; ruta: string } | Malo {
  const segmentos = cruda
    .split(/[\\/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segmentos.length === 0) return malo("La carpeta vino vacía.");
  if (segmentos.some((s) => s === "." || s === "..")) return malo("La carpeta no puede llevar «.» ni «..».");
  if (segmentos.some((s) => s.length > TOPE_SEGMENTO)) return malo(`Cada carpeta va hasta ${TOPE_SEGMENTO} letras.`);
  if (segmentos.length > PROFUNDIDAD_MAX) return malo(`La carpeta pasa de ${PROFUNDIDAD_MAX} niveles.`);
  if (segmentos.some((s) => pareceClave(s))) return conClave("carpetaRuta");
  return { ok: true, ruta: segmentos.join("/") };
}

function leerTags(crudo: string): { ok: true; tags: string[] } | Malo {
  let lista: unknown;
  try {
    lista = JSON.parse(crudo);
  } catch {
    return malo("Las etiquetas van como lista JSON: [\"agrobanco\", \"alquiler\"].");
  }
  if (!Array.isArray(lista) || !lista.every((t) => typeof t === "string")) {
    return malo("Las etiquetas van como lista JSON de textos.");
  }
  const tags = [...new Set(lista.map((t: string) => t.trim()).filter(Boolean))];
  if (tags.length > TOPE_TAGS) return malo(`Hasta ${TOPE_TAGS} etiquetas por archivo.`);
  const larga = tags.find((t) => t.length > TOPE_TAG);
  if (larga) return malo(`La etiqueta «${larga.slice(0, 50)}» pasa de ${TOPE_TAG} letras.`);
  // Los tags de máquina (`tramiteadm:…`, `parte:…`) los pone el servidor con el
  // vínculo: uno escrito a mano ataría el papel a una entidad sin verificarla.
  const deSistema = tags.find((t) => esTagDeEntidad(t.toLowerCase()) || esTagDeVinculo(t));
  if (deSistema) return malo(`«${deSistema}» es una etiqueta del sistema: usa vinculoTipo/vinculoId.`);
  if (tags.some((t) => pareceClave(t))) return conClave("tags");
  return { ok: true, tags };
}

/** Lee y valida los campos opcionales del formulario. */
export function leerMetadatos(form: FormData): { ok: true; data: MetadatosSubida } | Malo {
  const crudo: Record<string, string> = {};
  for (const k of CLAVES) {
    const v = form.get(k);
    if (typeof v === "string" && v.trim() !== "") crudo[k] = v;
  }
  const p = camposSchema.safeParse(crudo);
  if (!p.success) {
    const i = p.error.issues[0];
    return malo(i ? `${i.path.join(".") || "cuerpo"}: ${i.message}` : "Campos inválidos.");
  }
  const d = p.data;
  let ruta: string | null = null;
  if (d.carpetaRuta) {
    const r = leerRuta(d.carpetaRuta);
    if (!r.ok) return r;
    ruta = r.ruta;
  }
  let tags: string[] = [];
  if (d.tags) {
    const t = leerTags(d.tags);
    if (!t.ok) return t;
    tags = t.tags;
  }
  return {
    ok: true,
    data: {
      ruta,
      category: d.category,
      tags,
      expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T00:00:00Z`) : undefined,
      vinculo: d.vinculoTipo && d.vinculoId ? { tipo: d.vinculoTipo, id: d.vinculoId } : null,
      saltarSiExiste: d.siExiste === "saltar",
    },
  };
}

export interface DestinoVinculo {
  tipo: VinculoDocumento;
  /** Tag de máquina que ata el documento: `parte:` / `tramiteadm:` / `alquiler:`. */
  tag: string;
  /** Papel con candado de dueños (fichas, trámites y alquileres). */
  sensible: boolean;
  /** El efecto de cada tipo sobre la entidad; true si quedó colgado. */
  aplicar: (documentId: string, rotulo: string, user: string) => Promise<boolean>;
}

/** `<a>:<b>` → [a, b]; sin «:» → [a, null]. */
function partir(id: string): [string, string | null] {
  const i = id.indexOf(":");
  return i < 0 ? [id, null] : [id.slice(0, i).trim(), id.slice(i + 1).trim() || null];
}

/**
 * La entidad del vínculo, verificada en ESTE negocio (null = 404).
 * `requisito` = `<tramiteId>:<requisitoId>`; `pago_alquiler` = `<pagoId>` o
 * `<alquilerId>:<pagoId>`.
 */
export async function resolverVinculo(
  tenantId: string,
  v: { tipo: VinculoDocumento; id: string },
): Promise<DestinoVinculo | null> {
  switch (v.tipo) {
    case "parte": {
      const parte = await ForestDirectorioDB.getParte(tenantId, v.id);
      if (!parte) return null;
      return {
        tipo: v.tipo,
        tag: `parte:${parte.id}`,
        // DNI, ficha RUC, carta poder: datos personales (Ley 29733) → candado.
        sensible: true,
        aplicar: async (documentId, rotulo, user) =>
          (await ForestDirectorioDB.actualizarParteParcial(
            tenantId,
            parte.id,
            { adjuntosAgregar: [{ documentId, rotulo: rotulo.slice(0, 120) || "Documento" }] },
            user,
          )) !== null,
      };
    }
    case "tramite": {
      const t = await TramitesDB.obtener(tenantId, v.id);
      if (!t) return null;
      return {
        tipo: v.tipo,
        tag: tagEntidad("tramite_adm", t.id),
        sensible: true,
        // El tag ya lo ata; la lista del trámite cachea sus documentos.
        aplicar: async () => {
          TramitesDB.olvidar(tenantId);
          return true;
        },
      };
    }
    case "requisito": {
      const [tramiteId, requisitoId] = partir(v.id);
      if (!tramiteId || !requisitoId) return null;
      const t = await TramitesDB.obtener(tenantId, tramiteId);
      if (!t || !t.requisitos.some((r) => r.id === requisitoId)) return null;
      return {
        tipo: v.tipo,
        tag: tagEntidad("tramite_adm", t.id),
        sensible: true,
        aplicar: async (documentId, _rotulo, user) =>
          (await TramitesDB.requisitos(tenantId, t.id, { cambiar: [{ id: requisitoId, documentId, estado: "hay" }] }, user)).ok,
      };
    }
    case "alquiler": {
      const a = await AlquileresDB.obtener(tenantId, v.id);
      if (!a) return null;
      return {
        tipo: v.tipo,
        tag: tagEntidad("alquiler", a.id),
        sensible: true,
        // Sin contrato → este papel es el contrato. Con contrato, queda atado
        // por el tag (cambiar el contrato es un PATCH explícito).
        aplicar: async (documentId, _rotulo, user) => {
          if (!a.contratoDocumentId) await AlquileresDB.ponerContratoSiFalta(tenantId, a.id, documentId, user);
          else AlquileresDB.olvidar(tenantId);
          return true;
        },
      };
    }
    case "pago_alquiler": {
      const [primero, segundo] = partir(v.id);
      const pagoId = segundo ?? primero;
      const delPago = pagoId ? await AlquileresDB.alquilerDelPago(tenantId, pagoId) : null;
      if (!delPago || (segundo && delPago.alquilerId !== primero)) return null;
      return {
        tipo: v.tipo,
        tag: tagEntidad("alquiler", delPago.alquilerId),
        sensible: true,
        aplicar: async (documentId, _rotulo, user) =>
          (await AlquileresDB.corregirPago(tenantId, delPago.alquilerId, pagoId, { comprobanteDocumentId: documentId }, user)).ok,
      };
    }
  }
}

/** Une etiquetas sin repetir (la heurística, las del pedido y la de máquina). */
export function unirTags(...listas: (readonly string[] | string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const l of listas) {
    for (const t of typeof l === "string" ? [l] : (l ?? [])) if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
