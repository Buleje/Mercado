import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, applyRateLimitWithTenant, rateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { checkPermission, type Role } from "@/lib/auth/role-permissions";
import { AdminPreferencesDB } from "@/lib/db/admin-preferences.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { SuppliersDB } from "@/lib/db/purchases.db";
import { DocumentsDB } from "@/lib/db/documents.db";
import { ROLES_LECTURA_DOCS_PLAN } from "@/lib/forestal/plan-documentos-tipos";
import {
  DIAS_ENLACE,
  TOPE_ENLACES_HORA,
  envioSchema,
  guardadosVisibles,
  leerGuardados,
  normalizarTelefono,
  recordarContacto,
  unirContactos,
  type FuenteContacto,
  type FuenteGuardada,
} from "@/lib/forestal/contactos-envio";

/**
 * /api/admin/forestal/contactos-envio — a quién mandar los papeles del permiso
 * por WhatsApp (vista GTF del Libro TH › «Documentos del permiso», 08-10).
 *
 * GET  → { contactos } los números ya usados (sólo los que salieron de fuentes
 *        que el rol lee; los de antes sin fuente, sólo admin y dueño) +
 *        cuentas de Adelantos (sólo si el rol ve Adelantos) + directorio
 *        forestal + proveedores (si los ve); uno por número.
 * POST { telefono, nombre?, fuente?, documentos[], referencia? } → { enlaces }
 *        crea un enlace del Drive por documento (`DocumentShare`, vence en 7
 *        días, sólo si el rol ve la carpeta de ese papel), deja en la
 *        auditoría de CADA documento a qué número se mandó y recuerda el
 *        número con su fuente (sin schema: `admin_prefs.contactosEnvio`).
 *        Todo o nada: si un enlace no se crea o la auditoría no se escribe, los
 *        enlaces ya creados se revocan y no sale ninguno.
 *        En UN pedido (08-10): uno por documento chocaba con el tope STRICT del
 *        share del Drive (10 cada 15 min) al 11.º papel o al 3.er envío. El
 *        tope cuenta ENLACES por negocio (`TOPE_ENLACES_HORA`), no pedidos.
 *
 * La puerta es la de «Documentos del plan» (ADR-467): los mismos roles que ven
 * esas carpetas, y el Libro TH encendido. Son papeles con DNI.
 */

/* Cada método con su balde: compartir el prefijo mezclaba los 100/min de leer con los 10/15 min de enviar.
   Enviar suma un balde por NEGOCIO (no sólo por IP): cambiar de red no lo esquiva. */
async function entrar(req: NextRequest, limite: "GENEROUS" | "STRICT") {
  const auth = await requireAdmin(req, ROLES_LECTURA_DOCS_PLAN);
  if (auth instanceof NextResponse) return auth;
  const rl =
    limite === "STRICT"
      ? applyRateLimitWithTenant(req, "STRICT", auth.tenantId, "forestal-contactos-envio-post")
      : await applyRateLimit(req, "GENEROUS", "forestal-contactos-envio");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }
  return auth;
}

type Otro = { nombre: string | null | undefined; telefono: string | null | undefined; fuente: Exclude<FuenteContacto, "envio"> };

/**
 * Cobra `n` enlaces del balde del negocio (`TOPE_ENLACES_HORA` por hora). Un
 * envío de 20 papeles gasta 20, no 1. `null` = puede seguir; si no, el 429.
 */
function cobrarEnlaces(tenantId: string, n: number): NextResponse | null {
  for (let i = 0; i < n; i++) {
    const r = rateLimit(`forestal-contactos-envio-enlaces:tenant:${tenantId}`, TOPE_ENLACES_HORA, 60 * 60);
    if (!r.allowed) {
      const retryAfter = Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "rate_limited", message: `Tu negocio ya creó ${TOPE_ENLACES_HORA} enlaces en la última hora: espera unos minutos.`, retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }
  return null;
}

/** Deshace un envío a medias: revoca los enlaces ya creados (cada falla se loguea). */
async function revocar(tenantId: string, role: string, shareIds: readonly string[]): Promise<void> {
  await Promise.all(
    shareIds.map((id) =>
      DocumentsDB.revokeShare(tenantId, id, role).catch((err: unknown) =>
        logger.error("[contactos-envio] no se pudo revocar un enlace del envío fallido", { error: String(err), tenantId, shareId: id }),
      ),
    ),
  );
}

/** Una fuente que falla no deja sin contactos: se loguea y se sigue con las demás. */
async function fuente(nombre: string, tenantId: string, leer: () => Promise<Otro[]>): Promise<Otro[]> {
  try {
    return await leer();
  } catch (err) {
    logger.warn(`[contactos-envio] no se pudo leer ${nombre}`, { error: String(err), tenantId });
    return [];
  }
}

export const GET = withApiHandler("forestal-contactos-envio-get", async (req: NextRequest) => {
  const auth = await entrar(req, "GENEROUS");
  if (auth instanceof Response) return auth;
  const tenantId = auth.tenantId;
  /* Ley 29733: cada fuente de teléfonos, sólo si el rol ya la puede leer en su módulo. */
  const veAdelantos = checkPermission(auth.role as Role, "adelantos", "read");
  const veProveedores = checkPermission(auth.role as Role, "suppliers", "read");
  /* Los números ya usados, con la MISMA regla: sólo los que salieron de fuentes que el rol lee. */
  const puedeLeer = (f: FuenteGuardada) => (f === "adelantos" ? veAdelantos : f === "proveedor" ? veProveedores : true);
  const adminODueno = auth.role === "admin" || auth.role === "owner";
  try {
    const [prefs, adelantos, directorio, proveedores] = await Promise.all([
      AdminPreferencesDB.read(tenantId),
      veAdelantos
        ? fuente("adelantos", tenantId, async () =>
            (await AdelantosDB.listBeneficiarios(tenantId)).map((b) => ({ nombre: b.nombre, telefono: b.telefono, fuente: "adelantos" as const })),
          )
        : Promise.resolve([] as Otro[]),
      fuente("directorio", tenantId, async () =>
        (await ForestDirectorioDB.listarPartes(tenantId)).map((p) => ({ nombre: p.nombre, telefono: p.telefono, fuente: "directorio" as const })),
      ),
      veProveedores
        ? fuente("proveedores", tenantId, async () =>
            (await SuppliersDB.getAll(tenantId)).map((s) => ({ nombre: s.name, telefono: s.phone, fuente: "proveedor" as const })),
          )
        : Promise.resolve([] as Otro[]),
    ]);
    const guardados = guardadosVisibles(leerGuardados(prefs["contactosEnvio"]), { puedeLeer, adminODueno });
    const contactos = unirContactos(guardados, [...adelantos, ...directorio, ...proveedores]);
    return NextResponse.json({ contactos });
  } catch (err) {
    logger.error("[contactos-envio.GET] failed", { error: String(err), tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-contactos-envio-post", async (req: NextRequest) => {
  const auth = await entrar(req, "STRICT");
  if (auth instanceof Response) return auth;
  const tenantId = auth.tenantId;

  const crudo: unknown = await req.json().catch(() => null);
  const parsed = envioSchema.safeParse(crudo);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const telefono = normalizarTelefono(parsed.data.telefono);
  if (!telefono) {
    return NextResponse.json({ error: "telefono_invalido", message: "Ese número no es un celular: escribe 9 dígitos (o el número con su código de país)." }, { status: 400 });
  }

  /* Los enlaces creados hasta ahora: si algo falla a mitad, se revocan todos. */
  const creados: string[] = [];
  try {
    const ids = [...new Set(parsed.data.documentos)];
    /* Un papel que el rol no puede ver es «no existe» (el mismo 404 del Drive). */
    const visibles = await Promise.all(ids.map((id) => DocumentsDB.puedeVer(tenantId, id, auth.role)));
    if (visibles.some((v) => !v)) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const tope = cobrarEnlaces(tenantId, ids.length);
    if (tope) return tope;

    /* Los enlaces: el MISMO share del Drive (vuelve a mirar la carpeta con el rol). */
    const enlaces: { documentId: string; token: string; expiresAt: string }[] = [];
    for (const documentId of ids) {
      const share = await DocumentsDB.createShare(tenantId, documentId, {
        viewerRole: auth.role,
        createdById: auth.username,
        expiresInDays: DIAS_ENLACE,
      });
      if (!share) {
        await revocar(tenantId, auth.role, creados);
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      creados.push(share.id);
      enlaces.push({ documentId, token: share.token, expiresAt: new Date(share.expiresAt).toISOString() });
    }

    /* La auditoría de cada documento, ANTES de responder: un enlace público sin
       rastro de a qué número se mandó no sale (Ley 29733). */
    try {
      await DocumentsDB.logMany(
        tenantId,
        enlaces.map((e) => e.documentId),
        {
          actorId: auth.username,
          action: "share",
          metadata: {
            canal: "whatsapp",
            telefono,
            nombre: parsed.data.nombre ?? null,
            referencia: parsed.data.referencia ?? null,
            /* El comienzo del token de cada enlace: une la entrada con su `DocumentShare`. */
            tokens: Object.fromEntries(enlaces.map((e) => [e.documentId, e.token.slice(0, 8) + "…"])),
            expiresAt: enlaces.map((e) => e.expiresAt).sort().at(-1) ?? null,
          },
        },
        { estricto: true },
      );
    } catch (err) {
      logger.error("[contactos-envio] auditoría del envío falló: se revocan los enlaces", { error: String(err), tenantId });
      await revocar(tenantId, auth.role, creados);
      return NextResponse.json({ error: "audit_failed", message: "No se pudo registrar el envío: no se creó ningún enlace. Inténtalo de nuevo." }, { status: 500 });
    }

    /* Recordar el número no frena el envío: los enlaces ya existen y están auditados. */
    try {
      const prefs = await AdminPreferencesDB.read(tenantId);
      const contactos = recordarContacto(
        leerGuardados(prefs["contactosEnvio"]),
        { telefono, nombre: parsed.data.nombre, fuente: parsed.data.fuente },
        new Date().toISOString(),
      );
      await AdminPreferencesDB.write(tenantId, { contactosEnvio: contactos });
    } catch (err) {
      logger.warn("[contactos-envio] no se pudo recordar el número", { error: String(err), tenantId });
    }
    return NextResponse.json({ ok: true, telefono, enlaces });
  } catch (err) {
    logger.error("[contactos-envio.POST] failed", { error: String(err), tenantId });
    await revocar(tenantId, auth.role, creados);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
