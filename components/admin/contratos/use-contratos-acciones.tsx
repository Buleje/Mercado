import type { ContratoAPI } from "./constantes-contratos";
import { csrfHeaders } from "@/lib/csrf-client";
import { TIPO_LABELS } from "@/lib/types/contracts";
import { PLANTILLAS } from "@/lib/contratos/plantillas";
import ActionMenu from "@/components/admin/shared/action-menu";
import { MoreHorizontal, Eye, Printer, Download } from "@buleje/design-system/icons";
import type { HastaContratosWizard } from "./use-contratos-wizard";
export function useContratosAcciones(previo: HastaContratosWizard) {
  const { setArchivando, setArchivoError, setDetalle, setContratos, setRenovando, setRenovarError,
    mesesRenovacion, fetchContratos, setSelected, setActiveTab, setSelectedTemplate, setWizardData,
    setWizardStep } = previo;
  // ── Download Helpers ──────────────────────────────────────────────────

  /**
   * El texto del contrato vive en el servidor. El localStorage queda sólo como
   * rescate de los contratos creados antes de la migración, cuyo texto nunca
   * salió del navegador que los generó.
   */
  const getContractContent = (c: ContratoAPI): { content: string; summary: string } => {
    if (c.contenido?.trim()) return { content: c.contenido, summary: c.resumen || c.descripcion };
    try {
      const raw = localStorage.getItem(`contract-content-${c.id}`);
      if (raw) { const p = JSON.parse(raw); return { content: p.content || "", summary: p.summary || "" }; }
    } catch { /* el rescate es best-effort: si no está, caemos a las cláusulas */ }
    return { content: c.clausulas.join("\n\n"), summary: c.resumen || c.descripcion };
  };

  /**
   * PDF de verdad, armado en el servidor con pdf-lib. Antes esto abría una
   * ventana con HTML y llamaba a `window.print()`: no quedaba archivo, así que
   * el contrato no se podía guardar, firmar ni mandar.
   */
  const downloadPDF = (c: ContratoAPI) => {
    window.open(`/api/contratos/${c.id}/pdf?download=1`, "_blank", "noopener");
  };

  const verPDF = (c: ContratoAPI) => {
    window.open(`/api/contratos/${c.id}/pdf`, "_blank", "noopener");
  };

  /** Deja el contrato archivado en Documentación, con su vencimiento. */
  const archivarEnDrive = async (c: ContratoAPI) => {
    setArchivando(c.id);
    setArchivoError(null);
    try {
      const res = await fetch(`/api/contratos/${c.id}/pdf`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "No se pudo archivar");
      setDetalle(d => (d && d.id === c.id ? { ...d, documentId: json.documentId, hashSha256: json.hash } : d));
      setContratos(prev => prev.map(x => (x.id === c.id ? { ...x, documentId: json.documentId } : x)));
    } catch (e) {
      setArchivoError(e instanceof Error ? e.message : "No se pudo archivar");
    } finally {
      setArchivando(null);
    }
  };

  const downloadWord = (c: ContratoAPI) => {
    const { content, summary } = getContractContent(c);
    const tipoLabel = TIPO_LABELS[c.tipo] || c.tipo;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Contrato ${c.numero}</title>
<style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.6;}h1{text-align:center;font-size:14pt;text-transform:uppercase;}p{text-align:justify;margin:8pt 0;}</style></head>
<body><h1>CONTRATO DE ${tipoLabel.toUpperCase()}</h1><p style="text-align:center;color:#555;">N.o ${c.numero}</p>
${summary ? `<p style="background:#f0f0e0;padding:10px;border-left:4px solid var(--accent);"><b>RESUMEN:</b> ${summary}</p>` : ""}
${content.split("\n\n").map(p => `<p>${p}</p>`).join("")}
<br/><br/><table width="100%"><tr><td width="45%" style="border-top:1px solid #000;text-align:center;padding-top:8px;">PRIMERA PARTE</td><td width="10%"></td><td width="45%" style="border-top:1px solid #000;text-align:center;padding-top:8px;">SEGUNDA PARTE</td></tr></table>
</body></html>`;
    const blob = new Blob(["\ufeff" + html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Contrato_${c.numero}.doc`; a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (c: ContratoAPI) => {
    const { content, summary } = getContractContent(c);
    const text = `CONTRATO N.o ${c.numero}\n\nRESUMEN: ${summary}\n\n${content}`;
    try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
  };

  // ── Renovar ───────────────────────────────────────────────────────────

  /**
   * Crea el contrato sucesor y deja el actual marcado como renovado. Se abre
   * el nuevo para que quede claro qué se firmó y desde cuándo rige.
   */
  const renovarContrato = async (c: ContratoAPI) => {
    setRenovando(true);
    setRenovarError(null);
    try {
      const res = await fetch(`/api/contratos/${c.id}/renovar`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ meses: mesesRenovacion }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "No se pudo renovar");
      await fetchContratos();
      setSelected(json.contrato ?? null);
    } catch (e) {
      setRenovarError(e instanceof Error ? e.message : "No se pudo renovar");
    } finally {
      setRenovando(false);
    }
  };

  // ── Duplicar ──────────────────────────────────────────────────────────

  /**
   * Vuelve a abrir el asistente con los datos del contrato original. Los datos
   * llegan del servidor (`datos`), así que duplicar funciona desde cualquier
   * dispositivo — antes dependía del localStorage del navegador que lo creó.
   */
  const duplicarContrato = (c: ContratoAPI) => {
    const tpl =
      PLANTILLAS.find(t => t.id === c.plantillaId) ??
      PLANTILLAS.find(t => t.tipo === c.tipo);

    let datos: Record<string, string> = c.datos ?? {};
    if (Object.keys(datos).length === 0) {
      try {
        const raw = localStorage.getItem(`contract-content-${c.id}`);
        if (raw) datos = JSON.parse(raw).data ?? {};
      } catch { /* rescate de contratos viejos: si no está, arranca vacío */ }
    }

    if (!tpl) {
      setActiveTab("plantillas");
      setSelected(null);
      return;
    }
    setSelectedTemplate(tpl);
    setWizardData(datos);
    setWizardStep(0);
    setSelected(null);
    setActiveTab("crear");
  };

  // ── «⋯» por contrato (fila y tarjeta): ver, PDF y Word. La fila entera ya abre
  // la ficha; los dos íconos de 28 px de cada fila pasaron acá (11-10).
  const menuDeContrato = (c: ContratoAPI) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className="inline-flex" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <ActionMenu
        label={`Acciones del contrato ${c.numero}`}
        icon={MoreHorizontal}
        soloIcono
        size="md"
        className="w-12 border-transparent bg-transparent shadow-none"
        actions={[
          { id: "ver", label: "Ver contrato", hint: "Firmantes, historial y vencimiento", icon: Eye, onSelect: () => setSelected(c) },
          { id: "pdf", label: "Imprimir o guardar PDF", icon: Printer, onSelect: () => downloadPDF(c) },
          { id: "word", label: "Descargar Word", icon: Download, onSelect: () => downloadWord(c) },
        ]}
      />
    </div>
  );

  return { getContractContent, downloadPDF, verPDF, archivarEnDrive, downloadWord, copyToClipboard,
    renovarContrato, duplicarContrato, menuDeContrato };
}
export type HastaContratosAcciones = HastaContratosWizard & ReturnType<typeof useContratosAcciones>;