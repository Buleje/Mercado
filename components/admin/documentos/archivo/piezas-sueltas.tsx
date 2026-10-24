"use client";

import { useRef, useEffect } from "react";
import { SIDEBAR_DEFAULT_W, daysUntil } from "./compartido";
import { type File as FileIcon, HardDrive, Folder, AlarmClock, Upload } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatBytes } from "../archivo-visual";
import { formatDate } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────

/**
 * Barra de agarre entre el sidebar y el listado (achicar/alargar). Se mueve
 * con pointermove/pointerup en `window` (no en el propio div) para que el
 * drag no se corte si el mouse sale del hilo de 12px mientras arrastra.
 * Persiste sólo en `onCommit` (pointerup) — escribir en cada pixel arrastrado
 * sería cientos de writes a localStorage por un solo drag.
 */
export function SidebarResizeHandle({
  width, onChange, onCommit, min, max,
}: {
  width: number;
  onChange: (w: number) => void;
  onCommit: (w: number) => void;
  min: number;
  max: number;
}) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(width);
  const lastW = useRef(width);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const next = Math.min(max, Math.max(min, startW.current + (e.clientX - startX.current)));
      lastW.current = next;
      onChange(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onCommit(lastW.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onChange, onCommit, min, max]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar barra lateral"
      title="Arrastra para achicar o alargar · doble click para restaurar"
      onPointerDown={(e) => {
        dragging.current = true;
        startX.current = e.clientX;
        startW.current = width;
        lastW.current = width;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onDoubleClick={() => { onChange(SIDEBAR_DEFAULT_W); onCommit(SIDEBAR_DEFAULT_W); }}
      className="group hidden lg:flex cursor-col-resize items-center justify-center"
    >
      <div className="h-10 w-1 rounded-full bg-[var(--rule-base)] group-hover:bg-primary transition-colors" />
    </div>
  );
}

export function StatBlock({ label, value, icon: Icon, tint, nota }: { label: string; value: string; icon: typeof FileIcon; tint: string; nota?: string }) {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-tertiary)]">{label}</p>
          <p className={cn("text-2xl font-extrabold tabular-nums mt-0.5 truncate", tint)}>{value}</p>
          {nota && <p className="text-sm text-[var(--text-tertiary)]">{nota}</p>}
        </div>
        <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", tint)} />
      </div>
    </div>
  );
}

/** ADR-119 — anillo de almacenamiento usado vs cuota orientativa del plan. */
export function StorageRing({ usedBytes, quotaBytes }: { usedBytes: number; quotaBytes: number }) {
  const pct = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 90 ? "var(--color-danger, #ef4444)" : pct >= 70 ? "var(--color-warning, #ff6b5b)" : "var(--color-primary)";
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4 flex items-center gap-3">
      <div className="relative h-12 w-12 shrink-0">
        <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
          <circle cx="22" cy="22" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="4" />
          <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} />
        </svg>
        <HardDrive className="absolute inset-0 m-auto h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--text-tertiary)]">Espacio usado</p>
        <p className="text-xl font-extrabold tabular-nums leading-tight whitespace-nowrap" style={{ color }}>{formatBytes(usedBytes)}</p>
        <p className="text-sm text-[var(--text-tertiary)] tabular-nums">{pct}% de {formatBytes(quotaBytes)}</p>
      </div>
    </div>
  );
}

/** ADR-119 — badge de vencimiento con semáforo (rojo/ámbar/verde). */
/**
 * Chip de UBICACIÓN del documento en las vistas generales: con carpeta muestra
 * el nombre (clic = abrirla); sin carpeta, un chip punteado que lo delata —
 * lo suelto se ve de un vistazo y se arrastra a su lugar.
 */
export function FolderChip({ nombre, onClick }: { nombre: string | null; onClick?: () => void }) {
  if (nombre === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--rule-strong)] px-1.5 py-0.5 text-sm font-bold text-[var(--text-tertiary)]" title="Este documento no está en ninguna carpeta">
        <Folder className="h-3 w-3 shrink-0" /> Sin carpeta
      </span>
    );
  }
  // Sin `onClick` (las tarjetas) es un rótulo; con él (la lista), un enlace a la carpeta.
  const cls = "inline-flex max-w-[140px] items-center gap-1 rounded-lg bg-[var(--surface-sunken)] px-1.5 py-0.5 text-sm font-bold text-[var(--text-secondary)]";
  if (!onClick) {
    return (
      <span title={`Carpeta "${nombre}"`} className={cls}>
        <Folder className="h-3 w-3 shrink-0" /> <span className="truncate">{nombre}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={`Abrir la carpeta "${nombre}"`}
      className={cn(cls, "transition hover:text-primary")}
    >
      <Folder className="h-3 w-3 shrink-0" /> <span className="truncate">{nombre}</span>
    </button>
  );
}

export function ExpiryBadge({ expiresAt, className }: { expiresAt: string | null; className?: string }) {
  const n = daysUntil(expiresAt);
  if (n === null) return null;
  const err = "bg-[var(--data-error-50)] text-[var(--data-error-700)] border-[var(--data-error-500)]/40 dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]";
  const warn = "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] border-[var(--data-warning-500)]/40 dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]";
  const ok = "bg-[var(--data-success-50)] text-[var(--data-success-700)] border-[var(--data-success-500)]/40 dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]";
  const { label, cls } =
    n < 0
      ? { label: "Vencido", cls: err }
      : n === 0
      ? { label: "Vence hoy", cls: err }
      : n <= 7
      ? { label: `Vence en ${n}d`, cls: err }
      : n <= 30
      ? { label: `Vence en ${n}d`, cls: warn }
      : { label: formatDate(expiresAt!), cls: ok };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-sm font-bold", cls, className)}>
      <AlarmClock className="h-3 w-3" /> {label}
    </span>
  );
}

// ── Estados / workflow del documento ──
export function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="bg-[var(--surface-raised)] border border-dashed border-[var(--rule-base)] rounded-2xl p-10 text-center">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] mb-4">
        <Upload className="h-7 w-7" />
      </div>
      <p className="text-lg font-extrabold text-[var(--text-primary)]">Sube tu primer documento</p>
      <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-md mx-auto">
        Arrastra y suelta archivos en cualquier parte de la pantalla, o usa el botón. Aceptamos PDF, imágenes, planillas, Word, ZIP y más (hasta 50 MB c/u).
      </p>
      <button onClick={onUpload} className="mt-5 inline-flex items-center gap-2 px-5 min-h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">
        <Upload className="h-4 w-4" /> Subir archivos
      </button>
    </div>
  );
}

