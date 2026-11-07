"use client";

/**
 * «Tus documentos» (Configuración › Datos del negocio): vista previa del
 * membrete común (ADR-514) con lo que estás escribiendo en este formulario,
 * lo que falta para que salga completo y un PDF de ejemplo.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { datosDelMembrete } from "@/lib/documentos/membrete-pdf";
import { membreteHtml } from "@/lib/documentos/membrete-html";

interface Props {
  nombre: string;
  razonSocial: string;
  ruc: string;
  direccion: string;
  telefono: string;
  logoUrl: string;
  pie: string;
}

const ANCHO_A4_PX = 794;
const ESCALA = 0.42;

export function TusDocumentos({ nombre, razonSocial, ruc, direccion, telefono, logoUrl, pie }: Props) {
  const [bajando, setBajando] = useState(false);
  const membrete = useMemo(
    () => ({
      nombre: nombre.trim() || null,
      razonSocial: razonSocial.trim() || null,
      ruc: ruc.trim() || null,
      direccion: direccion.trim() || null,
      telefono: telefono.trim() || null,
      logoUrl: logoUrl.trim() || null,
      pie: pie.trim() || null,
    }),
    [nombre, razonSocial, ruc, direccion, telefono, logoUrl, pie],
  );
  const hoy = useMemo(() => new Date(), []);
  const html = useMemo(
    () => membreteHtml(datosDelMembrete(membrete, { tipo: "Cotización", codigo: "COT-0001" }), { emitido: hoy }),
    [membrete, hoy],
  );

  const avisos = [
    !membrete.logoUrl && { k: "logo", texto: "Sin logo", detalle: "Tus documentos salen con la inicial de tu negocio en vez del logo. Súbelo en «Logo e imágenes»." },
    !membrete.ruc && { k: "ruc", texto: "Falta RUC", detalle: "Tus proveedores y clientes lo piden para facturarte. Llénalo en «Identidad y contacto»." },
    !membrete.nombre && { k: "nombre", texto: "Falta nombre comercial", detalle: "Sin nombre comercial, el título del documento sale con tu razón social." },
  ].filter((a): a is { k: string; texto: string; detalle: string } => !!a);

  const verEjemplo = async () => {
    setBajando(true);
    try {
      const [{ jsPDF }, pdf, cargar] = await Promise.all([
        import("jspdf"),
        import("@/lib/documentos/membrete-pdf"),
        import("@/lib/documentos/membrete-cargar"),
      ]);
      const logo = membrete.logoUrl ? await cargar.logoDelDocumento(membrete.logoUrl) : null;
      const datos = pdf.datosDelMembrete({ ...membrete, logo }, { tipo: "Documento de ejemplo", codigo: "EJ-0001", fecha: pdf.emitidoEnLima(new Date()) });
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const y = pdf.dibujarMembrete(doc, datos);
      doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text("Así encabezan tus cotizaciones, recibos, contratos y reportes.", pdf.margenDelMembrete(), y + 8);
      pdf.dibujarPies(doc, datos);
      doc.save("ejemplo-de-documento.pdf");
    } catch (err) {
      toast.error("No se pudo armar el ejemplo", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
      <div
        className="relative mx-auto overflow-hidden rounded-lg border border-[var(--rule-base)] shadow-sm"
        style={{ width: ANCHO_A4_PX * ESCALA, height: 260, background: "Canvas", colorScheme: "light" }}
        role="img"
        aria-label="Vista previa del encabezado de tus documentos"
      >
        <div style={{ width: ANCHO_A4_PX, padding: "40px 48px", transform: `scale(${ESCALA})`, transformOrigin: "top left" }}>
          <style>{html.estilos}</style>
          <div dangerouslySetInnerHTML={{ __html: html.cabecera }} />
          <div style={{ height: 120 }} />
          <div dangerouslySetInnerHTML={{ __html: html.pie }} />
        </div>
      </div>
      <div className="space-y-3">
        {avisos.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Tus documentos salen completos: logo, nombre y RUC.</p>
        ) : (
          <ul className="space-y-1.5">
            {avisos.map((a) => (
              <li key={a.k} className="flex items-center gap-2 text-sm font-semibold text-[var(--data-warning-ink)]">
                {a.texto}
                <InfoTip title={a.texto} what={a.detalle} />
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="secondary" onClick={verEjemplo} disabled={bajando}>
          <Download className="h-4 w-4" aria-hidden /> {bajando ? "Armando…" : "Ver un ejemplo"}
        </Button>
      </div>
    </div>
  );
}
