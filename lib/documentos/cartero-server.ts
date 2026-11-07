import "server-only";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { SuppliersDB } from "@/lib/db/purchases.db";
import { VinculosCarpetaDB } from "@/lib/db/vinculos-carpeta.db";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { claveVinculo } from "@/lib/documentos/terceros-vinculo";
import {
  decidirEntidad, etiquetaDeEntidad, leerCartero,
  type CarteroDocumento, type EntidadCartero,
} from "@/lib/documentos/cartero";

/**
 * El cartero de papeles del servidor (Brandon 06-11): arma la lista de clientes
 * y proveedores del negocio, decide con `decidirEntidad` y lo guarda en el
 * documento. Lo que eligió una persona («¿Es de X?» → Sí/No) no se pisa nunca.
 */

/** La lista se reusa 60 s: la lectura de la noche analiza decenas de papeles seguidos. */
const VIDA_LISTA_MS = 60_000;
/** Tope de negocios en memoria (security 06-11): cada lista puede traer hasta 5.000 clientes. */
const MAX_LISTAS = 200;
const listas = new Map<string, { hasta: number; entidades: EntidadCartero[] }>();

/** DNI (8) o RUC (11): números más cortos salen por casualidad en cualquier papel. */
function numeroDoc(s: string | null | undefined): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d : null;
}

function sinVacios(...xs: (string | null | undefined)[]): string[] {
  return [...new Set(xs.map((x) => (x ?? "").trim()).filter((x) => x.length > 0))];
}

export async function entidadesDelNegocio(tenantId: string): Promise<EntidadCartero[]> {
  const guardada = listas.get(tenantId);
  if (guardada && guardada.hasta > Date.now()) return guardada.entidades;
  const [clientes, proveedores, alias] = await Promise.all([
    CustomersDB.paraCartero(tenantId),
    SuppliersDB.getAll(tenantId),
    VinculosCarpetaDB.alias(tenantId).catch((err) => {
      logger.warn("[cartero] alias de terceros no se leyeron", { error: String(err) });
      return {} as Record<string, string>;
    }),
  ]);
  const entidades: EntidadCartero[] = [];
  for (const c of clientes) {
    const nombre = (c.name || c.razonSocial || "").trim();
    if (!nombre) continue;
    entidades.push({
      tipo: "cliente",
      id: c.phone,
      nombre,
      alias: sinVacios(c.razonSocial, numeroDoc(c.documento), alias[claveVinculo("cliente", c.phone)]),
    });
  }
  for (const s of proveedores) {
    const nombre = (s.name || s.razonSocial || "").trim();
    if (!nombre) continue;
    entidades.push({
      tipo: "proveedor",
      id: s.id,
      nombre,
      alias: sinVacios(s.razonSocial, numeroDoc(s.ruc), numeroDoc(s.documento), alias[claveVinculo("proveedor", s.id)]),
    });
  }
  for (const [k, v] of listas) if (v.hasta <= Date.now()) listas.delete(k); // las vencidas se van al escribir
  if (listas.size >= MAX_LISTAS) listas.delete(listas.keys().next().value as string); // la más vieja (Map guarda el orden)
  listas.set(tenantId, { hasta: Date.now() + VIDA_LISTA_MS, entidades });
  return entidades;
}

/**
 * Corre el cartero sobre un documento y guarda lo que decidió. Si es «seguro»
 * y el papel no estaba atado a nadie (o lo había atado el propio cartero), lo
 * ata: `customerId`/`supplierId` + etiqueta «👤 Nombre». Sin texto leído mira
 * sólo el nombre del archivo. Devuelve lo guardado (o `null` si no escribió).
 */
export async function correrCartero(
  tenantId: string,
  docId: string,
  entidades?: EntidadCartero[],
): Promise<CarteroDocumento | null> {
  const doc = await DocumentsDB.getById(tenantId, docId);
  if (!doc) return null;
  const previo = leerCartero(doc.ocrMetadata);
  if (previo?.decidido?.por === "usuario") return previo;

  const lista = entidades ?? (await entidadesDelNegocio(tenantId));
  const archivo = doc.name === doc.originalName ? doc.name : `${doc.name} ${doc.originalName}`;
  const decision = decidirEntidad(archivo, doc.ocrText ?? "", lista);

  // ¿El vínculo actual lo puso el cartero? Entonces puede corregirlo.
  const dPrevio = previo?.decidido;
  const puestoPorCartero =
    dPrevio?.por === "cartero" &&
    ((dPrevio.tipo === "cliente" && doc.customerId === dPrevio.id && !doc.supplierId) ||
      (dPrevio.tipo === "proveedor" && doc.supplierId === dPrevio.id && !doc.customerId));
  const libre = (!doc.customerId && !doc.supplierId) || puestoPorCartero;
  // Una relectura menos clara no desata lo que el cartero ya había atado.
  if (puestoPorCartero && decision.estado !== "seguro") return previo;

  const elegido = decision.estado === "seguro" && libre ? decision.candidatos[0] : undefined;
  const cartero: CarteroDocumento = {
    ...decision,
    ...(elegido
      ? { decidido: { tipo: elegido.tipo, id: elegido.id, nombre: elegido.nombre, por: "cartero" as const, at: new Date().toISOString() } }
      : {}),
  };
  const guardado = await DocumentsDB.guardarCartero(tenantId, docId, {
    cartero,
    customerId: elegido ? (elegido.tipo === "cliente" ? elegido.id : null) : doc.customerId,
    supplierId: elegido ? (elegido.tipo === "proveedor" ? elegido.id : null) : doc.supplierId,
    etiqueta: elegido ? etiquetaDeEntidad(elegido.nombre) : null,
    quitarEtiquetas: !!elegido && puestoPorCartero,
    siSigueComo: { customerId: doc.customerId, supplierId: doc.supplierId },
  });
  if (guardado) {
    invalidateAdminCache.afterDocument(tenantId);
    if (elegido) {
      // Auditoría del vínculo automático (security 06-11): que se vea en el historial quién ató el papel.
      DocumentsDB.log(tenantId, {
        documentId: docId,
        actorId: "cartero",
        action: "link",
        metadata: { cartero: true, automatico: true, tipo: elegido.tipo, entidadId: elegido.id, nombre: elegido.nombre, motivo: decision.motivo },
      }).catch((err) => logger.error("[cartero] auditoría del vínculo automático falló", { error: String(err) }));
    }
  }
  return guardado?.cartero ?? null;
}
