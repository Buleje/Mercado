"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useCallback } from "react";
import {
  Receipt, Search, Plus, X, Loader2, Send,
  AlertTriangle, CheckCircle2, Eye, Printer,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type TipoComprobante = "boleta" | "factura";

type ItemLinea = {
  producto: string;
  cantidad: number;
  precioUnitario: number;
};

type ComprobanteEmitido = {
  tipo: TipoComprobante;
  serie: string;
  número: string;
  numeroCompleto: string;
  fechaEmision: string;
  cliente: { nombre: string; dni?: string; ruc?: string };
  totales: { gravado: number; igv: number; total: number };
  pdfUrl?: string | null;
  xmlUbl?: string;
  modo: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const IGV_RATE = 0.18;

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcularTotales(items: ItemLinea[]) {
  const totalConIgv = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
  const gravado = +(totalConIgv / (1 + IGV_RATE)).toFixed(2);
  const igv = +(totalConIgv - gravado).toFixed(2);
  return { gravado, igv, total: +(gravado + igv).toFixed(2) };
}

const EMPTY_ITEM: ItemLinea = { producto: "", cantidad: 1, precioUnitario: 0 };

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvoiceEmitter({
  onEmitido,
}: {
  onEmitido?: (comprobante: ComprobanteEmitido) => void;
}) {
  // Tipo de comprobante
  const [tipo, setTipo] = useState<TipoComprobante>("boleta");

  // Datos del cliente
  const [docNumero, setDocNumero] = useState("");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteDireccion, setClienteDireccion] = useState("");

  // Búsqueda RENIEC/SUNAT
  const [buscando, setBuscando] = useState(false);
  const [buscarMsg, setBuscarMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Items
  const [items, setItems] = useState<ItemLinea[]>([{ ...EMPTY_ITEM }]);

  // Estado de emisión
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emitido, setEmitido] = useState<ComprobanteEmitido | null>(null);

  // Preview
  const [showPreview, setShowPreview] = useState(false);

  const { gravado, igv, total } = calcularTotales(items);

  const serie = tipo === "boleta" ? "B001" : "F001";
  const docLabel = tipo === "boleta" ? "DNI" : "RUC";
  const docMaxLength = tipo === "boleta" ? 8 : 11;
  const docPlaceholder = tipo === "boleta" ? "12345678" : "20123456789";

  // ── Buscar DNI/RUC ──────────────────────────────────────────────────────────

  const buscarDocumento = useCallback(async () => {
    if (tipo === "boleta" && docNumero.length !== 8) return;
    if (tipo === "factura" && docNumero.length !== 11) return;

    setBuscando(true);
    setBuscarMsg(null);

    try {
      if (tipo === "boleta") {
        // Consulta RENIEC por DNI
        const res = await fetch(`/api/reniec/dni/${encodeURIComponent(docNumero)}`);
        const data = await res.json() as Record<string, string>;
        if (!res.ok) {
          setBuscarMsg({ ok: false, text: data.error ?? "No se pudo consultar RENIEC" });
          return;
        }
        const nombre = data.nombreCompleto ?? "";
        if (nombre && !clienteNombre.trim()) {
          setClienteNombre(nombre);
        }
        setBuscarMsg({ ok: true, text: nombre ? nombre : "DNI valido" });
      } else {
        // Stub: simula búsqueda SUNAT por RUC
        const esValido = /^\d{11}$/.test(docNumero) && (docNumero.startsWith("10") || docNumero.startsWith("20"));
        if (!esValido) {
          setBuscarMsg({ ok: false, text: "RUC invalido. Debe tener 11 digitos y empezar con 10 o 20" });
          return;
        }
        // Simula respuesta
        const razonSocial = docNumero.startsWith("20")
          ? `Empresa ${docNumero.slice(-4)} S.A.C.`
          : `Persona Natural ${docNumero.slice(-4)}`;
        if (!clienteNombre.trim()) {
          setClienteNombre(razonSocial);
        }
        setBuscarMsg({ ok: true, text: razonSocial });
      }
    } catch {
      setBuscarMsg({ ok: false, text: "Error de conexion" });
    } finally {
      setBuscando(false);
    }
  }, [tipo, docNumero, clienteNombre]);

  // ── Actualizar item ─────────────────────────────────────────────────────────

  const updateItem = (idx: number, field: keyof ItemLinea, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  // ── Emitir comprobante ──────────────────────────────────────────────────────

  const handleEmitir = async () => {
    setError(null);

    // Validaciones
    if (!clienteNombre.trim()) {
      setError("El nombre del cliente es obligatorio");
      return;
    }
    if (tipo === "factura" && !docNumero.trim()) {
      setError("El RUC es obligatorio para facturas");
      return;
    }
    if (tipo === "factura" && !clienteDireccion.trim()) {
      setError("La direccion es obligatoria para facturas");
      return;
    }
    if (items.some(i => !i.producto.trim())) {
      setError("Todos los items deben tener descripcion");
      return;
    }
    if (items.some(i => i.cantidad <= 0 || i.precioUnitario <= 0)) {
      setError("Cantidad y precio deben ser mayores a 0");
      return;
    }

    setEmitiendo(true);

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          type: tipo,
          clientDoc: docNumero || undefined,
          clientName: clienteNombre,
          clientAddress: clienteDireccion || undefined,
          items: items.map(i => ({
            description: i.producto,
            quantity: i.cantidad,
            unitPrice: i.precioUnitario,
          })),
        }),
      });

      const data = await res.json() as {
        ok?: boolean;
        comprobante?: ComprobanteEmitido;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al emitir el comprobante");
        return;
      }

      if (data.comprobante) {
        setEmitido(data.comprobante);
        onEmitido?.(data.comprobante);
      }
    } catch {
      setError("Error de conexion al emitir el comprobante");
    } finally {
      setEmitiendo(false);
    }
  };

  // ── Reset ───────────────────────────────────────────────────────────────────

  const handleNuevo = () => {
    setEmitido(null);
    setError(null);
    setDocNumero("");
    setClienteNombre("");
    setClienteDireccion("");
    setItems([{ ...EMPTY_ITEM }]);
    setBuscarMsg(null);
  };

  // ── Vista de comprobante emitido ────────────────────────────────────────────

  if (emitido) {
    return (
      <div className="space-y-6">
        <div className="bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-4 sm:p-6 text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-[var(--data-success-500)] mx-auto" />
          <SectionTitle className="text-xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
            Comprobante emitido
          </SectionTitle>
          <p className="text-2xl font-mono font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {emitido.numeroCompleto}
          </p>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
            {emitido.tipo === "boleta" ? "Boleta" : "Factura"} - {emitido.fechaEmision}
          </p>
        </div>

        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Cliente</p>
              <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{emitido.cliente.nombre}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{emitido.cliente.ruc ? "RUC" : "DNI"}</p>
              <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{emitido.cliente.ruc ?? emitido.cliente.dni ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Gravado</p>
              <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(emitido.totales.gravado)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">IGV (18%)</p>
              <p className="font-bold text-[var(--data-warning-500)]">{fmt(emitido.totales.igv)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Total</p>
              <p className="text-xl font-extrabold text-primary">{fmt(emitido.totales.total)}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {emitido.pdfUrl && (
            <a
              href={emitido.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary/10 text-white text-sm font-semibold hover:bg-primary/10 transition-colors"
            >
              <Printer className="h-4 w-4" /> Imprimir / Descargar PDF
            </a>
          )}
          <button
            onClick={handleNuevo}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Nuevo comprobante
          </button>
        </div>
      </div>
    );
  }

  // ── Formulario de emisión ───────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <SectionTitle className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          Emitir comprobante
        </SectionTitle>
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">
          Genera boletas o facturas electronicas SUNAT
        </p>
      </div>

      {/* Toggle Boleta / Factura */}
      <div className="flex gap-1 p-1 bg-[var(--surface-sunken)] dark:bg-surface rounded-xl w-fit">
        {(["boleta", "factura"] as const).map(t => (
          <button
            key={t}
            onClick={() => {
              setTipo(t);
              setDocNumero("");
              setBuscarMsg(null);
            }}
            className={cn(
              "px-4 py-2 text-sm font-bold rounded-lg transition-all",
              tipo === t
                ? "bg-primary text-white "
                : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)]",
            )}
          >
            {t === "boleta" ? "Boleta (B001)" : "Factura (F001)"}
          </button>
        ))}
      </div>

      {/* Datos del cliente */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5 space-y-3">
        <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
          Datos del cliente
        </p>

        {/* DNI / RUC + Buscar */}
        <div>
          <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 block">
            {docLabel} {tipo === "boleta" && <span className="font-normal">(opcional)</span>}
          </label>
          <div className="flex gap-2">
            <input
              value={docNumero}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, "").slice(0, docMaxLength);
                setDocNumero(val);
                setBuscarMsg(null);
              }}
              placeholder={docPlaceholder}
              maxLength={docMaxLength}
              className="flex-1 min-w-0 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] font-mono"
            />
            <button
              onClick={buscarDocumento}
              disabled={buscando || docNumero.length !== docMaxLength}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 shrink-0"
            >
              {buscando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Buscar
            </button>
          </div>
          {buscarMsg && (
            <p className={cn("mt-1.5 text-xs font-semibold", buscarMsg.ok ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
              {buscarMsg.text}
            </p>
          )}
        </div>

        {/* Nombre / Razon social */}
        <div>
          <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 block">
            {tipo === "boleta" ? "Nombre del cliente" : "Razon social"}
          </label>
          <input
            value={clienteNombre}
            onChange={e => setClienteNombre(e.target.value)}
            placeholder={tipo === "boleta" ? "Juan Perez" : "Empresa S.A.C."}
            className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]"
          />
        </div>

        {/* Direccion */}
        <div>
          <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 block">
            Direccion {tipo === "boleta" && <span className="font-normal">(opcional)</span>}
          </label>
          <input
            value={clienteDireccion}
            onChange={e => setClienteDireccion(e.target.value)}
            placeholder="Av. Centenario 123, Pucallpa"
            className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]"
          />
        </div>
      </div>

      {/* Items del comprobante */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
            Productos / Servicios
          </p>
          <button
            onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM }])}
            className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>

        {/* Header de tabla (desktop) */}
        <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-bold text-[var(--text-tertiary)] dark:text-muted uppercase">
          <div className="col-span-5">Producto</div>
          <div className="col-span-2">Cant.</div>
          <div className="col-span-2">P. Unit.</div>
          <div className="col-span-1">IGV</div>
          <div className="col-span-1">Total</div>
          <div className="col-span-1"></div>
        </div>

        {items.map((item, idx) => {
          const itemTotal = item.cantidad * item.precioUnitario;
          const itemIgv = +(itemTotal - itemTotal / (1 + IGV_RATE)).toFixed(2);

          return (
            <div key={idx} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center">
              <div className="col-span-2 sm:col-span-5">
                <input
                  value={item.producto}
                  onChange={e => updateItem(idx, "producto", e.target.value)}
                  placeholder="Descripcion del producto"
                  className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <input
                  type="number"
                  value={item.cantidad}
                  onChange={e => updateItem(idx, "cantidad", Math.max(0, parseFloat(e.target.value) || 0))}
                  min="0"
                  step="1"
                  className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <input
                  type="number"
                  value={item.precioUnitario}
                  onChange={e => updateItem(idx, "precioUnitario", Math.max(0, parseFloat(e.target.value) || 0))}
                  min="0"
                  step="0.01"
                  className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                />
              </div>
              <div className="hidden sm:block sm:col-span-1 text-xs text-[var(--data-warning-500)] font-semibold py-2">
                {fmt(itemIgv)}
              </div>
              <div className="hidden sm:block sm:col-span-1 text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] py-2">
                {fmt(itemTotal)}
              </div>
              <div className="hidden sm:flex sm:col-span-1 items-center">
                {items.length > 1 && (
                  <button
                    onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                    className="text-[var(--data-error-500)] hover:text-[var(--data-error-500)] transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {/* Mobile total + delete */}
              <div className="col-span-2 sm:hidden flex items-center justify-between text-sm px-1">
                <span className="text-[var(--text-secondary)]">Total: <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(itemTotal)}</span></span>
                {items.length > 1 && (
                  <button
                    onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                    className="text-[var(--data-error-500)] hover:text-[var(--data-error-500)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Totales */}
        <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-3 flex justify-end">
          <div className="space-y-1 text-right text-sm">
            <p className="text-[var(--text-secondary)] dark:text-muted">
              Gravado: <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(gravado)}</span>
            </p>
            <p className="text-[var(--text-secondary)] dark:text-muted">
              IGV (18%): <span className="font-semibold text-[var(--data-warning-500)]">{fmt(igv)}</span>
            </p>
            <p className="text-[var(--text-primary)] dark:text-[var(--text-primary)] font-extrabold text-base">
              Total: <span className="text-primary">{fmt(total)}</span>
            </p>
            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Moneda: PEN (S/.)</p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/40 rounded-xl p-3 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Botones */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleNuevo}
          className="px-4 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={() => setShowPreview(true)}
          disabled={items.every(i => !i.producto.trim())}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors disabled:opacity-40"
        >
          <Eye className="h-4 w-4" /> Vista previa
        </button>
        <button
          onClick={handleEmitir}
          disabled={emitiendo || !clienteNombre.trim() || items.every(i => !i.producto.trim())}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {emitiendo ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Emitiendo...</>
          ) : (
            <><Send className="h-4 w-4" /> Emitir comprobante</>
          )}
        </button>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="modal-backdrop p-4" onClick={() => setShowPreview(false)}>
          <div
            className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-6 w-full max-w-lg space-y-4 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                Vista previa - {tipo === "boleta" ? "Boleta" : "Factura"}
              </CardTitle>
              <button onClick={() => setShowPreview(false)}>
                <X className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
            </div>

            <div className="text-center border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] pb-3">
              <p className="font-extrabold text-lg text-[var(--text-primary)] dark:text-[var(--text-primary)]">Buleje</p>
              <p className="text-xs text-[var(--text-secondary)]">Pucallpa, Ucayali, Peru</p>
              <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mt-2">
                {tipo === "boleta" ? "BOLETA DE VENTA ELECTRONICA" : "FACTURA ELECTRONICA"}
              </p>
              <p className="font-mono font-bold text-primary">{serie}-XXXXXXXX</p>
            </div>

            <div className="text-sm space-y-1">
              <p><span className="text-[var(--text-tertiary)]">Cliente:</span> <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{clienteNombre || "-"}</span></p>
              <p><span className="text-[var(--text-tertiary)]">{docLabel}:</span> <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{docNumero || "-"}</span></p>
              {clienteDireccion && <p><span className="text-[var(--text-tertiary)]">Direccion:</span> <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{clienteDireccion}</span></p>}
              <p><span className="text-[var(--text-tertiary)]">Fecha:</span> <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{new Date().toLocaleDateString("es-PE")}</span></p>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs text-[var(--text-tertiary)] uppercase">
                  <th className="text-left py-1">Producto</th>
                  <th className="text-right py-1">Cant.</th>
                  <th className="text-right py-1">P.Unit</th>
                  <th className="text-right py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.filter(i => i.producto.trim()).map((item, idx) => (
                  <tr key={idx} className="border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                    <td className="py-1.5 text-[var(--text-primary)] dark:text-[var(--text-primary)]">{item.producto}</td>
                    <td className="py-1.5 text-right text-[var(--text-secondary)]">{item.cantidad}</td>
                    <td className="py-1.5 text-right text-[var(--text-secondary)]">{fmt(item.precioUnitario)}</td>
                    <td className="py-1.5 text-right font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(item.cantidad * item.precioUnitario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] pt-2 space-y-1 text-sm text-right">
              <p className="text-[var(--text-secondary)]">Gravado: <span className="font-semibold">{fmt(gravado)}</span></p>
              <p className="text-[var(--data-warning-500)]">IGV (18%): <span className="font-semibold">{fmt(igv)}</span></p>
              <p className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-base">Total: {fmt(total)}</p>
            </div>

            <button
              onClick={() => setShowPreview(false)}
              className="w-full py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
