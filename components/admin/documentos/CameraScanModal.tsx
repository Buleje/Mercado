"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Camera, Image as ImageIcon, FileText, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { scanToPdf } from "@/hooks/use-documents";

/**
 * Escáner multipágina: captura varias fotos con la cámara (getUserMedia) o las
 * sube desde el dispositivo, y las combina en UN PDF (una página por foto) vía
 * `scan-to-pdf`. En equipos sin cámara cae al selector de archivos.
 */
export function CameraScanModal({ folderId, onClose, onDone }: { folderId: string | null; onClose: () => void; onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<{ blob: Blob; url: string }[]>([]);
  const [camState, setCamState] = useState<"idle" | "on" | "denied" | "unsupported">("idle");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCamState("unsupported"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch((err) => console.warn("[camera-scan] video play failed", err)); }
      setCamState("on");
    } catch {
      setCamState("denied");
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((blob) => { if (blob) setPages((p) => [...p, { blob, url: URL.createObjectURL(blob) }]); }, "image/png");
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setPages((p) => [...p, ...imgs.map((f) => ({ blob: f, url: URL.createObjectURL(f) }))]);
  };

  const removePage = (i: number) => setPages((p) => { URL.revokeObjectURL(p[i].url); return p.filter((_, idx) => idx !== i); });

  const create = async () => {
    if (pages.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await scanToPdf(pages.map((p) => p.blob), name.trim() || undefined, folderId);
      stopCamera();
      pages.forEach((p) => URL.revokeObjectURL(p.url));
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 120) : "No se pudo crear el PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[34rem] flex-col overflow-hidden rounded-2xl bg-white dark:bg-[var(--color-card)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--rule-base)] p-4">
          <h3 className="inline-flex items-center gap-2 text-base font-bold text-[var(--text-primary)]"><Camera className="h-5 w-5 text-primary" /> Escanear a PDF</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Cámara / captador */}
          {camState === "on" ? (
            <div className="overflow-hidden rounded-xl bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="max-h-[40vh] w-full object-contain" playsInline muted />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-[var(--rule-base)] p-6 text-center">
              <Camera className="h-8 w-8 text-[var(--text-tertiary)]" />
              {camState === "idle" && <p className="text-sm text-[var(--text-secondary)]">Usá la cámara para fotografiar cada página, o subí fotos.</p>}
              {camState === "denied" && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">No pudimos acceder a la cámara. Podés subir fotos igual.</p>}
              {camState === "unsupported" && <p className="text-sm text-[var(--text-secondary)]">Este dispositivo no expone cámara al navegador. Subí fotos.</p>}
              <div className="flex flex-wrap justify-center gap-2">
                <button onClick={startCamera} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white hover:bg-primary/90"><Camera className="h-4 w-4" /> Abrir cámara</button>
                <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary"><ImageIcon className="h-4 w-4" /> Subir fotos</button>
              </div>
            </div>
          )}

          {camState === "on" && (
            <div className="mt-3 flex justify-center gap-2">
              <button onClick={capture} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90"><Camera className="h-4 w-4" /> Capturar página</button>
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] hover:border-primary"><ImageIcon className="h-4 w-4" /> Subir</button>
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />

          {/* Páginas capturadas */}
          {pages.length > 0 && (
            <>
              <p className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{pages.length} página(s)</p>
              <div className="grid grid-cols-4 gap-2">
                {pages.map((p, i) => (
                  <div key={i} className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Página ${i + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[length:var(--ts-2xs,11px)] font-bold text-white">{i + 1}</span>
                    <button onClick={() => removePage(i)} className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100" aria-label="Quitar"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </>
          )}

          <label className="mt-4 block text-xs font-semibold text-[var(--text-secondary)]">
            Nombre del documento (opcional)
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: DNI escaneado" className="mt-1 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary" />
          </label>

          {error && <p className="mt-2 text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--rule-base)] p-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button onClick={create} disabled={busy || pages.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {busy ? "Creando…" : `Crear PDF (${pages.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
