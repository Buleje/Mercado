"use client";

import { useState, useEffect, useRef } from "react";
import { esHojaEditable, esHojaLegible } from "@/lib/documentos/hoja-calculo";
import { esTextoEditable, esTextoLegible } from "@/lib/documentos/texto-docx";
import { esPresentacion } from "@/lib/documentos/presentacion";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { esImagenRenderizable, esImagenConvertible } from "@/lib/documents/tipos-archivo";
import dynamic from "next/dynamic";

/** El visor arrastra exceljs: entra sólo cuando se abre una planilla. */
const HojaPreview = dynamic(() => import("./HojaPreview"), {
  ssr: false,
  loading: () => <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">Abriendo la planilla…</p>,
});

/** Las presentaciones también: jszip sólo cuando se abre una. */
const PresentacionPreview = dynamic(() => import("./PresentacionPreview"), {
  ssr: false, loading: () => <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">Abriendo la presentación…</p>, });

/** Ídem para los documentos de texto (jszip para leer el .docx). */
const TextoPreview = dynamic(() => import("./TextoPreview"), {
  ssr: false,
  loading: () => <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">Abriendo el documento…</p>,
});
import {
  X, Download, History, Shield, Share2, FileText, Eye, Upload, Lock, Clipboard, Check, Table, MessageCircle,
  Pencil as PencilLine, Sparkles, Clock as AlarmClock, Link2, Users, Truck, ExternalLink,
  ChevronLeft, ChevronRight, GitCompareArrows as GitCompare,
  FileSpreadsheet, Plus, Link as LinkChain, Save, Folder as FolderIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { VisorImagen, VisorPdf } from "./VisorArchivo";
import { SendWhatsAppModal } from "./SendWhatsAppModal";
import CompararVersiones from "./CompararVersiones";
import {
  getDocumentDetail, fetchVersions, fetchAudit, fetchShares, createShare, revokeShare,
  uploadVersion, signDocument, patchDocument, relateDoc, docApproval,
} from "@/hooks/use-documents";
import { DOC_RESTRICTABLE_ROLES } from "@/lib/documents/doc-access";
import { buildChildrenMap, flattenAll, folderPath } from "@/lib/documentos/folder-tree";
import type {
  DbDocument, DbDocumentFolder, DbDocumentVersion, DbDocumentAuditLog, DbDocumentShare,
} from "@/lib/types/documents";

type Tab = "preview" | "details" | "versions" | "audit" | "share" | "sign";

interface Props {
  docId: string;
  onClose: () => void;
  onRefresh?: () => void;
  /** Lista completa (para resolver/elegir documentos relacionados). */
  allDocs?: DbDocument[];
  /** Carpetas del drive (para mostrar la ubicación y mover desde Detalles). */
  folders?: DbDocumentFolder[];
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

export function DocumentPreviewModal({ docId, onClose, onRefresh, allDocs, folders, onPrev, onNext, position }: Props) {
  const [tab, setTab] = useState<Tab>("preview");
  const [doc, setDoc] = useState<DbDocument | null>(null);
  const [versions, setVersions] = useState<DbDocumentVersion[]>([]);
  const [audit, setAudit] = useState<DbDocumentAuditLog[]>([]);
  const [shares, setShares] = useState<DbDocumentShare[]>([]);
  const [loading, setLoading] = useState(true);
  /** Mandar ESTE archivo por WhatsApp sin volver a la grilla. */
  const [enviando, setEnviando] = useState(false);

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
  // La grilla ya pidió esta miniatura, así que sale de la caché del navegador:
  // sirve de vista previa instantánea mientras se lee el archivo completo.
  const miniaturaUrl = urlMiniatura(docId);

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
  const isImage = esImagenRenderizable(doc.name, doc.mimeType);
  /** HEIC/TIFF/SVG: el navegador no las dibuja, el servidor las convierte a PNG. */
  const imagenConvertible = !isImage && esImagenConvertible(doc.name, doc.mimeType);
  /** .pptx/.odp: se muestra el guion de las diapositivas. */
  const esPresenta = esPresentacion(doc.mimeType, doc.name);
  const isVideo = doc.mimeType.startsWith("video/");
  /** .xlsx/.csv/.ods: se muestran como planilla en vez del cartel "sin vista previa". */
  const esHoja = esHojaLegible(doc.mimeType, doc.name);
  /** .docx/.txt/.md/.odt: se leen en el modal como documento. */
  const esTexto = esTextoLegible(doc.mimeType, doc.name);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl max-h-[92vh] overflow-hidden bg-[var(--surface-raised)] rounded-3xl shadow-2xl flex flex-col"
      >
        {/* Header — en un celular los botones bajan a una segunda línea en vez
            de aplastar el nombre del archivo hasta partirlo letra por letra. */}
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1 basis-56">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-sunken)] shrink-0">
              <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-[var(--text-primary)] truncate">{doc.name}</p>
              <p className="text-xs text-[var(--text-tertiary)] tabular-nums truncate">
                {formatBytes(doc.size)} · {doc.mimeType} · {new Date(doc.uploadedAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                {doc.versionCount ? ` · v${doc.versionCount + 1}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
            {/* Editar en el panel en vez de bajar → abrir Office → volver a
                subir. Guarda como versión nueva del mismo documento. */}
            {(esHojaEditable(doc.mimeType, doc.name) || esTextoEditable(doc.mimeType, doc.name)) && (
              <a
                href={`/admin/documentos/${docId}/editar`}
                target="_blank"
                rel="noopener noreferrer"
                title="Editar en una pestaña nueva y guardarlo acá mismo"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] text-xs font-bold text-white hover:bg-[var(--accent-600)] transition-colors"
              >
                {esHojaEditable(doc.mimeType, doc.name)
                  ? <><Table className="h-3.5 w-3.5" /> Editar planilla</>
                  : <><PencilLine className="h-3.5 w-3.5" /> Editar documento</>}
              </a>
            )}
            {/* Mandar el archivo por WhatsApp sin cerrar la ficha: mirarlo y
                mandarlo es el mismo gesto (llega el archivo, no un enlace). */}
            <button
              onClick={() => setEnviando(true)}
              title="Mandar este archivo por WhatsApp"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Enviar
            </button>
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
                <VisorImagen url={rawUrl} nombre={doc.name} />
              ) : imagenConvertible ? (
                // Convertida en el servidor: una foto HEIC del celular o un
                // escaneo TIFF se ven acá en vez de un ícono gris.
                <VisorImagen url={`/api/admin/documents/${doc.id}/preview-image`} nombre={doc.name} />
              ) : esPresenta ? (
                <div className="max-h-[78vh] w-full">
                  <PresentacionPreview url={rawUrl} nombre={doc.name} />
                </div>
              ) : isPdf ? (
                // Por blob y no `src={rawUrl}`: así un 429 sale como aviso y no
                // dibujado como texto adentro del visor.
                <VisorPdf url={rawUrl} nombre={doc.name} tamano={doc.size} />
              ) : isVideo ? (
                <video src={rawUrl} controls className="max-w-full max-h-full rounded-lg" />
              ) : esHoja ? (
                // Las planillas se leen acá mismo: antes había que bajarlas para
                // saber si era la lista correcta. Alto FIJO (no `max-h`): la
                // tabla scrollea por dentro y la barra de estado queda a la
                // vista en vez de empujarse fuera del modal.
                <div className="h-[70vh] w-full self-stretch">
                  <HojaPreview url={rawUrl} mimeType={doc.mimeType} nombre={doc.name} onEnviar={() => setEnviando(true)} miniaturaUrl={miniaturaUrl} />
                </div>
              ) : esTexto ? (
                <div className="h-[70vh] w-full self-stretch">
                  <TextoPreview url={rawUrl} mimeType={doc.mimeType} nombre={doc.name} miniaturaUrl={miniaturaUrl} />
                </div>
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
            <DetailsTab doc={doc} allDocs={allDocs ?? []} folders={folders ?? []} onPatched={(d) => { setDoc(d); onRefresh?.(); }} />
          )}

          {tab === "versions" && (
            <VersionsTab doc={doc} docId={docId} versions={versions} reload={() => fetchVersions(docId).then(setVersions)} onRefresh={onRefresh} />
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

      {/* El envío se monta sobre la ficha; al cerrarlo se vuelve al documento. */}
      {enviando && (
        <SendWhatsAppModal docs={[doc]} onClose={() => { setEnviando(false); fetchAudit(docId).then(setAudit); }} />
      )}
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
        // `shrink-0`: la barra scrollea de costado en un celular en vez de
        // apretar las pestañas hasta que se pisan entre ellas.
        "px-3 py-2.5 text-sm font-bold inline-flex shrink-0 items-center gap-1.5 border-b-2 -mb-px transition-colors whitespace-nowrap",
        active ? "border-primary text-primary" : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      )}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

// ─────────── Versions tab ───────────

function VersionsTab({
  doc, docId, versions, reload, onRefresh,
}: { doc: DbDocument; docId: string; versions: DbDocumentVersion[]; reload: () => void; onRefresh?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  /** Muestra el diff de contenido (no sólo tamaño y fecha). */
  const [verDiff, setVerDiff] = useState(false);

  /**
   * La versión ACTUAL entra a la lista de comparables: la pregunta más común
   * es "¿qué cambió desde la v3 hasta lo que estoy viendo?", y el archivo
   * activo no vive en el historial (ese guarda las anteriores).
   */
  const actual: DbDocumentVersion = {
    id: "actual",
    documentId: docId,
    versionNumber: (versions[0]?.versionNumber ?? 0) + 1,
    changeNote: "Versión actual",
    mimeType: doc.mimeType,
    size: doc.size,
    storagePath: doc.storagePath,
    uploadedById: doc.uploadedById,
    uploadedAt: doc.updatedAt || doc.uploadedAt,
  };
  const comparables = [actual, ...versions];
  const urlDe = (id: string) => id === "actual"
    ? `/api/admin/documents/${docId}/raw`
    : `/api/admin/documents/${docId}/versions/${id}/raw`;

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
          {versions.length >= 1 && (
            <button
              onClick={() => { setCompareMode((c) => !c); setPicked([]); setVerDiff(false); }}
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
              // Se busca en `comparables` (incluye la versión ACTUAL): buscar
              // sólo en el historial dejaba `b` en undefined y la ficha se caía
              // con "Algo salió mal" apenas se elegía la actual.
              const elegidas = picked
                .map((id) => comparables.find((v) => v.id === id))
                .filter((v): v is DbDocumentVersion => !!v)
                .sort((x, y) => x.versionNumber - y.versionNumber);
              if (elegidas.length < 2) {
                return <p className="text-xs text-[var(--text-secondary)]">Elegí <strong>2 versiones</strong> para comparar.</p>;
              }
              const [a, b] = elegidas;
              const etiqueta = (v: DbDocumentVersion) => (v.id === "actual" ? "Actual" : `v${v.versionNumber}`);
              const delta = b.size - a.size;
              return (
                <div>
                  <p className="mb-2 text-sm font-bold text-primary">{etiqueta(a)} → {etiqueta(b)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[a, b].map((v) => (
                      <div key={v.id} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5">
                        <p className="text-xs font-bold text-[var(--text-primary)]">{etiqueta(v)}</p>
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

                  {/* El tamaño no dice QUÉ cambió: esto lo lee y lo lista. */}
                  {!verDiff ? (
                    <button
                      onClick={() => setVerDiff(true)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
                    >
                      <GitCompare className="h-3.5 w-3.5" /> Ver qué cambió
                    </button>
                  ) : (
                    <div className="mt-3 border-t border-[var(--rule-base)] pt-3">
                      <CompararVersiones
                        urlAntes={urlDe(a.id)}
                        urlDespues={urlDe(b.id)}
                        etiquetaAntes={etiqueta(a)}
                        etiquetaDespues={etiqueta(b)}
                        mimeType={doc.mimeType}
                        nombre={doc.name}
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {versions.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic px-4 py-6">Aún no hay versiones previas. Subí una nueva para crear la primera entrada.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {(compareMode ? comparables : versions).map((v) => {
              const isPicked = picked.includes(v.id);
              return (
                <li key={v.id} className={cn("px-4 py-3 flex items-center gap-3", compareMode && isPicked && "bg-primary/5")}>
                  {compareMode && (
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => { setVerDiff(false); setPicked((p) => (p.includes(v.id) ? p.filter((x) => x !== v.id) : [...p, v.id].slice(-2))); }}
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

// ── Descripción rica generada por IA (buscable) ──────────────────────────────
type DocEntities = { people?: string[]; orgs?: string[]; places?: string[]; dates?: string[]; amounts?: string[] };
const ENTITY_LABEL: { key: keyof DocEntities; label: string }[] = [
  { key: "people", label: "Personas" },
  { key: "orgs", label: "Empresas" },
  { key: "places", label: "Lugares" },
  { key: "dates", label: "Fechas" },
  { key: "amounts", label: "Montos" },
];

function DescriptionSection({ doc }: { doc: DbDocument }) {
  const meta = doc.ocrMetadata as { description?: string; summary?: string; entities?: DocEntities } | null | undefined;
  const description = meta?.description || meta?.summary;
  const entities = meta?.entities;
  const hasEntities = entities && ENTITY_LABEL.some(({ key }) => (entities[key]?.length ?? 0) > 0);
  if (!description && !hasEntities) return null;
  return (
    <section className="rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-4">
      <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <Sparkles className="h-4 w-4 text-[var(--accent)]" /> Descripción (IA)
      </p>
      {description && <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>}
      {hasEntities && (
        <div className="mt-3 space-y-1.5">
          {ENTITY_LABEL.map(({ key, label }) => {
            const vals = entities?.[key] ?? [];
            if (vals.length === 0) return null;
            return (
              <div key={key} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] w-16 shrink-0">{label}</span>
                {vals.map((v, i) => (
                  <span key={i} className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-semibold text-[var(--text-secondary)]">{v}</span>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

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

// ── Flujo de aprobación (borrador → revisión → aprobado) ─────────────────────
type ApprovalTrail = { status?: string; requestedBy?: string; requestedAt?: string; decidedBy?: string; decidedAt?: string; note?: string };
const APPROVAL_LABEL: Record<string, { label: string; cls: string }> = {
  approved: { label: "Aprobado", cls: "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
  review: { label: "En revisión", cls: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" },
  draft: { label: "Borrador", cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
};

function ApprovalSection({ doc, onChanged }: { doc: DbDocument; onChanged: (d: DbDocument) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const trail = (doc.ocrMetadata?.approval as ApprovalTrail | undefined) ?? {};
  const status = doc.status;

  async function act(action: "request" | "approve" | "reject") {
    setBusy(true);
    try {
      await docApproval(doc.id, action, note.trim() || undefined);
      const nextStatus = action === "request" ? "review" : action === "approve" ? "approved" : "draft";
      const now = new Date().toISOString();
      const nextTrail: ApprovalTrail = action === "request"
        ? { status: "review", requestedBy: "vos", requestedAt: now, note: note.trim() || undefined }
        : { ...trail, status: nextStatus, decidedBy: "vos", decidedAt: now, note: note.trim() || undefined };
      onChanged({ ...doc, status: nextStatus, ocrMetadata: { ...(doc.ocrMetadata ?? {}), approval: nextTrail } });
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  const badge = APPROVAL_LABEL[status];

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <Shield className="h-4 w-4 text-primary" /> Aprobación
        {badge && <span className={cn("ml-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold", badge.cls)}>{badge.label}</span>}
      </p>

      {(trail.requestedAt || trail.decidedAt) && (
        <div className="mb-3 space-y-0.5 text-xs text-[var(--text-tertiary)]">
          {trail.requestedAt && <p>Enviado a revisión por {trail.requestedBy} · {relativeTime(trail.requestedAt)}</p>}
          {trail.decidedAt && <p>{status === "approved" ? "Aprobado" : "Decidido"} por {trail.decidedBy} · {relativeTime(trail.decidedAt)}{trail.note ? ` — "${trail.note}"` : ""}</p>}
        </div>
      )}

      {status === "review" ? (
        <>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className="mb-2 h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary" />
          <div className="flex gap-2">
            <button onClick={() => act("approve")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--data-success-700)] px-3 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 dark:bg-[var(--data-success-500)]"><Check className="h-4 w-4" /> Aprobar</button>
            <button onClick={() => act("reject")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--data-error-500)]/40 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-500)]/10 disabled:opacity-50 dark:text-[var(--data-error-500)]"><X className="h-4 w-4" /> Rechazar</button>
          </div>
        </>
      ) : status === "approved" ? (
        <button onClick={() => act("request")} disabled={busy} className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-primary disabled:opacity-50">Reabrir revisión</button>
      ) : (
        <button onClick={() => act("request")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50"><PencilLine className="h-4 w-4" /> Solicitar aprobación</button>
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
                on ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary/40",
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

function DetailsTab({ doc, allDocs, folders, onPatched }: { doc: DbDocument; allDocs: DbDocument[]; folders: DbDocumentFolder[]; onPatched: (d: DbDocument) => void }) {
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

  const folderById = new Map(folders.map((f) => [f.id, f]));
  const rutaCarpeta = doc.folderId ? folderPath(folderById, doc.folderId).map((f) => f.name).join(" › ") : null;
  const arbolCarpetas = flattenAll(buildChildrenMap(folders));

  return (
    <div className="p-5 space-y-4 max-w-2xl mx-auto">
      {/* Carpeta — dónde vive el documento, y mover sin salir del detalle */}
      <section className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4">
        <p className="text-sm font-bold text-[var(--text-primary)] mb-2 inline-flex items-center gap-1.5">
          <FolderIcon className="h-4 w-4 text-[var(--accent)]" /> Carpeta
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {rutaCarpeta ? (
            <span className="text-sm font-bold text-[var(--text-primary)]">{rutaCarpeta}</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--rule-strong)] px-2 py-0.5 text-xs font-bold text-[var(--text-tertiary)]">
              Sin carpeta (raíz)
            </span>
          )}
          <select
            value={doc.folderId ?? ""}
            onChange={(e) => save("folder", { folderId: e.target.value || null })}
            disabled={saving === "folder"}
            aria-label="Mover a otra carpeta"
            className="h-9 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-secondary)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
          >
            <option value="">Sin carpeta (raíz)</option>
            {arbolCarpetas.map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>{`${"  ".repeat(depth)}${depth > 0 ? "└ " : ""}${folder.name}`}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Descripción rica generada por IA (buscable) */}
      <DescriptionSection doc={doc} />

      {/* Datos estructurados extraídos por IA (facturas/recibos) */}
      <StructuredCard doc={doc} />

      {/* Documentos relacionados */}
      <RelatedSection doc={doc} allDocs={allDocs} onChanged={onPatched} />

      {/* Flujo de aprobación */}
      <ApprovalSection doc={doc} onChanged={onPatched} />

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
  sign: { color: "bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]", label: "Firmado" },
  version: { color: "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]", label: "Nueva versión" },
  move: { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: "Movido" },
  tag: { color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]", label: "Tag" },
  whatsapp_send: { color: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]", label: "Enviado por WhatsApp" },
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
