import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { AdelantosDB, type DbBeneficiario } from "@/lib/db/adelantos.db";
import type { ResumenPersona } from "@/lib/adelantos/saldo-persona";
import { ContractsDB } from "@/lib/db/contracts.db";
import { estadoVisible, diasParaVencer, type DbContract } from "@/lib/types/contracts";
import {
  enmascararDocumento,
  esRucEmpresa,
  mismoDocumento,
  normalizarDocumento,
  tipoDocumentoCandidato,
  tipoDocumentoPorFormato,
} from "@/lib/rrhh/documento";
import { dateDeFechaKey, etiquetaCorta, fechaKeyDeDate, mesDe, rangoDeDias, sumarDias } from "@/lib/rrhh/fechas";
import { tarifaVigente as tarifaVigentePura } from "@/lib/rrhh/ganado";
import {
  aAsistenciaDTO,
  aColaboradorDTO,
  aTarifaDTO,
  type AsistenciaRow as DtoAsistenciaRow,
  type ColaboradorRow as DtoColaboradorRow,
  type TarifaRow as DtoTarifaRow,
} from "@/lib/rrhh/dto";
import type { ColaboradorCrearInput, TarifaInput, TarifaGuardarInput, TraerDesdeAdelantosInput } from "@/lib/rrhh/schemas";
import type {
  AsistenciaDTO,
  CandidatoDesdeAdelantosDTO,
  ColaboradorDTO,
  ContratoDeColaboradorDTO,
  EstadoAsistencia,
  EstadoColaborador,
  FechaKey,
  FichaColaboradorDTO,
  Modalidad,
  NivelRrhh,
  ResultadoTraerDesdeAdelantosDTO,
  ResumenRrhhDTO,
  TarifaDTO,
} from "@/lib/rrhh/tipos";

/**
 * ColaboradoresDB — el personal del negocio (ADR-414 §1-§3, §6).
 *
 * `tenantId` SIEMPRE 1er parámetro. Prisma sólo se usa acá (y en la tabla
 * `Puesto`, que comparte la FK compuesta — ver el gotcha de `connect` abajo).
 * Compone `AdelantosDB` (cuenta vinculada) y `ContractsDB` (contratos) para
 * la ficha; nunca `prisma.adelanto`/`prisma.contract` directo.
 */

// ── Errores ──────────────────────────────────────────────────────────────────

export class DocumentoDuplicadoError extends Error {
  constructor(public readonly existente: { id: string; nombre: string }) {
    super(`Ya está registrado como ${existente.nombre}.`);
    this.name = "DocumentoDuplicadoError";
  }
}
export class DocumentoInvalidoError extends Error {
  constructor(message = "Ese documento no es válido para el tipo elegido.") {
    super(message);
    this.name = "DocumentoInvalidoError";
  }
}
export class DocumentoNoCoincideError extends Error {
  constructor() {
    super("El documento de la cuenta no coincide con el de la persona.");
    this.name = "DocumentoNoCoincideError";
  }
}
export class DocumentoOcupadoError extends Error {
  constructor(public readonly existente: { id: string; nombre: string }) {
    super(`Ese documento ya lo tiene ${existente.nombre}.`);
    this.name = "DocumentoOcupadoError";
  }
}
export class PuestoNoEncontradoError extends Error {
  constructor() {
    super("Ese puesto no existe.");
    this.name = "PuestoNoEncontradoError";
  }
}
export class BeneficiarioNoEncontradoError extends Error {
  constructor() {
    super("Esa cuenta de Adelantos no existe.");
    this.name = "BeneficiarioNoEncontradoError";
  }
}
export class BeneficiarioYaVinculadoError extends Error {
  constructor() {
    super("Esa cuenta de Adelantos ya está vinculada a otra persona.");
    this.name = "BeneficiarioYaVinculadoError";
  }
}
export class UsuarioNoEncontradoError extends Error {
  constructor() {
    super("Ese usuario del panel no existe.");
    this.name = "UsuarioNoEncontradoError";
  }
}
export class UsuarioYaVinculadoError extends Error {
  constructor() {
    super("Ese usuario ya está vinculado a otra persona.");
    this.name = "UsuarioYaVinculadoError";
  }
}
export class EstadoInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EstadoInvalidoError";
  }
}
export class NoEstaCesadoError extends Error {
  constructor() {
    super("Esta persona no está cesada.");
    this.name = "NoEstaCesadoError";
  }
}
export class MarcasDespuesDelCeseError extends Error {
  constructor(
    public readonly n: number,
    public readonly primera: FechaKey,
  ) {
    super(`Tiene ${n} marca${n === 1 ? "" : "s"} después del ${primera}: no se pueden cesar sin confirmar.`);
    this.name = "MarcasDespuesDelCeseError";
  }
}
export class TarifaInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TarifaInvalidaError";
  }
}
export class FechaInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FechaInvalidaError";
  }
}

// ── Tipos de fila ────────────────────────────────────────────────────────────

export type ColaboradorRow = DtoColaboradorRow;
export type TarifaRow = DtoTarifaRow;

export interface ListarFiltros {
  estados?: EstadoColaborador[];
  puestoId?: string;
  q?: string;
  incluirCesados?: boolean;
}

export interface ExportColaborador {
  colaborador: ColaboradorDTO;
  tarifas: TarifaDTO[];
  asistencias: AsistenciaDTO[];
  contratos: { id: string; numero: string; estado: string }[];
  adelantos: { id: string; codigo: string; saldo: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

const toNum = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));
const r2 = (n: number) => Math.round(n * 100) / 100;
const mayorFecha = (a: FechaKey, b: FechaKey | null): FechaKey => (b != null && b > a ? b : a);
const menorFecha = (a: FechaKey, b: FechaKey | null): FechaKey => (b != null && b < a ? b : a);

const COLABORADOR_INCLUDE = { puesto: { select: { id: true, nombre: true } } } satisfies Prisma.ColaboradorInclude;
type ColaboradorPrismaRow = Prisma.ColaboradorGetPayload<{ include: typeof COLABORADOR_INCLUDE }>;

function mapColaborador(row: ColaboradorPrismaRow): ColaboradorRow {
  return {
    id: row.id,
    nombre: row.nombre,
    apodo: row.apodo,
    tipoDocumento: row.tipoDocumento,
    documento: row.documento,
    celular: row.celular,
    direccion: row.direccion,
    contactoEmergenciaNombre: row.contactoEmergenciaNombre,
    contactoEmergenciaCelular: row.contactoEmergenciaCelular,
    puestoId: row.puestoId,
    puesto: row.puesto,
    estado: row.estado,
    fechaIngreso: row.fechaIngreso,
    fechaCese: row.fechaCese,
    motivoCese: row.motivoCese,
    observaciones: row.observaciones,
    fotoUrl: row.fotoUrl,
    grupoSanguineo: row.grupoSanguineo,
    alergias: row.alergias,
    beneficiarioId: row.beneficiarioId,
    adminUserId: row.adminUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type TarifaPrismaRow = {
  id: string;
  colaboradorId: string;
  modalidad: string;
  monto: Prisma.Decimal;
  horasJornada: Prisma.Decimal;
  vigenteDesde: Date;
  motivo: string | null;
  createdBy: string;
  createdAt: Date;
};

function mapTarifa(r: TarifaPrismaRow): TarifaRow {
  return {
    id: r.id,
    modalidad: r.modalidad,
    monto: toNum(r.monto),
    horasJornada: toNum(r.horasJornada),
    vigenteDesde: r.vigenteDesde,
    motivo: r.motivo,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  };
}

type AsistenciaPrismaRow = {
  id: string;
  colaboradorId: string;
  fecha: Date;
  estado: string;
  entradaMin: number | null;
  salidaMin: number | null;
  refrigerioMin: number;
  horas: Prisma.Decimal | null;
  nota: string | null;
  origen: string;
  marcadoPor: string;
  createdAt: Date;
  deletedAt: Date | null;
  reemplazadaPorId: string | null;
  motivoCorreccion: string | null;
};

function mapAsistencia(r: AsistenciaPrismaRow): DtoAsistenciaRow {
  return {
    id: r.id,
    colaboradorId: r.colaboradorId,
    fecha: r.fecha,
    estado: r.estado,
    entradaMin: r.entradaMin,
    salidaMin: r.salidaMin,
    refrigerioMin: r.refrigerioMin,
    horas: r.horas == null ? null : toNum(r.horas),
    nota: r.nota,
    origen: r.origen,
    marcadoPor: r.marcadoPor,
    createdAt: r.createdAt,
    deletedAt: r.deletedAt,
    reemplazadaPorId: r.reemplazadaPorId,
    motivoCorreccion: r.motivoCorreccion,
  };
}

function mapContratoDeColaborador(c: DbContract): ContratoDeColaboradorDTO {
  return {
    id: c.id,
    numero: c.numero,
    tipo: c.tipo,
    estadoVisible: estadoVisible(c),
    fechaInicio: fechaKeyDeDate(new Date(c.fechaInicio)),
    fechaVencimiento: c.fechaVencimiento ? fechaKeyDeDate(new Date(c.fechaVencimiento)) : null,
    diasParaVencer: diasParaVencer(c.fechaVencimiento),
    firmantesPendientes: c.firmantes.filter((f) => f.estado === "PENDIENTE").length,
    tienePdf: Boolean(c.documentId),
  };
}

/** El documento es válido si no viola las CHECK de la migración — mensaje limpio en vez de un 500 crudo. */
const DOCUMENTO_RE = /^[A-Z0-9]{4,20}$/;
function documentoInvalido(tipoDocumento: string | null | undefined, documento: string | null): boolean {
  if (!documento) return false; // sin documento no hay nada que validar
  if (!tipoDocumento) return true; // documento sin tipo viola Colaborador_documento_chk
  if (!DOCUMENTO_RE.test(documento)) return true;
  if (tipoDocumento === "DNI" && !/^\d{8}$/.test(documento)) return true;
  return false;
}

interface TarifaParaGuardar {
  modalidad: Modalidad;
  monto: number;
  horasJornada?: number;
  vigenteDesde: FechaKey;
  motivo?: string | null;
}

/**
 * Da de baja lógica cualquier versión viva de ESA fecha y crea la nueva —
 * "guardar otra vez la misma fecha corrige esa versión" (ADR-414 §3). Se
 * llama siempre dentro de una `$transaction`; el P2002 por carrera lo
 * reintenta el caller público (`guardarTarifa`).
 */
async function guardarTarifaEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  colaboradorId: string,
  input: TarifaParaGuardar,
  usuario: string,
): Promise<void> {
  await tx.colaboradorTarifa.updateMany({
    where: { tenantId, colaboradorId, vigenteDesde: dateDeFechaKey(input.vigenteDesde), deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: usuario },
  });
  await tx.colaboradorTarifa.create({
    data: {
      tenantId,
      colaboradorId,
      modalidad: input.modalidad,
      monto: new Prisma.Decimal(input.monto),
      horasJornada: input.horasJornada != null ? new Prisma.Decimal(input.horasJornada) : undefined,
      vigenteDesde: dateDeFechaKey(input.vigenteDesde),
      motivo: input.motivo ?? null,
      createdBy: usuario,
    },
  });
}

const CONTEO_ASISTENCIA_VACIO: Record<EstadoAsistencia, number> = {
  PRESENTE: 0,
  TARDANZA: 0,
  MEDIO_DIA: 0,
  FALTA: 0,
  PERMISO: 0,
  DESCANSO: 0,
  VACACIONES: 0,
};

// ── API ──────────────────────────────────────────────────────────────────────

export const ColaboradoresDB = {
  async listar(tenantId: string, filtros: ListarFiltros = {}): Promise<ColaboradorRow[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ColaboradorWhereInput = { tenantId, deletedAt: null };
    if (filtros.estados && filtros.estados.length > 0) {
      where.estado = { in: filtros.estados };
    } else if (!filtros.incluirCesados) {
      where.estado = { not: "CESADO" };
    }
    if (filtros.puestoId) where.puestoId = filtros.puestoId;
    if (filtros.q?.trim()) {
      const q = filtros.q.trim();
      where.OR = [
        { nombre: { contains: q, mode: "insensitive" } },
        { apodo: { contains: q, mode: "insensitive" } },
        { documento: { contains: q, mode: "insensitive" } },
      ];
    }
    const rows = await prisma.colaborador.findMany({ where, include: COLABORADOR_INCLUDE, orderBy: { nombre: "asc" } });
    return rows.map(mapColaborador);
  },

  async obtener(tenantId: string, id: string): Promise<ColaboradorRow | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: null }, include: COLABORADOR_INCLUDE });
    return row ? mapColaborador(row) : null;
  },

  async existe(tenantId: string, id: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const n = await prisma.colaborador.count({ where: { id, tenantId, deletedAt: null } });
    return n > 0;
  },

  async ficha(tenantId: string, id: string, nivel: Exclude<NivelRrhh, "marcar">): Promise<FichaColaboradorDTO | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: null }, include: COLABORADOR_INCLUDE });
    if (!row) return null;
    const colaboradorRow = mapColaborador(row);
    const colaborador = aColaboradorDTO(colaboradorRow, nivel);
    const hoy = limaDateKey();

    let tarifas: TarifaDTO[] | undefined;
    if (nivel === "completo") {
      const tarifaRows = await prisma.colaboradorTarifa.findMany({
        where: { tenantId, colaboradorId: id, deletedAt: null },
        orderBy: { vigenteDesde: "desc" },
      });
      tarifas = tarifaRows.map((t) => aTarifaDTO(mapTarifa(t)));
      const vigente = tarifaVigentePura(
        tarifaRows.map((t) => ({
          modalidad: t.modalidad as Modalidad,
          monto: toNum(t.monto),
          horasJornada: toNum(t.horasJornada),
          vigenteDesde: fechaKeyDeDate(t.vigenteDesde),
        })),
        hoy,
      );
      const tarifaVigenteDTO = vigente ? (tarifas.find((t) => t.vigenteDesde === vigente.vigenteDesde) ?? null) : null;
      colaborador.tarifaVigente = tarifaVigenteDTO;
    }

    // ── Vínculo con Adelantos y con el usuario del panel ──
    let beneficiario: FichaColaboradorDTO["vinculo"]["beneficiario"] = null;
    if (row.beneficiarioId) {
      const b = await AdelantosDB.getBeneficiario(tenantId, row.beneficiarioId);
      if (b) beneficiario = { id: b.id, nombre: b.nombre, documento: b.documento ?? null };
    }
    let adminUser: FichaColaboradorDTO["vinculo"]["adminUser"] = null;
    if (row.adminUserId) {
      const u = await prisma.adminUser.findFirst({
        where: { id: row.adminUserId, tenantId },
        select: { id: true, username: true, role: true },
      });
      if (u) adminUser = u;
    }
    const documentoNorm = normalizarDocumento(row.documento);
    let sugeridos: { id: string; nombre: string }[] = [];
    if (documentoNorm) {
      const [todos, vinculados] = await Promise.all([
        AdelantosDB.listBeneficiarios(tenantId),
        prisma.colaborador.findMany({
          where: { tenantId, deletedAt: null, beneficiarioId: { not: null }, id: { not: id } },
          select: { beneficiarioId: true },
        }),
      ]);
      const usados = new Set(vinculados.map((v) => v.beneficiarioId as string));
      sugeridos = todos
        .filter((b) => b.id !== row.beneficiarioId && !usados.has(b.id) && mismoDocumento(b.documento, documentoNorm))
        .map((b) => ({ id: b.id, nombre: b.nombre }));
    }

    // ── Cuenta de Adelantos (sólo completo, y sólo si hay cuenta vinculada) ──
    let cuenta: FichaColaboradorDTO["cuenta"];
    if (nivel === "completo") {
      cuenta = null;
      if (row.beneficiarioId) {
        const grupos = await AdelantosDB.saldosPorPersona(tenantId);
        let adelantosAbiertosPen = 0;
        let abiertos = 0;
        const otrasMonedas: Record<string, number> = {};
        for (const g of grupos) {
          if (g.beneficiarioId !== row.beneficiarioId || g.status !== "ABIERTO") continue;
          abiertos += g.cantidad;
          const moneda = g.moneda || "PEN";
          if (moneda === "PEN") adelantosAbiertosPen = r2(adelantosAbiertosPen + g.saldoPendiente);
          else otrasMonedas[moneda] = r2((otrasMonedas[moneda] ?? 0) + g.saldoPendiente);
        }
        cuenta = { adelantosAbiertosPen, abiertos, otrasMonedas };
      }
    }

    // ── Contratos vinculados y sugeridos ──
    const vinculados = await ContractsDB.list(tenantId, { colaboradorId: id, limit: 100 });
    const contratos = vinculados.map(mapContratoDeColaborador);
    let contratosSugeridos: ContratoDeColaboradorDTO[] = [];
    if (documentoNorm) {
      const candidatos = await ContractsDB.list(tenantId, { limit: 300 });
      contratosSugeridos = candidatos
        .filter(
          (c) =>
            c.colaboradorId == null &&
            (mismoDocumento(c.clienteDoc, documentoNorm) || c.firmantes.some((f) => mismoDocumento(f.documento, documentoNorm))),
        )
        .slice(0, 20)
        .map(mapContratoDeColaborador);
    }

    // ── Resumen del mes en curso (para el chip de la lista) ──
    const mesActual = mesDe(hoy);
    const inicioMes = `${mesActual}-01`;
    const marcasDelMes = await prisma.asistencia.findMany({
      where: { tenantId, colaboradorId: id, deletedAt: null, fecha: { gte: dateDeFechaKey(inicioMes), lte: dateDeFechaKey(hoy) } },
      select: { estado: true, fecha: true },
    });
    const conteoMes: Record<EstadoAsistencia, number> = { ...CONTEO_ASISTENCIA_VACIO };
    const fechasMarcadas = new Set<string>();
    for (const m of marcasDelMes) {
      conteoMes[m.estado as EstadoAsistencia]++;
      fechasMarcadas.add(fechaKeyDeDate(m.fecha));
    }
    const fechaIngresoKey = row.fechaIngreso ? fechaKeyDeDate(row.fechaIngreso) : null;
    const fechaCeseKey = row.fechaCese ? fechaKeyDeDate(row.fechaCese) : null;
    const periodoDesde = mayorFecha(inicioMes, fechaIngresoKey);
    const periodoHasta = menorFecha(hoy, fechaCeseKey);
    let sinMarcarMes = 0;
    if (periodoDesde <= periodoHasta) {
      for (const d of rangoDeDias(periodoDesde, periodoHasta)) if (!fechasMarcadas.has(d)) sinMarcarMes++;
    }

    return {
      nivel,
      colaborador,
      ...(nivel === "completo" ? { tarifas } : {}),
      vinculo: { beneficiario, sugeridos, adminUser },
      ...(nivel === "completo" ? { cuenta } : {}),
      contratos,
      contratosSugeridos,
      mes: { mes: mesActual, conteo: conteoMes, sinMarcar: sinMarcarMes },
    };
  },

  async crear(tenantId: string, input: ColaboradorCrearInput, usuario: string): Promise<ColaboradorRow> {
    if (!tenantId) throw new Error("tenantId is required");
    const nombre = input.nombre.trim();
    const documento = normalizarDocumento(input.documento ?? null);

    if (documentoInvalido(input.tipoDocumento, documento)) throw new DocumentoInvalidoError();

    if (input.puestoId) {
      const p = await prisma.puesto.findFirst({ where: { id: input.puestoId, tenantId, deletedAt: null }, select: { id: true } });
      if (!p) throw new PuestoNoEncontradoError();
    }

    if (documento) {
      const existente = await prisma.colaborador.findFirst({
        where: { tenantId, deletedAt: null, documento },
        select: { id: true, nombre: true },
      });
      if (existente) throw new DocumentoDuplicadoError(existente);
    }

    let beneficiario: DbBeneficiario | null = null;
    if (input.beneficiarioId) {
      beneficiario = await AdelantosDB.getBeneficiario(tenantId, input.beneficiarioId);
      if (!beneficiario) throw new BeneficiarioNoEncontradoError();
      const yaUsado = await prisma.colaborador.findFirst({
        where: { tenantId, deletedAt: null, beneficiarioId: input.beneficiarioId },
        select: { id: true },
      });
      if (yaUsado) throw new BeneficiarioYaVinculadoError();
      if (documento && beneficiario.documento && !mismoDocumento(documento, beneficiario.documento)) {
        throw new DocumentoNoCoincideError();
      }
    }

    let row: ColaboradorPrismaRow;
    try {
      row = await prisma.$transaction(async (tx) => {
        const creado = await tx.colaborador.create({
          data: {
            tenantId,
            nombre,
            apodo: input.apodo ?? null,
            tipoDocumento: documento ? (input.tipoDocumento ?? null) : null,
            documento,
            celular: input.celular ?? null,
            direccion: input.direccion ?? null,
            contactoEmergenciaNombre: input.contactoEmergenciaNombre ?? null,
            contactoEmergenciaCelular: input.contactoEmergenciaCelular ?? null,
            puestoId: input.puestoId ?? null,
            estado: input.estado ?? "ACTIVO",
            fechaIngreso: input.fechaIngreso ? dateDeFechaKey(input.fechaIngreso) : null,
            observaciones: input.observaciones ?? null,
            fotoUrl: input.fotoUrl ?? null,
            grupoSanguineo: input.grupoSanguineo ?? null,
            alergias: input.alergias?.trim() || null,
            beneficiarioId: input.beneficiarioId ?? null,
            createdBy: usuario,
          },
          include: COLABORADOR_INCLUDE,
        });
        if (input.tarifaInicial) {
          await guardarTarifaEnTx(tx, tenantId, creado.id, input.tarifaInicial, usuario);
        }
        return creado;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        if (documento) {
          const existente = await prisma.colaborador.findFirst({
            where: { tenantId, deletedAt: null, documento },
            select: { id: true, nombre: true },
          });
          if (existente) throw new DocumentoDuplicadoError(existente);
        }
        if (input.beneficiarioId) throw new BeneficiarioYaVinculadoError();
      }
      throw e;
    }

    logActivity("rrhh_colaborador_crear", "Colaborador", `Creó a ${nombre}`, row.id, usuario, undefined, tenantId).catch(() => {});
    if (input.tarifaInicial) {
      logActivity(
        "rrhh_tarifa_guardar",
        "Colaborador",
        `Nueva tarifa desde ${input.tarifaInicial.vigenteDesde} (${input.tarifaInicial.modalidad.toLowerCase()})`,
        row.id,
        usuario,
        undefined,
        tenantId,
      ).catch(() => {});
    }
    return mapColaborador(row);
  },

  async editar(
    tenantId: string,
    id: string,
    patch: Record<string, unknown>,
    usuario: string,
  ): Promise<{ row: ColaboradorRow; camposCambiados: string[] } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return null;

    // Unchecked: permite el escalar `puestoId` directo (gotcha ADR-414 — ver
    // más abajo, `connect`/`disconnect` no sirve en la FK compuesta).
    const data: Prisma.ColaboradorUncheckedUpdateInput = {};
    const cambios: string[] = [];
    const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);

    if (has("nombre")) {
      data.nombre = String(patch.nombre).trim();
      cambios.push("nombre");
    }
    if (has("apodo")) {
      data.apodo = patch.apodo as string | null;
      cambios.push("apodo");
    }

    let documentoFinal = existing.documento;
    let tipoDocumentoFinal = existing.tipoDocumento;
    let tocaDocumento = false;
    if (has("documento")) {
      documentoFinal = normalizarDocumento(patch.documento as string | null);
      tocaDocumento = true;
    }
    if (has("tipoDocumento")) {
      tipoDocumentoFinal = patch.tipoDocumento as string | null;
      tocaDocumento = true;
    }
    if (tocaDocumento) {
      if (documentoInvalido(tipoDocumentoFinal, documentoFinal)) throw new DocumentoInvalidoError();
      if (documentoFinal) {
        const dup = await prisma.colaborador.findFirst({
          where: { tenantId, deletedAt: null, documento: documentoFinal, id: { not: id } },
          select: { id: true, nombre: true },
        });
        if (dup) throw new DocumentoDuplicadoError(dup);
      }
      data.documento = documentoFinal;
      data.tipoDocumento = documentoFinal ? tipoDocumentoFinal : null;
      cambios.push("documento");
    }
    if (has("celular")) {
      data.celular = patch.celular as string | null;
      cambios.push("celular");
    }
    if (has("direccion")) {
      data.direccion = patch.direccion as string | null;
      cambios.push("dirección");
    }
    if (has("contactoEmergenciaNombre") || has("contactoEmergenciaCelular")) {
      if (has("contactoEmergenciaNombre")) data.contactoEmergenciaNombre = patch.contactoEmergenciaNombre as string | null;
      if (has("contactoEmergenciaCelular")) data.contactoEmergenciaCelular = patch.contactoEmergenciaCelular as string | null;
      cambios.push("contacto de emergencia");
    }
    if (has("grupoSanguineo")) {
      data.grupoSanguineo = patch.grupoSanguineo as string | null;
    }
    if (has("alergias")) {
      data.alergias = (patch.alergias as string | null)?.trim() || null;
    }
    if (has("fotoUrl")) {
      data.fotoUrl = patch.fotoUrl as string | null;
      cambios.push("foto");
    }
    if (has("puestoId")) {
      const puestoId = patch.puestoId as string | null;
      if (puestoId) {
        const p = await prisma.puesto.findFirst({ where: { id: puestoId, tenantId, deletedAt: null }, select: { id: true } });
        if (!p) throw new PuestoNoEncontradoError();
      }
      // Gotcha ADR-414: escribir el escalar, nunca `puesto: { connect/disconnect }`
      // (disconnect intentaría anular tenantId de la FK compuesta).
      data.puestoId = puestoId;
      cambios.push("puesto");
    }
    if (has("fechaIngreso")) {
      const fechaIngreso = patch.fechaIngreso as string | null;
      data.fechaIngreso = fechaIngreso ? dateDeFechaKey(fechaIngreso) : null;
      cambios.push("fecha de ingreso");
    }
    if (has("observaciones")) {
      data.observaciones = patch.observaciones as string | null;
      cambios.push("observaciones");
    }

    let row: ColaboradorPrismaRow;
    try {
      row = await prisma.colaborador.update({ where: { id, tenantId }, data, include: COLABORADOR_INCLUDE });
    } catch (e) {
      if (isUniqueViolation(e) && documentoFinal) {
        const dup = await prisma.colaborador.findFirst({
          where: { tenantId, deletedAt: null, documento: documentoFinal, id: { not: id } },
          select: { id: true, nombre: true },
        });
        throw new DocumentoDuplicadoError(dup ?? { id: "", nombre: documentoFinal });
      }
      throw e;
    }

    if (cambios.length > 0) {
      logActivity("rrhh_colaborador_editar", "Colaborador", `Cambió: ${cambios.join(", ")}`, id, usuario, undefined, tenantId).catch(
        () => {},
      );
    }
    return { row: mapColaborador(row), camposCambiados: cambios };
  },

  async cambiarEstado(
    tenantId: string,
    id: string,
    input: { estado: EstadoColaborador; sinPagoDesde?: FechaKey },
    usuario: string,
  ): Promise<ColaboradorRow | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return null;
    if (existing.estado === "CESADO") {
      throw new EstadoInvalidoError("Está cesado: usa «Reingresar» para volver a activarlo.");
    }

    // Reintento por P2002: `guardarTarifaEnTx` puede chocar con una tarifa
    // manual metida en el mismo instante (mismo criterio que `guardarTarifa`).
    const MAX_REINTENTOS = 2;
    let row: ColaboradorPrismaRow | undefined;
    for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
      try {
        row = await prisma.$transaction(async (tx) => {
          const actualizado = await tx.colaborador.update({
            where: { id, tenantId },
            data: { estado: input.estado },
            include: COLABORADOR_INCLUDE,
          });
          if (input.estado === "SUSPENDIDO" && input.sinPagoDesde) {
            await guardarTarifaEnTx(
              tx,
              tenantId,
              id,
              { modalidad: "SIN_PAGO", monto: 0, vigenteDesde: input.sinPagoDesde },
              usuario,
            );
          }
          // Vuelve a ACTIVO y la tarifa vigente es SIN_PAGO (p. ej. la
          // suspensión sin goce que dejó `sinPagoDesde`): sin esto ganaría
          // S/ 0 para siempre. Mismo criterio que `reingresar` — revive la
          // última tarifa PAGADA, desde hoy (Lima). Decisión de negocio por
          // defecto (hallazgo BAJO, revisión 2026-09-14).
          if (input.estado === "ACTIVO") {
            const hoy = limaDateKey();
            const tarifaActual = await tx.colaboradorTarifa.findFirst({
              where: { tenantId, colaboradorId: id, deletedAt: null, vigenteDesde: { lte: dateDeFechaKey(hoy) } },
              orderBy: { vigenteDesde: "desc" },
            });
            if (tarifaActual?.modalidad === "SIN_PAGO") {
              const ultimaPagada = await tx.colaboradorTarifa.findFirst({
                where: { tenantId, colaboradorId: id, deletedAt: null, modalidad: { not: "SIN_PAGO" } },
                orderBy: { vigenteDesde: "desc" },
              });
              if (ultimaPagada) {
                await guardarTarifaEnTx(
                  tx,
                  tenantId,
                  id,
                  {
                    modalidad: ultimaPagada.modalidad as Modalidad,
                    monto: toNum(ultimaPagada.monto),
                    horasJornada: toNum(ultimaPagada.horasJornada),
                    vigenteDesde: hoy,
                  },
                  usuario,
                );
              }
            }
          }
          return actualizado;
        });
        break;
      } catch (e) {
        if (isUniqueViolation(e) && intento < MAX_REINTENTOS - 1) continue;
        throw e;
      }
    }
    if (!row) throw new Error("No se pudo cambiar el estado (carrera con otra tarifa)");

    logActivity("rrhh_colaborador_editar", "Colaborador", `Cambió: estado a ${input.estado}`, id, usuario, undefined, tenantId).catch(
      () => {},
    );
    return mapColaborador(row);
  },

  async cesar(
    tenantId: string,
    id: string,
    input: { fechaCese: FechaKey; motivo: string; confirmar?: boolean },
    usuario: string,
  ): Promise<ColaboradorRow | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return null;

    if (existing.fechaIngreso && fechaKeyDeDate(existing.fechaIngreso) > input.fechaCese) {
      throw new FechaInvalidaError(
        `Ingresó el ${etiquetaCorta(fechaKeyDeDate(existing.fechaIngreso))}: el cese no puede ser antes.`,
      );
    }

    const posteriores = await prisma.asistencia.findMany({
      where: { tenantId, colaboradorId: id, deletedAt: null, fecha: { gt: dateDeFechaKey(input.fechaCese) } },
      select: { fecha: true },
      orderBy: { fecha: "asc" },
      take: 1,
    });
    if (posteriores.length > 0 && !input.confirmar) {
      const total = await prisma.asistencia.count({
        where: { tenantId, colaboradorId: id, deletedAt: null, fecha: { gt: dateDeFechaKey(input.fechaCese) } },
      });
      throw new MarcasDespuesDelCeseError(total, fechaKeyDeDate(posteriores[0].fecha));
    }

    // Reintento por P2002: `guardarTarifaEnTx` puede chocar con una tarifa
    // manual del mismo día metida en el mismo instante (mismo criterio que
    // `guardarTarifa`) — si eso pasa, la tx entera (estado + tarifa) se rehace
    // fresca, no sólo la tarifa.
    const MAX_REINTENTOS = 2;
    let row: ColaboradorPrismaRow | undefined;
    for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
      try {
        row = await prisma.$transaction(async (tx) => {
          const actualizado = await tx.colaborador.update({
            where: { id, tenantId },
            data: { estado: "CESADO", fechaCese: dateDeFechaKey(input.fechaCese), motivoCese: input.motivo.trim() },
            include: COLABORADOR_INCLUDE,
          });
          const tieneTarifa = await tx.colaboradorTarifa.count({ where: { tenantId, colaboradorId: id, deletedAt: null } });
          if (tieneTarifa > 0) {
            await guardarTarifaEnTx(
              tx,
              tenantId,
              id,
              { modalidad: "SIN_PAGO", monto: 0, vigenteDesde: sumarDias(input.fechaCese, 1) },
              usuario,
            );
          }
          return actualizado;
        });
        break;
      } catch (e) {
        if (isUniqueViolation(e) && intento < MAX_REINTENTOS - 1) continue;
        throw e;
      }
    }
    if (!row) throw new Error("No se pudo cesar (carrera con otra tarifa)");

    // Sin el motivo: es texto libre que puede llevar un dato sensible (salud,
    // conflicto) y el almacenero lee esta auditoría (ADR-414 §8) — nombres de
    // campo y fechas, nunca el valor que se tipeó.
    logActivity(
      "rrhh_colaborador_editar",
      "Colaborador",
      `Cesó a la persona desde el ${input.fechaCese}`,
      id,
      usuario,
      undefined,
      tenantId,
    ).catch(() => {});
    return mapColaborador(row);
  },

  async reingresar(
    tenantId: string,
    id: string,
    input: { fecha: FechaKey; tarifa?: TarifaInput | null },
    usuario: string,
  ): Promise<ColaboradorRow | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return null;
    if (existing.estado !== "CESADO") throw new NoEstaCesadoError();
    if (existing.fechaCese && input.fecha < fechaKeyDeDate(existing.fechaCese)) {
      throw new FechaInvalidaError(`Cesó el ${etiquetaCorta(fechaKeyDeDate(existing.fechaCese))}: no puede reingresar antes.`);
    }

    const MAX_REINTENTOS = 2;
    let row: ColaboradorPrismaRow | undefined;
    for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
      try {
        row = await prisma.$transaction(async (tx) => {
          const actualizado = await tx.colaborador.update({
            where: { id, tenantId },
            data: { estado: "ACTIVO", fechaCese: null, motivoCese: null },
            include: COLABORADOR_INCLUDE,
          });

          let tarifaAUsar: TarifaParaGuardar | null = input.tarifa ? { ...input.tarifa, vigenteDesde: input.fecha } : null;
          if (!tarifaAUsar) {
            // Sin tarifa a mano: la última PAGADA (nunca una SIN_PAGO), para no
            // dejarlo sin sueldo de referencia al volver.
            const ultimaPagada = await tx.colaboradorTarifa.findFirst({
              where: { tenantId, colaboradorId: id, deletedAt: null, modalidad: { not: "SIN_PAGO" } },
              orderBy: { vigenteDesde: "desc" },
            });
            if (ultimaPagada) {
              tarifaAUsar = {
                modalidad: ultimaPagada.modalidad as Modalidad,
                monto: toNum(ultimaPagada.monto),
                horasJornada: toNum(ultimaPagada.horasJornada),
                vigenteDesde: input.fecha,
              };
            }
          }
          if (tarifaAUsar) await guardarTarifaEnTx(tx, tenantId, id, tarifaAUsar, usuario);
          return actualizado;
        });
        break;
      } catch (e) {
        if (isUniqueViolation(e) && intento < MAX_REINTENTOS - 1) continue;
        throw e;
      }
    }
    if (!row) throw new Error("No se pudo reingresar (carrera con otra tarifa)");

    logActivity("rrhh_colaborador_editar", "Colaborador", `Reingresó desde ${input.fecha}`, id, usuario, undefined, tenantId).catch(
      () => {},
    );
    return mapColaborador(row);
  },

  async vincularBeneficiario(tenantId: string, id: string, beneficiarioId: string | null, usuario: string): Promise<ColaboradorRow | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return null;

    if (beneficiarioId) {
      const b = await AdelantosDB.getBeneficiario(tenantId, beneficiarioId);
      if (!b) throw new BeneficiarioNoEncontradoError();
      if (existing.documento && b.documento && !mismoDocumento(existing.documento, b.documento)) {
        throw new DocumentoNoCoincideError();
      }
    }

    try {
      const row = await prisma.colaborador.update({ where: { id, tenantId }, data: { beneficiarioId }, include: COLABORADOR_INCLUDE });
      logActivity(
        "rrhh_colaborador_editar",
        "Colaborador",
        beneficiarioId ? "Vinculó su cuenta de Adelantos" : "Desvinculó su cuenta de Adelantos",
        id,
        usuario,
        undefined,
        tenantId,
      ).catch(() => {});
      return mapColaborador(row);
    } catch (e) {
      if (isUniqueViolation(e)) throw new BeneficiarioYaVinculadoError();
      throw e;
    }
  },

  async vincularUsuario(tenantId: string, id: string, adminUserId: string | null, usuario: string): Promise<ColaboradorRow | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return null;

    if (adminUserId) {
      const u = await prisma.adminUser.findFirst({ where: { id: adminUserId, tenantId }, select: { id: true } });
      if (!u) throw new UsuarioNoEncontradoError();
    }

    try {
      const row = await prisma.colaborador.update({ where: { id, tenantId }, data: { adminUserId }, include: COLABORADOR_INCLUDE });
      logActivity(
        "rrhh_colaborador_editar",
        "Colaborador",
        adminUserId ? "Vinculó su usuario del panel" : "Desvinculó su usuario del panel",
        id,
        usuario,
        undefined,
        tenantId,
      ).catch(() => {});
      return mapColaborador(row);
    } catch (e) {
      if (isUniqueViolation(e)) throw new UsuarioYaVinculadoError();
      throw e;
    }
  },

  async eliminar(tenantId: string, id: string, usuario: string): Promise<{ marcasOcultas: number } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return null;
    const marcasOcultas = await prisma.asistencia.count({ where: { tenantId, colaboradorId: id, deletedAt: null } });
    await prisma.colaborador.update({ where: { id, tenantId }, data: { deletedAt: new Date() } });
    logActivity("rrhh_colaborador_editar", "Colaborador", `Eliminó a ${existing.nombre}`, id, usuario, undefined, tenantId).catch(
      () => {},
    );
    return { marcasOcultas };
  },

  async restaurar(tenantId: string, id: string, usuario: string): Promise<ColaboradorRow | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: { not: null } } });
    if (!existing) return null;
    if (existing.documento) {
      const ocupado = await prisma.colaborador.findFirst({
        where: { tenantId, deletedAt: null, documento: existing.documento, id: { not: id } },
        select: { id: true, nombre: true },
      });
      if (ocupado) throw new DocumentoOcupadoError(ocupado);
    }
    let row: ColaboradorPrismaRow;
    try {
      row = await prisma.colaborador.update({ where: { id, tenantId }, data: { deletedAt: null }, include: COLABORADOR_INCLUDE });
    } catch (e) {
      if (isUniqueViolation(e) && existing.documento) {
        const ocupado = await prisma.colaborador.findFirst({
          where: { tenantId, deletedAt: null, documento: existing.documento, id: { not: id } },
          select: { id: true, nombre: true },
        });
        throw new DocumentoOcupadoError(ocupado ?? { id: "", nombre: existing.documento });
      }
      throw e;
    }
    logActivity("rrhh_colaborador_editar", "Colaborador", `Restauró a ${existing.nombre}`, id, usuario, undefined, tenantId).catch(
      () => {},
    );
    return mapColaborador(row);
  },

  async tarifasDe(tenantId: string, colaboradorIds: string[]): Promise<Map<string, TarifaRow[]>> {
    if (!tenantId) throw new Error("tenantId is required");
    const mapa = new Map<string, TarifaRow[]>();
    if (colaboradorIds.length === 0) return mapa;
    const rows = await prisma.colaboradorTarifa.findMany({
      where: { tenantId, colaboradorId: { in: colaboradorIds }, deletedAt: null },
      orderBy: { vigenteDesde: "desc" },
    });
    for (const r of rows) {
      const lista = mapa.get(r.colaboradorId) ?? [];
      lista.push(mapTarifa(r));
      mapa.set(r.colaboradorId, lista);
    }
    return mapa;
  },

  async guardarTarifa(tenantId: string, colaboradorId: string, input: TarifaGuardarInput, usuario: string): Promise<TarifaRow[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (input.modalidad === "SIN_PAGO" && input.monto !== 0) {
      throw new TarifaInvalidaError("«Sin pago» va con monto S/ 0.");
    }
    if (input.modalidad !== "SIN_PAGO" && !(input.monto > 0)) {
      throw new TarifaInvalidaError("El monto tiene que ser mayor a S/ 0.");
    }

    const MAX_REINTENTOS = 2;
    for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
      try {
        await prisma.$transaction((tx) => guardarTarifaEnTx(tx, tenantId, colaboradorId, input, usuario));
        break;
      } catch (e) {
        if (isUniqueViolation(e) && intento < MAX_REINTENTOS - 1) continue;
        throw e;
      }
    }

    logActivity(
      "rrhh_tarifa_guardar",
      "Colaborador",
      `Nueva tarifa desde ${input.vigenteDesde} (${input.modalidad.toLowerCase()})`,
      colaboradorId,
      usuario,
      undefined,
      tenantId,
    ).catch(() => {});
    const mapa = await ColaboradoresDB.tarifasDe(tenantId, [colaboradorId]);
    return mapa.get(colaboradorId) ?? [];
  },

  async quitarTarifa(tenantId: string, colaboradorId: string, tarifaId: string, usuario: string): Promise<TarifaRow[] | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.colaboradorTarifa.findFirst({ where: { id: tarifaId, tenantId, colaboradorId, deletedAt: null } });
    if (!existing) return null;
    await prisma.colaboradorTarifa.update({ where: { id: tarifaId, tenantId }, data: { deletedAt: new Date(), deletedBy: usuario } });
    logActivity(
      "rrhh_tarifa_guardar",
      "Colaborador",
      `Quitó la tarifa desde ${fechaKeyDeDate(existing.vigenteDesde)}`,
      colaboradorId,
      usuario,
      undefined,
      tenantId,
    ).catch(() => {});
    const mapa = await ColaboradoresDB.tarifasDe(tenantId, [colaboradorId]);
    return mapa.get(colaboradorId) ?? [];
  },

  async exportar(tenantId: string, id: string): Promise<ExportColaborador | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.colaborador.findFirst({ where: { id, tenantId, deletedAt: null }, include: COLABORADOR_INCLUDE });
    if (!row) return null;

    const [tarifaRows, asistenciaRows, contratos, adelantos] = await Promise.all([
      prisma.colaboradorTarifa.findMany({ where: { tenantId, colaboradorId: id, deletedAt: null }, orderBy: { vigenteDesde: "desc" } }),
      prisma.asistencia.findMany({ where: { tenantId, colaboradorId: id, deletedAt: null }, orderBy: { fecha: "desc" }, take: 1000 }),
      ContractsDB.list(tenantId, { colaboradorId: id, limit: 200 }),
      row.beneficiarioId ? AdelantosDB.list(tenantId, { beneficiarioId: row.beneficiarioId }) : Promise.resolve([]),
    ]);

    return {
      colaborador: aColaboradorDTO(mapColaborador(row), "completo"),
      tarifas: tarifaRows.map((t) => aTarifaDTO(mapTarifa(t))),
      asistencias: asistenciaRows.map((a) => aAsistenciaDTO(mapAsistencia(a))),
      contratos: contratos.map((c) => ({ id: c.id, numero: c.numero, estado: c.estado })),
      adelantos: adelantos.map((a) => ({ id: a.id, codigo: a.codigoOperacion ?? "", saldo: a.saldoPendiente })),
    };
  },

  async resumen(tenantId: string, hoy: FechaKey): Promise<Omit<ResumenRrhhDTO, "nivel" | "hoy">> {
    if (!tenantId) throw new Error("tenantId is required");

    const [porEstado, incluibles, marcasHoy, contratosTodos] = await Promise.all([
      prisma.colaborador.groupBy({ by: ["estado"], where: { tenantId, deletedAt: null }, _count: true }),
      prisma.colaborador.findMany({
        where: {
          tenantId,
          deletedAt: null,
          estado: "ACTIVO",
          OR: [{ fechaIngreso: null }, { fechaIngreso: { lte: dateDeFechaKey(hoy) } }],
        },
        select: { id: true },
      }),
      prisma.asistencia.findMany({
        where: { tenantId, deletedAt: null, fecha: dateDeFechaKey(hoy) },
        select: { colaboradorId: true, estado: true },
      }),
      ContractsDB.list(tenantId, { limit: 500 }),
    ]);

    const personal: Record<EstadoColaborador, number> = { ACTIVO: 0, VACACIONES: 0, LICENCIA: 0, SUSPENDIDO: 0, CESADO: 0 };
    for (const g of porEstado) personal[g.estado as EstadoColaborador] = g._count;

    const incluiblesSet = new Set(incluibles.map((c) => c.id));
    const conteo: Record<EstadoAsistencia, number> = { ...CONTEO_ASISTENCIA_VACIO };
    let marcadosIncluidos = 0;
    for (const m of marcasHoy) {
      if (!incluiblesSet.has(m.colaboradorId)) continue;
      conteo[m.estado as EstadoAsistencia]++;
      marcadosIncluidos++;
    }

    let porVencer = 0;
    let vencidos = 0;
    const conColaborador = new Set<string>();
    for (const c of contratosTodos) {
      const v = estadoVisible(c);
      if (v === "POR_VENCER") porVencer++;
      if (v === "VENCIDO") vencidos++;
      if (c.colaboradorId) conColaborador.add(c.colaboradorId);
    }
    const activosSinContrato = incluibles.filter((c) => !conColaborador.has(c.id)).length;

    return {
      personal,
      hoyAsistencia: { incluidos: incluiblesSet.size, conteo, sinMarcar: incluiblesSet.size - marcadosIncluidos },
      contratos: { porVencer, vencidos, activosSinContrato },
    };
  },

  /**
   * Beneficiarios VIVOS de Adelantos que todavía no tienen un `Colaborador`
   * vivo vinculado — «Traer del negocio real». `esEmpresa` es informativo acá
   * (la pantalla ya lo puede usar para atenuar la fila); el filtro de verdad
   * lo aplica `traerDesdeAdelantos`.
   */
  async candidatosDesdeAdelantos(tenantId: string): Promise<{ candidatos: CandidatoDesdeAdelantosDTO[]; yaVinculados: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const [beneficiarios, vinculados] = await Promise.all([
      AdelantosDB.listBeneficiarios(tenantId),
      prisma.colaborador.findMany({
        where: { tenantId, deletedAt: null, beneficiarioId: { not: null } },
        select: { beneficiarioId: true },
      }),
    ]);
    const usados = new Set(vinculados.map((v) => v.beneficiarioId as string));
    const candidatos = beneficiarios
      .filter((b) => b.activo !== false && !usados.has(b.id))
      .map((b) => aCandidatoDesdeAdelantosDTO(b));
    return { candidatos, yaVinculados: usados.size };
  },

  /**
   * Crea un `Colaborador` por cada `beneficiarioId`, copiando EN EL SERVIDOR
   * nombre/documento/celular — nunca lo que mande el cliente. Cada persona es
   * independiente (no todo-o-nada): una que choca con una carrera no tumba a
   * las demás del lote. `esEmpresa` (RUC-20) se omite salvo que venga en
   * `incluirEmpresas` — un `Colaborador` es una PERSONA, no una empresa.
   */
  async traerDesdeAdelantos(
    tenantId: string,
    input: TraerDesdeAdelantosInput,
    usuario: string,
  ): Promise<ResultadoTraerDesdeAdelantosDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    const idsUnicos = [...new Set(input.beneficiarioIds)];
    const incluirEmpresas = new Set(input.incluirEmpresas ?? []);

    const [beneficiarios, vinculados, colaboradoresConDoc] = await Promise.all([
      AdelantosDB.listBeneficiarios(tenantId),
      prisma.colaborador.findMany({
        where: { tenantId, deletedAt: null, beneficiarioId: { not: null } },
        select: { beneficiarioId: true },
      }),
      prisma.colaborador.findMany({
        where: { tenantId, deletedAt: null, documento: { not: null } },
        select: { documento: true },
      }),
    ]);
    const porId = new Map(beneficiarios.filter((b) => b.activo !== false).map((b) => [b.id, b]));
    const yaVinculados = new Set(vinculados.map((v) => v.beneficiarioId as string));
    // Set mutable: reserva documentos DENTRO del lote para que dos candidatos
    // con el mismo número no se cuelen los dos en la misma pasada.
    const documentosUsados = new Set(colaboradoresConDoc.map((c) => c.documento as string));

    const creados: ColaboradorDTO[] = [];
    const omitidos: ResultadoTraerDesdeAdelantosDTO["omitidos"] = [];

    for (const beneficiarioId of idsUnicos) {
      const b = porId.get(beneficiarioId);
      if (!b) {
        omitidos.push({ beneficiarioId, nombre: "—", motivo: "no_encontrado" });
        continue;
      }
      if (yaVinculados.has(beneficiarioId)) {
        omitidos.push({ beneficiarioId, nombre: b.nombre, motivo: "ya_vinculado" });
        continue;
      }
      if (esRucEmpresa(b.documento) && !incluirEmpresas.has(beneficiarioId)) {
        omitidos.push({ beneficiarioId, nombre: b.nombre, motivo: "es_empresa" });
        continue;
      }
      const documento = normalizarDocumento(b.documento);
      if (documento && documentosUsados.has(documento)) {
        omitidos.push({ beneficiarioId, nombre: b.nombre, motivo: "documento_duplicado" });
        continue;
      }

      try {
        const row = await prisma.colaborador.create({
          data: {
            tenantId,
            nombre: b.nombre,
            tipoDocumento: tipoDocumentoPorFormato(documento),
            documento,
            celular: b.telefono?.trim() || null,
            estado: "ACTIVO",
            fechaIngreso: input.fechaIngreso ? dateDeFechaKey(input.fechaIngreso) : null,
            beneficiarioId,
            createdBy: usuario,
          },
          include: COLABORADOR_INCLUDE,
        });
        if (documento) documentosUsados.add(documento);
        creados.push(aColaboradorDTO(mapColaborador(row), "completo"));
        // Sin valores: el nombre lo trae la propia lista del panel; acá sólo
        // queda "de dónde salió" (ADR-414 §8).
        logActivity(
          "rrhh_colaborador_crear",
          "Colaborador",
          "Creó desde Adelantos",
          row.id,
          usuario,
          undefined,
          tenantId,
        ).catch((err) =>
          logger.error("[rrhh] no se pudo registrar la actividad de traer desde Adelantos", {
            error: String(err),
          }),
        );
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        // Carrera entre la relectura de arriba y este create: releo cuál de
        // los dos únicos parciales chocó, en vez de adivinar.
        const yaEsSuyo = await prisma.colaborador.findFirst({
          where: { tenantId, deletedAt: null, beneficiarioId },
          select: { id: true },
        });
        omitidos.push({ beneficiarioId, nombre: b.nombre, motivo: yaEsSuyo ? "ya_vinculado" : "documento_duplicado" });
      }
    }

    return { creados, omitidos };
  },
};

function aCandidatoDesdeAdelantosDTO(b: DbBeneficiario & ResumenPersona): CandidatoDesdeAdelantosDTO {
  return {
    beneficiarioId: b.id,
    nombre: b.nombre,
    tipoDocumento: tipoDocumentoCandidato(b.documento, b.tipoDocumento),
    documentoEnmascarado: enmascararDocumento(b.documento ?? null),
    tieneCelular: Boolean(b.telefono?.trim()),
    saldoAbierto: b.saldoPendiente.PEN ?? 0,
    esEmpresa: esRucEmpresa(b.documento ?? null),
  };
}
