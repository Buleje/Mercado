import { sinDato } from "@/lib/errores/sin-dato";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { type NotaCredito, type NCTemplate, STATUS_META } from "@/components/admin/notas-credito/nc-compartido";
import { useNcEstado } from "@/components/admin/notas-credito/hooks/use-nc-estado";
import { useNcSelector } from "@/components/admin/notas-credito/hooks/use-nc-selector";
import { useNcLista } from "@/components/admin/notas-credito/hooks/use-nc-lista";

/** Crear, emitir, anular, plantillas, PDF y WhatsApp. Parte de `useNotasCredito`. */
export function useNcAcciones(previo: ReturnType<typeof useNcEstado> & ReturnType<typeof useNcSelector> & ReturnType<typeof useNcLista>) {
  const {
    selected, setSelected, checkedIds, setCheckedIds, templates, setTemplates,
    setShowTemplates, setShowNew, setWizardStep, setCreating, setCreateError, form, setForm,
    setPickerSearch, setPickerDocType, setSelectedVenta, confirm, prompt, fetchNotas, montoNum, totalConIgv,
    filteredNotas,
  } = previo;
  // ── CRUD Operations ───────────────────────────────────────────────────────
  const resetWizard = () => {
    setShowNew(false); setWizardStep(0); setCreateError(null);
    setForm({ orderId: "", codigoMotivo: "", descripcionMotivo: "", monto: "", notasText: "" });
    setSelectedVenta(null); setPickerSearch(""); setPickerDocType("all");
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (montoNum <= 0) { setCreateError("Monto inv\u00e1lido"); return; }
    if (!form.codigoMotivo) { setCreateError("Selecciona un motivo"); return; }
    if (!form.descripcionMotivo.trim()) { setCreateError("Descripci\u00f3n del motivo requerida"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/notas-credito", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          saleId: form.orderId.trim() || undefined,
          motivoCodigo: form.codigoMotivo,
          motivoDesc: form.descripcionMotivo.trim(),
          ...(totalConIgv !== null ? { totalConIgv } : { monto: montoNum }),
          notas: form.notasText.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(typeof err.error === "string" ? err.error : "Error al crear nota de cr\u00e9dito");
      }
      resetWizard();
      fetchNotas();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error desconocido");
    } finally { setCreating(false); }
  };

  const handleDuplicate = (nc: NotaCredito) => {
    setForm({ orderId: nc.saleId ?? nc.orderId ?? "", codigoMotivo: nc.motivoCodigo, descripcionMotivo: nc.motivoDesc, monto: String(nc.monto), notasText: nc.notas ?? "" });
    setShowNew(true); setWizardStep(1); setSelected(null);
  };

  const handleEmitSunat = async (nc: NotaCredito) => {
    if (!(await confirm({
      title: "\u00bfEmitir nota de cr\u00e9dito a SUNAT?",
      description: "Esta acci\u00f3n no se puede deshacer.",
      intent: "warning",
      confirmLabel: "S\u00ed, emitir",
    }))) return;
    try {
      const res = await fetch(`/api/notas-credito/${nc.id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status: "EMITIDA" }) });
      if (res.ok) fetchNotas();
    } catch { /* silent */ }
  };

  const handleAnular = async (nc: NotaCredito) => {
    if (!(await confirm({
      title: "\u00bfAnular esta nota de cr\u00e9dito?",
      intent: "danger",
      confirmLabel: "S\u00ed, anular",
    }))) return;
    try {
      const res = await fetch(`/api/notas-credito/${nc.id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status: "ANULADA" }) });
      if (res.ok) { fetchNotas(); if (selected?.id === nc.id) setSelected(null); }
    } catch { /* silent */ }
  };

  // ── Bulk emit ─────────────────────────────────────────────────────────────
  const handleBulkEmit = async () => {
    const borradores = filteredNotas.filter(nc => checkedIds.has(nc.id) && nc.status === "BORRADOR");
    if (borradores.length === 0) return;
    if (!(await confirm({
      title: `¿Emitir ${borradores.length} nota(s) de crédito a SUNAT?`,
      intent: "warning",
      confirmLabel: "Sí, emitir",
    }))) return;
    await Promise.all(borradores.map(nc =>
      fetch(`/api/notas-credito/${nc.id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status: "EMITIDA" }) }).catch(sinDato("Notas de crédito PATCH /api/notas-credito"))
    ));
    fetchNotas(); setCheckedIds(new Set());
  };

  // ── Templates ─────────────────────────────────────────────────────────────
  const saveTemplate = async () => {
    if (!form.codigoMotivo || !form.descripcionMotivo.trim()) return;
    const name = await prompt({
      title: "Nombre del template",
      label: "Nombre",
      placeholder: "Ej: Devolución Parcial",
      inputType: "text",
      required: true,
    });
    if (!name?.trim()) return;
    const t: NCTemplate = { id: crypto.randomUUID(), name: name.trim(), codigoMotivo: form.codigoMotivo, descripcionMotivo: form.descripcionMotivo };
    const updated = [...templates, t];
    setTemplates(updated);
    localStorage.setItem("nc-templates", JSON.stringify(updated));
  };

  const deleteTemplate = (id: string) => {
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    localStorage.setItem("nc-templates", JSON.stringify(updated));
  };

  const loadTemplate = (t: NCTemplate) => {
    setForm(prev => ({ ...prev, codigoMotivo: t.codigoMotivo, descripcionMotivo: t.descripcionMotivo }));
    setShowTemplates(false);
  };

  // ── Exportar PDF real ─────────────────────────────────────────────────────
  const exportPDF = async (nc: NotaCredito) => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(45, 106, 79);
    doc.text("NOTA DE CRÉDITO", 105, 22, { align: "center" });
    doc.setDrawColor(45, 106, 79);
    doc.setLineWidth(0.5);
    doc.line(15, 27, 195, 27);
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    const col1 = 20, col2 = 120;
    const rows = [
      ["N° Documento:", nc.numero],
      ["Fecha:", formatDate(nc.createdAt)],
      ["Estado:", STATUS_META[nc.status].label],
      ["Cliente:", nc.clienteNombre ?? "—"],
      ["RUC/DNI:", nc.clienteDocumento ?? "—"],
      ["Doc. referencia:", nc.orderNumero ?? "—"],
    ];
    let y = 38;
    rows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold"); doc.text(label, col1, y);
      doc.setFont("helvetica", "normal"); doc.text(value, col2, y);
      y += 8;
    });
    y += 4;
    doc.setFont("helvetica", "bold"); doc.text(`[${nc.motivoCodigo}] Motivo:`, col1, y);
    doc.setFont("helvetica", "normal");
    doc.text(nc.motivoDesc, col2, y);
    y += 12;
    doc.line(15, y, 195, y); y += 8;
    doc.setFontSize(12);
    const montos = [["Monto base:", formatCurrency(nc.monto)], ["IGV (18%):", formatCurrency(nc.igv)], ["TOTAL NC:", formatCurrency(nc.total)]];
    montos.forEach(([label, value], i) => {
      if (i === 2) { doc.setFontSize(14); doc.setTextColor(220, 38, 38); }
      doc.setFont("helvetica", "bold"); doc.text(label, 110, y);
      doc.text(value, 185, y, { align: "right" });
      y += 9;
    });
    if (nc.notas) { doc.setFontSize(10); doc.setTextColor(120, 120, 120); doc.setFont("helvetica", "italic"); doc.text(`Notas: ${nc.notas}`, col1, y + 8); }
    doc.setFontSize(8); doc.setTextColor(160, 160, 160);
    doc.text("Documento generado por Buleje", 105, 285, { align: "center" });
    doc.save(`NC-${nc.numero}-${nc.createdAt.slice(0, 10)}.pdf`);
  };

  // ── Enviar por WhatsApp ───────────────────────────────────────────────────
  const sendWhatsApp = (nc: NotaCredito) => {
    const text = `*Nota de Crédito ${nc.numero}*\nMotivo: [${nc.motivoCodigo}] ${nc.motivoDesc}\nCliente: ${nc.clienteNombre ?? "—"}\nTotal: ${formatCurrency(nc.total)}\nEstado: ${STATUS_META[nc.status].label}\nFecha: ${formatDate(nc.createdAt)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return {
    resetWizard, handleCreate, handleDuplicate, handleEmitSunat, handleAnular, handleBulkEmit,
    saveTemplate, deleteTemplate, loadTemplate, exportPDF, sendWhatsApp,
  };
}
