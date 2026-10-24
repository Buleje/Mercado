import "server-only";
import { prisma } from "@/lib/prisma";
import {
  ACCION_RECIBO_WHATSAPP,
  HORAS_MINIMAS_PARA_REUSAR,
  fichaSinTelefono,
  leerDetalleEnvio,
  tagDelAdelanto,
  type EstadoRecibos,
} from "@/lib/adelantos/recibo-whatsapp";

/**
 * El estado del recibo por adelanto (23-10): firmas del registro y envíos por
 * WhatsApp. Lee lo que ya existe (`AdelantoFirma`, `ActivityLog`, el PDF en el
 * Archivo por su etiqueta `adelanto:<id>`), anota el celular en la persona si
 * no tenía y corta los enlaces del recibo al anular.
 */
export const AdelantosReciboDB = {
  /**
   * Una pasada para la tabla: la última firma y huella de cada adelanto
   * (groupBy) y el último envío por WhatsApp (los 2.000 más nuevos alcanzan:
   * `main` tiene 74 adelantos y Blas 8).
   */
  async estados(tenantId: string): Promise<EstadoRecibos> {
    if (!tenantId) throw new Error("tenantId is required");
    const [firmas, envios] = await Promise.all([
      prisma.adelantoFirma.groupBy({
        by: ["adelantoId", "tipo"],
        where: { tenantId },
        _max: { createdAt: true },
      }),
      prisma.activityLog.findMany({
        where: { tenantId, entity: "adelanto", action: ACCION_RECIBO_WHATSAPP },
        orderBy: { createdAt: "desc" },
        select: { entityId: true, detail: true, user: true, createdAt: true },
        take: 2000,
      }),
    ]);
    const out: EstadoRecibos = {};
    const de = (id: string) => (out[id] ??= { firma: null, huella: null, envio: null });
    for (const f of firmas) {
      const en = f._max.createdAt?.toISOString() ?? null;
      if (f.tipo === "FIRMA") de(f.adelantoId).firma = en;
      else de(f.adelantoId).huella = en;
    }
    for (const e of envios) {
      if (!e.entityId) continue;
      const fila = de(e.entityId);
      if (fila.envio) continue; // ya está el más nuevo (vienen de nuevo a viejo)
      const leido = leerDetalleEnvio(e.detail);
      if (leido) fila.envio = { en: e.createdAt.toISOString(), nueve: leido.nueve, por: e.user, via: leido.via };
    }
    return out;
  },

  /**
   * El celular en la ficha de la persona SÓLO si estaba vacía (`fichaSinTelefono`,
   * el mismo criterio que la ventana): un fijo o un número con espacios no se
   * pisa. El `where` repite el valor leído: si otro lo cambió entre medio, no
   * se toca. `true` si lo anotó.
   */
  async anotarCelularSiFalta(tenantId: string, beneficiarioId: string, nueve: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const p = await prisma.adelantoBeneficiario.findFirst({ where: { tenantId, id: beneficiarioId }, select: { telefono: true } });
    if (!p || !fichaSinTelefono(p.telefono)) return false;
    const r = await prisma.adelantoBeneficiario.updateMany({
      where: { tenantId, id: beneficiarioId, telefono: p.telefono },
      data: { telefono: nueve },
    });
    // Sin caché que invalidar: `AdelantosDB` lee a las personas directo (la
    // lista las pide con `no-store` al recargar).
    return r.count > 0;
  },

  /** ¿Ese documento es un recibo de ESTE adelanto, del tenant y sin borrar? (el PUT no anota un envío de otro papel). */
  async esReciboDelAdelanto(tenantId: string, documentoId: string, adelantoId: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const n = await prisma.document.count({
      where: { tenantId, id: documentoId, deletedAt: null, tags: { has: tagDelAdelanto(adelantoId) } },
    });
    return n > 0;
  },

  /**
   * Lo que el recibo necesita saber de las firmas del adelanto: la última
   * (un recibo armado antes ya no las lleva todas) y los documentos de quienes
   * firmaron (la copia que se comparte no los puede llevar enteros).
   */
  async firmasDelRecibo(tenantId: string, adelantoId: string): Promise<{ ultima: Date | null; documentos: string[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.adelantoFirma.findMany({
      where: { tenantId, adelantoId },
      select: { createdAt: true, firmanteDocumento: true },
    });
    let ultima: Date | null = null;
    for (const f of filas) if (!ultima || f.createdAt > ultima) ultima = f.createdAt;
    return { ultima, documentos: [...new Set(filas.map((f) => f.firmanteDocumento))] };
  },

  /**
   * El recibo ya preparado de este adelanto, si sirve todavía: armado después
   * de `despuesDe` (el último cambio del adelanto, su firma, huella o foto) y
   * con al menos `HORAS_MINIMAS_PARA_REUSAR` de enlace. Así «Preparar» dos
   * veces no deja dos PDF en el Archivo.
   */
  async reciboVivo(tenantId: string, adelantoId: string, despuesDe: Date): Promise<{ documentoId: string; token: string; expiresAt: Date } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const s = await prisma.documentShare.findFirst({
      where: {
        tenantId,
        revokedAt: null,
        createdAt: { gt: despuesDe },
        expiresAt: { gt: new Date(Date.now() + HORAS_MINIMAS_PARA_REUSAR * 3_600_000) },
        document: { tenantId, deletedAt: null, tags: { has: tagDelAdelanto(adelantoId) } },
      },
      orderBy: { createdAt: "desc" },
      select: { documentId: true, token: true, expiresAt: true },
    });
    return s ? { documentoId: s.documentId, token: s.token, expiresAt: s.expiresAt } : null;
  },

  /**
   * Al anular el adelanto: corta TODOS los enlaces de sus recibos (Ley 29733:
   * un papel con DNI, firma, huella y foto de algo que ya no vale no queda
   * publicado). Devuelve cuántos cortó.
   */
  async revocarEnlaces(tenantId: string, adelantoId: string): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.documentShare.updateMany({
      where: { tenantId, revokedAt: null, document: { tenantId, tags: { has: tagDelAdelanto(adelantoId) } } },
      data: { revokedAt: new Date() },
    });
    return r.count;
  },
};
