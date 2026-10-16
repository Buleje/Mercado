import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { ForestGtfColaMonteDB } from "@/lib/db/forest-gtf-cola-monte.db";
import { ForestGtfMatricialDB } from "@/lib/db/forest-gtf-matricial.db";
import { CtpGuiaDocumentosDB } from "@/lib/db/ctp-guia-documentos.db";
import { correlativoDeGuia, normalizarCelular, type AccionTrabajo, type TrabajoCola } from "@/lib/forestal/gtf-cola-monte";

/**
 * /api/admin/forestal/loth/gtf-cola — la cola «Por imprimir» del monte (16-10).
 *
 * GET   → `{ trabajos, contacto }` (la cola entera: a lo sumo 300 trabajos). Al
 *       leer cierra los envíos de guías anuladas o borradas después de mandarlas.
 * POST  `{ gtfId, hojas, perfilId, contacto?, reimprimir?: { motivo } }` → mete
 *       la guía en la cola (o actualiza su envío pendiente). El N° y el titular
 *       los pone el SERVIDOR desde la guía viva de este tenant, nunca el
 *       cliente. 422 si la impresora no existe. 409 `ya_impresa` si ya salió
 *       del talonario (impresa, observada o confirmada): otro envío gastaría
 *       otra hoja numerada; sólo `reimprimir` con motivo la manda de nuevo.
 * PATCH `{ id, accion: "impresa" | "foto" | "confirmar" | "anular", … }` o
 *       `{ contacto }` (el celular del monte). La foto tiene que ser un
 *       documento de ESA guía (documentos de la guía, ADR-482): no se ata un
 *       archivo ajeno.
 *
 * Quien imprime en el monte es el almacenero o el encargado del campamento:
 * los mismos roles que los papeles de la guía.
 */

const ROLES: readonly AdminRole[] = ["admin", "almacenero", "owner"];

const idSchema = z.string().trim().min(1).max(64);
const celularSchema = z.string().trim().max(20);

const postSchema = z.object({
  gtfId: idSchema,
  hojas: z.array(z.enum(["guia", "lista"])).min(1).max(2),
  perfilId: z.string().trim().min(1).max(64),
  contacto: celularSchema.optional(),
  /** «Reimprimir en otra hoja» (la hoja se dañó): el motivo queda escrito en el envío. */
  reimprimir: z.object({ motivo: z.string().trim().min(3, "Escribe por qué se reimprime").max(200) }).optional(),
});

const patchSchema = z.union([
  z.object({ id: idSchema, accion: z.literal("impresa") }),
  z.object({ id: idSchema, accion: z.literal("foto"), fotoDocId: idSchema }),
  z.object({
    id: idSchema,
    accion: z.literal("confirmar"),
    numeroHoja: z.string().trim().min(1, "Escribe el N° de la hoja").max(20).regex(/\d/, "El N° de la hoja lleva números"),
    fotoDocId: idSchema.optional(),
  }),
  z.object({ id: idSchema, accion: z.literal("anular"), motivo: z.string().trim().max(200).optional() }),
  z.object({ contacto: celularSchema }),
]);

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

/** El 409 dice en qué hoja salió y cómo se reimprime de verdad. */
function mensajeYaImpresa(t: TrabajoCola): string {
  const hoja = t.numeroHoja ?? correlativoDeGuia(t.numeroGuia);
  const donde = t.estado === "confirmada" && hoja ? `Ya está impresa en la hoja N° ${hoja}.` : "En el monte ya la imprimieron.";
  return `${donde} Si la hoja se dañó, usa «Reimprimir en otra hoja» con el motivo.`;
}

const celularInvalido = () =>
  NextResponse.json(
    { error: "validation_error", message: "Ese celular no sirve: 9 dígitos (987 654 321) o con código de país." },
    { status: 400 },
  );

export const GET = withApiHandler("forestal-loth-gtf-cola-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    return NextResponse.json(await ForestGtfColaMonteDB.leerAlDia(auth.tenantId));
  } catch (err) {
    logger.error("[loth.gtf-cola.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-loth-gtf-cola-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues.find((i) => i.message && !i.message.startsWith("Invalid"))?.message;
    return NextResponse.json({ error: "validation_error", ...(message ? { message } : {}), issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const { gtfId, hojas, perfilId, contacto, reimprimir } = parsed.data;
  const celular = contacto ? normalizarCelular(contacto) : null;
  if (contacto && !celular) return celularInvalido();
  try {
    const g = await ForestGtfDB.getById(auth.tenantId, gtfId);
    if (!g) return NextResponse.json({ error: "not_found", message: "No encontramos esa guía." }, { status: 404 });
    if (g.status === "anulada") return NextResponse.json({ error: "anulada", message: "La guía está anulada: no se imprime." }, { status: 409 });
    /* Una impresora borrada no tiene calibración: el monte bajaría una hoja que no sale. */
    const perfiles = await ForestGtfMatricialDB.perfiles(auth.tenantId);
    if (!perfiles.some((p) => p.id === perfilId)) {
      return NextResponse.json({ error: "perfil_no_existe", message: "Esa impresora ya no está: elige otra." }, { status: 422 });
    }
    const r = await ForestGtfColaMonteDB.crear(
      auth.tenantId,
      { gtfId: g.id, numeroGuia: g.gtfNumber, titular: g.titularName ?? "", hojas, perfilId, ...(reimprimir ? { reimprimir } : {}) },
      celular,
      auth.username ?? "unknown",
    );
    if (!r.ok) return NextResponse.json({ error: "ya_impresa", message: mensajeYaImpresa(r.trabajo), trabajo: r.trabajo }, { status: 409 });
    return NextResponse.json({ trabajo: r.trabajo, reenviado: r.reenviado, contacto: r.almacen.contacto }, { status: r.reenviado ? 200 : 201 });
  } catch (err) {
    logger.error("[loth.gtf-cola.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-loth-gtf-cola-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues.find((i) => i.message && !i.message.startsWith("Invalid"))?.message;
    return NextResponse.json({ error: "validation_error", ...(message ? { message } : {}), issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const user = auth.username ?? "unknown";
  try {
    const b = parsed.data;
    if (!("id" in b)) {
      const celular = b.contacto ? normalizarCelular(b.contacto) : null;
      if (b.contacto && !celular) return celularInvalido();
      return NextResponse.json({ contacto: await ForestGtfColaMonteDB.guardarContacto(auth.tenantId, celular, user) });
    }
    const fotoDocId = "fotoDocId" in b ? b.fotoDocId : undefined;
    if (fotoDocId) {
      /* La foto tiene que ser un papel de ESA guía, del tenant y visible para este rol. */
      const alm = await ForestGtfColaMonteDB.leer(auth.tenantId);
      const t = alm.trabajos.find((x) => x.id === b.id);
      if (!t) return NextResponse.json({ error: "no_existe", message: "Ese envío ya no está en la cola." }, { status: 404 });
      const doc = await CtpGuiaDocumentosDB.documentoDeGuia(auth.tenantId, fotoDocId, t.numeroGuia, auth.role);
      if (!doc) return NextResponse.json({ error: "foto_ajena", message: "Esa foto no está entre los papeles de la guía." }, { status: 400 });
    }
    const accion: AccionTrabajo =
      b.accion === "impresa"
        ? { tipo: "impresa" }
        : b.accion === "foto"
          ? { tipo: "foto", fotoDocId: b.fotoDocId }
          : b.accion === "confirmar"
            ? { tipo: "confirmar", numeroHoja: b.numeroHoja, ...(b.fotoDocId ? { fotoDocId: b.fotoDocId } : {}) }
            : { tipo: "anular", ...(b.motivo ? { motivo: b.motivo } : {}) };
    const r = await ForestGtfColaMonteDB.accion(auth.tenantId, b.id, accion, user);
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.mensaje }, { status: r.error === "no_existe" ? 404 : 409 });
    return NextResponse.json({ trabajo: r.trabajo });
  } catch (err) {
    logger.error("[loth.gtf-cola.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
