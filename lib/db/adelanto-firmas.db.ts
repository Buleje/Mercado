import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { hashToken, TOKEN_RE } from "@/lib/adelantos/registro-firmas";
import { fechaHoraLima, limpiarDocumento } from "@/lib/adelantos/recibo-firmado";
import { monedaEnLetras, montoEnLetras } from "@/lib/adelantos/comprobante";
import { direccionDe } from "@/lib/adelantos/direccion";
import {
  MAX_INTENTOS_DNI_ENLACE,
  enmascararDocumento,
  type CanalFirma,
  type EnlaceFirmaAdmin,
  type EstadoEnlace,
  type FirmaRegistrada,
  type TipoFirma,
  type VistaPublicaFirma,
} from "@/lib/adelantos/entregar-tipos";

/**
 * AdelantoFirmasDB — el registro de firmas y huellas de los adelantos y los
 * enlaces de firma de un uso (ADR-491).
 *
 * SOLO DE AGREGAR: esta clase no tiene update ni delete del registro, y la base
 * los rechaza igual (trigger `AdelantoFirma_inmutable`, 23001). La vigente de
 * cada tipo es la última por `createdAt`. La única excepción es borrar un
 * negocio entero o la supresión de la Ley 29733: `permitirBorrarFirmasEnTx` /
 * `permitirBorrarFirmas` dentro de LA MISMA transacción que borra.
 *
 * Sin caché propia: cada lectura es de un adelanto, por índice; lo que cambia
 * saldos ya lo invalida `AdelantosDB.create`.
 *
 * El token del enlace NUNCA se guarda: sólo su sha256. Se devuelve una vez, al
 * crearlo; `enlacePorToken`/`vistaPublica` buscan por el hash.
 */

type Db = typeof prisma | Prisma.TransactionClient;

/** Columnas de `AdelantoFirma` menos `id`, `tenantId` y `createdAt`. */
export type RegistrarFirmaInput = {
  adelantoId: string;
  tipo: TipoFirma;
  canal: CanalFirma;
  firmanteNombre: string;
  firmanteDocumento: string;
  ruta: string;
  sha256: string;
  bytes: number;
  montoFirmado: number;
  monedaFirmada: string;
  codigoOperacion?: string | null;
  pedidoPor?: string | null;
  enlaceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  consentimiento?: string | null;
  trazos?: unknown;
  idempotencyKey?: string | null;
};

/** Interno: no sale a la red (lleva ids). */
export type EnlaceResuelto = {
  enlaceId: string;
  tenantId: string;
  adelantoId: string;
  estado: EstadoEnlace;
  pideHuella: boolean;
  /** `limpiarDocumento` de la ficha al crear el enlace; null = la ficha no tenía. */
  documentoEsperado: string | null;
  firmanteNombre: string;
  creadoPor: string;
  montoAdelantado: number;
  moneda: string;
  codigoOperacion: string | null;
};

const SELECT_FIRMA = {
  id: true,
  adelantoId: true,
  tipo: true,
  canal: true,
  firmanteNombre: true,
  firmanteDocumento: true,
  montoFirmado: true,
  monedaFirmada: true,
  codigoOperacion: true,
  pedidoPor: true,
  sha256: true,
  createdAt: true,
} satisfies Prisma.AdelantoFirmaSelect;
type FilaFirma = Prisma.AdelantoFirmaGetPayload<{ select: typeof SELECT_FIRMA }>;

function mapFirma(f: FilaFirma, vigente: boolean): FirmaRegistrada {
  return {
    id: f.id,
    tipo: f.tipo as TipoFirma,
    canal: f.canal as CanalFirma,
    firmanteNombre: f.firmanteNombre,
    firmanteDocumento: f.firmanteDocumento,
    montoFirmado: Number(f.montoFirmado),
    monedaFirmada: f.monedaFirmada,
    codigoOperacion: f.codigoOperacion,
    pedidoPor: f.pedidoPor,
    creadoEn: f.createdAt.toISOString(),
    sha256: f.sha256,
    vigente,
    src: `/api/adelantos/${encodeURIComponent(f.adelantoId)}/firmas/${encodeURIComponent(f.id)}/imagen`,
  };
}

type FilaEnlace = {
  id: string;
  pideHuella: boolean;
  venceEn: Date;
  usadoEn: Date | null;
  revocadoEn: Date | null;
  creadoPor: string;
  createdAt: Date;
};

/** Usado y revocado mandan sobre lo demás; un adelanto anulado no se firma; después, el vencimiento. */
export function estadoDeEnlace(e: Pick<FilaEnlace, "usadoEn" | "revocadoEn" | "venceEn">, adelantoStatus: string, ahora = new Date()): EstadoEnlace {
  if (e.usadoEn) return "usado";
  if (e.revocadoEn) return "revocado";
  if (adelantoStatus === "CANCELADO") return "anulado";
  if (e.venceEn.getTime() <= ahora.getTime()) return "vencido";
  return "pendiente";
}

function mapEnlace(e: FilaEnlace, adelantoStatus: string, ahora = new Date()): EnlaceFirmaAdmin {
  return {
    id: e.id,
    estado: estadoDeEnlace(e, adelantoStatus, ahora),
    pideHuella: e.pideHuella,
    venceEn: e.venceEn.toISOString(),
    usadoEn: e.usadoEn ? e.usadoEn.toISOString() : null,
    creadoPor: e.creadoPor,
    creadoEn: e.createdAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

function dataDeFirma(tenantId: string, input: RegistrarFirmaInput): Prisma.AdelantoFirmaUncheckedCreateInput {
  return {
    tenantId,
    adelantoId: input.adelantoId,
    tipo: input.tipo,
    canal: input.canal,
    firmanteNombre: input.firmanteNombre.trim().slice(0, 120),
    firmanteDocumento: limpiarDocumento(input.firmanteDocumento),
    ruta: input.ruta,
    sha256: input.sha256,
    bytes: input.bytes,
    montoFirmado: Math.round(input.montoFirmado * 100) / 100,
    monedaFirmada: input.monedaFirmada,
    codigoOperacion: input.codigoOperacion ?? null,
    pedidoPor: input.pedidoPor ?? null,
    enlaceId: input.enlaceId ?? null,
    ip: input.ip?.slice(0, 100) ?? null,
    userAgent: input.userAgent?.slice(0, 400) ?? null,
    consentimiento: input.consentimiento ?? null,
    ...(input.trazos != null ? { trazos: input.trazos as Prisma.InputJsonValue } : {}),
    idempotencyKey: input.idempotencyKey?.trim() || null,
  };
}

export const AdelantoFirmasDB = {
  /**
   * Agrega una firma o huella. Idempotente por `idempotencyKey`: la misma clave
   * devuelve la fila que ya quedó (`repetida: true`) y quien llama borra la
   * imagen que subió de más. Una clave de otro adelanto no se devuelve: tira.
   */
  async registrar(tenantId: string, input: RegistrarFirmaInput, db: Db = prisma): Promise<{ fila: FirmaRegistrada; repetida: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const clave = input.idempotencyKey?.trim() || null;
    const yaEsta = async () => {
      if (!clave) return null;
      const ya = await db.adelantoFirma.findFirst({ where: { tenantId, idempotencyKey: clave }, select: SELECT_FIRMA });
      if (!ya) return null;
      if (ya.adelantoId !== input.adelantoId) throw new Error("La clave de la firma es de otro adelanto.");
      const ultima = await db.adelantoFirma.findFirst({
        where: { tenantId, adelantoId: ya.adelantoId, tipo: ya.tipo },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      return { fila: mapFirma(ya, ultima?.id === ya.id), repetida: true };
    };
    const repetida = await yaEsta();
    if (repetida) return repetida;
    try {
      const fila = await db.adelantoFirma.create({ data: dataDeFirma(tenantId, input), select: SELECT_FIRMA });
      return { fila: mapFirma(fila, true), repetida: false };
    } catch (e) {
      /* Dos pedidos con la misma clave a la vez: el índice único deja pasar uno. */
      if (clave && isUniqueViolation(e) && db === prisma) {
        const otra = await yaEsta();
        if (otra) return otra;
      }
      throw e;
    }
  },

  /** Las de una clave (`<clave>:FIRMA`, `<clave>:HUELLA`): para un reintento que ya guardó. */
  async porIdempotencia(tenantId: string, adelantoId: string, claves: string[]): Promise<FirmaRegistrada[]> {
    if (!claves.length) return [];
    const filas = await prisma.adelantoFirma.findMany({
      where: { tenantId, adelantoId, idempotencyKey: { in: claves } },
      select: SELECT_FIRMA,
    });
    const vig = await AdelantoFirmasDB.vigentes(tenantId, adelantoId);
    return filas.map((f) => mapFirma(f, f.id === vig.firma?.id || f.id === vig.huella?.id));
  },

  /** Todas, la más nueva primero; `vigente` = la última de su tipo. */
  async listar(tenantId: string, adelantoId: string): Promise<FirmaRegistrada[]> {
    const filas = await prisma.adelantoFirma.findMany({
      where: { tenantId, adelantoId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: SELECT_FIRMA,
      take: 200,
    });
    const vistos = new Set<string>();
    return filas.map((f) => {
      const vigente = !vistos.has(f.tipo);
      vistos.add(f.tipo);
      return mapFirma(f, vigente);
    });
  },

  async vigentes(tenantId: string, adelantoId: string): Promise<{ firma: FirmaRegistrada | null; huella: FirmaRegistrada | null }> {
    const ultima = (tipo: TipoFirma) =>
      prisma.adelantoFirma.findFirst({
        where: { tenantId, adelantoId, tipo },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: SELECT_FIRMA,
      });
    const [firma, huella] = await Promise.all([ultima("FIRMA"), ultima("HUELLA")]);
    return { firma: firma ? mapFirma(firma, true) : null, huella: huella ? mapFirma(huella, true) : null };
  },

  /** Para la puerta de la imagen: la ruta y el hash guardado, sólo si la firma es de ESTE adelanto de ESTE negocio. */
  async rutaDe(tenantId: string, adelantoId: string, firmaId: string): Promise<{ ruta: string; sha256: string } | null> {
    return prisma.adelantoFirma.findFirst({ where: { tenantId, adelantoId, id: firmaId }, select: { ruta: true, sha256: true } });
  },

  /**
   * Ley 29733 (derecho de supresión, huella = dato biométrico): borra UNA
   * huella del registro. Es la ÚNICA escritura destructiva de la clase y sólo
   * para tipo HUELLA: la firma es el respaldo de la plata y no se suprime acá.
   * El trigger la deja pasar sólo con el permiso LOCAL de esta transacción.
   * Devuelve la ruta para que quien llama borre el archivo del bucket.
   */
  async suprimirHuella(tenantId: string, adelantoId: string, firmaId: string): Promise<{ ruta: string } | "no-existe" | "no-es-huella"> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.$transaction(async (tx) => {
      const f = await tx.adelantoFirma.findFirst({ where: { tenantId, adelantoId, id: firmaId }, select: { tipo: true, ruta: true } });
      if (!f) return "no-existe" as const;
      if (f.tipo !== "HUELLA") return "no-es-huella" as const;
      await permitirBorrarFirmasEnTx(tx);
      const r = await tx.adelantoFirma.deleteMany({ where: { tenantId, adelantoId, id: firmaId, tipo: "HUELLA" } });
      return r.count === 1 ? { ruta: f.ruta } : ("no-existe" as const);
    });
  },

  /**
   * Enlace nuevo (D7): revoca los pendientes del mismo adelanto en la misma
   * transacción. Copia nombre y documento de la ficha (lo que la página
   * muestra y contra lo que compara el DNI). El token sale UNA vez.
   */
  async crearEnlace(
    tenantId: string,
    adelantoId: string,
    input: { creadoPor: string; pideHuella: boolean; horas: number },
  ): Promise<{ enlace: EnlaceFirmaAdmin; token: string } | "no-existe" | "anulado"> {
    if (!tenantId) throw new Error("tenantId is required");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    return prisma.$transaction(async (tx) => {
      const a = await tx.adelanto.findFirst({
        where: { id: adelantoId, tenantId },
        select: { status: true, beneficiario: { select: { nombre: true, documento: true } } },
      });
      if (!a) return "no-existe" as const;
      if (a.status === "CANCELADO") return "anulado" as const;
      const ahora = new Date();
      await tx.adelantoEnlaceFirma.updateMany({
        where: { tenantId, adelantoId, usadoEn: null, revocadoEn: null },
        data: { revocadoEn: ahora },
      });
      const fila = await tx.adelantoEnlaceFirma.create({
        data: {
          tenantId,
          adelantoId,
          tokenHash,
          pideHuella: input.pideHuella,
          firmanteNombre: a.beneficiario.nombre,
          firmanteDocumento: limpiarDocumento(a.beneficiario.documento) || null,
          creadoPor: input.creadoPor,
          venceEn: new Date(ahora.getTime() + input.horas * 3_600_000),
        },
      });
      return { enlace: mapEnlace(fila, a.status, ahora), token };
    });
  },

  async listarEnlaces(tenantId: string, adelantoId: string): Promise<EnlaceFirmaAdmin[]> {
    const a = await prisma.adelanto.findFirst({ where: { id: adelantoId, tenantId }, select: { status: true } });
    if (!a) return [];
    const filas = await prisma.adelantoEnlaceFirma.findMany({
      where: { tenantId, adelantoId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, pideHuella: true, venceEn: true, usadoEn: true, revocadoEn: true, creadoPor: true, createdAt: true },
    });
    const ahora = new Date();
    return filas.map((f) => mapEnlace(f, a.status, ahora));
  },

  async revocarEnlace(tenantId: string, adelantoId: string, enlaceId: string): Promise<"ok" | "no-existe" | "ya-cerrado"> {
    const r = await prisma.adelantoEnlaceFirma.updateMany({
      where: { id: enlaceId, tenantId, adelantoId, usadoEn: null, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    if (r.count === 1) return "ok";
    const existe = await prisma.adelantoEnlaceFirma.findFirst({ where: { id: enlaceId, tenantId, adelantoId }, select: { id: true } });
    return existe ? "ya-cerrado" : "no-existe";
  },

  /** SIN tenantId a propósito: el token es la credencial (como ContractsDB.findBySignerToken). Devuelve el tenantId para lo demás. */
  async enlacePorToken(token: string): Promise<EnlaceResuelto | null> {
    if (!TOKEN_RE.test(token)) return null;
    const e = await prisma.adelantoEnlaceFirma.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { adelanto: { select: { status: true, montoAdelantado: true, moneda: true, codigoOperacion: true } } },
    });
    if (!e) return null;
    return {
      enlaceId: e.id,
      tenantId: e.tenantId,
      adelantoId: e.adelantoId,
      estado: estadoDeEnlace(e, e.adelanto.status),
      pideHuella: e.pideHuella,
      documentoEsperado: e.firmanteDocumento ? limpiarDocumento(e.firmanteDocumento) || null : null,
      firmanteNombre: e.firmanteNombre,
      creadoPor: e.creadoPor,
      montoAdelantado: Number(e.adelanto.montoAdelantado),
      moneda: e.adelanto.moneda,
      codigoOperacion: e.adelanto.codigoOperacion,
    };
  },

  /**
   * Lo que ve la página pública. Fuera de «pendiente» devuelve SOLO el estado y
   * el negocio: un enlace usado, vencido o revocado no muestra monto ni persona.
   */
  async vistaPublica(token: string): Promise<VistaPublicaFirma | null> {
    if (!TOKEN_RE.test(token)) return null;
    const e = await prisma.adelantoEnlaceFirma.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        adelanto: { select: { status: true, montoAdelantado: true, moneda: true, codigoOperacion: true, fechaAdelanto: true, direccion: true } },
        tenant: { select: { name: true } },
      },
    });
    if (!e) return null;
    const estado = estadoDeEnlace(e, e.adelanto.status);
    const negocio = e.tenant.name;
    if (estado !== "pendiente") {
      return {
        estado, negocio, codigoOperacion: null, monto: 0, moneda: "PEN", montoEnLetras: "", fechaAdelanto: "",
        persona: "", documentoFinal: null, pideDocumento: false, direccion: "DADO", pideHuella: false, venceEn: "",
      };
    }
    const monto = Number(e.adelanto.montoAdelantado);
    return {
      estado,
      negocio,
      codigoOperacion: e.adelanto.codigoOperacion,
      monto,
      moneda: e.adelanto.moneda,
      montoEnLetras: `Son: ${montoEnLetras(monto)} ${monedaEnLetras(e.adelanto.moneda)}`,
      fechaAdelanto: fechaHoraLima(e.adelanto.fechaAdelanto),
      persona: e.firmanteNombre,
      documentoFinal: enmascararDocumento(e.firmanteDocumento),
      pideDocumento: !e.firmanteDocumento,
      direccion: direccionDe(e.adelanto.direccion),
      pideHuella: e.pideHuella,
      venceEn: e.venceEn.toISOString(),
    };
  },

  /** DNI que no coincide: suma uno y, al llegar a `MAX_INTENTOS_DNI_ENLACE`, revoca el enlace. */
  async sumarIntentoFallido(tenantId: string, enlaceId: string): Promise<{ revocado: boolean }> {
    /* `< MAX` en el WHERE: intentos en paralelo no pasan el tope (cada uno suma
       sólo si todavía queda margen) y el enlace revocado no suma más. */
    await prisma.adelantoEnlaceFirma.updateMany({
      where: { tenantId, id: enlaceId, usadoEn: null, revocadoEn: null, intentosFallidos: { lt: MAX_INTENTOS_DNI_ENLACE } },
      data: { intentosFallidos: { increment: 1 } },
    });
    await prisma.adelantoEnlaceFirma.updateMany({
      where: { tenantId, id: enlaceId, usadoEn: null, revocadoEn: null, intentosFallidos: { gte: MAX_INTENTOS_DNI_ENLACE } },
      data: { revocadoEn: new Date() },
    });
    const e = await prisma.adelantoEnlaceFirma.findFirst({ where: { tenantId, id: enlaceId }, select: { revocadoEn: true } });
    return { revocado: !!e?.revocadoEn };
  },

  /**
   * Un uso: el compara-y-cambia (`usadoEn IS NULL`, no revocado, no vencido,
   * adelanto no anulado) y los INSERT van en UNA transacción. Dos POST a la vez:
   * el segundo espera el lock de la fila, ve `usadoEn` y vuelve «usado» — quien
   * llama borra lo que subió.
   */
  async firmarPorEnlace(
    tenantId: string,
    enlaceId: string,
    filas: RegistrarFirmaInput[],
  ): Promise<"ok" | "usado" | "vencido" | "revocado" | "anulado"> {
    return prisma.$transaction(async (tx) => {
      const ahora = new Date();
      const cas = await tx.adelantoEnlaceFirma.updateMany({
        /* `intentosFallidos < MAX`: un DNI acertado en paralelo con los
           fallidos no firma un enlace que ya llegó al tope. */
        where: {
          tenantId, id: enlaceId, usadoEn: null, revocadoEn: null, venceEn: { gt: ahora },
          intentosFallidos: { lt: MAX_INTENTOS_DNI_ENLACE }, adelanto: { status: { not: "CANCELADO" } },
        },
        data: { usadoEn: ahora },
      });
      if (cas.count !== 1) {
        const e = await tx.adelantoEnlaceFirma.findFirst({
          where: { tenantId, id: enlaceId },
          select: { usadoEn: true, revocadoEn: true, venceEn: true, intentosFallidos: true, adelanto: { select: { status: true } } },
        });
        if (!e) return "revocado" as const;
        if (!e.usadoEn && e.intentosFallidos >= MAX_INTENTOS_DNI_ENLACE) return "revocado" as const;
        const estado = estadoDeEnlace(e, e.adelanto.status, ahora);
        return estado === "pendiente" ? ("usado" as const) : estado;
      }
      for (const f of filas) {
        await tx.adelantoFirma.create({ data: dataDeFirma(tenantId, { ...f, canal: "ENLACE", enlaceId }), select: { id: true } });
      }
      return "ok" as const;
    });
  },
};

/**
 * La ÚNICA puerta para borrar filas del registro: borrar un negocio entero
 * (superadmin, cron de demos) o la supresión de la Ley 29733. Pone
 * `app.permitir_borrar_firmas = 'on'` sólo para la transacción en curso
 * (`set_config(…, true)` = `SET LOCAL`): nunca un SET de sesión, que en el
 * pooler se pega a conexiones ajenas.
 *
 * Batch: `prisma.$transaction([permitirBorrarFirmas(), prisma.tenant.delete(…)])`.
 */
export function permitirBorrarFirmas() {
  return prisma.$queryRaw`SELECT set_config('app.permitir_borrar_firmas', 'on', true)`;
}

/** Lo mismo dentro de una transacción interactiva. */
export async function permitirBorrarFirmasEnTx(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT set_config('app.permitir_borrar_firmas', 'on', true)`;
}
