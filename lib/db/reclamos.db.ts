/**
 * lib/db/reclamos.db.ts — Libro de Reclamaciones Virtual (ADR-129).
 *
 * Platform-level POR DISEÑO: el Libro de Reclamaciones es de la plataforma, no de
 * un tenant (Ley N° 29571 + D.S. 011-2011-PCM, endpoint público). Por eso esta
 * clase NO recibe `tenantId` como 1er argumento — excepción documentada al rubric
 * `db-class.json`. `tenantId`/`tienda` quedan como campos opcionales para una futura
 * derivación del reclamo al vendor del marketplace.
 *
 * Fuente de verdad legal: cada hoja se persiste aquí (retención >= 2 años); el
 * email es solo acuse secundario.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export type ReclamoInput = {
  nombre: string;
  tipoDocumento: string;
  numeroDocumento: string;
  domicilio: string;
  telefono: string;
  email: string;
  esMenor: boolean;
  apoderado?: string;
  tipoBien: string;
  montoReclamado?: number;
  descripcionBien: string;
  numeroPedido?: string;
  tienda?: string;
  tenantId?: string | null;
  tipoReclamo: string;
  detalle: string;
  pedidoConsumidor: string;
  ip?: string | null;
  userAgent?: string | null;
};

/** Código humano correlativo: LR-AAAA-NNNNNN derivado del `numero` (serial). */
function buildCodigo(numero: number, when: Date): string {
  return `LR-${when.getFullYear()}-${String(numero).padStart(6, "0")}`;
}

export const ReclamosDB = {
  /**
   * Registra una hoja del Libro de Reclamaciones. Inserta primero (correlativo
   * `numero` autoincrement) y deriva el código LR-AAAA-NNNNNN.
   */
  async create(
    input: ReclamoInput,
  ): Promise<{ id: string; numero: number; codigo: string }> {
    const created = await prisma.reclamo.create({
      data: {
        nombre: input.nombre,
        tipoDocumento: input.tipoDocumento,
        numeroDocumento: input.numeroDocumento,
        domicilio: input.domicilio,
        telefono: input.telefono,
        email: input.email,
        esMenor: input.esMenor,
        apoderado: input.apoderado || null,
        tipoBien: input.tipoBien,
        montoReclamado: input.montoReclamado ?? null,
        descripcionBien: input.descripcionBien,
        numeroPedido: input.numeroPedido || null,
        tienda: input.tienda || null,
        tenantId: input.tenantId ?? null,
        tipoReclamo: input.tipoReclamo,
        detalle: input.detalle,
        pedidoConsumidor: input.pedidoConsumidor,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
      select: { id: true, numero: true, createdAt: true },
    });
    const codigo = buildCodigo(created.numero, created.createdAt);
    await prisma.reclamo.update({ where: { id: created.id }, data: { codigo } });
    return { id: created.id, numero: created.numero, codigo };
  },

  /** Busca una hoja por su código (seguimiento del consumidor). */
  async getByCodigo(codigo: string) {
    return prisma.reclamo.findUnique({ where: { codigo } });
  },

  /** Lista paginada para el panel superadmin / export INDECOPI (futuro). */
  async list(
    opts: { estado?: string; take?: number; skip?: number } = {},
  ) {
    return prisma.reclamo.findMany({
      where: opts.estado ? { estado: opts.estado } : undefined,
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.take ?? 50, 200),
      skip: opts.skip ?? 0,
    });
  },
};
