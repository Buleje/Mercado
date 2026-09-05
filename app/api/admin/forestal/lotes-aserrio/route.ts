import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestLoteAserrioDB } from "@/lib/db/forest-lote-aserrio.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * Lotes de ASERRÍO (ADR-334): la materia prima agrupada antes de la sierra.
 *
 * GET    → los lotes del tenant con sus piezas.
 * POST   → abre un lote para una especie.
 * PATCH  → guarda o saca piezas / edita la nota.
 * DELETE → deshace un lote abierto (sus piezas vuelven al patio).
 *
 * El lote COMERCIAL (`/lotes`) es otra cosa: agrupa producción terminada.
 */

const Query = z.object({
  status: z.enum(["abierto", "consumido", "cerrado"]).optional(),
  especie: z.string().trim().max(120).optional(),
  limite: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * Un día suelto del formulario (`AAAA-MM-DD`) → mediodía UTC, sin correrse en Lima.
 *
 * ⛔ `undefined` se preserva como `undefined`, y eso NO es un detalle de tipos.
 * Antes el transform devolvía `null` para cualquier ausencia, así que «no mandé
 * este campo» y «borrá este campo» llegaban idénticos a la capa de datos. El
 * `update()` de la DB class ya distingue bien (`!== undefined ? … : {}`), pero
 * nunca recibía un `undefined`: editar el NOMBRE de un lote le borraba en
 * silencio el inicio y el fin del proceso — las fechas que dicen cuánto tardó
 * la sierra, que no se recuperan de ningún lado.
 *
 * Los tres casos, que son tres:
 *   · el campo no viene            → `undefined` → no se toca
 *   · viene `null` o vacío         → `null`      → se borra a propósito
 *   · viene una fecha              → `Date`      → se escribe
 */
export const dia = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato AAAA-MM-DD")
  .nullish()
  .transform((v) => (v === undefined ? undefined : v ? new Date(`${v}T12:00:00.000Z`) : null));

/** Un paquete de producción declarado (ADR-349), igual que en `declarar_produccion`. */
const paqueteSchema = z.object({
  codigo: z.string().trim().min(1).max(60),
  productType: z.string().trim().max(80).nullish(),
  presentacion: z.string().trim().max(80).nullish(),
  cantidad: z.coerce.number().int().nonnegative().max(99999),
  volumenM3: z.coerce.number().positive().max(999999),
  espesorCm: z.coerce.number().positive().max(9999).nullish(),
  anchoCm: z.coerce.number().positive().max(9999).nullish(),
  largoM: z.coerce.number().positive().max(999).nullish(),
  observations: z.string().trim().max(300).nullish(),
});

/**
 * Dos formas de abrir un lote (Brandon, 2026-08-31): la de siempre, sin madera
 * —se carga después en Consumos— y la de INVENTARIO, que declara de una vez
 * cuánto se consumió y qué salió, sin trozas reales (`crearInventario`).
 * `modo` es obligatorio para poder discriminar: `z.discriminatedUnion` no
 * admite un campo opcional como llave.
 */
/** Código a mano (Brandon, 2026-08-31): vacío = correlativo automático. */
const codigoLote = z.string().trim().min(1).max(60).nullish();

const postSchema = z.discriminatedUnion("modo", [
  z.object({
    modo: z.literal("abierto"),
    code: codigoLote,
    speciesCommon: z.string().trim().min(1, "El lote necesita una especie").max(120),
    speciesScientific: z.string().trim().max(160).nullish(),
    notes: z.string().trim().max(500).nullish(),
    // Programación del lote (ADR-342): los campos del formulario oficial.
    ordenProduccion: z.string().trim().max(80).nullish(),
    tipoProductoConsumir: z.string().trim().max(60).nullish(),
    inicioProceso: dia,
    finProceso: dia,
  }),
  z.object({
    modo: z.literal("inventario"),
    code: codigoLote,
    speciesCommon: z.string().trim().min(1, "El lote necesita una especie").max(120),
    speciesScientific: z.string().trim().max(160).nullish(),
    volumenConsumidoM3: z.coerce.number().positive().max(999999),
    fecha: dia,
    finProceso: dia,
    notes: z.string().trim().max(500).nullish(),
    paquetes: z.array(paqueteSchema).min(1).max(200),
  }),
]);

const patchSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("agregar"),
    loteId: z.string().trim().min(1).max(60),
    trozaIds: z.array(z.string().trim().min(1).max(60)).min(1).max(500),
  }),
  z.object({
    accion: z.literal("quitar"),
    loteId: z.string().trim().min(1).max(60),
    trozaId: z.string().trim().min(1).max(60),
  }),
  /**
   * Editar la identidad/programación del lote (Brandon, 2026-08-31): código,
   * especie, orden, tipo de producto a consumir, ventana del proceso y nota.
   * Todos opcionales — sólo se toca lo que venga en el body.
   */
  z.object({
    accion: z.literal("editar"),
    loteId: z.string().trim().min(1).max(60),
    code: codigoLote,
    speciesCommon: z.string().trim().min(1).max(120).optional(),
    speciesScientific: z.string().trim().max(160).nullish(),
    ordenProduccion: z.string().trim().max(80).nullish(),
    tipoProductoConsumir: z.string().trim().max(60).nullish(),
    inicioProceso: dia,
    finProceso: dia,
    notes: z.string().trim().max(500).nullish(),
  }),
  /**
   * DESHACER un lote consumido cuya corrida sigue viva (Brandon, 2026-08-31):
   * "eliminar el registro de producción" desde la propia pestaña de Lotes, sin
   * ir primero a Producción a anular la línea.
   */
  z.object({
    accion: z.literal("deshacer-forzado"),
    loteId: z.string().trim().min(1).max(60),
    motivo: z.string().trim().min(3).max(500),
    /** Confirma eliminar aunque la corrida ya tenga despacho/reproceso registrado. */
    forzar: z.boolean().optional(),
  }),
  /**
   * CONSUMIR el lote en el patio (ADR-340): las piezas elegidas entran al lote y
   * a la sierra en la fecha indicada, y se abre la corrida que va a declarar la
   * producción después. Sin `trozaIds` consume lo que el lote ya tenía.
   */
  z.object({
    accion: z.literal("consumir"),
    loteId: z.string().trim().min(1).max(60),
    trozaIds: z.array(z.string().trim().min(1).max(60)).max(500).optional(),
    /** Día del consumo, `AAAA-MM-DD`. Sin fecha, hoy. */
    fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato AAAA-MM-DD").optional(),
    /** Observación del consumo: va al casillero (11) del libro. */
    observaciones: z.string().trim().max(500).optional(),
  }),
  /**
   * SUMAR piezas a una corrida que todavía no declaró (ADR-364): el turno que
   * entra en tandas es UNA corrida, no dos asientos con dos rendimientos.
   */
  z.object({
    accion: z.literal("sumar-corrida"),
    loteId: z.string().trim().min(1).max(60),
    corridaId: z.string().trim().min(1).max(60),
    trozaIds: z.array(z.string().trim().min(1).max(60)).min(1).max(500),
    fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá el formato AAAA-MM-DD").optional(),
  }),
  /**
   * Y el reverso (ADR-364): piezas mal tildadas que salen de una corrida que
   * todavía no declaró, sin tener que anular la línea entera. Sin `loteId`: las
   * piezas dicen solas de qué lote venían.
   */
  z.object({
    accion: z.literal("quitar-corrida"),
    corridaId: z.string().trim().min(1).max(60),
    trozaIds: z.array(z.string().trim().min(1).max(60)).min(1).max(500),
  }),
  /**
   * CERRAR un lote parcial que no va a terminar de aserrarse: su madera libre
   * vuelve al patio y el lote deja de figurar como trabajo pendiente. El motivo
   * es obligatorio — cerrar sin decir por qué no se puede reconstruir después.
   */
  z.object({
    accion: z.literal("cerrar"),
    loteId: z.string().trim().min(1).max(60),
    motivo: z.string().trim().min(3).max(300),
  }),
  /**
   * REABRIR un lote ya aserrado para seguirle cargando madera (2026-09-02): un
   * lote entra a la sierra en varias tandas, no en un solo acto. Las piezas ya
   * consumidas no se tocan — ver `ForestLoteAserrioDB.reabrir`.
   */
  z.object({
    accion: z.literal("reabrir"),
    loteId: z.string().trim().min(1).max(60),
  }),
]);

async function guard(req: NextRequest, roles: AdminRole[] = ["admin", "almacenero", "owner"]) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:lotes-aserrio");
  if (rl) return { error: rl };
  const auth = await requireAdmin(req, roles);
  if (auth instanceof NextResponse) return { error: auth };
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return { error: NextResponse.json({ error: "specialization_disabled" }, { status: 403 }) };
  }
  return { auth };
}

export async function GET(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
    const lotes = await ForestLoteAserrioDB.list(g.auth.tenantId, parsed.data);
    return NextResponse.json({ lotes, total: lotes.length });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-aserrio.GET", "");
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;

    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
    }
    const user = g.auth.username ?? "unknown";
    if (parsed.data.modo === "inventario") {
      const { modo: _modo, fecha, finProceso, ...resto } = parsed.data;
      const r = await ForestLoteAserrioDB.crearInventario(g.auth.tenantId, {
        ...resto,
        fecha: fecha ?? undefined,
        finProceso: finProceso ?? undefined,
        createdBy: user,
      });
      return NextResponse.json({ lote: r.lote, corrida: r.corrida }, { status: 201 });
    }
    const { modo: _modo, ...resto } = parsed.data;
    const lote = await ForestLoteAserrioDB.create(g.auth.tenantId, {
      ...resto,
      createdBy: user,
    });
    return NextResponse.json({ lote }, { status: 201 });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-aserrio.POST", "");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;

    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
    }
    const d = parsed.data;
    const user = g.auth.username ?? "unknown";

    /**
     * Deshacer un lote CON producción declarada no es trabajo de patio.
     *
     * Todo lo demás de este endpoint —armar el lote, agregar y quitar trozas,
     * consumirlo, cerrarlo— es lo que hace un almacenero todos los días.
     * `deshacer-forzado` es otra cosa: ANULA corridas ya asentadas en el Libro
     * de Operaciones y borra el lote. Un asiento anulado del libro que se
     * presenta ante SERFOR es un acto contable, no una corrección de patio.
     *
     * El guard de arriba admite `almacenero` porque cubre las nueve acciones;
     * ésta se recorta acá, junto a lo que hace, y no cambiando el guard entero
     * —que dejaría al almacenero sin poder cargar trozas.
     */
    if (d.accion === "deshacer-forzado" && !["admin", "owner"].includes(g.auth.role)) {
      return NextResponse.json(
        {
          error: "forbidden",
          message:
            "Deshacer un lote con producción declarada anula asientos del Libro de Operaciones. " +
            "Sólo el dueño o un administrador puede hacerlo.",
        },
        { status: 403 },
      );
    }

    if (d.accion === "agregar") {
      const r = await ForestLoteAserrioDB.agregarTrozas(g.auth.tenantId, d.loteId, d.trozaIds, user);
      return NextResponse.json(r);
    }
    if (d.accion === "quitar") {
      await ForestLoteAserrioDB.quitarTroza(g.auth.tenantId, d.loteId, d.trozaId, user);
      return NextResponse.json({ ok: true });
    }
    if (d.accion === "consumir") {
      /* La fecha llega como día (`AAAA-MM-DD`) y se construye a mediodía UTC: a
         medianoche, la zona de Lima (UTC-5) la correría al día anterior — el
         mismo off-by-one que ya mordió a `entryDate`. */
      const r = await ForestLoteAserrioDB.consumirEnPatio(g.auth.tenantId, {
        loteId: d.loteId,
        trozaIds: d.trozaIds,
        fecha: d.fecha ? new Date(`${d.fecha}T12:00:00.000Z`) : undefined,
        observaciones: d.observaciones ?? null,
        user,
      });
      return NextResponse.json(r);
    }
    if (d.accion === "sumar-corrida") {
      /* Misma construcción de fecha que `consumir`: mediodía UTC o Lima la corre
         al día anterior. */
      const r = await ForestLoteAserrioDB.sumarACorrida(g.auth.tenantId, {
        loteId: d.loteId,
        corridaId: d.corridaId,
        trozaIds: d.trozaIds,
        fecha: d.fecha ? new Date(`${d.fecha}T12:00:00.000Z`) : undefined,
        user,
      });
      return NextResponse.json(r);
    }
    if (d.accion === "cerrar") {
      const r = await ForestLoteAserrioDB.cerrar(g.auth.tenantId, {
        loteId: d.loteId,
        motivo: d.motivo,
        user,
      });
      return NextResponse.json(r);
    }
    if (d.accion === "reabrir") {
      const r = await ForestLoteAserrioDB.reabrir(g.auth.tenantId, { loteId: d.loteId, user });
      return NextResponse.json(r);
    }
    if (d.accion === "quitar-corrida") {
      const r = await ForestLoteAserrioDB.quitarDeCorrida(g.auth.tenantId, {
        corridaId: d.corridaId,
        trozaIds: d.trozaIds,
        user,
      });
      return NextResponse.json(r);
    }
    if (d.accion === "deshacer-forzado") {
      const r = await ForestLoteAserrioDB.deshacerConProduccion(g.auth.tenantId, {
        loteId: d.loteId,
        motivo: d.motivo,
        forzar: d.forzar,
        user,
      });
      return NextResponse.json(r);
    }
    const lote = await ForestLoteAserrioDB.update(
      g.auth.tenantId,
      d.loteId,
      {
        code: d.code,
        speciesCommon: d.speciesCommon,
        speciesScientific: d.speciesScientific,
        ordenProduccion: d.ordenProduccion,
        tipoProductoConsumir: d.tipoProductoConsumir,
        inicioProceso: d.inicioProceso,
        finProceso: d.finProceso,
        notes: d.notes,
      },
      user,
    );
    return NextResponse.json({ lote });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-aserrio.PATCH", "");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const g = await guard(req, ["admin", "owner"]);
    if (g.error) return g.error;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const id = req.nextUrl.searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
    await ForestLoteAserrioDB.softDelete(g.auth.tenantId, id, g.auth.username ?? "unknown");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-aserrio.DELETE", "");
  }
}
