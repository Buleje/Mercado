import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { getCacaoMarket, type PricePoint } from "@/lib/cacao/cacao-market";
import { CHACRA_CC_COMPRA_OFICIAL_FACTOR } from "@/lib/cacao/cacao-precio-regional";
import { graficoCacaoDiarioPNG, type PuntoCacaoSolKg } from "@/lib/cacao/cacao-chart-image";

/**
 * GET /api/cron/cacao-precio-diario
 *
 * Digest diario del cacao: precio de HOY en soles/kg (compra local) + gráfico
 * de los últimos 30 días, por correo. Pedido de Brandon (2026-08-18): "que
 * cada día me envíe el gráfico actualizado... de cuando está el cacao en
 * soles y subidas".
 *
 * El precio del cacao es un dato de mercado global, NO tenant-específico
 * (mismo criterio que /api/admin/cacao/market) — no hay que iterar tenants.
 *
 * Vercel cron: "0 12 * * *" (12:00 UTC = 7:00 am Perú).
 * Autorización: Bearer <CRON_SECRET>.
 * Destinatario: CACAO_DIGEST_EMAIL si está seteada, si no bulejelauea@gmail.com.
 */

const DAY_MS = 86_400_000;
const DIAS_GRAFICO = 30;
const DESTINATARIO_DEFAULT = "bulejelauea@gmail.com";

/**
 * Serie de los últimos `DIAS_GRAFICO` días en S//kg de compra local: mismo
 * cálculo que `CacaoTablaConversion` (ICE del día × FX REAL de ESE día, no el
 * de hoy) — un barrido de dos punteros porque ambas series vienen ordenadas
 * por fecha.
 */
function construirPuntosSolKg(series: PricePoint[], fxSeries: PricePoint[], fxActual: number | null): PuntoCacaoSolKg[] {
  const ventana = series.slice(-DIAS_GRAFICO);
  const out: PuntoCacaoSolKg[] = [];
  let fi = 0;
  let ultimoFx: number | null = fxActual;
  for (const p of ventana) {
    while (fi < fxSeries.length && fxSeries[fi].t <= p.t + DAY_MS / 2) { ultimoFx = fxSeries[fi].c; fi++; }
    if (ultimoFx == null) continue;
    out.push({ t: p.t, solKg: (p.c / 1000) * ultimoFx * CHACRA_CC_COMPRA_OFICIAL_FACTOR });
  }
  return out;
}

async function enviarDigest(params: {
  to: string;
  hoySolKg: number | null;
  changePct: number | null;
  usdTon: number | null;
  fechaTexto: string;
  fechaCorta: string;
  chartPng: Buffer | null;
}): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) {
    logger.warn("[cron/cacao-precio-diario] SMTP no configurado — email omitido");
    return;
  }

  const { to, hoySolKg, changePct, usdTon, fechaTexto, fechaCorta, chartPng } = params;
  const sube = changePct != null && changePct > 0;
  const baja = changePct != null && changePct < 0;
  const colorCambio = sube ? "#16A34A" : baja ? "#DC2626" : "#6B7280";
  const flecha = sube ? "▲" : baja ? "▼" : "■";
  const precioTxt = hoySolKg != null ? `S/ ${hoySolKg.toFixed(2)}` : "sin dato";
  const cambioTxt = changePct != null ? `${sube ? "+" : ""}${changePct.toFixed(1)}%` : "—";

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: `"Buleje · Cacao" <${smtpUser}>`,
    to,
    subject: `Cacao hoy: ${precioTxt}/kg (${cambioTxt}) — ${fechaCorta}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#00A0A0;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;">Cacao — precio de compra local</h2>
          <p style="color:#d9f4f4;margin:4px 0 0;">${fechaTexto}</p>
        </div>
        <div style="padding:20px 24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
          <div style="display:flex;align-items:baseline;gap:10px;">
            <span style="font-size:32px;font-weight:bold;color:#00A0A0;">${precioTxt}</span>
            <span style="font-size:14px;color:#666;">por kg seco</span>
          </div>
          <p style="margin:6px 0 16px;font-weight:bold;color:${colorCambio};">${flecha} ${cambioTxt} vs el cierre anterior</p>
          ${chartPng ? `<img src="cid:cacao-chart" alt="Gráfico del precio del cacao" style="width:100%;height:auto;border-radius:8px;border:1px solid #e0e0e0;" />` : `<p style="font-size:13px;color:#999;">(No se pudo generar el gráfico hoy — revisá el precio en el panel.)</p>`}
          ${usdTon != null ? `<p style="font-size:13px;color:#666;margin-top:14px;">Referencia internacional (ICE): USD ${usdTon.toFixed(0)} / tonelada.</p>` : ""}
          <p style="font-size:12px;color:#999;margin-top:12px;">Digest automático diario · Buleje · Panel → Cacao y Agricultura → Mercado.</p>
        </div>
      </div>
    `,
    attachments: chartPng
      ? [{ filename: `cacao-${fechaCorta.replace(/\s+/g, "-")}.png`, content: chartPng, contentType: "image/png", cid: "cacao-chart" }]
      : [],
  });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const market = await getCacaoMarket(true);
    const puntos = construirPuntosSolKg(market.price?.series ?? [], market.fxSeries, market.usdPen);

    const ahora = new Date();
    const fechaTexto = ahora.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Lima" });
    const fechaCorta = ahora.toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "America/Lima" });

    const chartPng = await graficoCacaoDiarioPNG({
      puntos,
      changePct: market.price?.changePct ?? null,
      usdTon: market.price?.value ?? null,
      fechaTexto,
    });

    const to = process.env.CACAO_DIGEST_EMAIL?.trim() || DESTINATARIO_DEFAULT;
    await enviarDigest({
      to,
      hoySolKg: puntos.at(-1)?.solKg ?? market.pricePenPerKg,
      changePct: market.price?.changePct ?? null,
      usdTon: market.price?.value ?? null,
      fechaTexto,
      fechaCorta,
      chartPng,
    });

    logActivity(
      "generate",
      "cacao_precio_diario",
      `Digest de cacao enviado — ${puntos.at(-1)?.solKg?.toFixed(2) ?? "—"} S//kg (${market.price?.changePct ?? "—"}%)`,
      undefined,
      "cron",
    ).catch((err) => logger.warn("[cron/cacao-precio-diario] activity log failed", { error: String(err) }));

    return NextResponse.json({
      ok: true,
      to,
      solKg: puntos.at(-1)?.solKg ?? null,
      changePct: market.price?.changePct ?? null,
      puntos: puntos.length,
      chartGenerado: !!chartPng,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    logger.error("[cron/cacao-precio-diario] Error fatal", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
