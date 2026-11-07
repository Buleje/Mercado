import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { limaDateKey } from "@/lib/utils";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { AdelantosDB, ContratoInvalidoError, IdempotenciaDistintaError } from "@/lib/db/adelantos.db";
import { ColaboradoresDB, CuentaAmbiguaError } from "@/lib/db/rrhh-colaboradores.db";
import { PagosSemanaDB } from "@/lib/db/rrhh-pagos.db";
import { RRHH_GESTION, nivelDeRol } from "@/lib/rrhh/roles";
import { IDS_METODO, IDS_MOTIVO, notaDelAdelantoRrhh, textoDelDescuento, type DescuentoDelAdelanto } from "@/lib/rrhh/adelanto-rrhh";
import { respuestaErrorColaborador } from "../../_errores";

const DarAdelantoSchema = z.object({
  monto: z.number().positive().max(1_000_000),
  /** El día en que se le dio; sin fecha = hoy (Lima). */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD").optional(),
  nota: z.string().trim().max(500).optional(),
  /** Por dónde salió la plata del cajón; ausente = no mover la caja. Sólo con fecha de hoy. */
  metodoCaja: z.enum(IDS_METODO).nullable().optional(),
  /** (25-10) Para qué lo pidió: va a la nota. «Otro» pide el detalle. */
  motivo: z.enum(IDS_MOTIVO).optional(),
  detalle: z.string().trim().max(200).optional(),
  /** (25-10) Cómo se le dio — va a la nota aunque no salga de la caja. */
  metodo: z.enum(IDS_METODO).optional(),
  /** (25-10) `true` = sale de la caja abierta por `metodo` (sólo hoy). */
  saleDeCaja: z.boolean().optional(),
  /** (25-10) El n.º del recibo de papel, si se firmó uno. */
  reciboManual: z.string().trim().max(60).optional(),
  /** El mismo intento (doble clic, reintento) no da dos adelantos. */
  idempotencyKey: z.string().trim().min(8).max(100),
});

/**
 * POST /api/rrhh/colaboradores/[id]/adelanto — «Dar adelanto» desde RRHH
 * (Brandon 24-10: «a veces piden plata, y todo eso se le descuenta el sábado»).
 *
 * El adelanto va a SU cuenta de Mi Plata (si no tiene, se vincula la persona
 * con su mismo documento o se le abre una: `asegurarCuenta`) con modalidad
 * «descuento por planilla», así que el pago del sábado lo descuenta solo.
 *
 * Roles: los que escriben adelantos (`permisoAdelantos`: admin, dueño,
 * encargado) y entran a RRHH con más que marcar. Cajero y almacenero, no.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_GESTION]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel || nivel === "marcar") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }
  const parsed = DarAdelantoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }
  const { fecha, nota, motivo, detalle, metodo, saleDeCaja, reciboManual, idempotencyKey } = parsed.data;
  if (motivo === "otro" && !detalle) {
    return NextResponse.json({ error: "detalle_requerido", message: "Con «Otro», escribe para qué fue el adelanto." }, { status: 422 });
  }
  if (saleDeCaja && !metodo) {
    return NextResponse.json({ error: "metodo_requerido", message: "Elige cómo salió de la caja (efectivo, Yape…)." }, { status: 422 });
  }
  // `metodoCaja` es el contrato de antes (la ficha del colaborador); `saleDeCaja` + `metodo`, el de la fila.
  const metodoCaja = saleDeCaja ? (metodo ?? null) : (parsed.data.metodoCaja ?? null);
  const monto = Math.round(parsed.data.monto * 100) / 100;
  if (monto <= 0) return NextResponse.json({ error: "validation_error", message: "El monto tiene que ser mayor que cero." }, { status: 422 });
  const hoy = limaDateKey();
  const dia = fecha ?? hoy;
  if (dia > hoy) {
    return NextResponse.json({ error: "fecha_futura", message: "Un adelanto se anota el día que se dio, no antes." }, { status: 422 });
  }
  if (metodoCaja && dia !== hoy) {
    return NextResponse.json(
      { error: "caja_solo_hoy", message: "Sólo lo que se da hoy sale de la caja abierta. Para un día pasado, anótalo sin caja." },
      { status: 422 },
    );
  }

  try {
    let cuenta;
    try {
      cuenta = await ColaboradoresDB.asegurarCuenta(auth.tenantId, id, auth.username);
    } catch (e) {
      if (e instanceof CuentaAmbiguaError) {
        return NextResponse.json({ error: "cuenta_ambigua", message: e.message }, { status: 409 });
      }
      const conocido = respuestaErrorColaborador(e);
      if (conocido) return conocido;
      throw e;
    }
    if (!cuenta) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // El sábado en que el pago lo descuenta (o fin de mes si cobra por mes). Si
    // no se puede leer, el adelanto se anota igual sin fecha: no se frena plata
    // por un aviso (sin fecha, Cobranza lo marca «sin fecha para cobrar»).
    let descuento: DescuentoDelAdelanto | null = null;
    try {
      descuento = await PagosSemanaDB.fechaDelDescuento(auth.tenantId, id, hoy);
    } catch (e) {
      logger.warn("[rrhh/adelanto] no se pudo calcular el sábado del descuento", { error: e instanceof Error ? e.message : String(e) });
    }

    let adelanto;
    try {
      adelanto = await AdelantosDB.create(auth.tenantId, {
        beneficiarioId: cuenta.beneficiarioId,
        modalidad: "DESCUENTO_PLANILLA",
        montoAdelantado: monto,
        moneda: "PEN",
        // Hoy = la hora de ahora; un día pasado, al mediodía de Lima (nunca corre de día).
        fechaAdelanto: dia === hoy ? undefined : `${dia}T12:00:00-05:00`,
        notas: notaDelAdelantoRrhh({ motivo, detalle, metodo: metodo ?? metodoCaja, nota }),
        direccion: "DADO",
        idempotencyKey,
        metodoCaja,
        // Al mediodía de Lima: la fecha nunca corre de día (como «Fecha de cobro» de Mi Plata).
        fechaVencimiento: descuento ? `${descuento.fecha}T12:00:00-05:00` : null,
        reciboManual: reciboManual || undefined,
      });
    } catch (bizErr) {
      if (bizErr instanceof IdempotenciaDistintaError || bizErr instanceof ContratoInvalidoError) {
        return NextResponse.json({ error: bizErr.code, message: bizErr.message }, { status: bizErr.status });
      }
      // Errores de negocio de Adelantos (límite de crédito, persona dada de baja) → 400 legible.
      const message = bizErr instanceof Error ? bizErr.message : "No se pudo anotar el adelanto.";
      return NextResponse.json({ error: "adelanto_rechazado", message }, { status: 400 });
    }

    const cuerpo = {
      adelanto,
      cuenta: { beneficiarioId: cuenta.beneficiarioId, origen: cuenta.origen },
      descuento: descuento ? { ...descuento, texto: textoDelDescuento(descuento) } : null,
    };
    if (adelanto.repetido) return NextResponse.json(cuerpo, { status: 200 });
    logActivity(
      "rrhh_adelanto",
      "Colaborador",
      `Adelanto de sueldo S/${monto.toFixed(2)} a ${cuenta.nombre}${metodoCaja ? ` (salió de la caja, ${metodoCaja})` : ""}`,
      id,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.error("[rrhh/adelanto] logActivity falló", { error: String(err) }));
    return NextResponse.json(cuerpo, { status: 201 });
  } catch (e) {
    logger.error("[rrhh/colaboradores/id/adelanto] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
