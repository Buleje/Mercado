"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, PenLine, Check, Lock, ShieldCheck, Loader2 } from "lucide-react";

interface Props {
  token: string;
  doc: { name: string; size: number };
  hasPassword: boolean;
  initialSignedUrl: string | null;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const W = 480;
const H = 160;

export function SignDocumentView({ token, doc, hasPassword, initialSignedUrl }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(initialSignedUrl);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const canSee = signedUrl !== null || !hasPassword;

  // Inicializa el lienzo cuando se monta (tras desbloquear / al cargar).
  useEffect(() => {
    if (done || !canSee) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    hasDrawn.current = false;
  }, [done, canSee, signedUrl]);

  function pt(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) };
  }
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const p = pt(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    hasDrawn.current = true;
    const p = pt(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end() { drawing.current = false; }
  function clear() {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    hasDrawn.current = false;
  }

  async function unlock() {
    setUnlocking(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/documents/${encodeURIComponent(token)}?password=${encodeURIComponent(password)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error === "password_required" ? "Contraseña incorrecta" : "No se pudo abrir"); return; }
      setSignedUrl(data.signedUrl);
    } catch {
      setError("Error de conexión");
    } finally {
      setUnlocking(false);
    }
  }

  async function handleSign() {
    if (name.trim().length < 2 || signing) return;
    setSigning(true);
    setError(null);
    try {
      const signatureImagePngBase64 = hasDrawn.current ? canvasRef.current!.toDataURL("image/png") : undefined;
      const res = await fetch(`/api/public/documents/${encodeURIComponent(token)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: name.trim(), signerRole: role.trim() || undefined, signatureImagePngBase64, password: hasPassword ? password : undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error === "only_pdf_signable" ? "Solo se pueden firmar PDFs" : "No se pudo firmar. Reintentá."); return; }
      setDone(true);
    } catch {
      setError("Error de conexión");
    } finally {
      setSigning(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-page,#f5f6f8)] p-6">
        <div className="max-w-md rounded-3xl border border-[var(--rule-base,#e5e7eb)] bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--data-success-50,#ecfdf5)] text-[var(--data-success-700,#047857)]"><Check className="h-8 w-8" /></div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary,#0f172a)]">¡Firmado! Gracias, {name.trim()}.</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary,#475569)]">Tu firma quedó registrada en <strong>{doc.name}</strong> con fecha y sello de verificación. Ya podés cerrar esta ventana.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-page,#f5f6f8)] px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--data-error-50,#fef2f2)] text-[var(--data-error-700,#b91c1c)]"><FileText className="h-6 w-6" /></span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold text-[var(--text-primary,#0f172a)]">{doc.name}</h1>
            <p className="text-xs text-[var(--text-tertiary,#94a3b8)]">Te pidieron firmar este documento · {formatBytes(doc.size)}</p>
          </div>
        </div>

        {hasPassword && !signedUrl ? (
          <div className="rounded-3xl border border-[var(--rule-base,#e5e7eb)] bg-white p-8 text-center shadow-sm">
            <Lock className="mx-auto mb-3 h-8 w-8 text-[var(--text-tertiary,#94a3b8)]" />
            <p className="mb-3 text-sm font-bold text-[var(--text-secondary,#475569)]">Este documento está protegido con contraseña.</p>
            <div className="mx-auto flex max-w-xs items-center gap-2">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") unlock(); }} placeholder="Contraseña" className="flex-1 rounded-xl border-2 border-[var(--rule-base,#e5e7eb)] px-3 py-2.5 text-sm outline-none" />
              <button onClick={unlock} disabled={unlocking} className="rounded-xl bg-[var(--color-primary,#00a0a0)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Abrir</button>
            </div>
            {error && <p className="mt-2 text-xs text-[var(--data-error-700,#b91c1c)]">{error}</p>}
          </div>
        ) : (
          <>
            {/* Vista previa del PDF (proxy same-origin: la URL firmada de Supabase se bloquea en iframe). */}
            <div className="mb-4 overflow-hidden rounded-2xl border border-[var(--rule-base,#e5e7eb)] bg-white shadow-sm">
              <iframe
                src={`/api/public/documents/${encodeURIComponent(token)}/raw${hasPassword && password ? `?password=${encodeURIComponent(password)}` : ""}`}
                title={doc.name}
                className="h-[42vh] w-full"
              />
            </div>

            <div className="rounded-3xl border border-[var(--rule-base,#e5e7eb)] bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <PenLine className="h-5 w-5 text-[var(--color-primary,#00a0a0)]" />
                <p className="text-sm font-extrabold text-[var(--text-primary,#0f172a)]">Firmá el documento</p>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold text-[var(--text-secondary,#475569)]">Tu nombre completo *</span>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. María Pacheco" className="mt-1 w-full rounded-xl border-2 border-[var(--rule-base,#e5e7eb)] px-3 py-2.5 text-sm outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-[var(--text-secondary,#475569)]">Cargo (opcional)</span>
                  <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Gerente, Contador…" className="mt-1 w-full rounded-xl border-2 border-[var(--rule-base,#e5e7eb)] px-3 py-2.5 text-sm outline-none" />
                </label>
              </div>

              <p className="mb-1.5 text-xs font-bold text-[var(--text-secondary,#475569)]">Trazá tu firma con el dedo o el mouse:</p>
              <div className="inline-block rounded-xl border-2 border-dashed border-[var(--rule-base,#e5e7eb)] bg-white">
                <canvas ref={canvasRef} width={W} height={H} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} style={{ touchAction: "none", maxWidth: "100%" }} className="block" />
              </div>

              {error && <p className="mt-2 text-xs text-[var(--data-error-700,#b91c1c)]">{error}</p>}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={clear} className="rounded-xl bg-[var(--surface-sunken,#f1f5f9)] px-3 py-2.5 text-xs font-bold text-[var(--text-secondary,#475569)]">Limpiar</button>
                <button onClick={handleSign} disabled={signing || name.trim().length < 2} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary,#00a0a0)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} Firmar documento
                </button>
              </div>

              <p className="mt-4 inline-flex items-start gap-1.5 text-[11px] text-[var(--text-tertiary,#94a3b8)]">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Al firmar, se estampa tu nombre, la fecha y un sello de verificación (hash) en el PDF. No es una firma criptográfica RENIEC.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
