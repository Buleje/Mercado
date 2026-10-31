import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import {
  CamposPersonalizadosDB,
  CarpetaDesconocidaError,
  ClaveDuplicadaError,
  DemasiadosCamposError,
  RegistroDesconocidoError,
  TipoFueraDeLugarError,
} from "@/lib/db/campos-personalizados.db";
import {
  TIPOS_CAMPO,
  claveDesdeNombre,
  motivoTipoFueraDeLugar,
  nombreDelFormulario,
  puedeEscribirFormulario,
  puedeLeerFormulario,
} from "@/lib/campos-personalizados";
import { TIPO_ARCHIVO } from "@/lib/forestal/plan-documentos-tipos";

/**
 * /api/admin/campos-personalizados — los campos que inventa el negocio (ADR-427).
 *
 * GET    ?formulario=X[&registroId=Y] → { campos, valores }
 *        permanentes del formulario + temporales de ESE registro, con lo
 *        contestado en él.
 * GET    ?reutilizables=X            → { campos }
 *        los permanentes de OTROS formularios, para copiar la pregunta.
 * POST   crea un campo → { campo } · 409 si la clave ya existe ahí.
 * PATCH  { id, ... } edita etiqueta/ayuda/opciones/orden/activo → { campo }
 * DELETE ?id=X baja lógica → { ok: true }
 *
 * Quién puede: **leer los campos de un formulario, quien puede entrar a ese
 * módulo** (`puedeLeerFormulario`) — hasta el 2026-09-21 era una lista global y
 * un cajero leía «DNI del titular» del plan de manejo, una pantalla que no
 * puede abrir. **Inventar o dar de baja un campo cambia el formulario de
 * todos**, así que eso sigue siendo del tier de gestión.
 */

/* Puerta de entrada. La que decide de verdad, formulario por formulario, es
   `puedeLeerFormulario`. */
const ROLES_LECTURA = ["admin", "owner", "manager", "almacenero", "cajero"] as const;
const ROLES_DEFINICION = ["admin", "owner", "manager"] as const;

/**
 * El nombre tiene que dejar una clave. «--» pasaba el `min(2)` y reventaba en la
 * DB class con un 500: un dato mal mandado se responde 400 con el motivo.
 */
const nombreConClave = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .refine((n) => claveDesdeNombre(n).length > 0, "Ese nombre no deja ninguna letra ni número para identificarlo.");

/**
 * `archivo` (ADR-467) entra por esta ruta, pero SÓLO dentro de una carpeta de
 * «Documentos del plan» (`forestal.plan.documentos.<clave>`): es un casillero de
 * papeles, sin valor propio. `carpeta` no entra nunca por acá — las carpetas las
 * crea `/api/admin/forestal/plan/documentos`, que además hace la del Drive.
 */
const crearSchema = z
  .object({
    formulario: z.string().trim().min(1).max(80),
    nombre: nombreConClave,
    descripcion: z.string().trim().max(300).nullable().optional(),
    tipo: z.enum([...TIPOS_CAMPO, TIPO_ARCHIVO]),
    opciones: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    soloParaRegistroId: z.string().trim().max(40).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const motivo = motivoTipoFueraDeLugar(v.tipo, v.formulario);
    if (motivo) ctx.addIssue({ code: "custom", path: ["tipo"], message: motivo });
  });

const patchSchema = z.object({
  id: z.string().trim().min(1).max(40),
  nombre: nombreConClave.optional(),
  descripcion: z.string().trim().max(300).nullable().optional(),
  opciones: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  orden: z.number().int().min(0).max(9999).optional(),
  activo: z.boolean().optional(),
});

const querySchema = z.object({
  formulario: z.string().trim().min(1).max(80).optional(),
  registroId: z.string().trim().min(1).max(40).optional(),
  reutilizables: z.string().trim().min(1).max(80).optional(),
});

export const GET = withApiHandler("campos-personalizados-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_LECTURA);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "campos-personalizados");
  if (rl) return rl;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    formulario: url.searchParams.get("formulario") ?? undefined,
    registroId: url.searchParams.get("registroId") ?? undefined,
    reutilizables: url.searchParams.get("reutilizables") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }
  const { formulario, registroId, reutilizables } = parsed.data;

  try {
    if (reutilizables) {
      /* El catálogo cruza formularios por definición: se filtra por lo que este
         rol puede ver, porque la etiqueta de una pregunta («DNI del titular»)
         ya dice algo del módulo del que viene. */
      const campos = (await CamposPersonalizadosDB.reutilizables(auth.tenantId, reutilizables)).filter((c) =>
        puedeLeerFormulario(auth.role, c.formulario),
      );
      return NextResponse.json({ campos });
    }
    if (!formulario) {
      return NextResponse.json({ error: "formulario_requerido" }, { status: 400 });
    }
    if (!puedeLeerFormulario(auth.role, formulario)) {
      return NextResponse.json(
        { error: "forbidden", message: `Tu rol no puede ver los campos de ${nombreDelFormulario(formulario)}.` },
        { status: 403 },
      );
    }
    const campos = await CamposPersonalizadosDB.listar(auth.tenantId, formulario, registroId ?? null);
    const valores = registroId
      ? await CamposPersonalizadosDB.valores(
          auth.tenantId,
          registroId,
          campos.map((c) => c.id),
        )
      : [];
    return NextResponse.json({ campos, valores });
  } catch (err) {
    logger.error("[campos-personalizados.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("campos-personalizados-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_DEFINICION);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "campos-personalizados");
  if (rl) return rl;

  const parsed = crearSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }
  /* Inventar una pregunta en un formulario es escribir en su módulo: los de
     «Documentos del plan» exigen los roles del plan (ADR-467). Management tier
     pasa igual que en `requireAdmin`, así que hoy esto sólo cambia algo si se
     suma un rol a ROLES_DEFINICION. */
  if (!puedeEscribirFormulario(auth.role, parsed.data.formulario)) {
    return NextResponse.json(
      { error: "forbidden", message: `Tu rol no puede crear campos en ${nombreDelFormulario(parsed.data.formulario)}.` },
      { status: 403 },
    );
  }
  try {
    const campo = await CamposPersonalizadosDB.crear(
      auth.tenantId,
      parsed.data,
      auth.username ?? "unknown",
    );
    return NextResponse.json({ campo }, { status: 201 });
  } catch (err) {
    // La misma pregunta dos veces es un dato repetido, no una falla: 409 con
    // el nombre del que ya está, para que la pantalla lo pueda decir.
    if (err instanceof DemasiadosCamposError) {
      return NextResponse.json({ error: "demasiados_campos", message: err.message }, { status: 409 });
    }
    if (err instanceof ClaveDuplicadaError) {
      return NextResponse.json({ error: "clave_duplicada", message: err.message }, { status: 409 });
    }
    // Campo temporal contra un registro que no existe: se responde igual que en
    // `valores` para que la pantalla diga siempre lo mismo.
    if (err instanceof RegistroDesconocidoError) {
      return NextResponse.json({ error: "registro_desconocido", message: err.message }, { status: 409 });
    }
    // 404 y no 409: el 409 de esta ruta dice «ya existe» y la pantalla lo lee así.
    if (err instanceof CarpetaDesconocidaError) {
      return NextResponse.json({ error: "carpeta_desconocida", message: err.message }, { status: 404 });
    }
    if (err instanceof TipoFueraDeLugarError) {
      return NextResponse.json({ error: "validation_error", message: err.message }, { status: 400 });
    }
    logger.error("[campos-personalizados.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("campos-personalizados-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_DEFINICION);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "campos-personalizados");
  if (rl) return rl;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  try {
    const campo = await CamposPersonalizadosDB.actualizar(
      auth.tenantId,
      id,
      patch,
      auth.username ?? "unknown",
    );
    // `null` = no existe EN ESTE negocio (el WHERE lleva tenantId): 404, y
    // nunca un update a ciegas sobre el id de otro.
    if (!campo) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ campo });
  } catch (err) {
    logger.error("[campos-personalizados.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("campos-personalizados-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_DEFINICION);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "campos-personalizados");
  if (rl) return rl;

  const url = new URL(req.url);
  const parsed = z
    .object({ id: z.string().trim().min(1).max(40) })
    .safeParse({ id: url.searchParams.get("id") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const ok = await CamposPersonalizadosDB.eliminar(
      auth.tenantId,
      parsed.data.id,
      auth.username ?? "unknown",
    );
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[campos-personalizados.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
