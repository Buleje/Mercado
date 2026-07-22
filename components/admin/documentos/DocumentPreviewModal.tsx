"use client";

import { useState, useEffect, useRef } from "react";
import {
  X, Download, History, Shield, Share2, FileText, Eye, Upload, Lock, Clipboard, Check,
  PencilLine, Sparkles, AlarmClock, Link2, Users, Truck, ExternalLink, ChevronLeft, ChevronRight, GitCompare,
  FileSpreadsheet, Plus, Link as LinkChain, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getDocumentDetail, fetchVersions, fetchAudit, fetchShares, createShare, revokeShare,
  uploadVersion, signDocument, patchDocument, relateDoc,
} from "@/hooks/use-documents";
import { DOC_RESTRICTABLE_ROLES } from "@/lib/documents/doc-access";
import type {
  DbDocument, DbDocumentVersion, DbDocumentAuditLog, DbDocumentShare,
} from "@/lib/types/documents";

type Tab = "preview" | "details" | "versions" | "audit" | "share" | "sign";

interface Props {
  docId: string;
  onClose: () => void;
  onRefresh?: () => void;
  /** Lista completa (para resolver/elegir documentos relacionados). */
  allDocs?: DbDocument[];
  /** Navegación entre documentos de la lista (undefined en los extremos). */
  onPrev?: () => void;
  onNext?: () => void;
  position?: { current: number; total: number };
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

export function DocumentPreviewModal({ docId, onClose, onRefresh, allDocs, onPrev, onNext, position }: Props) {
  const [tab, setTab] = useState<Tab>("preview");
  const [doc, setDoc] = useState<DbDocument | null>(null);
  const [versions, setVersions] = useState<DbDocumentVersion[]>([]);
  const [audit, setAudit] = useState<DbDocumentAuditLog[]>([]);
  const [shares, setShares] = useState<DbDocumentShare[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      // No navegar entre documentos si el usuario está escribiendo en un campo.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getDocumentDetail(docId).then((r) => {
      if (!mounted) return;
      setDoc(r.document);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { mounted = false; };
  }, [docId]);

  // Vista previa same-origin: servimos el archivo desde nuestro proxy (/raw) en vez
  // de iframear la URL firmada de Supabase directamente (llegaba con X-Frame-Options
  // → "contenido bloqueado"). El proxy es same-origin, así que la CSP `frame-src 'self'`
  // lo permite y las cookies autentican el GET.
  const rawUrl = `/api/admin/documents/${docId}/raw`;

  // Lazy load por tab
  useEffect(() => {
    if (tab === "versions") fetchVersions(docId).then(setVersions);
    if (tab === "audit") fetchAudit(docId).then(setAudit);
    if (tab === "share") fetchShares(docId).then(setShares);
  }, [tab, docId]);

  if (!doc) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-[var(--surface-raised)] rounded-3xl p-8 text-sm text-[var(--text-tertiary)]">{loading ? "Cargando…" : "No disponible"}</div>
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
        className="w-full max-w-6xl max-h-[92vh] overflow-hidden bg-[var(--surface-raised)] rounded-3xl shadow-2xl flex flex-col"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-sunken)] shrink-0">
              <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-[var(--text-primary)] truncate">{doc.name}</p>
              <p className="text-xs text-[var(--text-tertiary)] tabular-nums">
                {formatBytes(doc.size)} · {doc.mimeType} · {new Date(doc.uploadedAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                {doc.versionCount ? ` · v${doc.versionCount + 1}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(onPrev || onNext) && (
              <div className="mr-1 flex items-center gap-1">
                <button
                  onClick={onPrev}
                  disabled={!onPrev}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Documento anterior (←)"
                  aria-label="Documento anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {position && <span className="text-xs font-bold tabular-nums text-[var(--text-tertiary)] min-w-[52px] text-center">{position.current} / {position.total}</span>}
                <button
                  onClick={onNext}
                  disabled={!onNext}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Documento siguiente (→)"
                  aria-label="Documento siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {(isPdf || isImage || isVideo) && (
              <a
                href={rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] transition-colors"
                title="Abrir en una pestaña nueva"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </a>
            )}
            {/* Descarga vía nuestro proxy (?download=1): confiable y con auth, no
                depende de la URL firmada que expira. */}
            <a
              href={`${rawUrl}?download=1`}
              download={doc.name}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Descargar
            </a>
            <button
              onClick={onClose}
              className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Tabs */}
        <nav className="flex items-center gap-1 px-5 pt-3 border-b border-[var(--rule-base)] shrink-0 overflow-x-auto">
          <TabBtn icon={Eye} active={tab === "preview"} onClick={() => setTab("preview")}>Vista previa</TabBtn>
          <TabBtn icon={Link2} active={tab === "details"} onClick={() => setTab("details")}>Detalles{doc.expiresAt || doc.customerId || doc.supplierId ? " •" : ""}</TabBtn>
          <TabBtn icon={History} active={tab === "versions"} onClick={() => setTab("versions")}>Versiones{doc.versionCount ? ` (${(doc.versionCount ?? 0) + 1})` : ""}</TabBtn>
          <TabBtn icon={Share2} active={tab === "share"} onClick={() => setTab("share")}>Compartir{doc.shareCount ? ` (${doc.shareCount})` : ""}</TabBtn>
          {isPdf && <TabBtn icon={PencilLine} active={tab === "sign"} onClick={() => setTab("sign")}>Firmar</TabBtn>}
          <TabBtn icon={Shield} active={tab === "audit"} onClick={() => setTab("audit")}>Auditoría</TabBtn>
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-[var(--surface-sunken)] min-h-0">
          {tab === "preview" && (
            <div className="h-full flex items-center justify-center p-4">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rawUrl} alt={doc.name} className="max-w-full max-h-full object-contain rounded-lg shadow-md" />
              ) : isPdf ? (
                <iframe src={rawUrl} title={doc.name} className="w-full h-[78vh] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)]" />
              ) : isVideo ? (
                <video src={rawUrl} controls className="max-w-full max-h-full rounded-lg" />
              ) : (
                <div className="text-center py-10">
                  <FileText className="h-16 w-16 mx-auto text-[var(--text-tertiary)] mb-3" />
                  <p className="text-base font-bold text-[var(--text-secondary)]">{doc.name}</p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">Sin vista previa. Descargá para verlo en tu equipo.</p>
                </div>
              )}
            </div>
          )}

          {tab === "details" && (
            <DetailsTab doc={doc} allDocs={allDocs ?? []} onPatched={(d) => { setDoc(d); onRefresh?.(); }} />
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
        active ? "border-primary text-primary" : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
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
  const [compareMode, setCompareMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

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
      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-2">Subir nueva versión</p>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">Reemplaza el archivo activo y guarda la versión actual como histórico.</p>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota del cambio (opcional)…"
          className="w-full px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] text-sm outline-none focus:border-primary mb-2"
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

      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--rule-base)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--text-primary)]">Historial</p>
          {versions.length >= 2 && (
            <button
              onClick={() => { setCompareMode((c) => !c); setPicked([]); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors",
                compareMode ? "bg-primary text-white" : "border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary hover:text-primary"
              )}
            >
              <GitCompare className="h-3.5 w-3.5" /> {compareMode ? "Salir" : "Comparar"}
            </button>
          )}
        </div>

        {compareMode && (
          <div className="border-b border-[var(--rule-base)] bg-primary/5 px-4 py-3">
            {picked.length < 2 ? (
              <p className="text-xs text-[var(--text-secondary)]">Elegí <strong>2 versiones</strong> para comparar ({picked.length}/2).</p>
            ) : (() => {
              const [a, b] = picked
                .map((id) => versions.find((v) => v.id === id))
                .filter((v): v is DbDocumentVersion => !!v)
                .sort((x, y) => x.versionNumber - y.versionNumber);
              const delta = b.size - a.size;
              return (
                <div>
                  <p className="mb-2 text-sm font-bold text-primary">v{a.versionNumber} → v{b.versionNumber}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[a, b].map((v) => (
                      <div key={v.id} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5">
                        <p className="text-xs font-bold text-[var(--text-primary)]">v{v.versionNumber}</p>
                        <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{v.changeNote ?? "Sin nota"}</p>
                        <p className="mt-0.5 text-[length:var(--ts-2xs,11px)] tabular-nums text-[var(--text-tertiary)]">{formatBytes(v.size)} · {relativeTime(v.uploadedAt)}</p>
                        <p className="truncate text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">por {v.uploadedById}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs font-bold text-[var(--text-secondary)]">
                    Tamaño: {delta === 0 ? "sin cambio" : `${delta > 0 ? "+" : "−"}${formatBytes(Math.abs(delta))}`}
                    {" · "}{b.versionNumber - a.versionNumber} versión(es) de diferencia
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        {versions.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic px-4 py-6">Aún no hay versiones previas. Subí una nueva para crear la primera entrada.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {versions.map((v) => {
              const isPicked = picked.includes(v.id);
              return (
                <li key={v.id} className={cn("px-4 py-3 flex items-center gap-3", compareMode && isPicked && "bg-primary/5")}>
                  {compareMode && (
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => setPicked((p) => (p.includes(v.id) ? p.filter((x) => x !== v.id) : [...p, v.id].slice(-2)))}
                      className="h-4 w-4 shrink-0 rounded border-2 border-[var(--rule-base)] accent-[var(--color-primary)]"
                      aria-label={`Comparar v${v.versionNumber}`}
                    />
                  )}
                  <span className="h-8 w-8 rounded-lg bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)] inline-flex items-center justify-center text-xs font-bold">v{v.versionNumber}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{v.changeNote ?? "Sin nota"}</p>
                    <p className="text-xs text-[var(--text-tertiary)] tabular-nums">{formatBytes(v.size)} · {relativeTime(v.uploadedAt)} · {v.uploadedById}</p>
                  </div>
                  {!compareMode && (
                    <div className="flex shrink-0 items-center gap-1">
                      <a href={`/api/admin/documents/${docId}/versions/${v.id}/raw`} target="_blank" rel="noopener" className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-colors" title="Ver esta versión" aria-label={`Ver v${v.versionNumber}`}><Eye className="h-4 w-4" /></a>
                      <a href={`/api/admin/documents/${docId}/versions/${v.id}/raw?download=1`} className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-colors" title="Descargar esta versión" aria-label={`Descargar v${v.versionNumber}`}><Download className="h-4 w-4" /></a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────── Details tab (ADR-119) ───────────

interface EntityOpt { id: string; name: string }

// ── Datos estructurados (facturas/recibos extraídos por IA) ───────────────────
type StructuredData = { docType?: string | null; ruc?: string | null; razonSocial?: string | null; numero?: string | null; fecha?: string | null; moneda?: string | null; total?: number | string | null; igv?: number | string | null };

function money(v: number | string | null | undefined, moneda?: string | null): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  if (!isFinite(n)) return null;
  return `${moneda === "USD" ? "$" : "S/"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StructuredCard({ doc }: { doc: DbDocument }) {
  const s = doc.ocrMetadata?.structured as StructuredData | null | undefined;
  if (!s || typeof s !== "object") return null;
  const rows = ([
    ["Tipo", s.docType ?? null],
    ["Nº", s.numero ?? null],
    ["RUC", s.ruc ?? null],
    ["Emisor", s.razonSocial ?? null],
    ["Fecha", s.fecha ?? null],
    ["IGV", money(s.igv, s.moneda)],
    ["Total", money(s.total, s.moneda)],
  ] as [string, string | null][]).filter(([, v]) => v);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/8 p-4 dark:bg-[var(--data-success-500)]/12">
      <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <FileSpreadsheet className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" /> Datos extraídos por IA
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{k}</p>
            <p className={cn("truncate text-sm font-semibold text-[var(--text-primary)]", k === "Total" && "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]")}>{v}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Documentos relacionados ──────────────────────────────────────────────────
function getRelatedIds(doc: DbDocument): string[] {
  const r = doc.ocrMetadata?.relatedIds;
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === "string") : [];
}

function RelatedSection({ doc, allDocs, onChanged }: { doc: DbDocument; allDocs: DbDocument[]; onChanged: (d: DbDocument) => void }) {
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const relatedIds = getRelatedIds(doc);
  const related = relatedIds.map((id) => allDocs.find((d) => d.id === id)).filter((d): d is DbDocument => !!d);
  const candidates = allDocs.filter((d) => d.id !== doc.id && !relatedIds.includes(d.id));

  async function toggle(relatedId: string, link: boolean) {
    setBusy(true);
    try {
      await relateDoc(doc.id, relatedId, link);
      const nextIds = link ? [...relatedIds, relatedId] : relatedIds.filter((x) => x !== relatedId);
      onChanged({ ...doc, ocrMetadata: { ...(doc.ocrMetadata ?? {}), relatedIds: nextIds } });
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <LinkChain className="h-4 w-4 text-primary" /> Documentos relacionados
      </p>
      <p className="mb-3 text-xs text-[var(--text-tertiary)]">Vinculá este documento con otros (contrato ↔ adenda, factura ↔ recibo).</p>

      {related.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {related.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5">
              <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{d.name}</span>
              <span className="shrink-0 text-[length:var(--ts-2xs,11px)] capitalize text-[var(--text-tertiary)]">{d.category}</span>
              <button onClick={() => toggle(d.id, false)} disabled={busy} className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] disabled:opacity-50" aria-label="Quitar vínculo"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => { if (e.target.value) toggle(e.target.value, true); }}
          disabled={busy}
          className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary dark:bg-[var(--surface-sunken)]"
        >
          <option value="" disabled>Elegí un documento…</option>
          {candidates.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      ) : (
        <button onClick={() => setAdding(true)} disabled={candidates.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--rule-base)] px-3 py-1.5 text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary disabled:opacity-40">
          <Plus className="h-4 w-4" /> Vincular documento
        </button>
      )}
    </section>
  );
}

// ── Permisos por documento (roles que pueden verlo) ──────────────────────────
function PermissionsSection({ doc, onChanged }: { doc: DbDocument; onChanged: (d: DbDocument) => void }) {
  const [busy, setBusy] = useState(false);
  const allowed = doc.allowedRoles ?? [];
  const restricted = allowed.length > 0;

  async function setRoles(next: string[]) {
    setBusy(true);
    try {
      const d = await patchDocument(doc.id, { allowedRoles: next });
      onChanged(d);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (role: string) => {
    const next = allowed.includes(role) ? allowed.filter((r) => r !== role) : [...allowed, role];
    setRoles(next);
  };

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <Lock className="h-4 w-4 text-primary" /> Permisos
      </p>
      <p className="mb-3 text-xs text-[var(--text-tertiary)]">
        {restricted
          ? "Solo el dueño/admin y los roles marcados pueden ver este documento."
          : "Ahora lo pueden ver todos los del equipo. Marcá roles para restringirlo."}
      </p>
      <div className="flex flex-wrap gap-2">
        {DOC_RESTRICTABLE_ROLES.map((r) => {
          const on = allowed.includes(r.role);
          return (
            <button
              key={r.role}
              onClick={() => toggle(r.role)}
              disabled={busy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50",
                on ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary/40",
              )}
            >
              {on ? <Check className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />} {r.label}
            </button>
          );
        })}
      </div>
      {restricted && (
        <button onClick={() => setRoles([])} disabled={busy} className="mt-3 text-xs font-semibold text-[var(--text-tertiary)] hover:text-primary disabled:opacity-50">
          Quitar restricción (ver todos)
        </button>
      )}
    </section>
  );
}

function DetailsTab({ doc, allDocs, onPatched }: { doc: DbDocument; allDocs: DbDocument[]; onPatched: (d: DbDocument) => void }) {
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
      {/* Datos estructurados extraídos por IA (facturas/recibos) */}
      <StructuredCard doc={doc} />

      {/* Documentos relacionados */}
      <RelatedSection doc={doc} allDocs={allDocs} onChanged={onPatched} />

      {/* Permisos por documento */}
      <PermissionsSection doc={doc} onChanged={onPatched} />

      {/* Vencimiento */}
      <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-1 inline-flex items-center gap-1.5">
          <AlarmClock className="h-4 w-4 text-[var(--data-error-500)]" /> Fecha de vencimiento
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          Para licencias, certificados o contratos. Te avisamos por WhatsApp 7 días antes.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            defaultValue={expiryValue}
            onChange={(e) => save("expiry", { expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] text-sm outline-none focus:border-primary"
          />
          {doc.expiresAt && (
            <button
              onClick={() => save("expiry", { expiresAt: null })}
              className="px-2.5 py-2 rounded-lg bg-[var(--surface-sunken)] hover:bg-[var(--surface-canvas)] text-xs font-bold text-[var(--text-secondary)]"
            >
              Quitar
            </button>
          )}
          {saving === "expiry" && <span className="text-xs text-[var(--text-tertiary)]">Guardando…</span>}
          {dias !== null && (
            <span className={cn(
              "text-xs font-bold px-2 py-1 rounded-md",
              dias < 0 ? "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" : dias <= 7 ? "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]" : dias <= 30 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" : "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]"
            )}>
              {dias < 0 ? "Ya venció" : dias === 0 ? "Vence hoy" : `Faltan ${dias} días`}
            </span>
          )}
        </div>
      </section>

      {/* Vincular a entidad */}
      <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-1 inline-flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-primary" /> Vincular a
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mb-3">
          Conectá este documento con un cliente o proveedor para encontrarlo desde su ficha.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)] inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Cliente</span>
            <select
              value={doc.customerId ?? ""}
              onChange={(e) => save("customer", { customerId: e.target.value || null })}
              className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] text-sm outline-none focus:border-primary bg-[var(--surface-raised)]"
            >
              <option value="">— Ninguno —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)] inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Proveedor</span>
            <select
              value={doc.supplierId ?? ""}
              onChange={(e) => save("supplier", { supplierId: e.target.value || null })}
              className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] text-sm outline-none focus:border-primary bg-[var(--surface-raised)]"
            >
              <option value="">— Ninguno —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        {saving && (saving === "customer" || saving === "supplier") && (
          <p className="text-xs text-[var(--text-tertiary)] mt-2">Guardando…</p>
        )}
      </section>

      {/* Texto OCR detectado */}
      {doc.ocrText && (
        <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
          <p className="text-sm font-bold text-[var(--text-primary)] mb-2 inline-flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" /> Texto detectado (OCR)
          </p>
          <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap line-clamp-6 leading-relaxed">{doc.ocrText.slice(0, 800)}</p>
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
      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-3">Crear link público</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Días de validez</span>
            <input
              type="number" min={1} max={90} value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value))))}
              className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)] inline-flex items-center gap-1.5">
              <input type="checkbox" checked={usePwd} onChange={(e) => setUsePwd(e.target.checked)} className="accent-[var(--color-primary)]" />
              <Lock className="h-3.5 w-3.5" /> Proteger con contraseña
            </span>
            {usePwd && (
              <input
                type="text" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Mínimo 4 caracteres"
                className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] text-sm outline-none focus:border-primary"
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

      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden">
        <p className="text-sm font-bold text-[var(--text-primary)] px-4 py-3 border-b border-[var(--rule-base)]">Links activos</p>
        {shares.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic px-4 py-6">No hay links generados.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
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
                        active ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]" : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] line-through"
                      )}
                    />
                    <button
                      onClick={() => copyLink(s.token)}
                      disabled={!active}
                      className="px-2 py-1.5 rounded-md bg-[var(--surface-sunken)] hover:bg-[var(--surface-canvas)] text-xs font-bold text-[var(--text-secondary)] inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {copied === s.token ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                      {copied === s.token ? "Copiado" : "Copiar"}
                    </button>
                    {active && (
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Te comparto este documento: ${url}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1.5 rounded-md bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/15 hover:bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)] text-xs font-bold inline-flex items-center gap-1"
                        title="Enviar por WhatsApp"
                      >
                        <Share2 className="h-3 w-3" /> WhatsApp
                      </a>
                    )}
                    {active && (
                      <button
                        onClick={async () => { await revokeShare(s.id); await reload(); }}
                        className="px-2 py-1.5 rounded-md bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 hover:bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)] text-xs font-bold"
                      >
                        Revocar
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    <span>Expira: {new Date(s.expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    <span>Accesos: {s.accessCount}</span>
                    {s.hasPassword && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> protegido</span>}
                    {s.revokedAt && <span className="text-[var(--data-error-500)]">Revocado</span>}
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
      alert("Error al firmar: " + (e instanceof Error ? e.message : String(e)));
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
    if (!signerName.trim()) { setSavedNote("Escribí tu nombre antes de guardar."); return; }
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
    <div className="p-5 space-y-4">
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
            <img src={savedSig.png} alt="Mi firma" className="h-10 w-24 rounded bg-white object-contain" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--text-primary)]">{savedSig.name}</p>
              {savedSig.role && <p className="truncate text-xs text-[var(--text-tertiary)]">{savedSig.role}</p>}
            </div>
            <button
              onClick={() => doSign(savedSig.name, savedSig.role, savedSig.png)}
              disabled={signing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary-dark disabled:opacity-50"
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
              className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Cargo (opcional)</span>
            <input
              type="text" value={signerRole} onChange={(e) => setSignerRole(e.target.value)}
              placeholder="Gerente, Contador…"
              className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] text-sm outline-none focus:border-primary"
            />
          </label>
        </div>

        <p className="text-xs font-bold text-[var(--text-secondary)] mb-1.5">Trazá tu firma:</p>
        <div className="inline-block border-2 border-dashed border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)]">
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
          <button onClick={clear} className="px-3 py-2 rounded-lg bg-[var(--surface-sunken)] hover:bg-[var(--surface-canvas)] text-xs font-bold text-[var(--text-secondary)]">Limpiar</button>
          <button
            onClick={handleSign}
            disabled={signing || !signerName.trim()}
            className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {signing && <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            <PencilLine className="h-3.5 w-3.5" /> Firmar PDF
          </button>
          <button onClick={saveMySignature} className="px-3 py-2 rounded-lg border-2 border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary inline-flex items-center gap-1.5" title="Guardá tu firma para reusarla con 1 clic">
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

const ACTION_META: Record<string, { color: string; label: string }> = {
  upload: { color: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]", label: "Upload" },
  view: { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: "Vista" },
  download: { color: "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]", label: "Descarga" },
  rename: { color: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]", label: "Renombrado" },
  delete: { color: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]", label: "Eliminado" },
  restore: { color: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]", label: "Restaurado" },
  share: { color: "bg-[var(--accent)]/15 text-[var(--accent)]", label: "Compartido" },
  share_revoke: { color: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]", label: "Share revocado" },
  sign: { color: "bg-primary/15 text-primary", label: "Firmado" },
  version: { color: "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]", label: "Nueva versión" },
  move: { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: "Movido" },
  tag: { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: "Tag" },
};

function AuditTab({ logs }: { logs: DbDocumentAuditLog[] }) {
  return (
    <div className="p-5">
      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden">
        <p className="text-sm font-bold text-[var(--text-primary)] px-4 py-3 border-b border-[var(--rule-base)]">Registro de actividad</p>
        {logs.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic px-4 py-6">Sin eventos.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {logs.map((l) => {
              const meta = ACTION_META[l.action] ?? { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: l.action };
              return (
                <li key={l.id} className="px-4 py-3 flex items-start gap-3">
                  <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-md shrink-0", meta.color)}>
                    {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{l.actorId}</p>
                    <p className="text-xs text-[var(--text-tertiary)] tabular-nums">{relativeTime(l.createdAt)} · {l.ipAddress ?? "—"}</p>
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
