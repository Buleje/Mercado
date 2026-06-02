import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { applyRateLimit } from "@/lib/rate-limit";
import { ReclamosDB } from "@/lib/db/reclamos.db";
import {
  LEGAL,
  EMAIL_RECLAMOS,
  PLAZO_RESPUESTA_DIAS_HABILES,
  INDECOPI,
} from "@/lib/legal";

/**
 * POST /api/libro-reclamaciones — Hoja de Reclamación del Libro de
 * Reclamaciones Virtual (Ley N° 29571 + D.S. 011-2011-PCM).
 *
 * v1: valida (Zod safeParse), genera un código correlativo y envía la hoja por
 * email al titular (EMAIL_RECLAMOS = REGISTRO legal) + acuse de recibo al
 * consumidor con el plazo de respuesta. Persistencia en DB + panel de respuesta
 * del superadmin = mejora siguiente (no bloquea la accesibilidad obligatoria).
 *
 * Endpoint público (sin tenant): el Libro es de la plataforma, no de un tenant.
 */

const schema = z.object({
  // ── Identificación del consumidor ──
  nombre: z.string().trim().min(2, "Nombre requerido").max(120),
  tipoDocumento: z.enum(["DNI", "CE", "Pasaporte", "RUC"]),
  numeroDocumento: z.string().trim().min(6, "Documento inválido").max(20),
  domicilio: z.string().trim().min(3, "Domicilio requerido").max(200),
  telefono: z.string().trim().min(6, "Teléfono inválido").max(25),
  email: z.string().trim().toLowerCase().email("Email inválido").max(120),
  esMenor: z.boolean().default(false),
  apoderado: z.string().trim().max(120).optional().default(""),
  // ── Identificación del bien contratado ──
  tipoBien: z.enum(["producto", "servicio"]),
  montoReclamado: z.coerce.number().min(0).max(1_000_000).optional().default(0),
  descripcionBien: z.string().trim().min(3, "Describe el bien/servicio").max(500),
  numeroPedido: z.string().trim().max(60).optional().default(""),
  tienda: z.string().trim().max(120).optional().default(""),
  // ── Detalle de la reclamación ──
  tipoReclamo: z.enum(["reclamo", "queja"]),
  detalle: z.string().trim().min(10, "Detalla tu reclamo (mín. 10 caracteres)").max(3000),
  pedidoConsumidor: z.string().trim().min(5, "Indica tu pedido al proveedor").max(2000),
  aceptaVeracidad: z.literal(true, { message: "Debes declarar la veracidad de los datos" }),
});

const RESEND_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL ?? "Buleje <noreply@buleje.pe>";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, "STRICT", "libro-reclamaciones");
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida" }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Revisa los datos del formulario.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const r = parsed.data;

  // ── Persistencia DB-first: el Libro debe conservar la hoja (D.S. 011-2011-PCM,
  // retención >= 2 años). Si falla, NO confirmamos: nunca decimos "registrado" sin
  // registro. El email es solo acuse secundario. ──
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = req.headers.get("user-agent") || null;

  let codigo: string;
  try {
    const saved = await ReclamosDB.create({
      nombre: r.nombre,
      tipoDocumento: r.tipoDocumento,
      numeroDocumento: r.numeroDocumento,
      domicilio: r.domicilio,
      telefono: r.telefono,
      email: r.email,
      esMenor: r.esMenor,
      apoderado: r.apoderado,
      tipoBien: r.tipoBien,
      montoReclamado: r.montoReclamado,
      descripcionBien: r.descripcionBien,
      numeroPedido: r.numeroPedido,
      tienda: r.tienda,
      tenantId: null,
      tipoReclamo: r.tipoReclamo,
      detalle: r.detalle,
      pedidoConsumidor: r.pedidoConsumidor,
      ip,
      userAgent,
    });
    codigo = saved.codigo;
  } catch (err) {
    console.error("[libro-reclamaciones] DB persist failed", String(err));
    return NextResponse.json(
      {
        ok: false,
        error:
          "No pudimos registrar tu reclamo en este momento. Intenta de nuevo en unos minutos.",
      },
      { status: 500 },
    );
  }

  const fecha = new Date().toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const tipoLabel = r.tipoReclamo === "reclamo" ? "RECLAMO" : "QUEJA";
  const tipoDesc =
    r.tipoReclamo === "reclamo"
      ? "Disconformidad relacionada a los productos o servicios."
      : "Malestar respecto a la atención al público (no relacionado a los productos/servicios).";

  // ── Email al titular = registro legal de la hoja ──
  const adminHtml = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
      <div style="background:#0d9488;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Libro de Reclamaciones Virtual</p>
        <h1 style="margin:4px 0 0;font-size:20px">Nuevo ${tipoLabel} · ${esc(codigo)}</h1>
        <p style="margin:6px 0 0;font-size:13px;opacity:.9">${fecha}</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px;background:#fff">
        <h2 style="font-size:14px;color:#0d9488;margin:0 0 8px">1. Consumidor</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 0;color:#64748b;width:40%">Nombre</td><td style="padding:4px 0;font-weight:600">${esc(r.nombre)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Documento</td><td style="padding:4px 0">${esc(r.tipoDocumento)} ${esc(r.numeroDocumento)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Domicilio</td><td style="padding:4px 0">${esc(r.domicilio)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Teléfono</td><td style="padding:4px 0">${esc(r.telefono)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Email</td><td style="padding:4px 0">${esc(r.email)}</td></tr>
          ${r.esMenor ? `<tr><td style="padding:4px 0;color:#64748b">Menor de edad</td><td style="padding:4px 0">Sí — Apoderado: ${esc(r.apoderado || "—")}</td></tr>` : ""}
        </table>
        <h2 style="font-size:14px;color:#0d9488;margin:18px 0 8px">2. Bien contratado</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 0;color:#64748b;width:40%">Tipo</td><td style="padding:4px 0;text-transform:capitalize">${esc(r.tipoBien)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Monto reclamado</td><td style="padding:4px 0">${r.montoReclamado ? `S/ ${r.montoReclamado.toFixed(2)}` : "—"}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Descripción</td><td style="padding:4px 0">${esc(r.descripcionBien)}</td></tr>
          ${r.numeroPedido ? `<tr><td style="padding:4px 0;color:#64748b">N° de pedido</td><td style="padding:4px 0">${esc(r.numeroPedido)}</td></tr>` : ""}
          ${r.tienda ? `<tr><td style="padding:4px 0;color:#64748b">Tienda</td><td style="padding:4px 0">${esc(r.tienda)}</td></tr>` : ""}
        </table>
        <h2 style="font-size:14px;color:#0d9488;margin:18px 0 8px">3. Detalle del ${tipoLabel.toLowerCase()}</h2>
        <p style="font-size:13px;color:#64748b;margin:0 0 8px">${tipoDesc}</p>
        <p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:14px;white-space:pre-wrap;margin:0 0 12px">${esc(r.detalle)}</p>
        <p style="font-size:13px;color:#64748b;margin:0 0 4px"><strong>Pedido del consumidor:</strong></p>
        <p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:14px;white-space:pre-wrap;margin:0">${esc(r.pedidoConsumidor)}</p>
        <div style="margin-top:18px;padding:12px 14px;background:#fef9c3;border:1px solid #fde047;border-radius:8px;font-size:13px;color:#713f12">
          ⏱️ Plazo legal de respuesta: <strong>${PLAZO_RESPUESTA_DIAS_HABILES} días hábiles</strong> (D.S. 011-2011-PCM). Responde directamente al correo del consumidor: <strong>${esc(r.email)}</strong>.
        </div>
      </div>
    </div>`;

  // ── Acuse de recibo al consumidor ──
  const userHtml = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <div style="background:#0d9488;color:#fff;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="margin:0;font-size:20px">Recibimos tu ${tipoLabel.toLowerCase()}</h1>
        <p style="margin:8px 0 0;font-size:24px;font-weight:800;letter-spacing:.04em">${esc(codigo)}</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px;background:#fff;font-size:14px;line-height:1.6">
        <p style="margin:0 0 12px">Hola ${esc(r.nombre)}, registramos tu ${tipoLabel.toLowerCase()} en nuestro Libro de Reclamaciones Virtual con fecha ${fecha}.</p>
        <p style="margin:0 0 12px">Te responderemos en un plazo máximo de <strong>${PLAZO_RESPUESTA_DIAS_HABILES} días hábiles</strong> a este correo.</p>
        <p style="margin:0 0 12px;color:#64748b">Guarda tu código <strong>${esc(codigo)}</strong> para cualquier seguimiento.</p>
        <hr style="border:0;border-top:1px solid #e2e8f0;margin:16px 0" />
        <p style="margin:0;font-size:12px;color:#94a3b8">La presentación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para denunciar ante el INDECOPI (${INDECOPI.url}). Titular: ${esc(LEGAL.razonSocial.includes("PENDIENTE") ? LEGAL.nombreComercial : LEGAL.razonSocial)}.</p>
      </div>
    </div>`;

  if (resend) {
    // Fire-and-forget: si el email falla, igual confirmamos (el código queda).
    resend.emails
      .send({
        from: FROM,
        to: EMAIL_RECLAMOS,
        subject: `📕 Nuevo ${tipoLabel} ${codigo} — Libro de Reclamaciones`,
        html: adminHtml,
      })
      .catch((err) => console.error("[libro-reclamaciones] email send failed", String(err)));
    resend.emails
      .send({
        from: FROM,
        to: r.email,
        subject: `Recibimos tu ${tipoLabel.toLowerCase()} — ${codigo} — ${LEGAL.nombreComercial}`,
        html: userHtml,
      })
      .catch((err) => console.error("[libro-reclamaciones] email send failed", String(err)));
  }

  return NextResponse.json({
    ok: true,
    codigo,
    plazoDias: PLAZO_RESPUESTA_DIAS_HABILES,
  });
}
