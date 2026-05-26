"use client";

import { useState, useEffect, useRef } from "react";
import {
  X, Download, History, Shield, Share2, FileText, Eye, Upload, Lock, Clipboard, Check,
  PencilLine, Sparkles, AlarmClock, Link2, Users, Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getDocumentDetail, fetchVersions, fetchAudit, fetchShares, createShare, revokeShare,
  uploadVersion, signDocument, patchDocument,
} from "@/hooks/use-documents";
import type {
  DbDocument, DbDocumentVersion, DbDocumentAuditLog, DbDocumentShare,
} from "@/lib/types/documents";

type Tab = "preview" | "details" | "versions" | "audit" | "share" | "sign";

interface Props {
  docId: string;
  onClose: () => void;
  onRefresh?: () => void;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export function DocumentPreviewModal({ docId, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<Tab>("preview");
  const [doc, setDoc] = useState<DbDocument | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [versions, setVersions] = useState<DbDocumentVersion[]>([]);
  const [audit, setAudit] = useState<DbDocumentAuditLog[]>([]);
  const [shares, setShares] = useState<DbDocumentShare[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getDocumentDetail(docId).then((r) => {
      if (!mounted) return;
      setDoc(r.document);
      setSignedUrl(r.signedUrl);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { mounted = false; };
  }, [docId]);

  // Lazy load por tab
  useEffect(() => {
    if (tab === "versions") fetchVersions(docId).then(setVersions);
    if (tab === "audit") fetchAudit(docId).then(setAudit);
    if (tab === "share") fetchShares(docId).then(setShares);
  }, [tab, docId]);

  if (!doc) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-3xl p-8 text-sm text-slate-500">{loading ? "Cargando…" : "No disponible"}</div>
      </div>
    );
  }

  const isPdf = doc.mimeType === "application/pdf";
  const isImage = doc.mimeType.startsWith("image/");
  const isVideo = doc.mimeType.startsWith("video/");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl max-h-[92vh] overflow-hidden bg-white rounded-3xl shadow-2xl flex flex-col"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 shrink-0">
              <FileText className="h-5 w-5 text-slate-600" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-slate-900 truncate">{doc.name}</p>
              <p className="text-xs text-slate-500 tabular-nums">
                {formatBytes(doc.size)} · {doc.mimeType} · {new Date(doc.uploadedAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                {doc.versionCount ? ` · v${doc.versionCount + 1}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {signedUrl && (
              <a
                href={signedUrl}
                download={doc.name}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            )}
            <button
              onClick={onClose}
              className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-900 transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Tabs */}
        <nav className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 shrink-0 overflow-x-auto">
          <TabBtn icon={Eye} active={tab === "preview"} onClick={() => setTab("preview")}>Vista previa</TabBtn>
          <TabBtn icon={Link2} active={tab === "details"} onClick={() => setTab("details")}>Detalles{doc.expiresAt || doc.customerId || doc.supplierId ? " •" : ""}</TabBtn>
          <TabBtn icon={History} active={tab === "versions"} onClick={() => setTab("versions")}>Versiones{doc.versionCount ? ` (${(doc.versionCount ?? 0) + 1})` : ""}</TabBtn>
          <TabBtn icon={Share2} active={tab === "share"} onClick={() => setTab("share")}>Compartir{doc.shareCount ? ` (${doc.shareCount})` : ""}</TabBtn>
          {isPdf && <TabBtn icon={PencilLine} active={tab === "sign"} onClick={() => setTab("sign")}>Firmar</TabBtn>}
          <TabBtn icon={Shield} active={tab === "audit"} onClick={() => setTab("audit")}>Auditoría</TabBtn>
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-slate-50 min-h-0">
          {tab === "preview" && (
            <div className="h-full flex items-center justify-center p-4">
              {isImage && signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signedUrl} alt={doc.name} className="max-w-full max-h-full object-contain rounded-lg shadow-md" />
              ) : isPdf && signedUrl ? (
                <iframe src={signedUrl} title={doc.name} className="w-full h-[78vh] rounded-lg border border-slate-200 bg-white" />
              ) : isVideo && signedUrl ? (
                <video src={signedUrl} controls className="max-w-full max-h-full rounded-lg" />
              ) : (
                <div className="text-center py-10">
                  <FileText className="h-16 w-16 mx-auto text-slate-300 mb-3" />
                  <p className="text-base font-bold text-slate-700">{doc.name}</p>
                  <p className="text-sm text-slate-500 mt-1">Sin vista previa. Descargá para verlo en tu equipo.</p>
                </div>
              )}
            </div>
          )}

          {tab === "details" && (
            <DetailsTab doc={doc} onPatched={(d) => { setDoc(d); onRefresh?.(); }} />
          )}

          {tab === "versions" && (
            <VersionsTab docId={docId} versions={versions} reload={() => fetchVersions(docId).then(setVersions)} onRefresh={onRefresh} />
          )}

          {tab === "share" && (
            <ShareTab docId={docId} shares={shares} reload={() => fetchShares(docId).then(setShares)} />
          )}

          {tab === "sign" && (
            <SignTab docId={docId} onSigned={() => { fetchVersions(docId).then(setVersions); fetchAudit(docId).then(setAudit); onRefresh?.(); }} />
          )}

          {tab === "audit" && (
            <AuditTab logs={audit} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  icon: Icon, children, active, onClick,
}: { icon: typeof Eye; children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2.5 text-sm font-bold inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors whitespace-nowrap",
        active ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-900"
      )}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

// ─────────── Versions tab ───────────

function VersionsTab({
  docId, versions, reload, onRefresh,
}: { docId: string; versions: DbDocumentVersion[]; reload: () => void; onRefresh?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleFile(f: File) {
    setUploading(true);
    try {
      await uploadVersion(docId, f, note.trim() || undefined);
      setNote("");
      await reload();
      onRefresh?.();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-bold text-slate-900 mb-2">Subir nueva versión</p>
        <p className="text-xs text-slate-500 mb-3">Reemplaza el archivo activo y guarda la versión actual como histórico.</p>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota del cambio (opcional)…"
          className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-primary mb-2"
        />
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" /> {uploading ? "Subiendo…" : "Elegir archivo…"}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <p className="text-sm font-bold text-slate-900 px-4 py-3 border-b border-slate-200">Historial</p>
        {versions.length === 0 ? (
          <p className="text-xs text-slate-500 italic px-4 py-6">Aún no hay versiones previas. Subí una nueva para crear la primera entrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {versions.map((v) => (
              <li key={v.id} className="px-4 py-3 flex items-center gap-3">
                <span className="h-8 w-8 rounded-lg bg-blue-100 text-blue-700 inline-flex items-center justify-center text-xs font-bold">v{v.versionNumber}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{v.changeNote ?? "Sin nota"}</p>
                  <p className="text-xs text-slate-500 tabular-nums">{formatBytes(v.size)} · {relativeTime(v.uploadedAt)} · {v.uploadedById}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────── Details tab (ADR-119) ───────────

interface EntityOpt { id: string; name: string }

function DetailsTab({ doc, onPatched }: { doc: DbDocument; onPatched: (d: DbDocument) => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [customers, setCustomers] = useState<EntityOpt[]>([]);
  const [suppliers, setSuppliers] = useState<EntityOpt[]>([]);

  const expiryValue = doc.expiresAt ? doc.expiresAt.slice(0, 10) : "";

  useEffect(() => {
    fetch("/api/customers?limit=200", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.customers ?? [];
        // Customer.@id es `phone` (no hay campo id) — Document.customerId guarda el phone.
        setCustomers(
          arr
            .map((c: { phone?: string; name?: string }) => ({ id: c.phone ?? "", name: c.name || c.phone || "Cliente" }))
            .filter((c: EntityOpt) => c.id)
        );
      })
      .catch(() => {/* picker opcional: si falla, queda sin opciones de cliente */});
    fetch("/api/suppliers", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.suppliers ?? [];
        setSuppliers(arr.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
      })
      .catch(() => {/* picker opcional: si falla, queda sin opciones de proveedor */});
  }, []);

  async function save(field: string, body: Record<string, unknown>) {
    setSaving(field);
    try {
      const d = await patchDocument(doc.id, body);
      onPatched(d);
    } finally {
      setSaving(null);
    }
  }

  const dias = doc.expiresAt
    ? Math.ceil((new Date(doc.expiresAt).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="p-5 space-y-4 max-w-2xl mx-auto">
      {/* Vencimiento */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-bold text-slate-900 mb-1 inline-flex items-center gap-1.5">
          <AlarmClock className="h-4 w-4 text-red-500" /> Fecha de vencimiento
        </p>
        <p className="text-xs text-slate-500 mb-3">
          Para licencias, certificados o contratos. Te avisamos por WhatsApp 7 días antes.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            defaultValue={expiryValue}
            onChange={(e) => save("expiry", { expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-primary"
          />
          {doc.expiresAt && (
            <button
              onClick={() => save("expiry", { expiresAt: null })}
              className="px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-600"
            >
              Quitar
            </button>
          )}
          {saving === "expiry" && <span className="text-xs text-slate-400">Guardando…</span>}
          {dias !== null && (
            <span className={cn(
              "text-xs font-bold px-2 py-1 rounded-md",
              dias < 0 ? "bg-red-100 text-red-700" : dias <= 7 ? "bg-red-50 text-red-600" : dias <= 30 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
            )}>
              {dias < 0 ? "Ya venció" : dias === 0 ? "Vence hoy" : `Faltan ${dias} días`}
            </span>
          )}
        </div>
      </section>

      {/* Vincular a entidad */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-bold text-slate-900 mb-1 inline-flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-primary" /> Vincular a
        </p>
        <p className="text-xs text-slate-500 mb-3">
          Conectá este documento con un cliente o proveedor para encontrarlo desde su ficha.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-600 inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Cliente</span>
            <select
              value={doc.customerId ?? ""}
              onChange={(e) => save("customer", { customerId: e.target.value || null })}
              className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-primary bg-white"
            >
              <option value="">— Ninguno —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600 inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Proveedor</span>
            <select
              value={doc.supplierId ?? ""}
              onChange={(e) => save("supplier", { supplierId: e.target.value || null })}
              className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-primary bg-white"
            >
              <option value="">— Ninguno —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        {saving && (saving === "customer" || saving === "supplier") && (
          <p className="text-xs text-slate-400 mt-2">Guardando…</p>
        )}
      </section>

      {/* Texto OCR detectado */}
      {doc.ocrText && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-sm font-bold text-slate-900 mb-2 inline-flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" /> Texto detectado (OCR)
          </p>
          <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-6 leading-relaxed">{doc.ocrText.slice(0, 800)}</p>
        </section>
      )}
    </div>
  );
}

// ─────────── Share tab ───────────

function ShareTab({ docId, shares, reload }: { docId: string; shares: DbDocumentShare[]; reload: () => void }) {
  const [days, setDays] = useState(7);
  const [pwd, setPwd] = useState("");
  const [usePwd, setUsePwd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function handleCreate() {
    setCreating(true);
    try {
      await createShare(docId, {
        expiresInDays: days,
        ...(usePwd && pwd.length >= 4 ? { password: pwd } : {}),
      });
      setPwd("");
      setUsePwd(false);
      await reload();
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(token: string) {
    const url = `${baseUrl}/d/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // fallback
      window.prompt("Copiá este link:", url);
    }
  }

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-bold text-slate-900 mb-3">Crear link público</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Días de validez</span>
            <input
              type="number" min={1} max={90} value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value))))}
              className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600 inline-flex items-center gap-1.5">
              <input type="checkbox" checked={usePwd} onChange={(e) => setUsePwd(e.target.checked)} className="accent-[var(--color-primary)]" />
              <Lock className="h-3.5 w-3.5" /> Proteger con contraseña
            </span>
            {usePwd && (
              <input
                type="text" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Mínimo 4 caracteres"
                className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-primary"
              />
            )}
          </label>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || (usePwd && pwd.length < 4)}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50"
        >
          <Share2 className="h-3.5 w-3.5" /> {creating ? "Generando…" : "Generar link"}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <p className="text-sm font-bold text-slate-900 px-4 py-3 border-b border-slate-200">Links activos</p>
        {shares.length === 0 ? (
          <p className="text-xs text-slate-500 italic px-4 py-6">No hay links generados.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shares.map((s) => {
              const url = `${baseUrl}/d/${s.token}`;
              const active = !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now();
              return (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={url}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className={cn(
                        "flex-1 min-w-0 px-2 py-1.5 rounded-md border text-xs font-mono",
                        active ? "border-slate-200 bg-slate-50 text-slate-700" : "border-slate-200 bg-slate-100 text-slate-400 line-through"
                      )}
                    />
                    <button
                      onClick={() => copyLink(s.token)}
                      disabled={!active}
                      className="px-2 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {copied === s.token ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                      {copied === s.token ? "Copiado" : "Copiar"}
                    </button>
                    {active && (
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Te comparto este documento: ${url}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold inline-flex items-center gap-1"
                        title="Enviar por WhatsApp"
                      >
                        <Share2 className="h-3 w-3" /> WhatsApp
                      </a>
                    )}
                    {active && (
                      <button
                        onClick={async () => { await revokeShare(s.id); await reload(); }}
                        className="px-2 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold"
                      >
                        Revocar
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[length:var(--ts-2xs)] text-slate-500">
                    <span>Expira: {new Date(s.expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    <span>Accesos: {s.accessCount}</span>
                    {s.hasPassword && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> protegido</span>}
                    {s.revokedAt && <span className="text-red-500">Revocado</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────── Sign tab ───────────

function SignTab({ docId, onSigned }: { docId: string; onSigned: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");
  const [signing, setSigning] = useState(false);
  const [result, setResult] = useState<{ versionNumber: number; sha: string } | null>(null);

  const w = 480;
  const h = 160;

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

  async function handleSign() {
    if (!signerName.trim()) return;
    setSigning(true);
    try {
      const c = canvasRef.current!;
      const dataUrl = c.toDataURL("image/png");
      const r = await signDocument(docId, {
        signerName: signerName.trim(),
        signerRole: signerRole.trim() || undefined,
        signatureImagePngBase64: dataUrl,
      });
      setResult({ versionNumber: r.version.versionNumber, sha: r.originalSha256 });
      onSigned();
    } catch (e) {
      alert("Error al firmar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <PencilLine className="h-5 w-5 text-primary" />
          <p className="text-sm font-bold text-slate-900">Firma digital visual</p>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Estampa un sello visual + hash SHA-256 en la última página del PDF. NO es firma criptográfica RENIEC — es un sello con audit trail.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Tu nombre</span>
            <input
              type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Cargo (opcional)</span>
            <input
              type="text" value={signerRole} onChange={(e) => setSignerRole(e.target.value)}
              placeholder="Gerente, Contador…"
              className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>

        <p className="text-xs font-bold text-slate-600 mb-1.5">Trazá tu firma:</p>
        <div className="inline-block border-2 border-dashed border-slate-300 rounded-xl bg-white">
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
        <div className="flex items-center gap-2 mt-3">
          <button onClick={clear} className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700">Limpiar</button>
          <button
            onClick={handleSign}
            disabled={signing || !signerName.trim()}
            className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {signing && <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            <PencilLine className="h-3.5 w-3.5" /> Firmar PDF
          </button>
        </div>

        {result && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
            <p className="font-bold text-emerald-800 inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Firmado correctamente
            </p>
            <p className="text-emerald-700 mt-1 tabular-nums">Nueva versión: v{result.versionNumber}</p>
            <p className="text-emerald-700 mt-0.5 font-mono break-all text-[length:var(--ts-2xs)]">SHA-256: {result.sha}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────── Audit tab ───────────

const ACTION_META: Record<string, { color: string; label: string }> = {
  upload: { color: "bg-emerald-100 text-emerald-700", label: "Upload" },
  view: { color: "bg-slate-100 text-slate-600", label: "Vista" },
  download: { color: "bg-blue-100 text-blue-700", label: "Descarga" },
  rename: { color: "bg-amber-100 text-amber-700", label: "Renombrado" },
  delete: { color: "bg-red-100 text-red-700", label: "Eliminado" },
  restore: { color: "bg-emerald-100 text-emerald-700", label: "Restaurado" },
  share: { color: "bg-[var(--accent)]/15 text-[var(--accent)]", label: "Compartido" },
  share_revoke: { color: "bg-red-100 text-red-700", label: "Share revocado" },
  sign: { color: "bg-primary/15 text-primary", label: "Firmado" },
  version: { color: "bg-blue-100 text-blue-700", label: "Nueva versión" },
  move: { color: "bg-slate-100 text-slate-600", label: "Movido" },
  tag: { color: "bg-slate-100 text-slate-600", label: "Tag" },
};

function AuditTab({ logs }: { logs: DbDocumentAuditLog[] }) {
  return (
    <div className="p-5">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <p className="text-sm font-bold text-slate-900 px-4 py-3 border-b border-slate-200">Registro de actividad</p>
        {logs.length === 0 ? (
          <p className="text-xs text-slate-500 italic px-4 py-6">Sin eventos.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((l) => {
              const meta = ACTION_META[l.action] ?? { color: "bg-slate-100 text-slate-600", label: l.action };
              return (
                <li key={l.id} className="px-4 py-3 flex items-start gap-3">
                  <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-md shrink-0", meta.color)}>
                    {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">{l.actorId}</p>
                    <p className="text-xs text-slate-500 tabular-nums">{relativeTime(l.createdAt)} · {l.ipAddress ?? "—"}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
