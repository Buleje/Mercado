import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantosDB, IdempotenciaDistintaError } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { problemaDeDireccion } from "@/lib/adelantos/direccion";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";

const METODOS_CAJA = ["efectivo", "yape", "plin", "tarjeta", "transferencia"] as const;

const CreateSchema = z.object({
  beneficiarioId: z.string().min(1).max(40),
  modalidad: z.enum(["CUENTA_CORRIENTE", "ENTREGAS_PACTADAS", "DESCUENTO_PLANILLA"]).optional(),
  montoAdelantado: z.number().positive().max(9999999999),
  moneda: z.string().max(3).optional(),
  fechaAdelanto: z.string().optional(),
  /** (332) Cuándo se acordó devolverlo. */
  fechaVencimiento: z.string().max(40).nullable().optional(),
  notas: z.string().max(1000).optional(),
  comprobanteUrl: z.string().url().max(500).optional(),
  /** N° del talonario de papel que firmó la persona (ADR-329). */
  reciboManual: z.string().trim().max(60).optional(),
  /** Volumen de madera de referencia — no toca saldoPendiente ni el tope de crédito. */
  piesTablares: z.number().positive().max(9999999).optional(),
  /** SERVICIO (ADR-448): los pies que el negocio asierra por un adelanto recibido. */
  piesTablaresTipo: z.enum(["COMPRADO", "VENDIDO", "SERVICIO"]).optional(),
  /**
   * (ADR-448) De qué lado está la plata. Sin `.default()`: el default (DADO)
   * vive en la DB class, así el asistente IA y todo lo que ya llama a `create`
   * sigue dando plata sin mandar nada.
   */
  direccion: z.enum(["DADO", "RECIBIDO"]).optional(),
  /** Obligatorio con RECIBIDO, prohibido con DADO. */
  conceptoRecibido: z.enum(["SERVICIO", "PRESTAMO"]).nullable().optional(),
  /**
   * (ADR-448) Una por intento de alta: repetirla devuelve el mismo adelanto con
   * `repetido: true` (200) y no vuelve a mover la caja. Un doble clic creaba dos.
   */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
  /**
   * Pasar el tope de crédito a sabiendas. Va explícito y por defecto NO: un
   * desborde por descuido sigue rechazándose; éste lo manda la pantalla recién
   * después de que alguien confirmó el aviso con el monto exacto.
   */
  forzarLimite: z.boolean().optional(),
  /** El permiso bajo el que se entrega el adelanto (ADR-421). Opcional: un
   *  adelanto al personal de planta no pertenece a ningún contrato. */
  contratoId: z.string().max(64).nullish(),
  /**
   * Por qué vía salió la plata del cajón. Ausente = no mover la caja (el
   * adelanto salió del banco, o se está cargando en diferido).
   */
  metodoCaja: z.enum(METODOS_CAJA).nullable().optional(),
  entregasPactadas: z
    .array(
      z.object({
        descripcionEsperada: z.string().min(1).max(300),
        valorEsperado: z.number().positive().max(9999999999),
        fechaEsperada: z.string().optional(),
      }),
    )
    .max(60)
    .optional(),
}).superRefine((d, ctx) => {
  /* La MISMA regla que el CHECK de la base (`Adelanto_direccion_chk`): RECIBIDO
     sin concepto, DADO con concepto y RECIBIDO por planilla dan 400 acá, con el
     motivo en español, en vez de un 503 por la constraint. */
  const problema = problemaDeDireccion({ direccion: d.direccion, conceptoRecibido: d.conceptoRecibido, modalidad: d.modalidad });
  if (problema) ctx.addIssue({ code: "custom", message: problema, path: ["conceptoRecibido"] });
});

/**
 * Los filtros del GET. `status` y `modalidad` se casteaban `as never`: un valor
 * inventado llegaba a Prisma y daba 503. `direccion` (ADR-448) por defecto es
 * DADO — la lista del módulo pide `?direccion=todas` explícito.
 */
const ListSchema = z.object({
  status: z.enum(["ABIERTO", "LIQUIDADO", "EXCEDIDO", "CANCELADO"]).optional(),
  beneficiarioId: z.string().min(1).max(40).optional(),
  modalidad: z.enum(["CUENTA_CORRIENTE", "ENTREGAS_PACTADAS", "DESCUENTO_PLANILLA"]).optional(),
  search: z.string().max(120).optional(),
  direccion: z.enum(["DADO", "RECIBIDO", "todas"]).optional(),
});

// GET /api/adelantos — lista con filtros
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  try {
    const { searchParams } = new URL(req.url);
    /* Un parámetro vacío («?status=») es «sin filtro», como antes. */
    const param = (k: string) => searchParams.get(k) || undefined;
    const filtros = ListSchema.safeParse({
      status: param("status"),
      beneficiarioId: param("beneficiarioId"),
      modalidad: param("modalidad"),
      search: param("search"),
      direccion: param("direccion"),
    });
    if (!filtros.success) {
      return NextResponse.json(
        { error: "Filtros inválidos", issues: filtros.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 },
      );
    }
    const adelantos = await AdelantosDB.list(auth.tenantId, filtros.data);
    return NextResponse.json(adelantos, { headers: { "X-Total-Count": String(adelantos.length) } });
  } catch (e) {
    logger.error("[adelantos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/adelantos — crear adelanto
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  try {
    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    /* ADR-448: registrar plata RECIBIDA es sólo de admin o dueño. `requireAdmin`
       sin roles deja pasar a cajero y almacenero (no tienen `adelantos` en
       role-permissions), y un recibido abre la puerta a sacar plata de la caja
       al «devolverlo». Lo DADO sigue como hoy. */
    if (parsed.data.direccion === "RECIBIDO") {
      const prohibido = soloAdminODueno(auth.role, "registrar plata recibida");
      if (prohibido) return prohibido;
    }
    let adelanto;
    try {
      adelanto = await AdelantosDB.create(auth.tenantId, parsed.data);
    } catch (bizErr) {
      /* La misma clave con otro cuerpo: no es un reintento (ADR-448). */
      if (bizErr instanceof IdempotenciaDistintaError) {
        return NextResponse.json({ error: bizErr.message, code: bizErr.code }, { status: bizErr.status });
      }
      // Errores de negocio (límite de crédito, persona inexistente) → 400 claro.
      return NextResponse.json({ error: bizErr instanceof Error ? bizErr.message : "Error de validación" }, { status: 400 });
    }
    if (adelanto.repetido) return NextResponse.json(adelanto, { status: 200 });
    logActivity(
      "Crear",
      "adelanto",
      `Adelanto ${adelanto.direccion === "RECIBIDO" ? "recibido " : ""}S/${parsed.data.montoAdelantado.toFixed(2)} (${parsed.data.modalidad ?? "CUENTA_CORRIENTE"})`,
      adelanto.id,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    /* `caja` (ADR-448): `null` = no se pidió mover la caja; `{ sinCaja: true }` =
       se pidió y no había caja abierta — la pantalla lo dice. Un reintento con la
       misma `idempotencyKey` devuelve 200 con `repetido: true` (arriba). */
    return NextResponse.json(adelanto, { status: 201 });
  } catch (e) {
    logger.error("[adelantos] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
