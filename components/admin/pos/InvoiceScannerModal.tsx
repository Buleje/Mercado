"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Camera,
  Upload,
  X,
  Loader2,
  AlertCircle,
  RotateCcw,
  ShoppingCart,
  FileText,
  Trash2,
} from "@buleje/design-system/icons";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceItem {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

interface InvoiceData {
  proveedor: { nombre: string; ruc?: string };
  fecha?: string;
  items: InvoiceItem[];
  total: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: {
    proveedor: { nombre: string; ruc?: string };
    items: InvoiceItem[];
  }) => void;
}

type ScanState = "idle" | "capturing" | "processing" | "results" | "error";

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvoiceScannerModal({ open, onClose, onConfirm }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<ScanState>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);

  // ── Cleanup camera on unmount ───────────────────────────────────────────────

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // ── Camera start ────────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setError("");
    setPreview(null);
    setState("capturing");

    const supported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia;

    if (!supported) {
      setError("Este dispositivo no tiene cámara disponible.");
      setState("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Permiso de cámara denegado. Habilítelo en la configuración del navegador."
          : "No se pudo acceder a la cámara.";
      setError(msg);
      setState("error");
    }
  }, []);

  // ── Send to OCR API (hoisted so camera + upload handlers can reference it) ──

  const processImage = useCallback(async (imageDataUrl: string) => {
    setState("processing");
    setError("");

    try {
      const res = await fetch("/api/ocr/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Error al procesar la factura");
        setState("error");
        return;
      }

      setInvoiceData(data);
      setEditItems(data.items?.map((i: InvoiceItem) => ({ ...i })) ?? []);
      setState("results");
    } catch {
      setError("Error de conexión al procesar la factura");
      setState("error");
    }
  }, []);

  // ── Capture photo from camera ───────────────────────────────────────────────

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPreview(dataUrl);
    stopStream();
    processImage(dataUrl);
  }, [stopStream, processImage]);

  // ── Handle file upload ──────────────────────────────────────────────────────

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setError("Solo se permiten archivos de imagen.");
        setState("error");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError("La imagen no debe superar 10 MB.");
        setState("error");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setPreview(dataUrl);
        processImage(dataUrl);
      };
      reader.readAsDataURL(file);

      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [processImage],
  );

  // ── Edit item helpers ───────────────────────────────────────────────────────

  const updateItem = useCallback(
    (idx: number, field: keyof InvoiceItem, value: string | number) => {
      setEditItems((prev) =>
        prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
      );
    },
    [],
  );

  const removeItem = useCallback((idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Reset ───────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    stopStream();
    setPreview(null);
    setInvoiceData(null);
    setEditItems([]);
    setError("");
    setState("idle");
  }, [stopStream]);

  // ── Confirm ─────────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(() => {
    if (!invoiceData) return;
    const validItems = editItems.filter(
      (i) => i.nombre.trim() && i.cantidad > 0,
    );
    if (validItems.length === 0) return;

    onConfirm({
      proveedor: invoiceData.proveedor,
      items: validItems,
    });
  }, [invoiceData, editItems, onConfirm]);

  // ── Close handler ───────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  if (!open) return null;

  const editTotal = editItems.reduce(
    (sum, i) => sum + i.cantidad * i.precioUnitario,
    0,
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="modal-backdrop flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] rounded-t-2xl">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <SectionTitle className="text-base font-semibold text-[var(--text-primary)]">
              Escanear Factura
            </SectionTitle>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* ── Idle: action buttons ─────────────────────────────────── */}
          {state === "idle" && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-tertiary)]">
                Toma una foto o sube una imagen de la boleta/factura para extraer los productos automáticamente.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-[var(--rule-base)] dark:border-gray-600 hover:border-primary dark:hover:border-primary hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors group"
                >
                  <Camera className="h-8 w-8 text-[var(--text-tertiary)] group-hover:text-primary transition-colors" />
                  <span className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-primary">
                    Cámara
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-[var(--rule-base)] dark:border-gray-600 hover:border-primary dark:hover:border-primary hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors group"
                >
                  <Upload className="h-8 w-8 text-[var(--text-tertiary)] group-hover:text-primary transition-colors" />
                  <span className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-primary">
                    Subir imagen
                  </span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                aria-label="Subir imagen de factura"
              />
            </div>
          )}

          {/* ── Capturing: camera viewfinder ─────────────────────────── */}
          {state === "capturing" && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Viewfinder overlay */}
                <div className="absolute inset-4 border-2 border-white/40 rounded-lg pointer-events-none" />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-gray-600 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <X className="h-4 w-4" /> Cancelar
                </button>
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
                >
                  <Camera className="h-4 w-4" /> Capturar
                </button>
              </div>
            </div>
          )}

          {/* ── Processing: spinner ──────────────────────────────────── */}
          {state === "processing" && (
            <div className="flex flex-col items-center gap-4 py-10">
              {preview && (
                <Image
                  src={preview}
                  alt="Factura capturada"
                  width={128}
                  height={128}
                  className="object-cover rounded-xl opacity-60"
                  unoptimized
                />
              )}
              <LoadingState message="Analizando factura con IA..." />
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────────── */}
          {state === "error" && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)]">
                <AlertCircle className="h-5 w-5 text-[var(--data-error)] shrink-0 mt-0.5" />
                <p className="text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">
                  {error}
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-gray-600 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <RotateCcw className="h-4 w-4" /> Intentar de nuevo
              </button>
            </div>
          )}

          {/* ── Results: editable table ──────────────────────────────── */}
          {state === "results" && invoiceData && (
            <div className="space-y-6">
              {/* Proveedor info */}
              <div className="p-3 rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30">
                <p className="text-sm font-medium text-[var(--data-success)] dark:text-[var(--data-success)]">
                  {invoiceData.proveedor.nombre}
                  {invoiceData.proveedor.ruc && (
                    <span className="ml-2 text-xs font-normal text-[var(--data-success)] dark:text-[var(--data-success)]">
                      RUC: {invoiceData.proveedor.ruc}
                    </span>
                  )}
                </p>
                {invoiceData.fecha && (
                  <p className="text-xs text-[var(--data-success)] dark:text-[var(--data-success)] mt-0.5">
                    Fecha: {invoiceData.fecha}
                  </p>
                )}
              </div>

              {/* Items table */}
              <div className="border border-[var(--rule-base)] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--surface-sunken)]">
                      <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text-tertiary)]">
                        Producto
                      </th>
                      <th className="text-center px-2 py-2 text-xs font-medium text-[var(--text-tertiary)] w-16">
                        Cant.
                      </th>
                      <th className="text-right px-2 py-2 text-xs font-medium text-[var(--text-tertiary)] w-20">
                        P.Unit
                      </th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text-tertiary)] w-20">
                        Subtotal
                      </th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {editItems.map((item, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-[var(--surface-sunken)]/50"
                      >
                        <td className="px-3 py-1.5">
                          <input
                            type="text"
                            value={item.nombre}
                            onChange={(e) =>
                              updateItem(idx, "nombre", e.target.value)
                            }
                            className="w-full bg-transparent text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-primary rounded px-1 -mx-1"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) =>
                              updateItem(
                                idx,
                                "cantidad",
                                Math.max(0, Number(e.target.value)),
                              )
                            }
                            min={0}
                            className="w-full bg-transparent text-sm text-center text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-primary rounded"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            value={item.precioUnitario}
                            onChange={(e) =>
                              updateItem(
                                idx,
                                "precioUnitario",
                                Math.max(0, Number(e.target.value)),
                              )
                            }
                            min={0}
                            step={0.01}
                            className="w-full bg-transparent text-sm text-right text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-primary rounded"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right text-sm text-[var(--text-secondary)] tabular-nums">
                          S/{(item.cantidad * item.precioUnitario).toFixed(2)}
                        </td>
                        <td className="pr-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 transition-colors"
                            aria-label={`Eliminar ${item.nombre}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Total row */}
                <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--surface-sunken)] border-t border-[var(--rule-base)]">
                  <span className="text-sm font-medium text-[var(--text-secondary)]">
                    Total ({editItems.length} items)
                  </span>
                  <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                    S/{editTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {editItems.length === 0 && (
                <p className="text-center text-sm text-[var(--text-tertiary)] py-4">
                  No hay items. Intenta con otra imagen.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={cn(
            "sticky bottom-0 flex gap-2 px-5 py-4 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] rounded-b-2xl",
            state !== "results" && "hidden",
          )}
        >
          <button
            type="button"
            onClick={reset}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-gray-600 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <RotateCcw className="h-4 w-4" /> Otra foto
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={editItems.filter((i) => i.nombre.trim() && i.cantidad > 0).length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ShoppingCart className="h-4 w-4" /> Agregar al carrito
          </button>
        </div>

        {/* Hidden canvas for capturing */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
