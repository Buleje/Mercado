"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import {
  GripVertical, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Loader2, ImageOff, CheckCircle, XCircle, X,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type BannerSection = "hero" | "featured" | "promo";

interface Banner {
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  active: boolean;
  section: BannerSection;
  position: number;
  startDate?: string | null;
  endDate?: string | null;
}

interface BannerFormData {
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  startDate: string;
  endDate: string;
  active: boolean;
}

const EMPTY_FORM: BannerFormData = {
  title: "",
  subtitle: "",
  imageUrl: "",
  linkUrl: "",
  startDate: "",
  endDate: "",
  active: true,
};

const SECTION_LABELS: Record<BannerSection, string> = {
  hero: "Hero (banner principal)",
  featured: "Destacados",
  promo: "Promociones",
};

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold",
      type === "success" ? "bg-[var(--accent-soft)] text-white" : "bg-[var(--data-error-500)] text-white"
    )}>
      {type === "success" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
      {msg}
    </div>
  );
}

// ── Banner Modal ──────────────────────────────────────────────────────────────

function BannerModal({
  initial,
  section,
  saving,
  onSave,
  onClose,
}: {
  initial: BannerFormData;
  section: BannerSection;
  saving: boolean;
  onSave: (data: BannerFormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);

  const set = (field: keyof BannerFormData, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--rule-base)]">
          <CardTitle className="text-base font-semibold text-[var(--text-primary)]">
            Banner — {SECTION_LABELS[section]}
          </CardTitle>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {[
            { key: "title", label: "Título", placeholder: "Ej: Oferta de la semana" },
            { key: "subtitle", label: "Subtítulo", placeholder: "Ej: Hasta 30% de descuento" },
            { key: "imageUrl", label: "URL imagen", placeholder: "https://..." },
            { key: "linkUrl", label: "URL destino", placeholder: "https://..." },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1">{label}</label>
              <input
                type="text"
                value={form[key as keyof BannerFormData] as string}
                onChange={(e) => set(key as keyof BannerFormData, e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1">Inicio</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1">Fin</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Activo</span>
            <button onClick={() => set("active", !form.active)}>
              {form.active
                ? <ToggleRight className="h-6 w-6 text-primary" />
                : <ToggleLeft className="h-6 w-6 text-[var(--text-tertiary)]" />}
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--rule-base)] flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.title.trim()}
            className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-[#00a090] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sortable Banner Card ───────────────────────────────────────────────────────

function SortableBannerCard({
  banner,
  onEdit,
  onDelete,
  onToggle,
}: {
  banner: Banner;
  onEdit: (b: Banner) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: banner.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-shadow",
        isDragging && "ring-2 ring-primary opacity-90"
      )}
    >
      {/* Drag handle — min 44px touch target */}
      <button
        {...attributes}
        {...listeners}
        className="w-8 h-10 flex items-center justify-center text-[var(--text-tertiary)] cursor-grab active:cursor-grabbing touch-none shrink-0"
        aria-label="Arrastrar para reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Preview imagen */}
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--surface-sunken)] shrink-0">
        {banner.imageUrl ? (
          <Image
            src={banner.imageUrl}
            alt={banner.title}
            width={48}
            height={48}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff className="h-4 w-4 text-[var(--text-tertiary)]" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{banner.title}</p>
        {banner.subtitle && (
          <p className="text-xs text-[var(--text-tertiary)] truncate">{banner.subtitle}</p>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => onToggle(banner.id)} aria-label="Alternar activo">
          {banner.active
            ? <ToggleRight className="h-5 w-5 text-primary" />
            : <ToggleLeft className="h-5 w-5 text-[var(--text-tertiary)]" />}
        </button>
        <button
          onClick={() => onEdit(banner)}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(banner.id)}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 text-[var(--text-secondary)] hover:text-[var(--data-error-500)]"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface BannerEditorTabProps {
  storeSlug: string;
}

export default function BannerEditorTab({ storeSlug }: BannerEditorTabProps) {
  const [bannersBySection, setBannersBySection] = useState<Record<BannerSection, Banner[]>>({
    hero: [],
    featured: [],
    promo: [],
  });
  const [loading, setLoading] = useState(true);
  const [modalSection, setModalSection] = useState<BannerSection | null>(null);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Carga inicial
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/marketplace/stores/${storeSlug}/banners`);
        if (!res.ok) throw new Error("fetch fail");
        const data = await res.json();
        const list: Banner[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        const grouped: Record<BannerSection, Banner[]> = { hero: [], featured: [], promo: [] };
        for (const b of list) {
          if (b.section in grouped) grouped[b.section].push(b);
        }
        for (const s of Object.keys(grouped) as BannerSection[]) {
          grouped[s].sort((a, b) => a.position - b.position);
        }
        setBannersBySection(grouped);
      } catch {
        // Fallback: mock banners when API unavailable
        const mock: Record<BannerSection, Banner[]> = {
          hero: [
            { id: "h1", title: "Bienvenidos a tu tienda", subtitle: "Los mejores precios", imageUrl: null, linkUrl: null, active: true, section: "hero", position: 0 },
          ],
          featured: [],
          promo: [
            { id: "p1", title: "Oferta de fin de semana", subtitle: "30% de descuento en abarrotes", imageUrl: null, linkUrl: null, active: false, section: "promo", position: 0 },
          ],
        };
        setBannersBySection(mock);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [storeSlug]);

  const handleDragEnd = useCallback((event: DragEndEvent, section: BannerSection) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setBannersBySection((prev) => {
      const items = prev[section];
      const oldIdx = items.findIndex((b) => b.id === active.id);
      const newIdx = items.findIndex((b) => b.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const reordered = arrayMove(items, oldIdx, newIdx).map((b, i) => ({ ...b, position: i }));

      // POST reorder al backend (fire-and-forget)
      fetch(`/api/marketplace/stores/${storeSlug}/banners/reorder`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ section, order: reordered.map((b) => b.id) }),
      }).catch(() => {});

      return { ...prev, [section]: reordered };
    });
  }, [storeSlug]);

  const handleToggle = useCallback((section: BannerSection, bannerId: string) => {
    setBannersBySection((prev) => ({
      ...prev,
      [section]: prev[section].map((b) => {
        if (b.id !== bannerId) return b;
        const updated = { ...b, active: !b.active };
        fetch(`/api/marketplace/stores/${storeSlug}/banners/${bannerId}`, {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ active: updated.active }),
        }).catch(() => {});
        return updated;
      }),
    }));
  }, [storeSlug]);

  const handleDelete = useCallback((section: BannerSection, bannerId: string) => {
    fetch(`/api/marketplace/stores/${storeSlug}/banners/${bannerId}`, { method: "DELETE" })
      .catch(() => {});
    setBannersBySection((prev) => ({
      ...prev,
      [section]: prev[section].filter((b) => b.id !== bannerId),
    }));
    showToast("Banner eliminado", "success");
  }, [storeSlug]);

  const handleSave = async (section: BannerSection, data: BannerFormData) => {
    setSaving(true);
    try {
      if (editingBanner) {
        // Editar existente
        const res = await fetch(`/api/marketplace/stores/${storeSlug}/banners/${editingBanner.id}`, {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ ...data, section }),
        });
        if (!res.ok) throw new Error("Error al actualizar banner");
        const saved = await res.json().then((d) => d?.data ?? { ...editingBanner, ...data });
        setBannersBySection((prev) => ({
          ...prev,
          [section]: prev[section].map((b) => (b.id === editingBanner.id ? { ...b, ...saved } : b)),
        }));
        showToast("Banner actualizado", "success");
      } else {
        // Crear nuevo
        const res = await fetch(`/api/marketplace/stores/${storeSlug}/banners`, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ ...data, section, position: bannersBySection[section].length }),
        });
        if (!res.ok) throw new Error("Error al crear banner");
        const saved: Banner = await res.json().then((d) => d?.data ?? {
          id: `new-${Date.now()}`,
          ...data,
          section,
          position: bannersBySection[section].length,
        });
        setBannersBySection((prev) => ({
          ...prev,
          [section]: [...prev[section], saved],
        }));
        showToast("Banner creado", "success");
      }
    } catch (e) {
      showToast(String(e) || "Error al guardar banner", "error");
    } finally {
      setSaving(false);
      setModalSection(null);
      setEditingBanner(null);
    }
  };

  if (loading) {
    return (
      <LoadingState />
    );
  }

  const sections: BannerSection[] = ["hero", "featured", "promo"];

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <div key={section}>
          <div className="flex items-center justify-between mb-3">
            <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
              {SECTION_LABELS[section]}
              <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">
                ({bannersBySection[section].length} banners)
              </span>
            </CardTitle>
            <button
              onClick={() => { setEditingBanner(null); setModalSection(section); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 dark:bg-primary/20 text-primary text-xs font-medium hover:bg-primary/20 dark:hover:bg-primary/30 min-h-[44px]"
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo banner
            </button>
          </div>

          {bannersBySection[section].length === 0 ? (
            <div className="py-8 border-2 border-dashed border-[var(--rule-base)] rounded-xl text-center text-sm text-[var(--text-tertiary)]">
              Sin banners en esta sección
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(e, section)}
            >
              <SortableContext
                items={bannersBySection[section].map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {bannersBySection[section].map((banner) => (
                    <SortableBannerCard
                      key={banner.id}
                      banner={banner}
                      onEdit={(b) => {
                        setEditingBanner(b);
                        setModalSection(section);
                      }}
                      onDelete={(id) => handleDelete(section, id)}
                      onToggle={(id) => handleToggle(section, id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      ))}

      {modalSection && (
        <BannerModal
          initial={editingBanner
            ? {
                title: editingBanner.title,
                subtitle: editingBanner.subtitle ?? "",
                imageUrl: editingBanner.imageUrl ?? "",
                linkUrl: editingBanner.linkUrl ?? "",
                startDate: editingBanner.startDate ?? "",
                endDate: editingBanner.endDate ?? "",
                active: editingBanner.active,
              }
            : EMPTY_FORM}
          section={modalSection}
          saving={saving}
          onSave={(data) => handleSave(modalSection, data)}
          onClose={() => { setModalSection(null); setEditingBanner(null); }}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
