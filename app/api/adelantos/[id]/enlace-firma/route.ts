import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { EnlaceFirmaSchema } from "@/lib/adelantos/entregar-schema";
import { RUTA_FIRMA_PUBLICA, type EnlaceFirmaCreado } from "@/lib/adelantos/entregar-tipos";
import { enlaceWhatsAppConTexto } from "@/lib/adelantos/contacto";
import { montoConMoneda } from "@/lib/adelantos/comprobante";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";

/**
 * Enlace de firma de UN uso (ADR-491, D7): la persona firma el recibo en su
 * celular. La base guarda sólo el sha256 del token; el enlace con el token sale
 * UNA vez, en la respuesta del POST. Generar otro revoca el pendiente.
 */

function baseUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || req.nextUrl.origin;
}

/** GET — los enlaces del adelanto (estado, vencimiento, quién), nunca el token. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  const rl = await applyRateLimit(req, "DRIVE_READ", "adelantos-enlace-firma");
  if (rl) return rl;
  const { id } = await params;
  try {
    if (!(await AdelantosDB.comprobanteDe(auth.tenantId, id))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ enlaces: await AdelantoFirmasDB.listarEnlaces(auth.tenantId, id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[adelantos/enlace-firma] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** POST `{ pideHuella?, horas? }` — crea el enlace (48 h por defecto) y lo devuelve con el botón de WhatsApp. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-enlace-firma"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;

  const texto = await req.text().catch(() => "");
  let cuerpo: unknown = {};
  if (texto.trim()) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      return NextResponse.json({ error: "Datos inválidos", issues: ["El cuerpo no es JSON."] }, { status: 400 });
    }
  }
  const parsed = EnlaceFirmaSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  try {
    const r = await AdelantoFirmasDB.crearEnlace(auth.tenantId, id, { creadoPor: auth.username, ...parsed.data });
    if (r === "no-existe") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (r === "anulado") return NextResponse.json({ error: "Este adelanto está anulado: no se firma.", code: "anulado" }, { status: 409 });
    const a = await AdelantosDB.datosParaFirmar(auth.tenantId, id);
    const url = `${baseUrl(req)}${RUTA_FIRMA_PUBLICA}/${r.token}`;
    const nombre = a?.beneficiario.nombre.split(/\s+/)[0] ?? "";
    const monto = a ? montoConMoneda(a.montoAdelantado, a.moneda) : "";
    const mensaje = `Hola ${nombre}, firma el recibo del adelanto${a?.codigoOperacion ? ` ${a.codigoOperacion}` : ""}${monto ? ` de ${monto}` : ""} desde tu celular: ${url} (vence en ${parsed.data.horas} h).`;
    const enlace: EnlaceFirmaCreado = { ...r.enlace, url, whatsapp: enlaceWhatsAppConTexto(a?.beneficiario.telefono, mensaje) };
    logActivity(
      "Enlace de firma",
      "adelanto",
      `Adelanto ${a?.codigoOperacion ?? id}: enlace para firmar en el celular (${parsed.data.horas} h${parsed.data.pideHuella ? ", con huella" : ""})`,
      id,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.error("[adelantos/enlace-firma] logActivity failed", { error: String(err) }));
    return NextResponse.json({ enlace }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[adelantos/enlace-firma] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
