import { useState, useEffect, useId, useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { limaDateKey } from "@/lib/utils";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { efectosDeRecepcion, lineasDeSeguimiento, listarCorto } from "@/lib/compras/ciclo-oc";
import type { CreditoDeRecepcion } from "@/components/admin/cuentas-por-pagar/AvisoCreditoRecepcion";
import { useConfirmarCreditoRecepcion } from "@/components/admin/cuentas-por-pagar/use-confirmar-credito-recepcion";
import { errorDeVencimiento, pideLote } from "@/lib/compras/lotes-recepcion";
import {
  EMPTY_CHECKLIST, PREFIJO_SIN_ORDEN, itemsDeOrden,
  type ItemCondition, type PendingOC, type Reception, type ReceptionItem, type ReceptionStatus,
} from "@/components/admin/ordenes-compra/recepciones/tipos";

/** Contra qué llega la mercadería (C18): una orden pendiente, o nada y su motivo. */
export type OrigenRecepcion = "orden" | "sin_orden";

/**
 * «Recibir mercadería» (con o sin orden): el formulario, las órdenes pendientes
 * para auto-completar, la foto de la factura y el guardado. Salió de
 * `ReceivingTab` (10-10) con el MISMO cuerpo que se manda a
 * `POST /api/compras/recepciones`.
 */
export function useNuevaRecepcion(setReceptions: Dispatch<SetStateAction<Reception[]>>) {
  const [showNew, setShowNew]           = useState(false);
  const newTitleId = useId();
  const newPanelRef = useRef<HTMLDivElement>(null);
  useModalAccesible(newPanelRef, { onCerrar: () => setShowNew(false), activo: showNew });
  const ventanaNueva = useVentanaDeModal(showNew, { ref: newPanelRef, aplicarTranslate: true, claveMemoria: "recepcion-nueva" });

  // Órdenes pendientes de recibir (para el dropdown del modal)
  const [pendingOCs, setPendingOCs] = useState<PendingOC[]>([]);
  const confirmarCredito = useConfirmarCreditoRecepcion();
  const { confirm } = useConfirm();
  const [selectedOcId, setSelectedOcId] = useState("");
  const [origen, setOrigen] = useState<OrigenRecepcion>("orden");
  /** Uno de MOTIVOS_SIN_ORDEN u «otro» (entonces manda `motivoOtro`). */
  const [motivo, setMotivo] = useState("");
  const [motivoOtro, setMotivoOtro] = useState("");
  /** Lo que frenó el guardado (falta algo o el servidor lo rechazó): la ventana queda abierta. */
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  // New reception form
  const [newForm, setNewForm] = useState({
    supplier: "", orderRef: "", scheduledDate: limaDateKey(), inspector: "",
  });
  const [checklist, setChecklist] = useState<ReceptionItem[]>([{ ...EMPTY_CHECKLIST }]);
  const [saving, setSaving] = useState(false);
  /** Lo que la última recepción bajó de la cuenta por pagar o dejó como reclamo. */
  const [avisoCredito, setAvisoCredito] = useState<(CreditoDeRecepcion & { proveedor: string }) | null>(null);
  // Factura del proveedor adjunta a la recepción (foto/imagen → /api/upload).
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");

  // Carga OCs pendientes al abrir el modal de nueva recepción
  const loadPendingOCs = useCallback(async () => {
    try {
      // Con lo que ya llegó de cada orden: así se precarga lo que FALTA (C19).
      const res = await fetch("/api/purchases?seguimiento=1", { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      const all: PendingOC[] = Array.isArray(json) ? json : (json?.purchases ?? []);
      // Solo mostrar OCs pendientes / parciales / auto_generated
      const pending = all.filter((p) => {
        const s = (p.status ?? "").toLowerCase();
        return s === "pendiente" || s === "parcial" || s === "auto_generated" || s === "ordered" || s === "draft";
      });
      setPendingOCs(pending);
    } catch (err) {
      console.warn("[recepciones] no se cargaron las órdenes pendientes", err);
    }
  }, []);

  useEffect(() => {
    if (showNew) void loadPendingOCs();
  }, [showNew, loadPendingOCs]);
  const addChecklistRow  = () => setChecklist(prev => [...prev, { ...EMPTY_CHECKLIST }]);
  const removeChecklistRow = (idx: number) => setChecklist(prev => prev.filter((_, i) => i !== idx));
  const updateChecklistRow = <K extends keyof ReceptionItem>(idx: number, key: K, value: ReceptionItem[K]) =>
    setChecklist(prev => prev.map((row, i) => i === idx ? { ...row, [key]: value } : row));

  // Sube la foto de la factura del proveedor y guarda su URL (solo imágenes).
  const uploadInvoice = async (file: File) => {
    setInvoiceError("");
    setUploadingInvoice(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "recepciones");
      const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), body: fd });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "No se pudo subir la factura");
      setInvoiceUrl(body.url);
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Error al subir la factura");
    } finally {
      setUploadingInvoice(false);
    }
  };

  /** Una fecha de vencimiento imposible frena el guardado (el servidor la rechazaría igual). */
  const venceConError = checklist.some((r) => pideLote(r) && errorDeVencimiento(r.expiryDate ?? "") !== null);

  const ocElegida = origen === "orden" ? pendingOCs.find((p) => p.id === selectedOcId) : undefined;
  const motivoFinal = motivo === "otro" ? motivoOtro.trim() : motivo;
  /** Lo que va a pasar al guardar, contado como el servidor (C23). */
  const efectos = efectosDeRecepcion(checklist, ocElegida ? { items: itemsDeOrden(ocElegida), seguimiento: ocElegida.seguimiento } : null);

  /** Qué falta para poder guardar, en una frase; null si está todo. */
  const faltaParaGuardar = (): string | null => {
    if (origen === "orden" && !ocElegida) return "Elige la orden que llegó, o marca «Sin orden».";
    if (origen === "sin_orden" && !motivoFinal) return "Di por qué llega sin orden.";
    if (!newForm.supplier.trim()) return "Escribe el proveedor.";
    if (checklist.some((r) => !r.product.trim())) return "Cada fila necesita su producto (o quítala).";
    return null;
  };

  const saveReception = async () => {
    const falta = faltaParaGuardar();
    setErrorGuardar(falta);
    if (falta) return;
    // C19: lo que pasa lo pedido entra igual al stock (regla del servidor): se dice y se pregunta antes.
    if (efectos.deMas.length > 0) {
      const ok = await confirm({
        title: "Llegó más de lo que pediste",
        description: `${listarCorto(efectos.deMas.map((d) => `${d.n} de ${d.nombre}`))} pasa lo que faltaba de la orden.\nSi lo guardas así, entra al stock igual. Si no te lo vas a quedar, baja la cantidad de «Llegó».`,
        intent: "warning",
        confirmLabel: "Guardar con lo de más",
        cancelLabel: "Revisar",
      });
      if (!ok) return;
    }
    if (!(await confirmarCredito(ocElegida, newForm.supplier, checklist))) return;
    setSaving(true);
    const nonConformities = checklist.filter(it => it.condition !== "ok" || it.receivedQty < it.expectedQty).length;
    const body = {
      ...newForm,
      orderRef: ocElegida?.id ?? "",
      ...(origen === "sin_orden" ? { notes: `${PREFIJO_SIN_ORDEN}${motivoFinal}` } : {}),
      // Igual que `OCRecepcionModal`: todo OK y completo = aceptada; algo
      // faltante, dañado o distinto de lo pedido = parcial. Antes iba siempre
      // «en-proceso» y los indicadores Aceptadas quedaban en 0.
      status: (checklist.some((it) => it.condition !== "ok" || it.receivedQty !== it.expectedQty)
        ? "parcial"
        : "aceptada") as ReceptionStatus,
      // Lo dañado, vencido o faltante no hace lote: la fecha no viaja.
      items: checklist.map(({ expiryDate, lote, ...it }) => (it.condition === "ok" ? { ...it, expiryDate, lote } : it)),
      photos: 0,
      nonConformities,
      invoiceUrl: invoiceUrl || undefined,
    };
    let res: Response;
    try {
      res = await fetch("/api/compras/recepciones", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
    } catch {
      setSaving(false);
      setErrorGuardar("Sin conexión con el servidor: la recepción no se guardó.");
      return;
    }
    // Antes cerraba la ventana aunque el servidor dijera que no: lo escrito se perdía sin aviso.
    if (!res.ok) {
      const d = await leerJson<{ error?: unknown }>(res);
      setSaving(false);
      setErrorGuardar(typeof d?.error === "string" ? d.error : `No se guardó (error ${res.status}). Revisa los datos e intenta otra vez.`);
      return;
    }
    const created: Reception & { credito?: CreditoDeRecepcion } = await res.json();
    setAvisoCredito(created.credito && created.credito.total > 0 ? { ...created.credito, proveedor: created.supplier } : null);
    setReceptions(prev => {
      const next = [created, ...prev];
      try { localStorage.setItem("admin-recepciones-cache", JSON.stringify({ data: next, ts: Date.now() })); } catch { /* quota */ }
      return next;
    });
    setSaving(false);
    setShowNew(false);
    setErrorGuardar(null);
    setMotivo("");
    setMotivoOtro("");
    setNewForm({ supplier: "", orderRef: "", scheduledDate: limaDateKey(), inspector: "" });
    setChecklist([{ ...EMPTY_CHECKLIST }]);
    setInvoiceUrl("");
    setInvoiceError("");
    setSelectedOcId("");
  };

  // Al elegir una OC del dropdown — auto-llena proveedor + items con lo que FALTA
  // (C19): una orden con un viaje ya recibido sugería contar todo otra vez.
  const applyOC = useCallback((ocId: string) => {
    setSelectedOcId(ocId);
    setErrorGuardar(null);
    if (!ocId) return;
    const oc = pendingOCs.find((p) => p.id === ocId);
    if (!oc) return;
    setNewForm((f) => ({
      ...f,
      supplier: oc.supplierName ?? f.supplier,
      orderRef: oc.id,
    }));
    const faltan = lineasDeSeguimiento(itemsDeOrden(oc), oc.seguimiento).filter((l) => l.falta > 0);
    if (faltan.length > 0) {
      setChecklist(faltan.map((l) => ({
        product: l.nombre,
        productId: l.productId,
        expectedQty: l.falta,
        receivedQty: l.falta,
        condition: "ok" as ItemCondition,
        notes: "",
      })));
    }
  }, [pendingOCs]);

  const cambiarOrigen = (o: OrigenRecepcion) => {
    setOrigen(o);
    setErrorGuardar(null);
    if (o === "sin_orden") {
      setSelectedOcId("");
      setNewForm((f) => ({ ...f, orderRef: "" }));
    }
  };

  return {
    showNew, setShowNew, newTitleId, newPanelRef, ventanaNueva, pendingOCs, selectedOcId, newForm, setNewForm,
    checklist, setChecklist, saving, avisoCredito, setAvisoCredito, invoiceUrl, setInvoiceUrl, uploadingInvoice,
    invoiceError, addChecklistRow, removeChecklistRow, updateChecklistRow, uploadInvoice, venceConError,
    saveReception, applyOC, origen, cambiarOrigen, motivo, setMotivo, motivoOtro, setMotivoOtro,
    ocElegida, efectos, errorGuardar,
  };
}

export type NuevaRecepcion = ReturnType<typeof useNuevaRecepcion>;
