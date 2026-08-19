import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  PREFIJO_ADELANTO,
  normalizarBusquedaCodigo,
  siguienteCodigo,
} from "@/lib/adelantos/codigo-operacion";
import { resumirPersona, type ResumenPersona } from "@/lib/adelantos/saldo-persona";
import {
  etiquetaEgreso,
  etiquetaIngreso,
  etiquetaReversion,
  moverCaja,
  type MetodoPago,
} from "@/lib/adelantos/movimiento-caja";

/**
 * AdelantosDB — Adelantos de dinero a personas/proveedores por servicios,
 * liquidados con entregas valuadas (producto o servicio). ADR-XXX (2026-05-25).
 *
 * Reglas críticas (CLAUDE.md):
 *  - tenantId SIEMPRE 1er param y en todo where (aislamiento multi-tenant).
 *  - Totales (valor de entrega, saldoPendiente) calculados en backend (anti-fraude #6).
 *  - registrarEntrega es atómico ($transaction): entrega + recálculo de saldo + status
 *    + cuota pactada + stock, todo o nada.
 */

// ── Types ───────────────────────────────────────────────────────────────────
export type AdelantoModalidad = "CUENTA_CORRIENTE" | "ENTREGAS_PACTADAS" | "DESCUENTO_PLANILLA";
export type AdelantoStatus = "ABIERTO" | "LIQUIDADO" | "EXCEDIDO" | "CANCELADO";
export type AdelantoEntregaTipo = "LIBRE" | "PRODUCTO";

export type DbBeneficiario = {
  id: string;
  nombre: string;
  documento?: string | null;
  telefono?: string | null;
  notas?: string | null;
  limiteCredito?: number | null;
  /**
   * Cuándo se le mandó el último recordatorio de cobranza.
   *
   * Vive en la BASE, no en el navegador: el cron `adelantos-recordatorios` la
   * escribe, y si la pantalla mirara `localStorage` (como hacía) no se
   * enterarían uno del otro — al mismo deudor le llegaba el aviso automático y
   * el manual el mismo día. Además, desde otra computadora no se veía nada.
   */
  ultimoRecordatorio?: string | null;
  /** (330) Identidad oficial, traída de RENIEC/SUNAT al tipear el documento. */
  tipoDocumento?: string | null;
  razonSocial?: string | null;
  direccion?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  email?: string | null;
  estadoSunat?: string | null;
  condicionSunat?: string | null;
  verificadoEn?: string | null;
  banco?: string | null;
  cuentaBancaria?: string | null;
  cci?: string | null;
  /** Baja lógica: se deja de ofrecer sin borrar su historial. */
  activo: boolean;
  createdAt: string;
};

export type DbGestion = {
  id: string;
  beneficiarioId: string;
  beneficiarioNombre?: string;
  fecha: string;
  tipo: string;
  nota?: string | null;
  fechaPrometida?: string | null;
  montoPrometido?: number | null;
  usuario?: string | null;
};

export type GestionInput = {
  beneficiarioId: string;
  tipo: string;
  nota?: string;
  fechaPrometida?: string | null;
  montoPrometido?: number | null;
  usuario?: string;
};

export type RecurrenteFrecuencia = "semanal" | "quincenal" | "mensual";
export type DbRecurrente = {
  id: string;
  beneficiarioId: string;
  beneficiarioNombre?: string;
  modalidad: AdelantoModalidad;
  monto: number;
  moneda: string;
  frecuencia: RecurrenteFrecuencia;
  diaMes?: number | null;
  activo: boolean;
  proximaEjecucion?: string | null;
  ultimaEjecucion?: string | null;
  notas?: string | null;
  createdAt: string;
};
export type RecurrenteInput = {
  beneficiarioId: string;
  modalidad?: AdelantoModalidad;
  monto: number;
  moneda?: string;
  frecuencia: RecurrenteFrecuencia;
  diaMes?: number | null;
  notas?: string;
};

export type DbAdelantoEntrega = {
  id: string;
  adelantoId: string;
  fecha: string;
  tipo: AdelantoEntregaTipo;
  descripcion?: string | null;
  productId?: number | null;
  cantidad?: number | null;
  valor: number;
  sumadoAStock: boolean;
  notas?: string | null;
  comprobanteUrl?: string | null;
  createdAt: string;
};

export type DbEntregaPactada = {
  id: string;
  numero: number;
  descripcionEsperada: string;
  valorEsperado: number;
  fechaEsperada?: string | null;
  cumplidaEn?: string | null;
  entregaId?: string | null;
};

export type DbAdelanto = {
  id: string;
  tenantId: string;
  /** «ADL-2026-0007» — el que se dicta por teléfono (ADR-329). */
  codigoOperacion?: string | null;
  /** N° del talonario de papel firmado. */
  reciboManual?: string | null;
  beneficiarioId: string;
  beneficiario?: DbBeneficiario;
  modalidad: AdelantoModalidad;
  montoAdelantado: number;
  moneda: string;
  fechaAdelanto: string;
  /** (332) Cuándo se acordó devolverlo. */
  fechaVencimiento?: string | null;
  status: AdelantoStatus;
  saldoPendiente: number;
  totalEntregado: number;
  notas?: string | null;
  comprobanteUrl?: string | null;
  entregas: DbAdelantoEntrega[];
  entregasPactadas: DbEntregaPactada[];
  createdAt: string;
  updatedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : Number(d);
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const INCLUDE_FULL = {
  beneficiario: true,
  entregas: { orderBy: { fecha: "desc" } },
  entregasPactadas: { orderBy: { numero: "asc" } },
} satisfies Prisma.AdelantoInclude;

type AdelantoRow = Prisma.AdelantoGetPayload<{ include: typeof INCLUDE_FULL }>;

type BeneficiarioRow = {
  id: string; nombre: string; documento: string | null; telefono: string | null;
  notas: string | null; limiteCredito?: Prisma.Decimal | number | null;
  ultimoRecordatorio?: Date | null; createdAt: Date;
  tipoDocumento?: string | null; razonSocial?: string | null; direccion?: string | null;
  departamento?: string | null; provincia?: string | null; distrito?: string | null;
  email?: string | null; estadoSunat?: string | null; condicionSunat?: string | null;
  verificadoEn?: Date | null; banco?: string | null; cuentaBancaria?: string | null;
  cci?: string | null; activo?: boolean;
};

function mapBeneficiario(b: BeneficiarioRow): DbBeneficiario {
  return {
    id: b.id, nombre: b.nombre, documento: b.documento, telefono: b.telefono,
    notas: b.notas, limiteCredito: b.limiteCredito != null ? Number(b.limiteCredito) : null,
    ultimoRecordatorio: iso(b.ultimoRecordatorio),
    tipoDocumento: b.tipoDocumento ?? null,
    razonSocial: b.razonSocial ?? null,
    direccion: b.direccion ?? null,
    departamento: b.departamento ?? null,
    provincia: b.provincia ?? null,
    distrito: b.distrito ?? null,
    email: b.email ?? null,
    estadoSunat: b.estadoSunat ?? null,
    condicionSunat: b.condicionSunat ?? null,
    verificadoEn: iso(b.verificadoEn),
    banco: b.banco ?? null,
    cuentaBancaria: b.cuentaBancaria ?? null,
    cci: b.cci ?? null,
    /* Los registros anteriores a la 330 no traen la columna en memoria: se
       asumen activos, que es lo que eran. */
    activo: b.activo ?? true,
    createdAt: b.createdAt.toISOString(),
  };
}

/** Los campos opcionales de la ficha, normalizados: "" y "   " son NULL. */
function camposFicha(data: BeneficiarioInput) {
  const t = (v?: string | null) => (v == null ? undefined : v.trim() || null);
  return {
    tipoDocumento: t(data.tipoDocumento),
    razonSocial: t(data.razonSocial),
    direccion: t(data.direccion),
    departamento: t(data.departamento),
    provincia: t(data.provincia),
    distrito: t(data.distrito),
    email: t(data.email),
    estadoSunat: t(data.estadoSunat),
    condicionSunat: t(data.condicionSunat),
    verificadoEn: data.verificadoEn === undefined ? undefined : data.verificadoEn ? new Date(data.verificadoEn) : null,
    banco: t(data.banco),
    cuentaBancaria: t(data.cuentaBancaria),
    cci: t(data.cci),
    activo: data.activo,
  };
}

function mapAdelanto(row: AdelantoRow): DbAdelanto {
  const montoAdelantado = toNum(row.montoAdelantado);
  const saldoPendiente = toNum(row.saldoPendiente);
  return {
    id: row.id,
    tenantId: row.tenantId,
    codigoOperacion: row.codigoOperacion,
    reciboManual: row.reciboManual,
    beneficiarioId: row.beneficiarioId,
    beneficiario: row.beneficiario ? mapBeneficiario(row.beneficiario) : undefined,
    modalidad: row.modalidad as AdelantoModalidad,
    montoAdelantado,
    moneda: row.moneda,
    fechaAdelanto: row.fechaAdelanto.toISOString(),
    fechaVencimiento: iso(row.fechaVencimiento),
    status: row.status as AdelantoStatus,
    saldoPendiente,
    totalEntregado: Math.round((montoAdelantado - saldoPendiente) * 100) / 100,
    notas: row.notas,
    comprobanteUrl: row.comprobanteUrl,
    entregas: row.entregas.map((e) => ({
      id: e.id, adelantoId: e.adelantoId, fecha: e.fecha.toISOString(),
      tipo: e.tipo as AdelantoEntregaTipo, descripcion: e.descripcion,
      productId: e.productId, cantidad: e.cantidad == null ? null : toNum(e.cantidad),
      valor: toNum(e.valor), sumadoAStock: e.sumadoAStock, notas: e.notas,
      comprobanteUrl: e.comprobanteUrl,
      createdAt: e.createdAt.toISOString(),
    })),
    entregasPactadas: row.entregasPactadas.map((p) => ({
      id: p.id, numero: p.numero, descripcionEsperada: p.descripcionEsperada,
      valorEsperado: toNum(p.valorEsperado), fechaEsperada: iso(p.fechaEsperada),
      cumplidaEn: iso(p.cumplidaEn), entregaId: p.entregaId,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Inputs ───────────────────────────────────────────────────────────────────
export type BeneficiarioInput = {
  nombre: string;
  documento?: string;
  telefono?: string;
  notas?: string;
  limiteCredito?: number | null;
  /** (330) Los que llegan de RENIEC/SUNAT o se cargan a mano. */
  tipoDocumento?: string | null;
  razonSocial?: string | null;
  direccion?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  email?: string | null;
  estadoSunat?: string | null;
  condicionSunat?: string | null;
  /** ISO: cuándo se contrastó contra el padrón oficial. */
  verificadoEn?: string | null;
  banco?: string | null;
  cuentaBancaria?: string | null;
  cci?: string | null;
  activo?: boolean;
};

export type EntregaPactadaInput = {
  descripcionEsperada: string; valorEsperado: number; fechaEsperada?: string;
};

export type AdelantoCreateInput = {
  beneficiarioId: string;
  modalidad?: AdelantoModalidad;
  montoAdelantado: number;
  moneda?: string;
  fechaAdelanto?: string;
  /** (332) Cuándo se acordó devolverlo; ISO. */
  fechaVencimiento?: string | null;
  notas?: string;
  comprobanteUrl?: string;
  /** N° del talonario de papel que firmó la persona (ADR-329). */
  reciboManual?: string;
  entregasPactadas?: EntregaPactadaInput[]; // solo modalidad ENTREGAS_PACTADAS
  /**
   * Pasar por encima del límite de crédito, a sabiendas.
   *
   * El tope sigue bloqueando por DEFECTO —un desborde por descuido es un
   * desborde— pero es plata del dueño y hay clientes de años a los que se les
   * fía de más a propósito. La pantalla avisa con el número exacto y pide
   * confirmación; recién entonces manda esto. Queda en las notas del adelanto,
   * porque una decisión así tiene que poder explicarse después.
   */
  forzarLimite?: boolean;
  /**
   * Si esta plata salió del cajón, y por qué vía.
   *
   * `null`/ausente = no mover la caja (transferencia desde el banco, o el
   * adelanto se está cargando en diferido). Sólo el efectivo y lo que pasa por
   * caja se anota; ver `lib/adelantos/movimiento-caja.ts`.
   */
  metodoCaja?: MetodoPago | null;
};

export type EntregaInput = {
  tipo: AdelantoEntregaTipo;
  descripcion?: string;
  productId?: number;
  cantidad?: number;
  valorManual?: number; // tipo LIBRE: valor directo. tipo PRODUCTO: override opcional.
  sumarAStock?: boolean;
  pactadaId?: string; // marca una entrega pactada como cumplida
  notas?: string;
  comprobanteUrl?: string;
  fecha?: string;
  /**
   * Si la persona liquidó con PLATA y esa plata entró al cajón.
   *
   * Sólo aplica a entregas libres: una entrega de producto no mueve efectivo.
   * Ausente = no tocar la caja.
   */
  metodoCaja?: MetodoPago | null;
};

export type AdelantoListFilters = {
  status?: AdelantoStatus;
  beneficiarioId?: string;
  modalidad?: AdelantoModalidad;
  search?: string;
};

/**
 * El próximo código de operación del tenant (ADR-329).
 *
 * Se calcula sobre los códigos YA EMITIDOS del año, no con un `count(*)`: si un
 * adelanto se cancela, el contador no puede retroceder y reusar un número que ya
 * anda escrito en un recibo de papel.
 *
 * El índice único `(tenantId, codigoOperacion)` es la red: si dos altas
 * simultáneas piden el mismo, la segunda falla en la base en vez de duplicar.
 */
async function siguienteCodigoDeTenant(tenantId: string): Promise<string> {
  const anio = new Date().getFullYear();
  const emitidos = await prisma.adelanto.findMany({
    where: { tenantId, codigoOperacion: { startsWith: `${PREFIJO_ADELANTO}-${anio}-` } },
    select: { codigoOperacion: true },
    orderBy: { codigoOperacion: "desc" },
    take: 1,
  });
  return siguienteCodigo(emitidos.map((e) => e.codigoOperacion), anio);
}

// ── DB ───────────────────────────────────────────────────────────────────────
export const AdelantosDB = {
  // ── Beneficiarios ──
  async listBeneficiarios(tenantId: string): Promise<(DbBeneficiario & ResumenPersona)[]> {
    const rows = await prisma.adelantoBeneficiario.findMany({
      where: { tenantId },
      orderBy: { nombre: "asc" },
      include: {
        adelantos: { select: { montoAdelantado: true, saldoPendiente: true, status: true, fechaAdelanto: true } },
      },
    });
    /**
     * El resumen sale de `resumirPersona`, que excluye los CANCELADOS y define
     * `saldoPendiente` como la suma de los ABIERTOS — la MISMA cuenta que hace
     * el guard de crédito de `create`. Antes acá se sumaba todo: la pantalla
     * mostraba deudas de adelantos cancelados y decía «sin margen» sobre gente
     * que no debía nada, mientras el backend la dejaba pasar.
     */
    return rows.map((b) => ({
      ...mapBeneficiario(b),
      ...resumirPersona(
        b.adelantos.map((a) => ({
          montoAdelantado: toNum(a.montoAdelantado),
          saldoPendiente: toNum(a.saldoPendiente),
          status: a.status,
          fechaAdelanto: a.fechaAdelanto,
        })),
      ),
    }));
  },

  /**
   * La bitácora de cobranza del tenant.
   *
   * Se traen TODAS las gestiones recientes de una sola vez y la pantalla las
   * indexa por persona: una consulta por fila sería N+1 sobre una lista que se
   * abre todos los días.
   */
  async listGestiones(tenantId: string, opts?: { desde?: Date; limite?: number }): Promise<DbGestion[]> {
    const rows = await prisma.adelantoGestion.findMany({
      where: { tenantId, ...(opts?.desde ? { fecha: { gte: opts.desde } } : {}) },
      orderBy: { fecha: "desc" },
      take: opts?.limite ?? 500,
      include: { beneficiario: { select: { nombre: true } } },
    });
    return rows.map((g) => ({
      id: g.id,
      beneficiarioId: g.beneficiarioId,
      beneficiarioNombre: g.beneficiario?.nombre,
      fecha: g.fecha.toISOString(),
      tipo: g.tipo,
      nota: g.nota,
      fechaPrometida: iso(g.fechaPrometida),
      montoPrometido: g.montoPrometido == null ? null : toNum(g.montoPrometido),
      usuario: g.usuario,
    }));
  },

  /**
   * Anota una gestión. Además actualiza `ultimoRecordatorio`, que es la columna
   * que mira el cron: si no, el aviso automático saldría igual el mismo día en
   * que alguien acaba de llamar por teléfono.
   */
  async createGestion(tenantId: string, data: GestionInput): Promise<DbGestion | null> {
    const benef = await prisma.adelantoBeneficiario.findFirst({
      where: { id: data.beneficiarioId, tenantId },
      select: { id: true, nombre: true },
    });
    if (!benef) return null;

    const g = await prisma.adelantoGestion.create({
      data: {
        tenantId,
        beneficiarioId: data.beneficiarioId,
        tipo: data.tipo,
        nota: data.nota?.trim() || null,
        fechaPrometida: data.fechaPrometida ? new Date(data.fechaPrometida) : null,
        montoPrometido: data.montoPrometido != null && data.montoPrometido > 0 ? data.montoPrometido : null,
        usuario: data.usuario?.trim() || null,
      },
    });

    /* Sólo los contactos cuentan como «se le recordó»: anotar «no contesta» no
       es haberle llegado, y silenciar el cron por eso lo dejaría sin aviso. */
    if (data.tipo !== "NO_CONTESTA" && data.tipo !== "OTRO") {
      await prisma.adelantoBeneficiario
        .updateMany({ where: { id: data.beneficiarioId, tenantId }, data: { ultimoRecordatorio: new Date() } })
        .catch((err) =>
          logger.error("[adelantos.db] createGestion: no se pudo actualizar ultimoRecordatorio", {
            error: String(err),
          }),
        );
    }

    return {
      id: g.id,
      beneficiarioId: g.beneficiarioId,
      beneficiarioNombre: benef.nombre,
      fecha: g.fecha.toISOString(),
      tipo: g.tipo,
      nota: g.nota,
      fechaPrometida: iso(g.fechaPrometida),
      montoPrometido: g.montoPrometido == null ? null : toNum(g.montoPrometido),
      usuario: g.usuario,
    };
  },

  async createBeneficiario(tenantId: string, data: BeneficiarioInput): Promise<DbBeneficiario> {
    const b = await prisma.adelantoBeneficiario.create({
      data: {
        tenantId,
        nombre: data.nombre.trim(),
        documento: data.documento?.trim() || null,
        telefono: data.telefono?.trim() || null,
        notas: data.notas?.trim() || null,
        limiteCredito: data.limiteCredito != null && data.limiteCredito > 0 ? data.limiteCredito : null,
        ...camposFicha(data),
      },
    });
    return mapBeneficiario(b);
  },

  /**
   * Anotar que se le mandó un recordatorio de cobranza a alguien.
   *
   * El cron `adelantos-recordatorios` escribe la MISMA columna. Antes la
   * pantalla lo guardaba en `localStorage`, así que ninguno de los dos sabía del
   * otro: al mismo deudor le podía llegar el aviso automático y el manual el
   * mismo día, y desde otra computadora no se veía que ya se había avisado.
   *
   * Devuelve `null` si ya se le recordó hoy — quien llama decide si eso es un
   * error o simplemente no hacer nada. Insistir dos veces en un día no cobra
   * más rápido; molesta.
   */
  async marcarRecordatorio(
    tenantId: string,
    beneficiarioId: string,
  ): Promise<{ ultimoRecordatorio: string } | null> {
    const b = await prisma.adelantoBeneficiario.findFirst({
      where: { id: beneficiarioId, tenantId },
      select: { ultimoRecordatorio: true },
    });
    if (!b) throw new Error("Persona no encontrada");

    const hoy = new Date().toISOString().slice(0, 10);
    if (b.ultimoRecordatorio && b.ultimoRecordatorio.toISOString().slice(0, 10) === hoy) return null;

    const upd = await prisma.adelantoBeneficiario.update({
      where: { id: beneficiarioId },
      data: { ultimoRecordatorio: new Date() },
      select: { ultimoRecordatorio: true },
    });
    return { ultimoRecordatorio: upd.ultimoRecordatorio!.toISOString() };
  },

  // ── Adelantos ──
  async list(tenantId: string, filters?: AdelantoListFilters): Promise<DbAdelanto[]> {
    const where: Prisma.AdelantoWhereInput = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.beneficiarioId) where.beneficiarioId = filters.beneficiarioId;
    if (filters?.modalidad) where.modalidad = filters.modalidad;
    if (filters?.search) {
      // Un código dictado («2026-7», «adl-2026-7») se normaliza y se busca
      // EXACTO; el resto va por nombre, notas y recibo de papel.
      const comoCodigo = normalizarBusquedaCodigo(filters.search);
      where.OR = [
        { beneficiario: { nombre: { contains: filters.search, mode: "insensitive" } } },
        { notas: { contains: filters.search, mode: "insensitive" } },
        { reciboManual: { contains: filters.search, mode: "insensitive" } },
        { codigoOperacion: comoCodigo ? { equals: comoCodigo } : { contains: filters.search, mode: "insensitive" } },
      ];
    }
    const rows = await prisma.adelanto.findMany({
      where,
      include: INCLUDE_FULL,
      orderBy: { fechaAdelanto: "desc" },
      take: 500,
    });
    return rows.map(mapAdelanto);
  },

  async getById(tenantId: string, id: string): Promise<DbAdelanto | null> {
    const row = await prisma.adelanto.findFirst({ where: { id, tenantId }, include: INCLUDE_FULL });
    return row ? mapAdelanto(row) : null;
  },

  async create(tenantId: string, data: AdelantoCreateInput): Promise<DbAdelanto> {
    const monto = Math.round(data.montoAdelantado * 100) / 100;
    /** Se llena sólo si se pasó el tope a propósito; va a las notas. */
    let excedioLimite = "";
    const modalidad = data.modalidad ?? "CUENTA_CORRIENTE";
    const pactadas = modalidad === "ENTREGAS_PACTADAS" ? (data.entregasPactadas ?? []) : [];

    // ADR-118: límite de crédito por persona (saldo abierto + nuevo monto ≤ límite)
    const benef = await prisma.adelantoBeneficiario.findFirst({
      where: { id: data.beneficiarioId, tenantId },
      select: { nombre: true, limiteCredito: true },
    });
    /**
     * La persona tiene que existir EN ESTE TENANT.
     *
     * Esta búsqueda ya filtraba por `tenantId`, pero el resultado sólo se usaba
     * para el tope de crédito: si venía `null` el código seguía derecho y creaba
     * el adelanto con el `beneficiarioId` crudo del body. La FK del schema es de
     * una sola columna (`beneficiarioId → AdelantoBeneficiario.id`, sin
     * `tenantId` compuesto), así que Postgres aceptaba el id de un beneficiario
     * de OTRO tenant. Consecuencias medidas: el 201 y todos los GET siguientes
     * devolvían la ficha completa de esa persona ajena —documento, dirección,
     * banco, CCI— porque `INCLUDE_FULL` trae la relación entera; y como la FK es
     * `onDelete: Restrict`, el otro tenant quedaba sin poder borrar a su propio
     * beneficiario por un adelanto que no puede ver.
     *
     * El endpoint ya esperaba este error: su catch de negocio dice «persona
     * inexistente → 400 claro». Faltaba tirarlo.
     */
    if (!benef) {
      throw new Error("Esa persona no existe en este negocio. Elegila de la lista de beneficiarios.");
    }
    if (benef.limiteCredito != null) {
      const limite = Number(benef.limiteCredito);
      const abiertos = await prisma.adelanto.aggregate({
        where: { tenantId, beneficiarioId: data.beneficiarioId, status: "ABIERTO" },
        _sum: { saldoPendiente: true },
      });
      const actual = Number(abiertos._sum.saldoPendiente ?? 0);
      if (actual + monto > limite && !data.forzarLimite) {
        throw new Error(`Supera el límite de crédito de ${benef.nombre} (S/${limite.toFixed(2)}). Ya tiene S/${actual.toFixed(2)} sin liquidar.`);
      }
      if (actual + monto > limite && data.forzarLimite) {
        // Que quede escrito en el adelanto: dentro de un mes nadie se acuerda de
        // que fue una decisión y parece un error del sistema.
        excedioLimite = `Se autorizó por encima del límite (S/${limite.toFixed(2)}; quedaba S/${Math.max(0, limite - actual).toFixed(2)}).`;
      }
    }

    const row = await prisma.adelanto.create({
      data: {
        tenantId,
        beneficiarioId: data.beneficiarioId,
        modalidad,
        montoAdelantado: monto,
        moneda: data.moneda ?? "PEN",
        fechaAdelanto: data.fechaAdelanto ? new Date(data.fechaAdelanto) : new Date(),
        fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
        status: "ABIERTO",
        saldoPendiente: monto, // arranca con saldo completo a favor del negocio
        codigoOperacion: await siguienteCodigoDeTenant(tenantId),
        reciboManual: data.reciboManual?.trim() || null,
        notas: [data.notas?.trim(), excedioLimite].filter(Boolean).join(" · ") || null,
        comprobanteUrl: data.comprobanteUrl?.trim() || null,
        entregasPactadas: pactadas.length
          ? {
              create: pactadas.map((p, i) => ({
                numero: i + 1,
                descripcionEsperada: p.descripcionEsperada,
                valorEsperado: Math.round(p.valorEsperado * 100) / 100,
                fechaEsperada: p.fechaEsperada ? new Date(p.fechaEsperada) : null,
              })),
            }
          : undefined,
      },
      include: INCLUDE_FULL,
    });

    // La caja se mueve DESPUÉS de crear el adelanto y sin poder tumbarlo: la
    // plata ya salió, y perder el registro del préstamo por no poder anotar el
    // movimiento sería el peor de los dos errores.
    if (data.metodoCaja) {
      await moverCaja(tenantId, {
        tipo: "egreso",
        monto,
        metodo: data.metodoCaja,
        etiqueta: etiquetaEgreso(row.codigoOperacion, row.beneficiario?.nombre ?? "—"),
      });
    }

    return mapAdelanto(row);
  },

  /**
   * Registrar una entrega que liquida (parcial o totalmente) el adelanto.
   * ATÓMICO: crea entrega, recalcula saldoPendiente (montoAdelantado − Σvalor),
   * ajusta status (LIQUIDADO si 0, EXCEDIDO si <0), marca cuota pactada si aplica,
   * e incrementa stock si tipo=PRODUCTO && sumarAStock.
   */
  async registrarEntrega(tenantId: string, adelantoId: string, input: EntregaInput): Promise<DbAdelanto | null> {
    const resultado = await prisma.$transaction(async (tx) => {
      const adelanto = await tx.adelanto.findFirst({ where: { id: adelantoId, tenantId } });
      if (!adelanto) return null;
      if (adelanto.status === "CANCELADO") {
        throw new Error("No se pueden registrar entregas en un adelanto cancelado");
      }

      // Valor SIEMPRE calculado en backend (anti-fraude).
      let valor: number;
      if (input.tipo === "PRODUCTO" && input.productId != null) {
        if (input.valorManual != null && input.valorManual > 0) {
          valor = input.valorManual;
        } else {
          const prod = await tx.product.findFirst({
            where: { id: input.productId, tenantId },
            select: { price: true, costPrice: true },
          });
          if (!prod) throw new Error("Producto no encontrado en este tenant");
          const cantidad = input.cantidad ?? 1;
          /**
           * Se valúa al COSTO, no al precio de venta.
           *
           * Acá el negocio está RECIBIENDO mercadería para saldar una deuda: es
           * una compra. Acreditarla al precio al que después la vende liquidaba
           * el adelanto con menos producto del que corresponde — el margen se
           * regalaba en cada liquidación, en silencio.
           *
           * Sin costo cargado se cae al precio de venta, que es lo único que
           * hay; `valorManual` sigue pisando todo cuando se pacta otro valor.
           */
          const unitario = prod.costPrice != null ? toNum(prod.costPrice) : toNum(prod.price);
          valor = unitario * cantidad;
        }
      } else {
        valor = input.valorManual ?? 0;
      }
      valor = Math.round(valor * 100) / 100;
      if (valor <= 0) throw new Error("El valor de la entrega debe ser mayor a 0");

      const entrega = await tx.adelantoEntrega.create({
        data: {
          adelantoId,
          fecha: input.fecha ? new Date(input.fecha) : new Date(),
          tipo: input.tipo,
          descripcion: input.descripcion?.trim() || null,
          productId: input.tipo === "PRODUCTO" ? input.productId ?? null : null,
          cantidad: input.cantidad ?? null,
          valor,
          sumadoAStock: Boolean(input.tipo === "PRODUCTO" && input.sumarAStock),
          notas: input.notas?.trim() || null,
          comprobanteUrl: input.comprobanteUrl?.trim() || null,
        },
      });

      // Incrementar stock si corresponde (entrega de producto que entra al inventario).
      if (input.tipo === "PRODUCTO" && input.sumarAStock && input.productId != null) {
        const qty = Math.round(input.cantidad ?? 1);
        if (qty > 0) {
          await tx.product.updateMany({
            where: { id: input.productId, tenantId },
            data: { stock: { increment: qty } },
          });
        }
      }

      // Marcar cuota pactada cumplida (si se indicó y pertenece a este adelanto).
      if (input.pactadaId) {
        await tx.adelantoEntregaPactada.updateMany({
          where: { id: input.pactadaId, adelantoId },
          data: { cumplidaEn: new Date(), entregaId: entrega.id },
        });
      }

      // Recalcular saldo desde la suma real de entregas (fuente de verdad).
      const agg = await tx.adelantoEntrega.aggregate({
        where: { adelantoId },
        _sum: { valor: true },
      });
      const totalEntregado = toNum(agg._sum.valor);
      const montoAdelantado = toNum(adelanto.montoAdelantado);
      const saldo = Math.round((montoAdelantado - totalEntregado) * 100) / 100;
      const nuevoStatus: AdelantoStatus =
        saldo > 0.009 ? "ABIERTO" : saldo < -0.009 ? "EXCEDIDO" : "LIQUIDADO";

      await tx.adelanto.update({
        where: { id: adelantoId },
        data: { saldoPendiente: saldo, status: nuevoStatus },
      });

      const full = await tx.adelanto.findFirst({ where: { id: adelantoId, tenantId }, include: INCLUDE_FULL });
      return full ? mapAdelanto(full) : null;
    });

    // Fuera de la transacción: anotar el efectivo que entró no puede hacer
    // rollback de una liquidación ya asentada.
    if (resultado && input.metodoCaja && input.tipo === "LIBRE") {
      await moverCaja(tenantId, {
        tipo: "ingreso",
        monto: resultado.entregas[0]?.valor ?? 0,
        metodo: input.metodoCaja,
        etiqueta: etiquetaIngreso(resultado.codigoOperacion, resultado.beneficiario?.nombre ?? "—"),
      });
    }
    return resultado;
  },

  /**
   * Anular un adelanto.
   *
   * `devolucionCaja` es EXPLÍCITO y por defecto no revierte nada: anular puede
   * significar dos cosas opuestas —que fue un error y la plata nunca salió, o
   * que se está dando por perdida— y sólo la primera devuelve efectivo al
   * cajón. Eso lo sabe la persona, no el sistema.
   */
  async cancel(
    tenantId: string,
    id: string,
    devolucionCaja?: MetodoPago | null,
  ): Promise<DbAdelanto | null> {
    const existing = await prisma.adelanto.findFirst({
      where: { id, tenantId },
      include: { beneficiario: { select: { nombre: true } } },
    });
    if (!existing) return null;
    await prisma.adelanto.updateMany({ where: { id, tenantId }, data: { status: "CANCELADO" } });

    if (devolucionCaja) {
      // Se devuelve lo que todavía debía, no el monto original: si ya había
      // liquidado la mitad, esa mitad nunca volvió como efectivo.
      await moverCaja(tenantId, {
        tipo: "ingreso",
        monto: Number(existing.saldoPendiente),
        metodo: devolucionCaja,
        etiqueta: etiquetaReversion(existing.codigoOperacion, existing.beneficiario?.nombre ?? "—"),
      });
    }

    const row = await prisma.adelanto.findFirst({ where: { id, tenantId }, include: INCLUDE_FULL });
    return row ? mapAdelanto(row) : null;
  },

  async updateNotas(tenantId: string, id: string, notas: string | null): Promise<DbAdelanto | null> {
    const existing = await prisma.adelanto.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    await prisma.adelanto.updateMany({ where: { id, tenantId }, data: { notas: notas?.trim() || null } });
    const row = await prisma.adelanto.findFirst({ where: { id, tenantId }, include: INCLUDE_FULL });
    return row ? mapAdelanto(row) : null;
  },

  // ── Resumen (KPIs del módulo) ──
  async resumen(tenantId: string): Promise<{
    totalAdelantado: number;
    totalLiquidado: number;
    saldoPendiente: number;
    excedente: number;
    adelantosAbiertos: number;
    adelantosLiquidados: number;
    beneficiarios: number;
  }> {
    const [adelantos, totalBenef] = await Promise.all([
      prisma.adelanto.findMany({
        where: { tenantId, status: { not: "CANCELADO" } },
        select: { montoAdelantado: true, saldoPendiente: true, status: true },
      }),
      prisma.adelantoBeneficiario.count({ where: { tenantId } }),
    ]);
    let totalAdelantado = 0, saldoPos = 0, excedente = 0, abiertos = 0, liquidados = 0;
    for (const a of adelantos) {
      const monto = toNum(a.montoAdelantado);
      const saldo = toNum(a.saldoPendiente);
      totalAdelantado += monto;
      if (saldo > 0) saldoPos += saldo;
      if (saldo < 0) excedente += -saldo;
      if (a.status === "ABIERTO") abiertos++;
      if (a.status === "LIQUIDADO") liquidados++;
    }
    const totalLiquidado = adelantos.reduce(
      (s, a) => s + Math.min(toNum(a.montoAdelantado), toNum(a.montoAdelantado) - toNum(a.saldoPendiente)),
      0,
    );
    const r = (n: number) => Math.round(n * 100) / 100;
    return {
      totalAdelantado: r(totalAdelantado),
      totalLiquidado: r(totalLiquidado),
      saldoPendiente: r(saldoPos),
      excedente: r(excedente),
      adelantosAbiertos: abiertos,
      adelantosLiquidados: liquidados,
      beneficiarios: totalBenef,
    };
  },

  // ── Beneficiarios: editar / eliminar ──
  async updateBeneficiario(tenantId: string, id: string, data: BeneficiarioInput): Promise<DbBeneficiario | null> {
    const existing = await prisma.adelantoBeneficiario.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    await prisma.adelantoBeneficiario.updateMany({
      where: { id, tenantId },
      data: {
        nombre: data.nombre.trim(),
        documento: data.documento?.trim() || null,
        telefono: data.telefono?.trim() || null,
        notas: data.notas?.trim() || null,
        limiteCredito: data.limiteCredito != null && data.limiteCredito > 0 ? data.limiteCredito : null,
        ...camposFicha(data),
      },
    });
    const row = await prisma.adelantoBeneficiario.findFirst({ where: { id, tenantId } });
    return row ? mapBeneficiario(row) : null;
  },

  /** Elimina una persona. Bloquea si tiene adelantos registrados (integridad). */
  async deleteBeneficiario(tenantId: string, id: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "has_adelantos" }> {
    const existing = await prisma.adelantoBeneficiario.findFirst({ where: { id, tenantId } });
    if (!existing) return { ok: false, reason: "not_found" };
    const adelantos = await prisma.adelanto.count({ where: { tenantId, beneficiarioId: id } });
    if (adelantos > 0) return { ok: false, reason: "has_adelantos" };
    await prisma.adelantoBeneficiario.deleteMany({ where: { id, tenantId } });
    return { ok: true };
  },

  // ── Adelantos recurrentes (ADR-118) ──
  async listRecurrentes(tenantId: string): Promise<DbRecurrente[]> {
    const rows = await prisma.adelantoRecurrente.findMany({
      where: { tenantId },
      include: { beneficiario: { select: { nombre: true } } },
      orderBy: [{ activo: "desc" }, { proximaEjecucion: "asc" }],
    });
    return rows.map(mapRecurrente);
  },

  async createRecurrente(tenantId: string, data: RecurrenteInput): Promise<DbRecurrente> {
    // Mismo cuidado que en `create()`: la FK del schema no lleva `tenantId`, así
    // que sin este chequeo se puede dejar programado un adelanto recurrente
    // contra el beneficiario de otro negocio —y su nombre viaja en cada lectura
    // de la lista por el `include` de abajo.
    const benef = await prisma.adelantoBeneficiario.findFirst({
      where: { id: data.beneficiarioId, tenantId },
      select: { id: true },
    });
    if (!benef) {
      throw new Error("Esa persona no existe en este negocio. Elegila de la lista de beneficiarios.");
    }
    const proxima = nextProxima(data.frecuencia, data.diaMes ?? null, new Date());
    const row = await prisma.adelantoRecurrente.create({
      data: {
        tenantId,
        beneficiarioId: data.beneficiarioId,
        modalidad: data.modalidad ?? "CUENTA_CORRIENTE",
        monto: Math.round(data.monto * 100) / 100,
        moneda: data.moneda ?? "PEN",
        frecuencia: data.frecuencia,
        diaMes: data.frecuencia === "mensual" ? data.diaMes ?? null : null,
        notas: data.notas?.trim() || null,
        proximaEjecucion: proxima,
      },
      include: { beneficiario: { select: { nombre: true } } },
    });
    return mapRecurrente(row);
  },

  async setRecurrenteActivo(tenantId: string, id: string, activo: boolean): Promise<boolean> {
    const r = await prisma.adelantoRecurrente.updateMany({ where: { id, tenantId }, data: { activo } });
    return r.count > 0;
  },

  async deleteRecurrente(tenantId: string, id: string): Promise<boolean> {
    const r = await prisma.adelantoRecurrente.deleteMany({ where: { id, tenantId } });
    return r.count > 0;
  },

  /** Cron: materializa los recurrentes activos vencidos → crea adelantos reales. */
  async materializeRecurrentes(now = new Date()): Promise<{ creados: number }> {
    const pendientes = await prisma.adelantoRecurrente.findMany({
      where: { activo: true, proximaEjecucion: { lte: now } },
    });
    if (pendientes.length === 0) return { creados: 0 };
    // Perf 2026-05-26 (P0-6): una sola transacción batched en vez de abrir 1
    // $transaction por fila (N transacciones). $transaction([...]) ejecuta
    // todas las ops atómicamente: o se materializan todas o ninguna.
    const ops = pendientes.flatMap((r) => {
      const monto = Number(r.monto);
      return [
        prisma.adelanto.create({
          data: {
            tenantId: r.tenantId,
            beneficiarioId: r.beneficiarioId,
            modalidad: r.modalidad,
            montoAdelantado: monto,
            moneda: r.moneda,
            status: "ABIERTO",
            saldoPendiente: monto,
            notas: `Adelanto recurrente (${r.frecuencia})`,
          },
        }),
        prisma.adelantoRecurrente.update({
          where: { id: r.id },
          data: { ultimaEjecucion: now, proximaEjecucion: nextProxima(r.frecuencia as RecurrenteFrecuencia, r.diaMes, now) },
        }),
      ];
    });
    await prisma.$transaction(ops);
    return { creados: pendientes.length };
  },
};

function mapRecurrente(r: {
  id: string; beneficiarioId: string; modalidad: string; monto: Prisma.Decimal | number;
  moneda: string; frecuencia: string; diaMes: number | null; activo: boolean;
  proximaEjecucion: Date | null; ultimaEjecucion: Date | null; notas: string | null; createdAt: Date;
  beneficiario?: { nombre: string } | null;
}): DbRecurrente {
  return {
    id: r.id, beneficiarioId: r.beneficiarioId, beneficiarioNombre: r.beneficiario?.nombre,
    modalidad: r.modalidad as AdelantoModalidad, monto: toNum(r.monto), moneda: r.moneda,
    frecuencia: r.frecuencia as RecurrenteFrecuencia, diaMes: r.diaMes, activo: r.activo,
    proximaEjecucion: iso(r.proximaEjecucion), ultimaEjecucion: iso(r.ultimaEjecucion),
    notas: r.notas, createdAt: r.createdAt.toISOString(),
  };
}

/** Calcula la próxima ejecución según frecuencia (mensual respeta diaMes 1-28). */
function nextProxima(frecuencia: RecurrenteFrecuencia, diaMes: number | null, from: Date): Date {
  const d = new Date(from);
  if (frecuencia === "semanal") { d.setDate(d.getDate() + 7); return d; }
  if (frecuencia === "quincenal") { d.setDate(d.getDate() + 14); return d; }
  // mensual: próximo mes, día diaMes (default mismo día, cap 28)
  const dia = Math.min(Math.max(diaMes ?? d.getDate(), 1), 28);
  d.setMonth(d.getMonth() + 1, dia);
  return d;
}
