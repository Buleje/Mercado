import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit, applyRateLimitWithTenant, RateLimitPresets } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { ForestVincularTrozasDB, TandaEnCursoError } from "@/lib/db/forest-vincular-trozas.db";
import { ForestVincularCorridaDB } from "@/lib/db/forest-vincular-corrida.db";
import { esChoqueDeLocks, MENSAJE_CHOQUE_DE_LOCKS } from "@/lib/forestal/ctp-api-errors";
import {
  vincularTandaSchema,
  vincularTrozasSchema,
  type ResultadoTandaVincular,
  type ResultadoVincularTrozas,
} from "@/lib/forestal/vincular-trozas";
import { MAX_TROZAS_SIMULAR, soltarTrozasSchema, type ResultadoSoltarTrozas } from "@/lib/forestal/soltar-trozas";

/**
 * «Saber de qué trozas salió» (Libro CTP): por qué cada corrida no tiene su
 * madera y, cuando se puede, con qué trozas se vincula.
 *
 * GET  ?diagnostico=1                          → `DiagnosticoSinOrigen` (cada corrida con su `arreglo`, ADR-447)
 * GET  ?corridaId=<id>                         → `DiagnosticoCorrida` de una
 * GET  ?propuesta=1&especie=&fecha=&m3=[&contratoId=|&permiso=]
 *                                              → `{ propuesta, motivo, detalle, m3Propuesto, arreglo }`
 *      (la corrida todavía no existe: el modal de declarar)
 * GET  ?tanda=1                                → `{ propuesta: PropuestaDeTandaOrigen, simulacion: SimulacionDeArreglos }`
 *      (ADR-447: qué se vincula junto, ninguna troza en dos corridas; sólo lee)
 * POST `{ corridaId, trozaIds }`               → `ResultadoVincularTrozas`
 *      201 vinculada · 400 pedido mal armado · 404 no es de este negocio ·
 *      409 el libro no lo admite (permiso, T1, T3, volumen, I2, mes cerrado)
 *      o chocó con otra persona. Siempre con `message` en una frase.
 * POST `{ tanda: [{ corridaId, trozaIds }, …] }` (1 a 15) → `{ ok: true, tanda: ResultadoTandaVincular }`
 *      200 con el estado de CADA corrida (`vinculada | ya_vinculada | bloqueada | error | pendiente`):
 *      una tx por corrida, una rechazada no deshace las demás; pasados 240 s
 *      las que faltan vuelven `pendiente` (se mandan en otro pedido) · 400
 *      pedido mal armado (más de 15, troza repetida, corrida repetida) · 404
 *      una corrida no es de este negocio (no se escribe nada) · 409
 *      `TANDA_EN_CURSO` otra tanda tenía el bloqueo al ARRANCAR (no se escribe
 *      nada; si pasa en una corrida posterior, ésa vuelve `error` y las
 *      anteriores quedan escritas) · 429 límite propio del negocio (MODERATE).
 *      `maxDuration` 300 s en `vercel.json`.
 *
 * SOLTAR trozas de una corrida (ADR-447 §6), el reverso de vincular:
 * GET  ?soltar=<corridaId>                     → `VistaDeSoltar` (la corrida, sus piezas y sus m³ por guía; 404 si no es de este negocio)
 * GET  ?soltar=<corridaId>&simular=1[&trozas=a,b,…]
 *                                              → `SimulacionDeSoltar` (qué corridas quedan listas y la sugerencia; sólo lee)
 * POST `{ accion: "soltar", corridaId, trozaIds, motivo }` → `ResultadoSoltarTrozas`
 *      200 soltadas · 400 pedido mal armado o sin motivo · 404 la corrida o
 *      una troza no es de este negocio · 409 el libro no lo admite (mes
 *      cerrado, congelado, lo que queda no alcanza para lo producido, otra
 *      pantalla ya las soltó) o chocó con otra persona. Roles: los de vincular.
 *
 * Roles: leer, los de Lotes de aserrío (`admin`/`almacenero`/`owner`) y también
 * `manager`, que entra por el «management tier» de `requireAdmin` — leer el
 * diagnóstico no cambia nada, así que se le deja a propósito. Vincular, sólo
 * `admin`/`owner` — la decisión 2 de Brandon para ADR-441: cambia la materia
 * prima de un asiento que se presenta ante SERFOR. Ahí el chequeo del rol va
 * explícito además de `requireAdmin`, porque el «management tier» dejaría
 * pasar a `manager` aunque la lista diga admin/owner.
 */

const LEER: AdminRole[] = ["admin", "almacenero", "owner"];
const VINCULAR: AdminRole[] = ["admin", "owner"];

const idCorto = z.string().trim().min(1).max(40);

/** Simulaciones de «Soltar trozas» por negocio: cuatro modales usados a fondo en 5 minutos. */
const SIMULAR_POR_NEGOCIO = { maxReqs: 60, windowSec: 5 * 60 };

/** Ids separados por coma (`trozas=a,b`): la selección que se simula. */
const listaDeIds = z
  .string()
  .trim()
  .max(MAX_TROZAS_SIMULAR * 41)
  .transform((v) =>
    v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  )
  .pipe(z.array(idCorto).max(MAX_TROZAS_SIMULAR, `Se simulan hasta ${MAX_TROZAS_SIMULAR} trozas.`));

const querySchema = z.union([
  /* Primero: `?soltar=` no se confunde con las otras formas. */
  z.object({ soltar: idCorto, simular: z.literal("1").optional(), trozas: listaDeIds.optional() }),
  z.object({ diagnostico: z.literal("1") }),
  z.object({ tanda: z.literal("1") }),
  z.object({ corridaId: idCorto }),
  z.object({
    propuesta: z.literal("1"),
    especie: z.string().trim().min(1, "Falta la especie").max(120),
    fecha: z.string().trim().pipe(z.iso.date("Usa una fecha real con el formato AAAA-MM-DD")),
    /* `transform(Number)` + `finite`: un `m3=` vacío con coerce sería 0 y
       propondría toda la madera sin avisar. */
    m3: z
      .string()
      .trim()
      .min(1, "Falta lo producido")
      .transform(Number)
      .pipe(z.number().finite().min(0, "Lo producido no puede ser negativo").max(100_000)),
    contratoId: idCorto.optional(),
    permiso: z.string().trim().max(120).optional(),
  }),
]);

async function guard(req: NextRequest, roles: AdminRole[]) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:vincular-trozas");
  if (rl) return { error: rl };
  const auth = await requireAdmin(req, roles);
  if (auth instanceof NextResponse) return { error: auth };
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return {
      error: NextResponse.json(
        { error: "specialization_disabled", message: "El Libro CTP no está habilitado para este negocio." },
        { status: 403 },
      ),
    };
  }
  return { auth };
}

const noOk = (error: string, message: string, status: number) =>
  NextResponse.json({ ok: false, error, message } satisfies ResultadoVincularTrozas, { status });

export async function GET(req: NextRequest) {
  const g = await guard(req, LEER);
  if (g.error) return g.error;
  const tenantId = g.auth.tenantId;
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "invalid_query",
          message: "Pide ?diagnostico=1, ?tanda=1, ?corridaId=<id>, ?soltar=<id> o ?propuesta=1 con especie, fecha y m3.",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 },
      );
    }
    const q = parsed.data;
    if ("soltar" in q) {
      /* La simulación lee el patio entero: cupo por negocio además del de la IP.
         Un modal pide una al abrirse y una por selección quieta (~15 por uso). */
      if (q.simular) {
        const rl = applyRateLimitWithTenant(req, "GENEROUS", tenantId, "ctp-soltar-simular", SIMULAR_POR_NEGOCIO);
        if (rl) return rl;
      }
      const r = q.simular
        ? await ForestVincularTrozasDB.simularSoltar(tenantId, q.soltar, q.trozas ?? null)
        : await ForestVincularCorridaDB.vistaDeSoltar(tenantId, q.soltar);
      /* Otro negocio o inexistente es «no existe», nunca un 401 que saque del panel. */
      if (!r) {
        return NextResponse.json({ error: "no_existe", message: "Esa corrida no existe en este negocio." }, { status: 404 });
      }
      return NextResponse.json(r);
    }
    if ("diagnostico" in q) {
      return NextResponse.json(await ForestVincularTrozasDB.diagnostico(tenantId));
    }
    if ("tanda" in q) {
      return NextResponse.json(await ForestVincularTrozasDB.tanda(tenantId));
    }
    if ("corridaId" in q) {
      const r = await ForestVincularTrozasDB.diagnosticoDeCorrida(tenantId, q.corridaId);
      if (!r.ok) {
        /* Otro negocio o inexistente es «no existe», nunca un 401 que saque del panel. */
        const status = r.error === "no_existe" ? 404 : 409;
        return NextResponse.json({ error: r.error, message: r.message }, { status });
      }
      return NextResponse.json(r.diagnostico);
    }
    const r = await ForestVincularTrozasDB.propuesta(tenantId, {
      especie: q.especie,
      fecha: q.fecha,
      m3: q.m3,
      contratoId: q.contratoId ?? null,
      permiso: q.permiso ?? null,
    });
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: 404 });
    const { ok: _ok, ...propuesta } = r;
    return NextResponse.json(propuesta);
  } catch (e) {
    logger.error("[forestal.ctp.vincular-trozas.GET] failed", { error: String(e), tenantId });
    return NextResponse.json({ error: "internal_error", message: "No se pudo leer el diagnóstico." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req, VINCULAR);
  if (g.error) return g.error;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const { tenantId, role } = g.auth;
  if (!VINCULAR.includes(role)) {
    return noOk(
      "forbidden",
      "Vincular una corrida con su madera cambia un asiento del Libro de Operaciones. Sólo el dueño o un administrador puede hacerlo.",
      403,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noOk("invalid_json", "El pedido no es JSON.", 400);
  }
  /* La tanda (ADR-447) es aditiva: sin la clave `tanda`, el pedido de una
     corrida sigue exactamente como antes. */
  if (body && typeof body === "object" && "tanda" in body) {
    return postTanda(req, body, tenantId, g.auth.username ?? "unknown");
  }
  /* Soltar (ADR-447 §6), también aditivo: sólo con la clave `accion`. */
  if (body && typeof body === "object" && "accion" in body) {
    return postSoltar(req, body, tenantId, g.auth.username ?? "unknown");
  }
  const parsed = vincularTrozasSchema.safeParse(body);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return noOk(
      "validation_error",
      i?.path[0] === "trozaIds" && i.code === "too_small" ? "Elige al menos una troza." : (i?.message ?? "Datos inválidos."),
      400,
    );
  }

  try {
    const r = await ForestVincularTrozasDB.vincularTrozas(tenantId, parsed.data, g.auth.username ?? "unknown");
    return NextResponse.json({ ok: true, ...r } satisfies ResultadoVincularTrozas, { status: 201 });
  } catch (e) {
    if (e instanceof CtpInvariantError) {
      /* Un pedido mal armado es 400; lo que no es de este negocio, 404; todo
         lo demás es el libro diciendo «no» (permiso, T1, T3, volumen, I2, mes
         cerrado): 409, con la frase que dice qué corregir y dónde. */
      const status = e.code === "VALIDACION" ? 400 : e.code === "TENANT_MISMATCH" ? 404 : 409;
      return noOk(e.code, e.message, status);
    }
    if (esChoqueDeLocks(e)) {
      logger.warn("[forestal.ctp.vincular-trozas.POST] choque de locks: se pidió reintentar", {
        error: String(e),
        tenantId,
      });
      return noOk("CHOQUE_DE_LOCKS", MENSAJE_CHOQUE_DE_LOCKS, 409);
    }
    logger.error("[forestal.ctp.vincular-trozas.POST] failed", { error: String(e), tenantId });
    return noOk("internal_error", "No se pudo vincular. Vuelve a intentar.", 500);
  }
}

/** `POST { tanda }`: una transacción por corrida; el estado de cada una en la respuesta. */
async function postTanda(req: NextRequest, body: unknown, tenantId: string, usuario: string): Promise<Response> {
  /* Una tanda son hasta 15 transacciones con locks: límite propio por IP y por
     negocio, aparte del GENEROUS que comparte con las lecturas (seguridad S1).
     MODERATE como «Guías sin registrar» (ADR-446); la clave sin «:» porque
     `applyRateLimit` toma lo de antes del primero como tenant. */
  const rl = applyRateLimitWithTenant(req, "MODERATE", tenantId, "ctp-vincular-tanda", RateLimitPresets.MODERATE);
  if (rl) return rl;
  const parsed = vincularTandaSchema.safeParse(body);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    const vacia = i?.path.length === 1 && i.path[0] === "tanda" && i.code === "too_small";
    return noOk("validation_error", vacia ? "Elige al menos una corrida." : (i?.message ?? "Datos inválidos."), 400);
  }
  try {
    const tanda = await ForestVincularTrozasDB.vincularTanda(tenantId, parsed.data.tanda, usuario);
    return NextResponse.json({ ok: true, tanda } satisfies { ok: true; tanda: ResultadoTandaVincular });
  } catch (e) {
    if (e instanceof TandaEnCursoError) return noOk("TANDA_EN_CURSO", e.message, 409);
    if (e instanceof CtpInvariantError) {
      const status = e.code === "VALIDACION" ? 400 : e.code === "TENANT_MISMATCH" ? 404 : 409;
      return noOk(e.code, e.message, status);
    }
    logger.error("[forestal.ctp.vincular-trozas.POST tanda] failed", { error: String(e), tenantId });
    return noOk("internal_error", "No se pudo vincular la tanda. Vuelve a intentar.", 500);
  }
}

/**
 * `POST { accion: "soltar" }` (ADR-447 §6): las trozas vuelven al patio y la
 * corrida conserva lo producido. Llega acá con el rol de vincular y el CSRF ya
 * revisados: cambia la materia prima de un asiento que se presenta ante SERFOR.
 */
async function postSoltar(req: NextRequest, body: unknown, tenantId: string, usuario: string): Promise<Response> {
  /* Cupo propio por negocio (auditoría 28-09): el GENEROUS de `guard` es por IP
     y lo comparten las lecturas. Soltar es un acto raro que cambia el libro:
     MODERATE, como la tanda; la clave sin «:» (ver `postTanda`). */
  const rl = applyRateLimitWithTenant(req, "MODERATE", tenantId, "ctp-soltar-trozas", RateLimitPresets.MODERATE);
  if (rl) return rl;
  const no = (error: string, message: string, status: number) =>
    NextResponse.json({ ok: false, error, message } satisfies ResultadoSoltarTrozas, { status });
  const parsed = soltarTrozasSchema.safeParse(body);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return no("validation_error", i?.message ?? "Datos inválidos.", 400);
  }
  try {
    const r = await ForestVincularCorridaDB.soltarTrozas(tenantId, parsed.data, usuario);
    return NextResponse.json(r satisfies ResultadoSoltarTrozas);
  } catch (e) {
    if (e instanceof CtpInvariantError) {
      /* Pedido mal armado o sin motivo: 400; lo que no es de este negocio: 404;
         lo demás es el libro diciendo «no» con la frase de qué hacer: 409. */
      const status =
        e.code === "VALIDACION" || e.code === "MOTIVO_REQUERIDO" ? 400 : e.code === "TENANT_MISMATCH" ? 404 : 409;
      return no(e.code, e.message, status);
    }
    if (esChoqueDeLocks(e)) {
      logger.warn("[forestal.ctp.vincular-trozas.POST soltar] choque de locks: se pidió reintentar", {
        error: String(e),
        tenantId,
      });
      return no("CHOQUE_DE_LOCKS", MENSAJE_CHOQUE_DE_LOCKS, 409);
    }
    logger.error("[forestal.ctp.vincular-trozas.POST soltar] failed", { error: String(e), tenantId });
    return no("internal_error", "No se pudieron soltar las trozas. Vuelve a intentar.", 500);
  }
}
