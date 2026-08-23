"use client";

import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import type { SmartFolder, SmartFolderRules } from "@/lib/documentos/smart-folders";

/**
 * Modal para crear/editar una carpeta inteligente (filtro guardado). No mueve
 * archivos: define reglas que agrupan dinámicamente los documentos que cumplen.
 */
const CATEGORIES = ["", "contratos", "facturas", "manuales", "fotos", "personal", "otros"];
const STATUSES = ["", "draft", "review", "approved", "archived"];
const STATUS_LABEL: Record<string, string> = { draft: "Borrador", review: "En revisión", approved: "Aprobado", archived: "Archivado" };

export function SmartFolderModal({ initial, onSave, onClose }: { initial?: SmartFolder; onSave: (f: SmartFolder) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [r, setR] = useState<SmartFolderRules>(initial?.rules ?? {});

  const set = (patch: Partial<SmartFolderRules>) => setR((prev) => ({ ...prev, ...patch }));

  const save = () => {
    const clean: SmartFolderRules = {};
    if (r.category) clean.category = r.category;
    if (r.tag?.trim()) clean.tag = r.tag.trim();
    if (r.status) clean.status = r.status;
    if (r.favorite) clean.favorite = true;
    if (r.isComprobante) clean.isComprobante = true;
    if (r.expiringDays !== undefined && !Number.isNaN(r.expiringDays)) clean.expiringDays = r.expiringDays;
    if (r.minTotal !== undefined && !Number.isNaN(r.minTotal)) clean.minTotal = r.minTotal;
    onSave({ id: initial?.id ?? `sf_${Math.round(performance.now())}_${name.slice(0, 4)}`, name: name.trim() || "Carpeta inteligente", rules: clean });
    onClose();
  };

  const inputCls = "mt-1 h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary";
  const labelCls = "text-xs font-bold text-[var(--text-secondary)]";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[30rem] rounded-2xl bg-white dark:bg-[var(--color-card)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle as="h3" className="inline-flex items-center gap-2 text-base font-bold text-[var(--text-primary)]"><Sparkles className="h-5 w-5 text-primary" /> Carpeta inteligente</CardTitle>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">Agrupa dinámicamente los documentos que cumplen estas reglas. No mueve archivos.</p>

        <label className="block mb-3">
          <span className={labelCls}>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Facturas grandes del mes" className={inputCls} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Categoría</span>
            <select value={r.category ?? ""} onChange={(e) => set({ category: e.target.value || undefined })} className={inputCls}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c ? c.charAt(0).toUpperCase() + c.slice(1) : "Cualquiera"}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Estado</span>
            <select value={r.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })} className={inputCls}>
              {STATUSES.map((s) => <option key={s} value={s}>{s ? STATUS_LABEL[s] : "Cualquiera"}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Etiqueta contiene</span>
            <input value={r.tag ?? ""} onChange={(e) => set({ tag: e.target.value || undefined })} placeholder="ej: alquiler" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Vence en ≤ (días)</span>
            <input type="number" value={r.expiringDays ?? ""} onChange={(e) => set({ expiringDays: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="ej: 30" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Total ≥ (S/)</span>
            <input type="number" value={r.minTotal ?? ""} onChange={(e) => set({ minTotal: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="ej: 1000" className={inputCls} />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <input type="checkbox" checked={!!r.isComprobante} onChange={(e) => set({ isComprobante: e.target.checked || undefined })} className="h-4 w-4 accent-[var(--color-primary)]" /> Solo comprobantes (factura/recibo)
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <input type="checkbox" checked={!!r.favorite} onChange={(e) => set({ favorite: e.target.checked || undefined })} className="h-4 w-4 accent-[var(--color-primary)]" /> Solo favoritos
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
          <button onClick={save} className={cn("rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90")}>Guardar carpeta</button>
        </div>
      </div>
    </div>
  );
}
