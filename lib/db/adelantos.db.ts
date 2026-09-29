import "server-only";
import { prisma } from "@/lib/prisma";
import { limaDateKey } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { contratoPropio } from "./contrato-propio.db";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  PREFIJO_ADELANTO,
  anioDeCodigo,
  normalizarBusquedaCodigo,
  siguienteCodigo,
} from "@/lib/adelantos/codigo-operacion";
import { estadoDelSaldo } from "@/lib/adelantos/saldo-adelanto";
import { resumirPersona, type ResumenPersona } from "@/lib/adelantos/saldo-persona";
import {
  etiquetaEgreso,
  etiquetaIngreso,
  etiquetaRecibido,
  etiquetaReversion,
  moverCajaEnTx,
  type MetodoPago,
  type ResultadoMovimiento,
} from "@/lib/adelantos/movimiento-caja";
import {
  SOLO_DADOS,
  cajaAlCrear,
  cajaAlDevolver,
  direccionDe,
  mensajeMovioCaja,
  movimientoDelAlta,
  problemaDeDireccion,
  whereDireccion,
  type AdelantoConceptoRecibido,
  type AdelantoDireccion,
  type FiltroDireccion,
} from "@/lib/adelantos/direccion";
import { limpiarMotivo, motivoLegible } from "@/lib/forestal/motivo";
import { formatCurrency } from "@/lib/currency";
import { huellaDeAlta, huellaDeEntrega } from "@/lib/adelantos/idempotencia";
import { invalidateByPrefix } from "@/lib/cache";
import { claveCacheResultado } from "@/lib/finance/resultado-del-negocio";

/** ADR-451: la caja y lo que viene del negocio leen los adelantos (alta, entrega, anulación). */
function invalidarResultado(tenantId: string): void {
  try {
    invalidateByPrefix(`${claveCacheResultado(tenantId)}:`);
  } catch (err) {
    logger.warn("[adelantos.db] no se pudo invalidar el resultado del negocio", { error: String(err), tenantId });
  }
}
// Sólo LECTURA de la parte: la clase forestal es dueña de `ForestParty`
// (ADR-317); acá no se toca su tabla, sólo se confirma que exista en el tenant.
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";

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
/** (ADR-448) Para los 5 lectores que consultan `prisma.adelanto` por fuera de esta clase. */
export { SOLO_DADOS };
export type { AdelantoDireccion, AdelantoConceptoRecibido, FiltroDireccion };
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
  /**
   * Esta persona es tal parte del directorio forestal (ADR-412 §5): con esto
   * su cuenta une adelantos y aserríos en una sola fila en `/api/adelantos/cuentas`.
   * `null` = todavía sin vincular (se intenta por documento, nunca por nombre).
   */
  forestPartyId?: string | null;
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
  /** 0-6 (domingo a sábado). Sólo para semanal/quincenal. */
  diaSemana?: number | null;
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
  /** 0-6 (domingo a sábado). Sólo para semanal/quincenal. */
  diaSemana?: number | null;
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
  /** La liquidación de cuenta de la que salió (ADR-413). */
  liquidacionId?: string | null;
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
  /** El permiso bajo el que se entrega (ADR-421). */
  contratoId?: string | null;
  moneda: string;
  fechaAdelanto: string;
  /** (332) Cuándo se acordó devolverlo. */
  fechaVencimiento?: string | null;
  status: AdelantoStatus;
  saldoPendiente: number;
  totalEntregado: number;
  notas?: string | null;
  comprobanteUrl?: string | null;
  /** Volumen de madera de referencia (pies tablares) — NO participa en
   *  saldoPendiente ni en el tope de crédito. Ver comentario en schema.prisma. */
  piesTablares?: number | null;
  piesTablaresTipo?: PiesTablaresTipo | null;
  /**
   * (ADR-448) De qué lado está la plata. DADO = el negocio la dio (te debe si
   * el saldo es positivo); RECIBIDO = el negocio la recibió (le debes si el
   * saldo es positivo). Ver `lib/adelantos/direccion.ts`.
   */
  direccion: AdelantoDireccion;
  /** Sólo en RECIBIDO: un adelanto por un servicio que darás, o un préstamo. */
  conceptoRecibido: AdelantoConceptoRecibido | null;
  entregas: DbAdelantoEntrega[];
  entregasPactadas: DbEntregaPactada[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Se intentó vincular una parte del directorio forestal que YA es la cuenta de
 * otra persona en Adelantos (ADR-412 §5: una parte ↔ una persona).
 */
export class ParteYaVinculadaError extends Error {
  constructor(readonly forestPartyId: string, readonly deQuien: string) {
    super(`Esa parte del directorio ya está vinculada a ${deQuien}. Desvincúlala ahí primero.`);
    this.name = "ParteYaVinculadaError";
  }
}

/**
 * Se intentó vincular una parte que el directorio muestra «dada de baja»
 * (`activo: false`). `getParte` sólo mira `deletedAt`, así que sin este guard
 * pasaba: la cuenta de la persona terminaba unida a alguien con quien ya no se
 * trabaja. Re-vincular la MISMA parte que ya tenía no se rechaza.
 */
/**
 * Se intentó anular un adelanto que ya no tiene nada que anular: ya está
 * anulado, o ya se liquidó entero. Anularlo otra vez devolvería a la caja un
 * saldo que ya no existe.
 */
/**
 * (Revisión ADR-449) El adelanto tiene entregas VIVAS de una liquidación: un
 * cruce o un pago. Anularlo y después anular la liquidación dejaba la cuenta
 * mal (el adelanto seguía CANCELADO con el cruce devuelto). 409 `con_liquidacion`.
 */
export class AdelantoConLiquidacionError extends Error {
  readonly code = "con_liquidacion" as const;
  constructor(readonly liquidacion: string) {
    super(`Tiene un cruce o pago de la liquidación ${liquidacion}: anula esa liquidación primero (Cuenta por persona › Liquidaciones).`);
    this.name = "AdelantoConLiquidacionError";
  }
}

export class AdelantoNoCancelableError extends Error {
  constructor(readonly status: "CANCELADO" | "LIQUIDADO") {
    super(
      status === "CANCELADO"
        ? "Este adelanto ya está anulado."
        : "Este adelanto ya se liquidó entero: no queda saldo que anular.",
    );
    this.name = "AdelantoNoCancelableError";
  }
}

export class ParteDadaDeBajaError extends Error {
  constructor(readonly forestPartyId: string, nombre: string) {
    super(`${nombre} está dada de baja en el directorio: actívala ahí o elige otra parte.`);
    this.name = "ParteDadaDeBajaError";
  }
}

/** De qué lado está la madera de referencia; SERVICIO = la que el negocio asierra por el adelanto recibido. */
export type PiesTablaresTipo = "COMPRADO" | "VENDIDO" | "SERVICIO";

/**
 * No se puede corregir la dirección de este adelanto (ADR-448): ya tiene
 * entregas vivas, está anulado, o la combinación pedida no vale. La ruta lo
 * devuelve con `status` tal cual (409 o 400) y el mensaje en español.
 */
export class DireccionNoCorregibleError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409,
    readonly code: "con_entregas" | "anulado" | "sin_cambio" | "combinacion" | "motivo" | "movio_caja",
    /** En `movio_caja`: el movimiento del alta que lo impide, para mostrarlo. */
    readonly movimiento?: { tipo: string; monto: number; fecha: string },
  ) {
    super(message);
    this.name = "DireccionNoCorregibleError";
  }
}

/**
 * Una regla de la plata RECIBIDA que frena una entrega o una anulación
 * (ADR-448, revisión de seguridad). La ruta la devuelve con `status` y `code`.
 *
 * - `solo_admin_o_dueno` (403): sacar plata de la caja por un recibido.
 * - `excede_saldo` (400): devolver en plata más de lo que se debe.
 * - `producto_en_recibido` (400): entregar producto no baja el stock todavía.
 */
export class ReglaDeRecibidoError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403,
    readonly code: "solo_admin_o_dueno" | "excede_saldo" | "producto_en_recibido",
  ) {
    super(message);
    this.name = "ReglaDeRecibidoError";
  }
}

/**
 * La misma `idempotencyKey` llegó con OTRO cuerpo (ADR-448): no es un reintento,
 * es otro acto con la clave repetida. Devolver el primero con 200 hacía creer
 * que se guardó lo que se mandó. La ruta responde 422 `idempotencia_distinta`.
 */
export class IdempotenciaDistintaError extends Error {
  readonly status = 422 as const;
  readonly code = "idempotencia_distinta" as const;
  constructor(que: "adelanto" | "entrega") {
    super(
      que === "adelanto"
        ? "Ya guardaste un adelanto con otros datos en este intento; revísalo en la lista."
        : "Ya guardaste una entrega con otros datos en este intento; revísala en el detalle del adelanto.",
    );
    this.name = "IdempotenciaDistintaError";
  }
}

type Db = typeof prisma | Prisma.TransactionClient;

/** Quién pide la escritura, en lo que importa a la plata recibida. */
export type PermisosDeRecibido = {
  /**
   * Admin o dueño (`soloAdminODueno` de la ruta). Sin esto, devolver en plata un
   * recibido o anularlo devolviendo la plata se rechaza: un almacenero podía
   * anotar un recibido de S/ 1 y devolverle S/ 5 000 de la caja.
   */
  puedeSacarPlataDeRecibido?: boolean;
};

const SOLO_ADMIN_RECIBIDO = "Solo el administrador o el dueño pueden sacar plata de la caja por una plata recibida.";

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Violación de unique constraint de Prisma (P2002) — mismo detector que juntas.db.ts. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : Number(d);
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const INCLUDE_FULL = {
  beneficiario: true,
  /* Una entrega de una liquidación anulada no existe para nadie (ADR-413 §7):
     todos los lectores leen `DbAdelanto.entregas`, así que filtrar acá los
     cubre a todos. */
  entregas: { where: { anuladaAt: null }, orderBy: { fecha: "desc" } },
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
  cci?: string | null; activo?: boolean; forestPartyId?: string | null;
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
    forestPartyId: b.forestPartyId ?? null,
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
    // ADR-421 — se guardaba en `create()` pero el mapper no lo devolvía: la
    // pantalla nunca podía confirmar que quedó imputado a un contrato
    // (mismo whitelist desactualizado que ExpensesDB.mapExpense).
    contratoId: row.contratoId,
    moneda: row.moneda,
    fechaAdelanto: row.fechaAdelanto.toISOString(),
    fechaVencimiento: iso(row.fechaVencimiento),
    status: row.status as AdelantoStatus,
    saldoPendiente,
    totalEntregado: Math.round((montoAdelantado - saldoPendiente) * 100) / 100,
    notas: row.notas,
    comprobanteUrl: row.comprobanteUrl,
    piesTablares: row.piesTablares == null ? null : toNum(row.piesTablares),
    piesTablaresTipo: row.piesTablaresTipo as PiesTablaresTipo | null,
    /* ADR-448: una fila (o un mock) sin la columna se lee DADO, que es lo que era. */
    direccion: direccionDe(row.direccion),
    conceptoRecibido: row.conceptoRecibido ?? null,
    entregas: row.entregas.map((e) => ({
      id: e.id, adelantoId: e.adelantoId, fecha: e.fecha.toISOString(),
      tipo: e.tipo as AdelantoEntregaTipo, descripcion: e.descripcion,
      productId: e.productId, cantidad: e.cantidad == null ? null : toNum(e.cantidad),
      valor: toNum(e.valor), sumadoAStock: e.sumadoAStock, notas: e.notas,
      comprobanteUrl: e.comprobanteUrl,
      liquidacionId: e.liquidacionId ?? null,
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
  /** Volumen de madera de referencia — sólo se guarda si vienen los DOS juntos. */
  piesTablares?: number;
  piesTablaresTipo?: PiesTablaresTipo;
  /**
   * (ADR-448) De qué lado está la plata. Ausente = DADO: el asistente IA y
   * todo lo que ya llamaba a `create` siguen dando plata, como siempre.
   */
  direccion?: AdelantoDireccion;
  /** Obligatorio con RECIBIDO, prohibido con DADO (mismo CHECK que la base). */
  conceptoRecibido?: AdelantoConceptoRecibido | null;
  /**
   * (ADR-448) La clave del intento de alta: repetirla devuelve el MISMO adelanto
   * (`repetido: true`, sin volver a mover la caja). Un doble clic creaba dos.
   */
  idempotencyKey?: string | null;
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
  /** El permiso bajo el que se entrega el adelanto (ADR-421). */
  contratoId?: string | null;
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
  /**
   * (ADR-448) La clave del intento: un reintento (corte de red) con el mismo
   * cuerpo devuelve la misma entrega (`repetido`), sin anotar otra ni mover la
   * caja otra vez; con otro cuerpo, `IdempotenciaDistintaError` (422).
   */
  idempotencyKey?: string | null;
};

export type AdelantoListFilters = {
  status?: AdelantoStatus;
  beneficiarioId?: string;
  modalidad?: AdelantoModalidad;
  search?: string;
  /**
   * (ADR-448) Por defecto SÓLO lo dado: un lector que no pide lo recibido por
   * nombre deja de verlo, en vez de contarlo como «te debe». `"todas"` explícito
   * para la lista del módulo y el estado de cuenta.
   */
  direccion?: FiltroDireccion;
};

/**
 * (ADR-448) Lo que el negocio recibió, en `AdelantosDB.resumen().recibido`.
 *
 * La plata va SÓLO por moneda: un total que suma soles y dólares sin tipo de
 * cambio es una cifra inventada (revisión 28-09). Arriba queda sólo el conteo.
 */
export type ResumenRecibido = {
  /** Cuántos recibidos siguen abiertos, en todas las monedas (es un conteo). */
  abiertos: number;
  porMoneda: {
    moneda: string;
    /** Lo recibido, no anulado. */
    total: number;
    /** Saldo positivo: lo que le debes a la gente. */
    porDevolver: number;
    /** Saldo negativo: le diste de más de lo que te dio (te debe). */
    excedente: number;
    abiertos: number;
  }[];
};

/** El resultado de una escritura que puede mover la caja. `null` = no se pidió moverla. */
export type ConCaja<T> = T & { caja: ResultadoMovimiento | null };

/** Una fila de `saldosPorPersona` — ya agregada, no un adelanto individual. */
export type SaldoAdelantoGrupo = {
  beneficiarioId: string;
  status: AdelantoStatus;
  moneda: string;
  /** (ADR-448) Un grupo RECIBIDO ABIERTO es «le debes», no «te debe». */
  direccion: AdelantoDireccion;
  /** SUMA de saldoPendiente del grupo (beneficiario, status, moneda). */
  saldoPendiente: number;
  /** Cuántos adelantos individuales componen este grupo (`_count` del `groupBy`). */
  cantidad: number;
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
  /* El año de LIMA: con el del servidor (UTC) un adelanto del 31/12 a las
     20:00 salía con el número del año siguiente. */
  const anio = anioDeCodigo();
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
  /** Una persona sola — para armar su estado de cuenta (ADR-412 §5) sin traer el listado entero. */
  async getBeneficiario(tenantId: string, id: string): Promise<DbBeneficiario | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.adelantoBeneficiario.findFirst({ where: { id, tenantId } });
    return row ? mapBeneficiario(row) : null;
  },

  async listBeneficiarios(tenantId: string): Promise<(DbBeneficiario & ResumenPersona)[]> {
    const rows = await prisma.adelantoBeneficiario.findMany({
      where: { tenantId },
      orderBy: { nombre: "asc" },
      include: {
        /* Con la dirección (ADR-448): `resumirPersona` separa lo recibido y deja
           los campos de siempre en lo dado. */
        adelantos: {
          select: { montoAdelantado: true, saldoPendiente: true, moneda: true, status: true, fechaAdelanto: true, direccion: true },
        },
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
          moneda: a.moneda,
          status: a.status,
          fechaAdelanto: a.fechaAdelanto,
          direccion: a.direccion,
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

    /* El día es el de LIMA, no el de UTC. Con `toISOString()` el día cambiaba a
       las 19:00 hora peruana: un recordatorio mandado a las 18:00 y otro a las
       20:00 caían en «días» distintos y el segundo pasaba el filtro. Le llegan
       dos avisos de cobranza la misma tarde a una persona real. */
    const hoy = limaDateKey();
    if (b.ultimoRecordatorio && limaDateKey(b.ultimoRecordatorio) === hoy) return null;

    const upd = await prisma.adelantoBeneficiario.update({
      where: { id: beneficiarioId },
      data: { ultimoRecordatorio: new Date() },
      select: { ultimoRecordatorio: true },
    });
    return { ultimoRecordatorio: upd.ultimoRecordatorio!.toISOString() };
  },

  // ── Adelantos ──
  async list(tenantId: string, filters?: AdelantoListFilters): Promise<DbAdelanto[]> {
    const where: Prisma.AdelantoWhereInput = { tenantId, ...whereDireccion(filters?.direccion) };
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

  async create(tenantId: string, data: AdelantoCreateInput): Promise<ConCaja<DbAdelanto> & { repetido?: true }> {
    if (!tenantId) throw new Error("tenantId is required");
    /* Idempotencia: el mismo intento (doble clic, reintento de la red) devuelve
       el adelanto que ya se creó, sin volver a mover la caja. */
    const clave = data.idempotencyKey?.trim() || null;
    const huella = huellaDeAlta({
      beneficiarioId: data.beneficiarioId,
      montoAdelantado: data.montoAdelantado,
      moneda: data.moneda || "PEN",
      direccion: direccionDe(data.direccion),
      conceptoRecibido: direccionDe(data.direccion) === "RECIBIDO" ? (data.conceptoRecibido ?? null) : null,
      metodoCaja: data.metodoCaja ?? null,
    });
    const yaCreado = async () => {
      if (!clave) return null;
      const ya = await prisma.adelanto.findFirst({ where: { tenantId, idempotencyKey: clave }, include: INCLUDE_FULL });
      if (!ya) return null;
      /* Otro cuerpo con la misma clave no es un reintento. Una fila sin huella
         (de antes de la columna) se compara por lo que la fila guarda. */
      const igual = ya.idempotencyHuella
        ? ya.idempotencyHuella === huella
        : huellaDeAlta({
            beneficiarioId: ya.beneficiarioId,
            montoAdelantado: toNum(ya.montoAdelantado),
            moneda: ya.moneda,
            direccion: direccionDe(ya.direccion),
            conceptoRecibido: ya.conceptoRecibido ?? null,
            metodoCaja: data.metodoCaja ?? null,
          }) === huella;
      if (!igual) throw new IdempotenciaDistintaError("adelanto");
      return { ...mapAdelanto(ya), caja: null, repetido: true as const };
    };
    const repetido = await yaCreado();
    if (repetido) return repetido;
    const monto = Math.round(data.montoAdelantado * 100) / 100;
    /** Se llena sólo si se pasó el tope a propósito; va a las notas. */
    let excedioLimite = "";
    const modalidad = data.modalidad ?? "CUENTA_CORRIENTE";
    const pactadas = modalidad === "ENTREGAS_PACTADAS" ? (data.entregasPactadas ?? []) : [];
    /* ADR-448: la dirección y su concepto, con la MISMA regla que el CHECK de la
       base — mejor el mensaje en español acá que un error de constraint. */
    const direccion = direccionDe(data.direccion);
    const conceptoRecibido = direccion === "RECIBIDO" ? (data.conceptoRecibido ?? null) : null;
    const problema = problemaDeDireccion({ direccion, conceptoRecibido: data.conceptoRecibido ?? null, modalidad });
    if (problema) throw new Error(problema);

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
      throw new Error("Esa persona no existe en este negocio. Elígela de la lista de beneficiarios.");
    }
    /**
     * `limiteCredito` es UN número en soles (el formulario lo rotula "S/", sin
     * selector de moneda) — no hay tope en dólares. Antes el aggregate sumaba
     * `saldoPendiente` de TODOS los adelantos ABIERTOS sin filtrar moneda, así
     * que una persona con deuda en soles Y en dólares se comparaba contra el
     * tope con una cifra que mezclaba las dos (auditoría de esta sesión). El
     * guard sólo tiene sentido para un adelanto nuevo que también sea en
     * soles: compararle dólares a un tope en soles no significa nada.
     */
    const monedaNueva = data.moneda || "PEN";
    /* ADR-448: el tope es de lo que el negocio DA. Recibir un préstamo no se
       valida contra él, y lo recibido abierto tampoco le quita margen a nadie. */
    if (benef.limiteCredito != null && monedaNueva === "PEN" && direccion === "DADO") {
      const limite = Number(benef.limiteCredito);
      const abiertos = await prisma.adelanto.aggregate({
        where: { tenantId, beneficiarioId: data.beneficiarioId, status: "ABIERTO", moneda: "PEN", ...SOLO_DADOS },
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

    const codigoOperacion = await siguienteCodigoDeTenant(tenantId);
    const contratoId = await contratoPropio(tenantId, data.contratoId);
    const crear = async (db: Db) => db.adelanto.create({
      data: {
        tenantId,
        idempotencyKey: clave,
        idempotencyHuella: clave ? huella : null,
        beneficiarioId: data.beneficiarioId,
        modalidad,
        montoAdelantado: monto,
        moneda: data.moneda ?? "PEN",
        fechaAdelanto: data.fechaAdelanto ? new Date(data.fechaAdelanto) : new Date(),
        fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
        status: "ABIERTO",
        // Arranca con el saldo completo: en DADO te lo deben, en RECIBIDO lo debes tú.
        saldoPendiente: monto,
        direccion,
        conceptoRecibido,
        codigoOperacion,
        reciboManual: data.reciboManual?.trim() || null,
        contratoId,
        notas: [data.notas?.trim(), excedioLimite].filter(Boolean).join(" · ") || null,
        comprobanteUrl: data.comprobanteUrl?.trim() || null,
        // Dato de referencia: uno sin el otro no dice nada, así que se guardan
        // juntos o no se guarda ninguno.
        piesTablares: data.piesTablares != null && data.piesTablaresTipo ? data.piesTablares : null,
        piesTablaresTipo: data.piesTablares != null && data.piesTablaresTipo ? data.piesTablaresTipo : null,
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
    /*
     * Con caja, el alta y su movimiento van en UNA transacción (ADR-448, revisión
     * de seguridad): antes el movimiento se anotaba 0,8–2 s después del commit, y
     * en ese hueco `corregirDireccion` no lo veía — DADO X corregido a RECIBIDO y
     * devuelto en plata = la persona cobraba 2X. Sin caja abierta sigue guardándose
     * (`sinCaja`); si la base no puede anotar el movimiento, no se guarda nada y la
     * pantalla lo dice (antes quedaba el adelanto sin su movimiento, en silencio).
     */
    let row: Awaited<ReturnType<typeof crear>>;
    let caja: ResultadoMovimiento | null = null;
    try {
      const metodoCaja = data.metodoCaja;
      if (metodoCaja) {
        ({ row, caja } = await prisma.$transaction(async (tx) => {
          const creado = await crear(tx);
          const nombre = creado.beneficiario?.nombre ?? "—";
          const mov = await moverCajaEnTx(tx, tenantId, {
            tipo: cajaAlCrear(direccion),
            monto,
            metodo: metodoCaja,
            etiqueta:
              direccion === "RECIBIDO"
                ? etiquetaRecibido("alta", creado.codigoOperacion, nombre)
                : etiquetaEgreso(creado.codigoOperacion, nombre),
          });
          return { row: creado, caja: mov };
        }));
      } else {
        row = await crear(prisma);
      }
    } catch (e) {
      /* Dos pedidos con la misma clave a la vez: el índice único deja pasar uno.
         El otro devuelve el que quedó — y no mueve la caja. */
      if (clave && isUniqueViolation(e)) {
        const otro = await yaCreado();
        if (otro) return otro;
      }
      throw e;
    }

    invalidarResultado(tenantId);
    return { ...mapAdelanto(row), caja };
  },

  /**
   * Registrar una entrega que liquida (parcial o totalmente) el adelanto.
   * ATÓMICO: crea entrega, recalcula saldoPendiente (montoAdelantado − Σvalor),
   * ajusta status (LIQUIDADO si 0, EXCEDIDO si <0), marca cuota pactada si aplica,
   * e incrementa stock si tipo=PRODUCTO && sumarAStock.
   */
  async registrarEntrega(
    tenantId: string,
    adelantoId: string,
    input: EntregaInput,
    permisos: PermisosDeRecibido = {},
  ): Promise<(ConCaja<DbAdelanto> & { repetido?: true }) | null> {
    /* La entrega, el saldo y el movimiento de caja en UNA transacción (ADR-448):
       un corte entre el commit y la caja dejaba la entrega sin su movimiento, y
       el reintento (idempotente) ya no la volvía a anotar.
       El monto es el `valor` de ESTA entrega, calculado en la transacción. Antes
       se leía `entregas[0].valor`, y `INCLUDE_FULL` ordena por `fecha desc`: una
       entrega con fecha PASADA no es la primera, y la caja anotaba otra.
       En un DADO la persona te devuelve plata (entra); en un RECIBIDO se la
       devuelves tú (sale). */
    const hecho = await prisma.$transaction(async (tx) => {
      const r = await AdelantosDB.registrarEntregaEnTx(tx, tenantId, adelantoId, input, permisos);
      if (!r) return null;
      const full = await tx.adelanto.findFirst({ where: { id: adelantoId, tenantId }, include: INCLUDE_FULL });
      if (!full) return null;
      const adelanto = mapAdelanto(full);
      let caja: ResultadoMovimiento | null = null;
      if (!r.repetido && input.metodoCaja && input.tipo === "LIBRE") {
        const nombre = adelanto.beneficiario?.nombre ?? "—";
        caja = await moverCajaEnTx(tx, tenantId, {
          tipo: cajaAlDevolver(adelanto.direccion),
          monto: r.valor,
          metodo: input.metodoCaja,
          etiqueta:
            adelanto.direccion === "RECIBIDO"
              ? etiquetaRecibido("devolucion", adelanto.codigoOperacion, nombre)
              : etiquetaIngreso(adelanto.codigoOperacion, nombre),
        });
      }
      return { adelanto, caja, repetido: r.repetido };
    });
    if (!hecho) return null;
    invalidarResultado(tenantId);
    return { ...hecho.adelanto, caja: hecho.caja, ...(hecho.repetido ? { repetido: true as const } : {}) };
  },

  /**
   * El cuerpo de una entrega, dentro de la transacción de quien llama (ADR-413 §6).
   *
   * `registrarEntrega` es esto + la caja; la liquidación de una cuenta lo llama
   * varias veces dentro de SU transacción. Esta clase sigue siendo la única que
   * escribe `AdelantoEntrega`.
   *
   * Bloquea la fila del adelanto (`FOR UPDATE`): dos entregas simultáneas
   * recalculaban el saldo con un `aggregate` que no veía a la otra, y la última
   * en escribir pisaba el saldo con uno que no la contaba.
   *
   * No mueve la caja: eso va después del commit, una vez, en quien orquesta.
   */
  async registrarEntregaEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    adelantoId: string,
    input: EntregaInput & { liquidacionId?: string },
    permisos: PermisosDeRecibido = {},
  ): Promise<{ entregaId: string; valor: number; saldo: number; status: AdelantoStatus; repetido?: true } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const bloqueado = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Adelanto" WHERE "id" = ${adelantoId} AND "tenantId" = ${tenantId} FOR UPDATE
    `;
    if (bloqueado.length === 0) return null;
    const adelanto = await tx.adelanto.findFirst({ where: { id: adelantoId, tenantId } });
    if (!adelanto) return null;
    /* Idempotencia (ADR-448), bajo el lock de la fila: dos reintentos del mismo
       intento se turnan y el segundo ve la entrega del primero. Va ANTES de las
       reglas: el reintento de una entrega que ya dejó el saldo en cero no puede
       rebotar por «ya no le debes nada». */
    const clave = input.idempotencyKey?.trim() || null;
    const huella = huellaDeEntrega(input);
    if (clave) {
      /* Con las anuladas A PROPÓSITO (no filtra `anuladaAt`): la clave ya se usó
         y el índice único (adelantoId, idempotencyKey) no dejaría anotar otra. */
      const ya = await tx.adelantoEntrega.findFirst({
        where: { adelantoId, idempotencyKey: clave },
        select: { id: true, valor: true, idempotencyHuella: true, anuladaAt: true },
      });
      if (ya) {
        if (ya.idempotencyHuella && ya.idempotencyHuella !== huella) throw new IdempotenciaDistintaError("entrega");
        return {
          entregaId: ya.id,
          valor: toNum(ya.valor),
          saldo: toNum(adelanto.saldoPendiente),
          status: adelanto.status as AdelantoStatus,
          repetido: true,
        };
      }
    }
    if (adelanto.status === "CANCELADO") {
      throw new Error("No se pueden registrar entregas en un adelanto cancelado");
    }
    /* ADR-448: en un RECIBIDO la entrega es lo que el NEGOCIO da para
       cancelarlo. Tres reglas, las tres bajo el lock de la fila:
       · producto todavía NO: saldría del inventario y el stock no baja (fase 2);
       · sacar plata de la caja, sólo admin o dueño;
       · y nunca más plata que lo que se debe (abajo, con el valor ya calculado). */
    const recibido = direccionDe(adelanto.direccion) === "RECIBIDO";
    const saleDeCaja = recibido && input.tipo === "LIBRE" && Boolean(input.metodoCaja);
    if (recibido && input.tipo === "PRODUCTO") {
      throw new ReglaDeRecibidoError(
        "Por ahora, lo que le das para cancelar un recibido se anota como entrega libre.",
        400,
        "producto_en_recibido",
      );
    }
    if (saleDeCaja && !permisos.puedeSacarPlataDeRecibido) {
      throw new ReglaDeRecibidoError(SOLO_ADMIN_RECIBIDO, 403, "solo_admin_o_dueno");
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
    /* Devolver en plata un recibido: nunca más de lo que todavía se debe (el
       saldo se leyó bajo el lock). Con más, la caja pagaba plata que nadie dio. */
    const debe = toNum(adelanto.saldoPendiente);
    if (saleDeCaja && valor > debe + 0.005) {
      throw new ReglaDeRecibidoError(
        debe > 0.005
          ? `Le debes ${formatCurrency(debe)}: no puedes devolverle más que eso de la caja.`
          : "Ya no le debes nada por esta plata recibida.",
        400,
        "excede_saldo",
      );
    }

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
        liquidacionId: input.liquidacionId ?? null,
        idempotencyKey: clave,
        idempotencyHuella: clave ? huella : null,
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

    // Recalcular saldo desde la suma real de entregas VIVAS (fuente de verdad):
    // la de una liquidación anulada ya no descuenta nada.
    const agg = await tx.adelantoEntrega.aggregate({
      where: { adelantoId, anuladaAt: null },
      _sum: { valor: true },
    });
    const { saldo, status } = estadoDelSaldo(toNum(adelanto.montoAdelantado), toNum(agg._sum.valor));

    await tx.adelanto.update({
      where: { id: adelantoId },
      data: { saldoPendiente: saldo, status },
    });

    return { entregaId: entrega.id, valor, saldo, status };
  },

  /**
   * Da de baja las entregas de una liquidación anulada y recalcula el saldo de
   * cada adelanto tocado (ADR-413 §7), dentro de la tx de quien orquesta.
   *
   * Baja lógica (`anuladaAt`), no borrado: es plata con un tercero. Quitar un
   * pago o un cruce sólo SUBE una deuda, así que ningún adelanto pasa a
   * EXCEDIDO por anular. Un CANCELADO sigue CANCELADO.
   *
   * La entrega no tiene `tenantId`: se llega a ella por el adelanto del tenant.
   */
  async anularEntregasDeLiquidacionEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    liquidacionId: string,
  ): Promise<{ adelantoIds: string[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const entregas = await tx.adelantoEntrega.findMany({
      where: { liquidacionId, anuladaAt: null, adelanto: { tenantId } },
      select: { adelantoId: true },
    });
    const adelantoIds = [...new Set(entregas.map((e) => e.adelantoId))].sort();
    /* Bloqueo en orden de id: dos anulaciones que tocan los mismos adelantos
       no se abrazan. */
    for (const adelantoId of adelantoIds) {
      await tx.$queryRaw`SELECT "id" FROM "Adelanto" WHERE "id" = ${adelantoId} AND "tenantId" = ${tenantId} FOR UPDATE`;
    }
    await tx.adelantoEntrega.updateMany({
      where: { liquidacionId, anuladaAt: null, adelanto: { tenantId } },
      data: { anuladaAt: new Date() },
    });
    for (const adelantoId of adelantoIds) {
      const a = await tx.adelanto.findFirst({ where: { id: adelantoId, tenantId }, select: { montoAdelantado: true, status: true } });
      if (!a) continue;
      const agg = await tx.adelantoEntrega.aggregate({ where: { adelantoId, anuladaAt: null }, _sum: { valor: true } });
      const { saldo, status } = estadoDelSaldo(toNum(a.montoAdelantado), toNum(agg._sum.valor));
      await tx.adelanto.update({
        where: { id: adelantoId },
        data: { saldoPendiente: saldo, ...(a.status === "CANCELADO" ? {} : { status }) },
      });
    }
    return { adelantoIds };
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
    permisos: PermisosDeRecibido = {},
  ): Promise<ConCaja<DbAdelanto> | null> {
    if (!tenantId) throw new Error("tenantId is required");
    /* Lock, relectura y update condicionado en UNA transacción. Antes el saldo
       se leía sin lock y ESE número iba a la caja: si una liquidación de cuenta
       (ADR-413) tenía el adelanto bloqueado y le bajó el saldo, la anulación
       devolvía el saldo de antes y la plata entraba dos veces al cajón. */
    const hecho = await prisma.$transaction(async (tx) => {
      const bloqueado = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Adelanto" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE
      `;
      if (bloqueado.length === 0) return null;
      const actual = await tx.adelanto.findFirst({
        where: { id, tenantId },
        select: {
          status: true,
          saldoPendiente: true,
          codigoOperacion: true,
          direccion: true,
          beneficiario: { select: { nombre: true } },
        },
      });
      if (!actual) return null;
      if (actual.status === "CANCELADO" || actual.status === "LIQUIDADO") throw new AdelantoNoCancelableError(actual.status);
      /* Revisión ADR-449: con un cruce o un pago de una liquidación viva, se
         anula primero la liquidación (bajo el mismo lock de la fila que toma
         la liquidación al escribir). */
      const deLiquidacion = await tx.adelantoEntrega.findFirst({
        where: { adelantoId: id, anuladaAt: null, liquidacionId: { not: null }, adelanto: { tenantId } },
        select: { liquidacionId: true },
      });
      if (deLiquidacion?.liquidacionId) {
        const liq = await tx.liquidacionCuenta.findFirst({ where: { id: deLiquidacion.liquidacionId, tenantId }, select: { codigo: true } });
        throw new AdelantoConLiquidacionError(liq?.codigo ?? "de esta persona");
      }
      /* ADR-448: anular un recibido devolviendo la plata la SACA de la caja: sólo admin o dueño. */
      if (devolucionCaja && direccionDe(actual.direccion) === "RECIBIDO" && !permisos.puedeSacarPlataDeRecibido) {
        throw new ReglaDeRecibidoError(SOLO_ADMIN_RECIBIDO, 403, "solo_admin_o_dueno");
      }
      const { count } = await tx.adelanto.updateMany({
        where: { id, tenantId, status: { notIn: ["CANCELADO", "LIQUIDADO"] } },
        data: { status: "CANCELADO" },
      });
      if (count === 0) throw new AdelantoNoCancelableError("CANCELADO");
      const row = await tx.adelanto.findFirst({ where: { id, tenantId }, include: INCLUDE_FULL });
      if (!row) return null;
      /* La devolución va en la MISMA transacción (ADR-448) y con el saldo
         releído bajo el lock: se devuelve lo que todavía debía, no el monto
         original — si ya había liquidado la mitad, esa mitad nunca volvió como
         efectivo. Un RECIBIDO anulado devolviendo es plata que SALE. */
      let caja: ResultadoMovimiento | null = null;
      if (devolucionCaja) {
        const direccion = direccionDe(actual.direccion);
        const nombre = actual.beneficiario?.nombre ?? "—";
        caja = await moverCajaEnTx(tx, tenantId, {
          tipo: cajaAlDevolver(direccion),
          monto: toNum(actual.saldoPendiente),
          metodo: devolucionCaja,
          etiqueta:
            direccion === "RECIBIDO"
              ? etiquetaRecibido("anulacion", actual.codigoOperacion, nombre)
              : etiquetaReversion(actual.codigoOperacion, nombre),
        });
      }
      return { adelanto: mapAdelanto(row), caja };
    });
    if (!hecho) return null;
    invalidarResultado(tenantId);
    return { ...hecho.adelanto, caja: hecho.caja };
  },

  async updateNotas(tenantId: string, id: string, notas: string | null): Promise<DbAdelanto | null> {
    const existing = await prisma.adelanto.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    await prisma.adelanto.updateMany({ where: { id, tenantId }, data: { notas: notas?.trim() || null } });
    const row = await prisma.adelanto.findFirst({ where: { id, tenantId }, include: INCLUDE_FULL });
    return row ? mapAdelanto(row) : null;
  },

  /**
   * Re-marca la dirección de un adelanto cargado del lado equivocado (ADR-448):
   * en Blas, ADL-0003/4 de WASACO son pagos por aserrío que se guardaron como
   * plata dada porque no había otra opción.
   *
   * Cuatro guardas, todas DENTRO del lock de la fila (una entrega simultánea
   * espera): sin entregas vivas (con entregas, el sentido de cada una ya se leyó
   * de un lado), no anulado, la combinación que acepta el CHECK, y **que el alta
   * no haya movido la caja** (`movio_caja`). Sin la última, un DADO de S/ X que
   * sacó X del cajón, corregido a RECIBIDO, se «devolvía» con otros X: la persona
   * cobraba 2X. Con caja movida, el camino es anular devolviendo y cargarlo de
   * nuevo del lado correcto (`mensajeMovioCaja`).
   *
   * NO MUEVE LA CAJA. El antes → después con el motivo va a la auditoría en la
   * MISMA transacción: si no se puede escribir el rastro, no hay corrección.
   * Pasar a DADO corre el control del tope y lo informa (`excedeLimite`) sin
   * bloquear: la decide un admin o el dueño, con motivo.
   */
  async corregirDireccion(
    tenantId: string,
    id: string,
    input: {
      direccion: AdelantoDireccion;
      conceptoRecibido?: AdelantoConceptoRecibido | null;
      motivo: string;
      usuario: string;
    },
  ): Promise<{
    adelanto: DbAdelanto;
    antes: { direccion: AdelantoDireccion; conceptoRecibido: AdelantoConceptoRecibido | null };
    despues: { direccion: AdelantoDireccion; conceptoRecibido: AdelantoConceptoRecibido | null };
    /** Pasó a DADO y con eso la persona supera su tope de crédito (no bloquea). */
    excedeLimite: { limite: number; saldo: number } | null;
  } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const motivo = limpiarMotivo(input.motivo);
    if (!motivoLegible(motivo)) {
      throw new DireccionNoCorregibleError("Escribe por qué cambias la dirección (al menos 3 letras).", 400, "motivo");
    }
    const direccion = direccionDe(input.direccion);
    const conceptoRecibido = direccion === "RECIBIDO" ? (input.conceptoRecibido ?? null) : null;

    return prisma.$transaction(async (tx) => {
      const bloqueado = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Adelanto" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE
      `;
      if (bloqueado.length === 0) return null;
      const actual = await tx.adelanto.findFirst({
        where: { id, tenantId },
        select: {
          status: true,
          modalidad: true,
          direccion: true,
          conceptoRecibido: true,
          codigoOperacion: true,
          montoAdelantado: true,
          moneda: true,
          createdAt: true,
          beneficiarioId: true,
          beneficiario: { select: { nombre: true, limiteCredito: true } },
        },
      });
      if (!actual) return null;
      if (actual.status === "CANCELADO") {
        throw new DireccionNoCorregibleError("Este adelanto está anulado: no hay dirección que corregir.", 409, "anulado");
      }
      /* Contado DESPUÉS del lock, en su propia sentencia: ve la entrega que otra
         transacción acaba de confirmar mientras esta esperaba. */
      const vivas = await tx.adelantoEntrega.count({ where: { adelantoId: id, anuladaAt: null } });
      if (vivas > 0) {
        /* Revisión ADR-449: si la entrega es de una liquidación (un cruce con sus
           aserríos), se dice CUÁL y dónde se anula — «anúlalas» solo no decía dónde. */
        const deLiq = await tx.adelantoEntrega.findFirst({
          where: { adelantoId: id, anuladaAt: null, liquidacionId: { not: null } },
          select: { liquidacionId: true },
        });
        const liq = deLiq?.liquidacionId
          ? await tx.liquidacionCuenta.findFirst({ where: { id: deLiq.liquidacionId, tenantId }, select: { codigo: true } })
          : null;
        throw new DireccionNoCorregibleError(
          liq
            ? `Está cruzado en la liquidación ${liq.codigo}: anúlala en Cuenta por persona › Liquidaciones antes de cambiar de lado la plata.`
            : `Ya tiene ${vivas} ${vivas === 1 ? "entrega registrada" : "entregas registradas"}: anúlalas antes de cambiar de lado la plata.`,
          409,
          "con_entregas",
        );
      }
      const problema = problemaDeDireccion({ direccion, conceptoRecibido: input.conceptoRecibido ?? null, modalidad: actual.modalidad });
      if (problema) throw new DireccionNoCorregibleError(problema, 400, "combinacion");

      const antes = { direccion: direccionDe(actual.direccion), conceptoRecibido: actual.conceptoRecibido ?? null };
      const despues = { direccion, conceptoRecibido };
      if (antes.direccion === despues.direccion && antes.conceptoRecibido === despues.conceptoRecibido) {
        throw new DireccionNoCorregibleError("Ya está registrado así: no hay nada que cambiar.", 409, "sin_cambio");
      }

      /* ¿El alta movió la caja? Sólo importa si cambia el LADO (servicio ↔
         préstamo no toca plata). Por código o por monto y día
         (`movimientoDelAlta`). Desde la revisión 28-09 el alta y su movimiento
         se confirman en la misma transacción: no hay un instante en que el
         adelanto exista y su movimiento todavía no. */
      if (antes.direccion !== despues.direccion) {
        const monto = toNum(actual.montoAdelantado);
        const codigo = actual.codigoOperacion?.trim() || null;
        const dia = limaDateKey(actual.createdAt);
        const desde = new Date(`${dia}T00:00:00-05:00`);
        const movimientos = await tx.cashMovement.findMany({
          where: {
            cashRegister: { tenantId },
            OR: [
              ...(codigo ? [{ description: { contains: codigo } }] : []),
              /* El egreso (o ingreso) del mismo monto ese día, aunque no lleve el
                 código: el que se anotó a mano en la caja. */
              {
                type: cajaAlCrear(antes.direccion),
                amount: monto,
                createdAt: { gte: desde, lt: new Date(desde.getTime() + 86_400_000) },
              },
            ],
          },
          select: { type: true, amount: true, description: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 50,
        });
        const mov = movimientoDelAlta(
          { codigoOperacion: codigo, montoAdelantado: monto, createdAt: actual.createdAt, direccion: antes.direccion },
          movimientos.map((m) => ({ ...m, amount: toNum(m.amount) })),
        );
        if (mov) {
          throw new DireccionNoCorregibleError(mensajeMovioCaja(antes.direccion, mov), 409, "movio_caja", {
            tipo: mov.type,
            monto: Number(mov.amount),
            fecha: new Date(mov.createdAt).toISOString(),
          });
        }
      }

      await tx.adelanto.update({ where: { id }, data: { direccion, conceptoRecibido } });

      /* Pasar a DADO: el tope de la persona, ahora con este adelanto adentro. */
      let excedeLimite: { limite: number; saldo: number } | null = null;
      const limite = actual.beneficiario?.limiteCredito;
      if (direccion === "DADO" && limite != null && (actual.moneda || "PEN") === "PEN") {
        const abiertos = await tx.adelanto.aggregate({
          where: { tenantId, beneficiarioId: actual.beneficiarioId, status: "ABIERTO", moneda: "PEN", ...SOLO_DADOS },
          _sum: { saldoPendiente: true },
        });
        const saldo = Math.round(toNum(abiertos._sum.saldoPendiente) * 100) / 100;
        if (saldo > toNum(limite) + 0.005) excedeLimite = { limite: toNum(limite), saldo };
      }

      const lado = (d: typeof antes) =>
        d.direccion === "RECIBIDO" ? `recibido (${d.conceptoRecibido === "PRESTAMO" ? "préstamo" : "servicio"})` : "dado";
      await tx.activityLog.create({
        data: {
          tenantId,
          action: "Corregir dirección",
          entity: "adelanto",
          entityId: id,
          user: input.usuario || "—",
          detail: [
            `${actual.codigoOperacion ?? id}: ${lado(antes)} → ${lado(despues)}.`,
            `Motivo: ${motivo}.`,
            "La caja no se movió.",
            excedeLimite ? `Supera el tope de crédito (S/${excedeLimite.limite.toFixed(2)}; queda S/${excedeLimite.saldo.toFixed(2)} abierto).` : "",
          ]
            .filter(Boolean)
            .join(" "),
        },
      });

      const row = await tx.adelanto.findFirst({ where: { id, tenantId }, include: INCLUDE_FULL });
      if (!row) return null;
      return { adelanto: mapAdelanto(row), antes, despues, excedeLimite };
    });
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
    /**
     * Lo mismo por moneda (reporte diario, ADR-439). `saldoPendiente` de arriba
     * suma soles y dólares sin tipo de cambio: sirve de conteo en el módulo,
     * pero una cifra de plata que sale del panel va separada.
     */
    porMoneda: { moneda: string; saldoPendiente: number; adelantosAbiertos: number }[];
    /**
     * (ADR-448) Lo que el negocio RECIBIÓ, aparte: todo lo de arriba sigue
     * siendo lo dado (el reporte diario lo lee como «por cobrar»). `porDevolver`
     * = lo que le debes a la gente; `excedente` = le diste de más (te deben).
     */
    recibido: ResumenRecibido;
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    const [todos, totalBenef] = await Promise.all([
      prisma.adelanto.findMany({
        where: { tenantId, status: { not: "CANCELADO" } },
        select: { montoAdelantado: true, saldoPendiente: true, status: true, moneda: true, direccion: true },
      }),
      prisma.adelantoBeneficiario.count({ where: { tenantId } }),
    ]);
    const adelantos = todos.filter((a) => direccionDe(a.direccion) === "DADO");
    const recibidos = todos.filter((a) => direccionDe(a.direccion) === "RECIBIDO");
    let totalAdelantado = 0, saldoPos = 0, excedente = 0, abiertos = 0, liquidados = 0;
    const porMoneda = new Map<string, { saldo: number; abiertos: number }>();
    for (const a of adelantos) {
      const monto = toNum(a.montoAdelantado);
      const saldo = toNum(a.saldoPendiente);
      const m = porMoneda.get(a.moneda || "PEN") ?? { saldo: 0, abiertos: 0 };
      totalAdelantado += monto;
      if (saldo > 0) {
        saldoPos += saldo;
        m.saldo += saldo;
      }
      if (saldo < 0) excedente += -saldo;
      if (a.status === "ABIERTO") {
        abiertos++;
        m.abiertos++;
      }
      if (a.status === "LIQUIDADO") liquidados++;
      porMoneda.set(a.moneda || "PEN", m);
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
      /* Soles primero; después las demás por código. */
      porMoneda: [...porMoneda.entries()]
        .map(([moneda, v]) => ({ moneda, saldoPendiente: r(v.saldo), adelantosAbiertos: v.abiertos }))
        .sort(solesPrimero),
      recibido: resumirRecibidos(recibidos),
    };
  },

  /**
   * Saldos por persona SIN TOPE DE FILAS (ADR-412 §5).
   *
   * `list()` trae como mucho 500 adelantos: para la cuenta unificada eso es
   * una cifra que puede quedar corta sin avisar — el peor tipo de bug, porque
   * parece un número real. Acá se agrega EN LA BASE con `groupBy`: una fila
   * por (beneficiario, status, moneda), nunca una por adelanto, así que da
   * igual si el tenant tiene 50 adelantos o 50.000.
   *
   * Sólo ABIERTO/EXCEDIDO: son los dos únicos estados que pesan en el neto de
   * `unificarCuentas` — traer también LIQUIDADO/CANCELADO sería agregar en la
   * base filas que la cuenta después descarta igual.
   */
  async saldosPorPersona(tenantId: string, opts?: { direccion?: FiltroDireccion }): Promise<SaldoAdelantoGrupo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    /* ADR-448: por defecto sólo lo dado (la ficha de RRHH, el ganado). Con
       `"todas"` se agrupa también por dirección: sin eso, un grupo RECIBIDO
       ABIERTO se sumaba como «te debe». */
    const grupos = await prisma.adelanto.groupBy({
      by: ["beneficiarioId", "status", "moneda", "direccion"],
      where: { tenantId, status: { in: ["ABIERTO", "EXCEDIDO"] }, ...whereDireccion(opts?.direccion) },
      _sum: { saldoPendiente: true },
      _count: true,
    });
    return grupos.map((g) => ({
      beneficiarioId: g.beneficiarioId,
      status: g.status as AdelantoStatus,
      moneda: g.moneda,
      direccion: direccionDe(g.direccion),
      saldoPendiente: Math.round(toNum(g._sum.saldoPendiente) * 100) / 100,
      cantidad: g._count,
    }));
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

  /**
   * Vincula (o desvincula con `null`) a esta persona con una parte del
   * directorio forestal — la unión explícita de ADR-412 §5, que
   * `/api/adelantos/cuentas` prioriza sobre el match por documento.
   *
   * Dos guardas antes de escribir:
   *  · la parte tiene que existir EN ESTE TENANT (mismo cuidado que el resto
   *    del módulo con el beneficiario ajeno — memoria: IDOR beneficiario ajeno);
   *  · nadie más de este tenant puede tenerla vinculada ya: una parte es UNA
   *    cuenta, no puede blanquear la deuda de dos personas a la vez.
   */
  async vincularParte(
    tenantId: string,
    beneficiarioId: string,
    forestPartyId: string | null,
  ): Promise<(DbBeneficiario & { forestPartyIdAnterior: string | null }) | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existente = await prisma.adelantoBeneficiario.findFirst({ where: { id: beneficiarioId, tenantId } });
    if (!existente) return null;

    if (forestPartyId) {
      const parte = await ForestDirectorioDB.getParte(tenantId, forestPartyId);
      if (!parte) throw new Error("Esa parte no existe en el directorio de este negocio.");
      if (!parte.activo && existente.forestPartyId !== forestPartyId) {
        throw new ParteDadaDeBajaError(forestPartyId, parte.nombre);
      }

      const yaVinculada = await prisma.adelantoBeneficiario.findFirst({
        where: { tenantId, forestPartyId, id: { not: beneficiarioId } },
        select: { nombre: true },
      });
      if (yaVinculada) throw new ParteYaVinculadaError(forestPartyId, yaVinculada.nombre);
    }

    try {
      await prisma.adelantoBeneficiario.updateMany({ where: { id: beneficiarioId, tenantId }, data: { forestPartyId } });
    } catch (e) {
      /**
       * Carrera: dos pedidos pasaron el chequeo de arriba (`yaVinculada`) antes
       * de que cualquiera de los dos escribiera — el mismo patrón que el doble
       * canje de puntos. El chequeo previo es sólo para el mensaje con nombre;
       * lo que de verdad lo impide es el índice único parcial
       * `(tenantId, forestPartyId) WHERE forestPartyId IS NOT NULL`. Acá sólo
       * se traduce su P2002 al mismo error de negocio (→ 409).
       */
      if (forestPartyId && isUniqueViolation(e)) {
        const dueño = await prisma.adelantoBeneficiario.findFirst({
          where: { tenantId, forestPartyId, id: { not: beneficiarioId } },
          select: { nombre: true },
        });
        throw new ParteYaVinculadaError(forestPartyId, dueño?.nombre ?? "otra persona");
      }
      throw e;
    }
    const row = await prisma.adelantoBeneficiario.findFirst({ where: { id: beneficiarioId, tenantId } });
    /* La parte de antes viaja para la auditoría (revisión ADR-449): un vínculo
       cambiado a otra parte manda los cruces a OTRA cuenta forestal. */
    return row ? { ...mapBeneficiario(row), forestPartyIdAnterior: existente.forestPartyId ?? null } : null;
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
      throw new Error("Esa persona no existe en este negocio. Elígela de la lista de beneficiarios.");
    }
    /* El día de semana sólo aplica a semanal/quincenal, igual que `diaMes` sólo
       a mensual: guardar el de la otra frecuencia dejaría un dato que nadie lee
       y que la próxima lectura no sabría si creer. */
    const esSemanal = data.frecuencia === "semanal" || data.frecuencia === "quincenal";
    const diaSemana = esSemanal ? (data.diaSemana ?? null) : null;
    const proxima = nextProxima(data.frecuencia, data.diaMes ?? null, new Date(), diaSemana);
    const row = await prisma.adelantoRecurrente.create({
      data: {
        tenantId,
        beneficiarioId: data.beneficiarioId,
        modalidad: data.modalidad ?? "CUENTA_CORRIENTE",
        monto: Math.round(data.monto * 100) / 100,
        moneda: data.moneda ?? "PEN",
        frecuencia: data.frecuencia,
        diaMes: data.frecuencia === "mensual" ? data.diaMes ?? null : null,
        diaSemana,
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
          data: {
            ultimaEjecucion: now,
            /* Con el día pactado, si no: el ciclo se corría al día en que se
               ejecutó y «todos los viernes» derivaba solo. */
            proximaEjecucion: nextProxima(r.frecuencia as RecurrenteFrecuencia, r.diaMes, now, r.diaSemana),
          },
        }),
      ];
    });
    await prisma.$transaction(ops);
    return { creados: pendientes.length };
  },

  /**
   * Cron de recordatorios (ADR-118): los adelantos DADOS, abiertos, con saldo y
   * más viejos que `umbral`, de TODOS los negocios — como
   * `materializeRecurrentes`, esto es trabajo del sistema, no de un tenant.
   *
   * ADR-448: sólo lo dado. Sin el filtro, el aviso le recordaba a WASACO que
   * «pague» el aserrío que el negocio le debe.
   */
  async vencidosParaRecordatorio(umbral: Date): Promise<
    { tenantId: string; beneficiarioId: string; saldoPendiente: number; moneda: string }[]
  > {
    const rows = await prisma.adelanto.findMany({
      where: { status: "ABIERTO", saldoPendiente: { gt: 0 }, fechaAdelanto: { lt: umbral }, ...SOLO_DADOS },
      select: { tenantId: true, beneficiarioId: true, saldoPendiente: true, moneda: true },
    });
    return rows.map((a) => ({ ...a, saldoPendiente: toNum(a.saldoPendiente) }));
  },

  /** Sella `ultimoRecordatorio` en las personas avisadas por el cron, dentro de SU negocio. */
  async sellarRecordatorios(tenantId: string, beneficiarioIds: string[]): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    if (beneficiarioIds.length === 0) return 0;
    const r = await prisma.adelantoBeneficiario.updateMany({
      where: { tenantId, id: { in: beneficiarioIds } },
      data: { ultimoRecordatorio: new Date() },
    });
    return r.count;
  },
};

/** Soles primero; después las demás monedas por código. */
const solesPrimero = (a: { moneda: string }, b: { moneda: string }) =>
  a.moneda === "PEN" ? -1 : b.moneda === "PEN" ? 1 : a.moneda.localeCompare(b.moneda);

/** El bloque `recibido` del resumen (ADR-448), sobre los RECIBIDOS no anulados, por moneda. */
function resumirRecibidos(
  rows: { montoAdelantado: Prisma.Decimal | number; saldoPendiente: Prisma.Decimal | number; status: string; moneda: string }[],
): ResumenRecibido {
  const r = (n: number) => Math.round(n * 100) / 100;
  let abiertos = 0;
  const porMoneda = new Map<string, { total: number; porDevolver: number; excedente: number; abiertos: number }>();
  for (const a of rows) {
    const saldo = toNum(a.saldoPendiente);
    const moneda = a.moneda || "PEN";
    const m = porMoneda.get(moneda) ?? { total: 0, porDevolver: 0, excedente: 0, abiertos: 0 };
    m.total += toNum(a.montoAdelantado);
    if (saldo > 0) m.porDevolver += saldo;
    if (saldo < 0) m.excedente += -saldo;
    if (a.status === "ABIERTO") {
      abiertos++;
      m.abiertos++;
    }
    porMoneda.set(moneda, m);
  }
  return {
    abiertos,
    porMoneda: [...porMoneda.entries()]
      .map(([moneda, v]) => ({ moneda, total: r(v.total), porDevolver: r(v.porDevolver), excedente: r(v.excedente), abiertos: v.abiertos }))
      .sort(solesPrimero),
  };
}

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
/**
 * Cuándo cae la próxima entrega de un adelanto recurrente.
 *
 * ⚠️ `diaSemana` existía en la tabla —documentado como «0-6 (semanal/quincenal)»—
 * y no llegaba hasta acá: el Zod del endpoint no lo aceptaba, `createRecurrente`
 * no lo persistía y esta función ni lo recibía. O sea que un recurrente semanal
 * caía el día en que se creó, para siempre: si lo armabas un martes eran todos
 * los martes, y no había forma de pedir los viernes.
 *
 * Exportada para poder testear el calendario sin tocar la base.
 */
export function nextProxima(
  frecuencia: RecurrenteFrecuencia,
  diaMes: number | null,
  from: Date,
  diaSemana: number | null = null,
): Date {
  const d = new Date(from);
  if (frecuencia === "semanal" || frecuencia === "quincenal") {
    const paso = frecuencia === "semanal" ? 7 : 14;
    /* Sin día elegido se conserva el comportamiento viejo EXACTO: los
       recurrentes que ya existen no pueden cambiar de fecha por este arreglo. */
    if (diaSemana == null) { d.setDate(d.getDate() + paso); return d; }
    /* Con día elegido: al próximo que caiga. Si es hoy, se salta al ciclo
       siguiente — «cada martes» creado un martes no entrega dos veces hoy. */
    const delta = (diaSemana - d.getDay() + 7) % 7 || paso;
    d.setDate(d.getDate() + delta);
    return d;
  }
  // mensual: próximo mes, día diaMes (default mismo día, cap 28)
  const dia = Math.min(Math.max(diaMes ?? d.getDate(), 1), 28);
  d.setMonth(d.getMonth() + 1, dia);
  return d;
}
