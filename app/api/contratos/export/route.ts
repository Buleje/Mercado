export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";

// ── Schema ──────────────────────────────────────────────────────────────────

const ExportSchema = z.object({
  contractId: z.string().min(1, "contractId requerido"),
  format: z.enum(["pdf", "docx", "txt"]),
});

// ── HTML Contract Generator ─────────────────────────────────────────────────

function generarHTMLContrato(contrato: Record<string, unknown>): string {
  const tipo = String(contrato.tipo || "CONTRATO");
  const tipoLabel = tipo.charAt(0) + tipo.slice(1).toLowerCase();
  const numero = String(contrato.numero || "");
  const fecha = contrato.fecha
    ? new Date(String(contrato.fecha)).toLocaleDateString("es-PE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "_______________";

  const clienteNombre = String(contrato.clienteNombre || "_______________");
  const clienteDoc = String(contrato.clienteDoc || "_______________");
  const descripcion = String(contrato.descripcion || "");
  const monto = Number(contrato.monto) || 0;
  const moneda = contrato.moneda === "USD" ? "US$" : "S/";
  const lugarFirma = String(contrato.lugarFirma || "Pucallpa");
  const parte2Nombre = String(contrato.parte2Nombre || "Buleje");
  const parte2Doc = String(contrato.parte2Doc || "");
  const condiciones = String(contrato.condiciones || "");
  const clausulas = Array.isArray(contrato.clausulas) ? contrato.clausulas : [];
  const fechaVencimiento = contrato.fechaVencimiento
    ? new Date(String(contrato.fechaVencimiento)).toLocaleDateString("es-PE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  // Build clauses HTML
  const clausulasLabels = [
    "PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA",
    "SEXTA", "SEPTIMA", "OCTAVA", "NOVENA", "DECIMA",
    "UNDECIMA", "DUODECIMA", "DECIMOTERCERA", "DECIMOCUARTA", "DECIMOQUINTA",
  ];

  let clausulasHTML = "";
  clausulas.forEach((clausula: string, i: number) => {
    const label = clausulasLabels[i] || `${i + 1}`;
    // Split on ":" to separate title from body if present
    const parts = clausula.split(":");
    const titulo = parts[0]?.trim() || `CLAUSULA ${label}`;
    const cuerpo = parts.length > 1 ? parts.slice(1).join(":").trim() : clausula;

    clausulasHTML += `
      <p style="margin-top: 1.5em;"><strong>CLAUSULA ${label}.- ${titulo}</strong></p>
      <p style="text-align: justify;">${cuerpo}</p>
    `;
  });

  // Add default clauses if none provided
  if (clausulas.length === 0) {
    clausulasHTML = `
      <p style="margin-top: 1.5em;"><strong>CLAUSULA PRIMERA.- DEL OBJETO</strong></p>
      <p style="text-align: justify;">${descripcion}</p>
      <p style="margin-top: 1.5em;"><strong>CLAUSULA SEGUNDA.- DEL MONTO</strong></p>
      <p style="text-align: justify;">El monto total del presente contrato asciende a ${moneda}${monto.toFixed(2)} (${monedaEnPalabras(monto, contrato.moneda === "USD" ? "dolares" : "soles")}).</p>
      <p style="margin-top: 1.5em;"><strong>CLAUSULA TERCERA.- DE LA VIGENCIA</strong></p>
      <p style="text-align: justify;">El presente contrato entra en vigencia a partir de su firma${fechaVencimiento ? ` y tendra validez hasta el ${fechaVencimiento}` : ""}.</p>
    `;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Contrato ${numero}</title>
  <style>
    @media print {
      body { margin: 0; }
      @page { size: A4; margin: 2.5cm; }
    }
  </style>
</head>
<body>
<div style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; max-width: 21cm; margin: 0 auto; padding: 2.5cm;">

  <h1 style="text-align: center; font-size: 14pt; font-weight: bold; text-transform: uppercase; margin-bottom: 0.5cm;">
    CONTRATO DE ${tipo}
  </h1>

  <p style="text-align: center; font-size: 10pt; color: #666; margin-bottom: 1cm;">
    N&deg; ${numero}
  </p>

  <p style="text-align: justify;">
    Conste por el presente documento, el contrato de ${tipoLabel} que celebran de una parte
    <strong>${clienteNombre}</strong>, identificado(a) con DNI/RUC N&deg; <strong>${clienteDoc}</strong>,
    a quien en adelante se le denominara <strong>"LA PRIMERA PARTE"</strong>; y de otra parte
    <strong>${parte2Nombre}</strong>${parte2Doc ? `, identificado(a) con DNI/RUC N&deg; <strong>${parte2Doc}</strong>` : ""},
    a quien en adelante se le denominara <strong>"LA SEGUNDA PARTE"</strong>;
    en los terminos y condiciones siguientes:
  </p>

  ${clausulasHTML}

  ${condiciones ? `
  <p style="margin-top: 1.5em;"><strong>CONDICIONES ADICIONALES</strong></p>
  <p style="text-align: justify;">${condiciones}</p>
  ` : ""}

  <p style="margin-top: 1.5em;"><strong>CLAUSULA FINAL.- DE LA CONFORMIDAD</strong></p>
  <p style="text-align: justify;">
    En senal de conformidad con todo lo estipulado, las partes firman el presente contrato
    en la ciudad de ${lugarFirma}, a los ${fecha}.
  </p>

  <div style="margin-top: 4cm; display: flex; justify-content: space-between;">
    <div style="text-align: center; width: 40%;">
      <div style="border-top: 1px solid black; padding-top: 0.5cm;">
        ${clienteNombre}<br/>DNI/RUC: ${clienteDoc}
      </div>
      <p style="font-size: 9pt; color: #666; margin-top: 0.3cm;">LA PRIMERA PARTE</p>
    </div>
    <div style="text-align: center; width: 40%;">
      <div style="border-top: 1px solid black; padding-top: 0.5cm;">
        ${parte2Nombre}<br/>${parte2Doc ? `DNI/RUC: ${parte2Doc}` : ""}
      </div>
      <p style="font-size: 9pt; color: #666; margin-top: 0.3cm;">LA SEGUNDA PARTE</p>
    </div>
  </div>

  <p style="text-align: center; font-size: 8pt; color: #999; margin-top: 3cm;">
    Documento generado por Buleje - Sistema ERP
  </p>

</div>
</body>
</html>`;
}

// ── Text contract generator ─────────────────────────────────────────────────

function generarTextoContrato(contrato: Record<string, unknown>): string {
  const tipo = String(contrato.tipo || "CONTRATO");
  const tipoLabel = tipo.charAt(0) + tipo.slice(1).toLowerCase();
  const numero = String(contrato.numero || "");
  const fecha = contrato.fecha
    ? new Date(String(contrato.fecha)).toLocaleDateString("es-PE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "_______________";

  const clienteNombre = String(contrato.clienteNombre || "");
  const clienteDoc = String(contrato.clienteDoc || "");
  const descripcion = String(contrato.descripcion || "");
  const monto = Number(contrato.monto) || 0;
  const moneda = contrato.moneda === "USD" ? "US$" : "S/";
  const lugarFirma = String(contrato.lugarFirma || "Pucallpa");
  const parte2Nombre = String(contrato.parte2Nombre || "Buleje");
  const parte2Doc = String(contrato.parte2Doc || "");
  const clausulas = Array.isArray(contrato.clausulas) ? contrato.clausulas : [];

  const clausulasLabels = [
    "PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA",
    "SEXTA", "SEPTIMA", "OCTAVA", "NOVENA", "DECIMA",
  ];

  let clausulasText = "";
  if (clausulas.length > 0) {
    clausulas.forEach((clausula: string, i: number) => {
      const label = clausulasLabels[i] || `${i + 1}`;
      clausulasText += `\nCLAUSULA ${label}.-\n${clausula}\n`;
    });
  } else {
    clausulasText = `
CLAUSULA PRIMERA.- DEL OBJETO
${descripcion}

CLAUSULA SEGUNDA.- DEL MONTO
El monto total del presente contrato asciende a ${moneda}${monto.toFixed(2)}.
`;
  }

  return `========================================
CONTRATO DE ${tipo}
N° ${numero}
========================================

Conste por el presente documento, el contrato de ${tipoLabel} que celebran:

PRIMERA PARTE: ${clienteNombre}
DNI/RUC: ${clienteDoc}

SEGUNDA PARTE: ${parte2Nombre}
${parte2Doc ? `DNI/RUC: ${parte2Doc}` : ""}

En los terminos y condiciones siguientes:
${clausulasText}
CLAUSULA FINAL.- DE LA CONFORMIDAD
En senal de conformidad, las partes firman el presente contrato
en la ciudad de ${lugarFirma}, a los ${fecha}.


___________________________          ___________________________
${clienteNombre.padEnd(30)} ${parte2Nombre}
DNI/RUC: ${clienteDoc.padEnd(22)} ${parte2Doc ? `DNI/RUC: ${parte2Doc}` : ""}
LA PRIMERA PARTE                     LA SEGUNDA PARTE


Documento generado por Buleje - Sistema ERP
`;
}

// ── DOCX HTML wrapper ───────────────────────────────────────────────────────

function generarDOCXHtml(contrato: Record<string, unknown>): string {
  // DOCX-compatible HTML: Word can open this with proper styling
  const htmlContent = generarHTMLContrato(contrato);

  return `<html xmlns:o='urn:schemas-microsoft-com:office:office'
  xmlns:w='urn:schemas-microsoft-com:office:word'
  xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="UTF-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Buleje ERP">
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page { size: 21cm 29.7cm; margin: 2.5cm; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; }
    h1 { text-align: center; font-size: 14pt; font-weight: bold; text-transform: uppercase; }
    p { text-align: justify; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  ${htmlContent.replace(/<!DOCTYPE html>[\s\S]*?<body>/, "").replace(/<\/body>[\s\S]*?<\/html>/, "")}
</body>
</html>`;
}

// ── Helper: monto en palabras (simplificado) ────────────────────────────────

function monedaEnPalabras(monto: number, monedaLabel: string): string {
  const entero = Math.floor(monto);
  const centavos = Math.round((monto - entero) * 100);
  return `${entero} con ${String(centavos).padStart(2, "0")}/100 ${monedaLabel}`;
}

// ── POST — Export contract ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ExportSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { contractId, format } = parsed.data;

  try {
    const nota = await prisma.note.findFirst({
      where: {
        id: contractId,
        tenantId: auth.tenantId,
        title: { startsWith: "CONTRATO:" },
      },
    });

    if (!nota) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }

    let contrato: Record<string, unknown>;
    try {
      contrato = JSON.parse(nota.content);
    } catch {
      return NextResponse.json({ error: "Datos del contrato corruptos" }, { status: 500 });
    }

    const numero = String(contrato.numero || "contrato");
    const filename = `${numero.replace(/\//g, "-")}`;

    logAudit({
      req,
      action: "EXPORT",
      entity: "Order",
      entityId: contractId,
      detail: `Contrato ${numero} exportado como ${format.toUpperCase()}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    switch (format) {
      case "pdf": {
        // Return HTML optimized for print (client uses window.print())
        const html = generarHTMLContrato(contrato);
        return new NextResponse(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `inline; filename="${filename}.html"`,
          },
        });
      }

      case "docx": {
        // Return DOCX-compatible HTML with Word namespaces
        const docxHtml = generarDOCXHtml(contrato);
        const blob = new Blob([docxHtml], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const buffer = Buffer.from(await blob.arrayBuffer());

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${filename}.doc"`,
          },
        });
      }

      case "txt": {
        const text = generarTextoContrato(contrato);
        return new NextResponse(text, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}.txt"`,
          },
        });
      }

      default:
        return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
    }
  } catch (e) {
    console.error("[contratos/export] POST error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
