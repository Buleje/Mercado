"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Pencil as PencilLine, Sparkles, Save } from "@buleje/design-system/icons";
import { signDocument } from "@/hooks/use-documents";

export function SignTab({ docId, onSigned }: { docId: string; onSigned: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");
  const [signing, setSigning] = useState(false);
  const [result, setResult] = useState<{ versionNumber: number; sha: string } | null>(null);
  // Mi firma guardada (por-dispositivo, localStorage) para firmar con 1 clic.
  const [savedSig, setSavedSig] = useState<{ png: string; name: string; role?: string } | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const w = 480;
  const h = 160;

  const MY_SIG_KEY = "doc-my-signature";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MY_SIG_KEY);
      if (raw) setSavedSig(JSON.parse(raw));
    } catch { /* localStorage no disponible */ }
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pt(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    const p = pt(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = pt(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end() {
    drawingRef.current = false;
  }
  function clear() {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }

  async function doSign(name: string, role: string | undefined, png: string) {
    setSigning(true);
    try {
      const r = await signDocument(docId, { signerName: name, signerRole: role || undefined, signatureImagePngBase64: png });
      setResult({ versionNumber: r.version.versionNumber, sha: r.originalSha256 });
      onSigned();
    } catch (e) {
      toast.error("Error al firmar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSigning(false);
    }
  }

  async function handleSign() {
    if (!signerName.trim()) return;
    await doSign(signerName.trim(), signerRole.trim(), canvasRef.current!.toDataURL("image/png"));
  }

  // Guarda el trazo actual + nombre como "mi firma" (localStorage, por dispositivo).
  function saveMySignature() {
    if (!signerName.trim()) { setSavedNote("Escribe tu nombre antes de guardar."); return; }
    const png = canvasRef.current!.toDataURL("image/png");
    const sig = { png, name: signerName.trim(), role: signerRole.trim() || undefined };
    try {
      localStorage.setItem(MY_SIG_KEY, JSON.stringify(sig));
      setSavedSig(sig);
      setSavedNote("Firma guardada en este dispositivo.");
    } catch {
      setSavedNote("No se pudo guardar (localStorage).");
    }
  }

  function forgetMySignature() {
    try { localStorage.removeItem(MY_SIG_KEY); } catch { /* noop */ }
    setSavedSig(null);
    setSavedNote(null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <PencilLine className="h-5 w-5 text-primary" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Firma digital visual</p>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mb-4">
          Estampa un sello visual + hash SHA-256 en la última página del PDF. NO es firma criptográfica RENIEC — es un sello con audit trail.
        </p>

        {/* Firma guardada: firmar con 1 clic */}
        {savedSig && !result && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={savedSig.png} alt="Mi firma" className="h-10 w-24 rounded bg-[var(--surface-raised)] object-contain" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--text-primary)]">{savedSig.name}</p>
              {savedSig.role && <p className="truncate text-xs text-[var(--text-tertiary)]">{savedSig.role}</p>}
            </div>
            <button
              onClick={() => doSign(savedSig.name, savedSig.role, savedSig.png)}
              disabled={signing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {signing && <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              <PencilLine className="h-3.5 w-3.5" /> Firmar con mi firma
            </button>
            <button onClick={forgetMySignature} className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error-700)]">Olvidar</button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Tu nombre</span>
            <input
              type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)}
              className="mt-1 w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Cargo (opcional)</span>
            <input
              type="text" value={signerRole} onChange={(e) => setSignerRole(e.target.value)}
              placeholder="Gerente, Contador…"
              className="mt-1 w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary"
            />
          </label>
        </div>

        <p className="text-xs font-bold text-[var(--text-secondary)] mb-1.5">Traza tu firma:</p>
        <div className="inline-block border border-dashed border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)]">
          <canvas
            ref={canvasRef}
            width={w}
            height={h}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            style={{ touchAction: "none" }}
            className="block"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button onClick={clear} className="px-3 py-2 rounded-xl bg-[var(--surface-sunken)] hover:bg-[var(--surface-canvas)] text-xs font-bold text-[var(--text-secondary)]">Limpiar</button>
          <button
            onClick={handleSign}
            disabled={signing || !signerName.trim()}
            className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {signing && <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            <PencilLine className="h-3.5 w-3.5" /> Firmar PDF
          </button>
          <button onClick={saveMySignature} className="px-3 py-2 rounded-xl border border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary inline-flex items-center gap-1.5" title="Guarda tu firma para reusarla con 1 clic">
            <Save className="h-3.5 w-3.5" /> Guardar mi firma
          </button>
          {savedNote && <span className="text-xs font-semibold text-[var(--text-tertiary)]">{savedNote}</span>}
        </div>

        {result && (
          <div className="mt-4 p-3 rounded-xl bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/15 border border-[var(--data-success-500)]/30 text-xs">
            <p className="font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Firmado correctamente
            </p>
            <p className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)] mt-1 tabular-nums">Nueva versión: v{result.versionNumber}</p>
            <p className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)] mt-0.5 font-mono break-all text-[length:var(--ts-2xs)]">SHA-256: {result.sha}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────── Audit tab ───────────
