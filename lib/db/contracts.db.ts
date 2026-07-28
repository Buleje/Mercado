import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  Contract as PContract,
  ContractSigner as PContractSigner,
  ContractEvent as PContractEvent,
} from "@/lib/generated/prisma/client";
import type {
  DbContract,
  DbContractSigner,
  DbContractEvent,
  ContractEventType,
  ContractListFilters,
  CreateContractInput,
  UpdateContractInput,
  CreateSignerInput,
} from "@/lib/types/contracts";

// ── Serialización ─────────────────────────────────────────────────────────────

function toISO(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function mapSigner(s: PContractSigner): DbContractSigner {
  return {
    id: s.id,
    contractId: s.contractId,
    orden: s.orden,
    rol: s.rol as DbContractSigner["rol"],
    nombre: s.nombre,
    documento: s.documento,
    telefono: s.telefono,
    email: s.email,
    estado: s.estado as DbContractSigner["estado"],
    // El token es la credencial del link público: NUNCA sale en los listados
    // del admin salvo que se pida explícitamente (ver `getSignerToken`).
    tieneFirma: Boolean(s.firmaDataUrl),
    firmadoEn: toISO(s.firmadoEn),
    enviadoEn: toISO(s.enviadoEn),
    motivoRechazo: s.motivoRechazo,
    createdAt: s.createdAt.toISOString(),
  };
}

function mapEvent(e: PContractEvent): DbContractEvent {
  return {
    id: e.id,
    contractId: e.contractId,
    tipo: e.tipo as ContractEventType,
    detalle: e.detalle,
    actor: e.actor,
    metadata: (e.metadata ?? null) as Record<string, unknown> | null,
    createdAt: e.createdAt.toISOString(),
  };
}

type PContractFull = PContract & {
  firmantes?: PContractSigner[];
  eventos?: PContractEvent[];
};

function mapContract(c: PContractFull): DbContract {
  return {
    id: c.id,
    tenantId: c.tenantId,
    numero: c.numero,
    tipo: c.tipo as DbContract["tipo"],
    estado: c.estado as DbContract["estado"],
    clienteNombre: c.clienteNombre,
    clienteDoc: c.clienteDoc,
    customerId: c.customerId,
    supplierId: c.supplierId,
    descripcion: c.descripcion,
    resumen: c.resumen,
    monto: Number(c.monto),
    moneda: c.moneda as DbContract["moneda"],
    fechaInicio: c.fechaInicio.toISOString(),
    fechaVencimiento: toISO(c.fechaVencimiento),
    plantillaId: c.plantillaId,
    contenido: c.contenido,
    datos: (c.datos ?? null) as Record<string, string> | null,
    clausulas: c.clausulas,
    lugarFirma: c.lugarFirma,
    condiciones: c.condiciones,
    documentId: c.documentId,
    hashSha256: c.hashSha256,
    firmadoEn: toISO(c.firmadoEn),
    renovadoDeId: c.renovadoDeId,
    revisionIa: (c.revisionIa ?? null) as DbContract["revisionIa"],
    creadoPor: c.creadoPor,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    firmantes: (c.firmantes ?? []).map(mapSigner),
    eventos: (c.eventos ?? []).map(mapEvent),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * El correlativo se calculaba con `max(count, total) + 1` sobre notas: dos
 * contratos creados al mismo tiempo recibían el MISMO número. Ahora el número
 * se deriva del mayor existente y el índice único `(tenantId, numero)` es el
 * árbitro final — si dos requests chocan, la que pierde reintenta.
 */
async function siguienteNumero(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CONT-${year}-`;
  const ultimo = await prisma.contract.findFirst({
    where: { tenantId, numero: { startsWith: prefix } },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  const actual = ultimo ? parseInt(ultimo.numero.slice(prefix.length), 10) : 0;
  const siguiente = Number.isFinite(actual) ? actual + 1 : 1;
  return `${prefix}${String(siguiente).padStart(4, "0")}`;
}

function nuevoToken(): string {
  return randomBytes(24).toString("base64url");
}

const MAX_REINTENTOS_NUMERO = 5;

// ── API ───────────────────────────────────────────────────────────────────────

export const ContractsDB = {
  async list(tenantId: string, filters: ContractListFilters = {}): Promise<DbContract[]> {
    const where: Prisma.ContractWhereInput = { tenantId, deletedAt: null };

    if (filters.tipo) where.tipo = filters.tipo;
    if (filters.estado) where.estado = filters.estado;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.from || filters.to) {
      where.fechaInicio = {
        ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      };
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { numero: { contains: q, mode: "insensitive" } },
        { clienteNombre: { contains: q, mode: "insensitive" } },
        { clienteDoc: { contains: q, mode: "insensitive" } },
        { descripcion: { contains: q, mode: "insensitive" } },
        { contenido: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.contract.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 500,
      include: { firmantes: { orderBy: { orden: "asc" } } },
    });
    return rows.map(mapContract);
  },

  async getById(tenantId: string, id: string): Promise<DbContract | null> {
    const row = await prisma.contract.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        firmantes: { orderBy: { orden: "asc" } },
        eventos: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    return row ? mapContract(row) : null;
  },

  async create(tenantId: string, input: CreateContractInput): Promise<DbContract> {
    for (let intento = 0; intento < MAX_REINTENTOS_NUMERO; intento++) {
      const numero = await siguienteNumero(tenantId);
      try {
        const row = await prisma.contract.create({
          data: {
            tenantId,
            numero,
            tipo: input.tipo,
            estado: input.estado ?? "VIGENTE",
            clienteNombre: input.clienteNombre,
            clienteDoc: input.clienteDoc ?? "",
            customerId: input.customerId ?? null,
            supplierId: input.supplierId ?? null,
            descripcion: input.descripcion ?? "",
            resumen: input.resumen ?? "",
            monto: new Prisma.Decimal(input.monto ?? 0),
            moneda: input.moneda ?? "PEN",
            fechaInicio: new Date(input.fechaInicio),
            fechaVencimiento: input.fechaVencimiento ? new Date(input.fechaVencimiento) : null,
            plantillaId: input.plantillaId ?? null,
            contenido: input.contenido ?? "",
            datos: (input.datos ?? undefined) as Prisma.InputJsonValue | undefined,
            clausulas: input.clausulas ?? [],
            lugarFirma: input.lugarFirma ?? "Pucallpa",
            condiciones: input.condiciones ?? "",
            renovadoDeId: input.renovadoDeId ?? null,
            creadoPor: input.creadoPor ?? "",
          },
          include: { firmantes: true },
        });
        return mapContract(row);
      } catch (e) {
        // P2002 = otro request se quedó con este correlativo. Reintentamos.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          logger.warn("[contracts] correlativo tomado, reintentando", { numero, intento });
          continue;
        }
        throw e;
      }
    }
    throw new Error("No se pudo asignar un número de contrato libre");
  },

  async update(tenantId: string, id: string, input: UpdateContractInput): Promise<DbContract | null> {
    const existing = await prisma.contract.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return null;

    const data: Prisma.ContractUpdateInput = {};
    if (input.tipo !== undefined) data.tipo = input.tipo;
    if (input.estado !== undefined) data.estado = input.estado;
    if (input.clienteNombre !== undefined) data.clienteNombre = input.clienteNombre;
    if (input.clienteDoc !== undefined) data.clienteDoc = input.clienteDoc;
    if (input.customerId !== undefined) data.customerId = input.customerId;
    if (input.supplierId !== undefined) data.supplierId = input.supplierId;
    if (input.descripcion !== undefined) data.descripcion = input.descripcion;
    if (input.resumen !== undefined) data.resumen = input.resumen;
    if (input.monto !== undefined) data.monto = new Prisma.Decimal(input.monto);
    if (input.moneda !== undefined) data.moneda = input.moneda;
    if (input.fechaInicio !== undefined) data.fechaInicio = new Date(input.fechaInicio);
    if (input.fechaVencimiento !== undefined) {
      data.fechaVencimiento = input.fechaVencimiento ? new Date(input.fechaVencimiento) : null;
      // Cambiar el vencimiento re-arma el ciclo del recordatorio (ADR-119).
      data.recordatorioEnviadoEn = null;
    }
    if (input.contenido !== undefined) data.contenido = input.contenido;
    if (input.datos !== undefined) data.datos = (input.datos ?? undefined) as Prisma.InputJsonValue | undefined;
    if (input.clausulas !== undefined) data.clausulas = input.clausulas;
    if (input.lugarFirma !== undefined) data.lugarFirma = input.lugarFirma;
    if (input.condiciones !== undefined) data.condiciones = input.condiciones;
    if (input.documentId !== undefined) data.documentId = input.documentId;
    if (input.hashSha256 !== undefined) data.hashSha256 = input.hashSha256;
    if (input.firmadoEn !== undefined) data.firmadoEn = input.firmadoEn ? new Date(input.firmadoEn) : null;
    if (input.revisionIa !== undefined) {
      data.revisionIa = (input.revisionIa ?? undefined) as Prisma.InputJsonValue | undefined;
    }

    const row = await prisma.contract.update({
      where: { id },
      data,
      include: { firmantes: { orderBy: { orden: "asc" } } },
    });
    return mapContract(row);
  },

  async softDelete(tenantId: string, id: string): Promise<boolean> {
    const existing = await prisma.contract.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return false;
    await prisma.contract.update({ where: { id }, data: { deletedAt: new Date() } });
    return true;
  },

  // ── Eventos ────────────────────────────────────────────────────────────────

  async addEvent(
    tenantId: string,
    contractId: string,
    tipo: ContractEventType,
    detalle: string,
    actor: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await prisma.contractEvent.create({
      data: {
        tenantId,
        contractId,
        tipo,
        detalle,
        actor,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  },

  async listEvents(tenantId: string, contractId: string, limit = 50): Promise<DbContractEvent[]> {
    const rows = await prisma.contractEvent.findMany({
      where: { tenantId, contractId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(mapEvent);
  },

  // ── Firmantes ──────────────────────────────────────────────────────────────

  /** Reemplaza la lista de firmantes (sólo mientras nadie firmó todavía). */
  async setSigners(
    tenantId: string,
    contractId: string,
    firmantes: CreateSignerInput[],
  ): Promise<DbContractSigner[]> {
    const yaFirmo = await prisma.contractSigner.count({
      where: { contractId, tenantId, estado: "FIRMADO" },
    });
    if (yaFirmo > 0) throw new Error("no_se_puede_cambiar_firmantes_con_firmas");

    await prisma.contractSigner.deleteMany({ where: { contractId, tenantId } });
    await prisma.contractSigner.createMany({
      data: firmantes.map((f, i) => ({
        tenantId,
        contractId,
        orden: f.orden ?? i + 1,
        rol: f.rol ?? "CONTRAPARTE",
        nombre: f.nombre,
        documento: f.documento ?? "",
        telefono: f.telefono ?? "",
        email: f.email ?? null,
        token: nuevoToken(),
        tokenExpiraEn: new Date(Date.now() + 30 * 86_400_000),
      })),
    });
    const rows = await prisma.contractSigner.findMany({
      where: { contractId, tenantId },
      orderBy: { orden: "asc" },
    });
    return rows.map(mapSigner);
  },

  /** El token sólo se entrega cuando el admin va a mandar el link. */
  async getSignerToken(tenantId: string, signerId: string): Promise<string | null> {
    const row = await prisma.contractSigner.findFirst({
      where: { id: signerId, tenantId },
      select: { token: true },
    });
    return row?.token ?? null;
  },

  async markSignerSent(tenantId: string, signerId: string): Promise<void> {
    await prisma.contractSigner.updateMany({
      where: { id: signerId, tenantId },
      data: { enviadoEn: new Date() },
    });
  },

  /** Busca por token público — sin tenantId, el token ES la credencial. */
  async findBySignerToken(
    token: string,
  ): Promise<{ signer: PContractSigner; contract: DbContract } | null> {
    const signer = await prisma.contractSigner.findUnique({
      where: { token },
      include: {
        contract: {
          include: { firmantes: { orderBy: { orden: "asc" } } },
        },
      },
    });
    if (!signer || signer.contract.deletedAt) return null;
    return { signer, contract: mapContract(signer.contract) };
  },

  async signByToken(
    token: string,
    data: { firmaDataUrl: string; ip?: string; userAgent?: string },
  ): Promise<DbContractSigner | null> {
    const signer = await prisma.contractSigner.findUnique({ where: { token } });
    if (!signer || signer.estado === "FIRMADO") return null;
    const row = await prisma.contractSigner.update({
      where: { id: signer.id },
      data: {
        estado: "FIRMADO",
        firmaDataUrl: data.firmaDataUrl,
        firmadoEn: new Date(),
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
    return mapSigner(row);
  },

  async rejectByToken(token: string, motivo: string): Promise<DbContractSigner | null> {
    const signer = await prisma.contractSigner.findUnique({ where: { token } });
    if (!signer || signer.estado === "FIRMADO") return null;
    const row = await prisma.contractSigner.update({
      where: { id: signer.id },
      data: { estado: "RECHAZADO", motivoRechazo: motivo.slice(0, 500) },
    });
    return mapSigner(row);
  },

  /** Trazos de firma de un contrato, para dibujarlos en el PDF final. */
  async getSignatureImages(
    tenantId: string,
    contractId: string,
  ): Promise<{ nombre: string; rol: string; documento: string; firmaDataUrl: string; firmadoEn: Date }[]> {
    const rows = await prisma.contractSigner.findMany({
      where: { contractId, tenantId, estado: "FIRMADO", firmaDataUrl: { not: null } },
      orderBy: { orden: "asc" },
    });
    return rows.map((r) => ({
      nombre: r.nombre,
      rol: r.rol,
      documento: r.documento,
      firmaDataUrl: r.firmaDataUrl as string,
      firmadoEn: r.firmadoEn ?? r.createdAt,
    }));
  },

  // ── Vencimientos ───────────────────────────────────────────────────────────

  /**
   * Contratos cuyo vencimiento cae dentro de la ventana y a los que todavía no
   * se les avisó. Lo consume el cron diario.
   */
  async listPendingExpiryReminders(diasVentana: number): Promise<
    { id: string; tenantId: string; numero: string; clienteNombre: string; fechaVencimiento: Date }[]
  > {
    const hoy = new Date();
    const limite = new Date(hoy.getTime() + diasVentana * 86_400_000);
    const rows = await prisma.contract.findMany({
      where: {
        deletedAt: null,
        estado: { in: ["VIGENTE", "PENDIENTE_FIRMA"] },
        fechaVencimiento: { not: null, gte: hoy, lte: limite },
        recordatorioEnviadoEn: null,
      },
      select: { id: true, tenantId: true, numero: true, clienteNombre: true, fechaVencimiento: true },
      take: 200,
    });
    return rows.map((r) => ({ ...r, fechaVencimiento: r.fechaVencimiento as Date }));
  },

  async markReminderSent(tenantId: string, id: string): Promise<void> {
    await prisma.contract.updateMany({
      where: { id, tenantId },
      data: { recordatorioEnviadoEn: new Date() },
    });
  },

  /**
   * Pasa a VENCIDO todo contrato vigente cuya fecha ya pasó. Devuelve cuántos
   * cambió. El estado dejó de ser algo que la UI adivina en cada render.
   *
   * CROSS-TENANT A PROPÓSITO (ADR-101): lo llama el cron de plataforma, que
   * barre todos los negocios de una pasada. Iterar tenant por tenant sería una
   * query por bodega para el mismo resultado. El barrido es acotado: sólo toca
   * contratos VIGENTES con fecha ya cumplida, y sólo les cambia el estado —
   * nunca borra ni mueve datos entre tenants.
   */
  async expireOverdue(): Promise<number> {
    const res = await prisma.contract.updateMany({
      // eslint-disable-next-line no-restricted-syntax -- barrido de plataforma, ver comentario arriba
      where: {
        deletedAt: null,
        estado: "VIGENTE",
        fechaVencimiento: { not: null, lt: new Date() },
      },
      data: { estado: "VENCIDO" },
    });
    return res.count;
  },

  async countAll(tenantId: string): Promise<number> {
    return prisma.contract.count({ where: { tenantId, deletedAt: null } });
  },
};
