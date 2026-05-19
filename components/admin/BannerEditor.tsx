"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import Image from "next/image";
import { Plus, Pencil, Trash2, GripVertical, Check, X, AlertTriangle, ExternalLink } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Banner = {
  id:       string;
  title:    string;
  subtitle: string;
  imageUrl: string;
  bgColor:  string;
  link:     string;
  active:   boolean;
};

type FormState = Omit<Banner, "id" | "active">;

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "buleje_banners";
const MAX_ACTIVE  = 5;

const SEED: Banner[] = [
  {
    id:       "b1",
    title:    "Ofertas de la semana",
    subtitle: "Ahorra hasta 30% en abarrotes seleccionados",
    imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80",
    bgColor:  "#2563EB",
    link:     "/tienda",
    active:   true,
  },
];

function loadBanners(): Banner[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Banner[]) : SEED;
  } catch { return SEED; }
}

function saveBanners(banners: Banner[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(banners));
}

// ── Empty form ────────────────────────────────────────────────────────────────

const PRESET_COLORS = ["#2563EB", "#f97316", "#264653", "#e76f51", "#2a9d8f", "#e9c46a", "#1d3557", "#457b9d"];

const emptyForm = (): FormState => ({
  title:    "",
  subtitle: "",
  imageUrl: "",
  bgColor:  "#2563EB",
  link:     "",
});

// ── BannerPreview ─────────────────────────────────────────────────────────────

function BannerPreview({ banner }: { banner: Banner }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="relative rounded-xl overflow-hidden aspect-[3/1]"
      style={{ backgroundColor: banner.bgColor || "#2563EB" }}
    >
      {banner.imageUrl && !imgError ? (
        <Image
          src={banner.imageUrl}
          alt={banner.title}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
          onError={() => setImgError(true)}
        />
      ) : null}
      <div className="absolute inset-0 bg-linear-to-r from-black/60 to-transparent flex flex-col justify-center px-5">
        <p className="text-white font-bold text-base leading-snug drop-shadow">
          {banner.title || "Titulo del banner"}
        </p>
        {banner.subtitle && (
          <p className="text-white/80 text-xs mt-1 drop-shadow">
            {banner.subtitle}
          </p>
        )}
        {banner.link && (
          <div className="mt-2 inline-flex items-center gap-1 bg-white/90 text-[var(--text-primary)] text-xs font-medium px-2 py-1 rounded-lg w-fit">
            Ver mas <ExternalLink className="w-3 h-3" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Form modal ────────────────────────────────────────────────────────────────

function BannerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial:  FormState;
  onSave:   (f: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "El titulo es obligatorio";
    if (form.imageUrl && !/^https?:\/\//.test(form.imageUrl)) e.imageUrl = "Debe ser una URL valida (https://...)";
    if (form.link && !/^(\/|https?:\/\/)/.test(form.link)) e.link = "Debe ser una ruta (/tienda) o URL completa";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (validate()) onSave(form);
  };

  const renderField = (label: string, field: keyof FormState, placeholder: string, type = "text") => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--text-tertiary)]">{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        placeholder={placeholder}
        className={cn(
          "w-full px-3 py-2 rounded-lg border bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
          errors[field] ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
        )}
      />
      {errors[field] && <p className="text-xs text-[var(--data-error-500)]">{errors[field]}</p>}
    </div>
  );

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-5  space-y-4">
      <p className="text-sm font-semibold text-[var(--text-secondary)]">
        {initial.title ? "Editar banner" : "Nuevo banner"}
      </p>

      {renderField("Titulo", "title", "Ofertas de la semana")}
      {renderField("Subtitulo (opcional)", "subtitle", "Descuentos hasta 30% en abarrotes")}
      {renderField("URL de imagen (opcional)", "imageUrl", "https://...", "url")}

      {/* Mejora 17: Color de fondo */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--text-tertiary)]">Color de fondo (si no hay imagen)</label>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setForm(f => ({ ...f, bgColor: c }))}
              className={cn(
                "w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110",
                form.bgColor === c ? "border-gray-900 dark:border-white scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={form.bgColor || "#2563EB"}
            onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))}
            className="w-7 h-7 rounded-lg cursor-pointer border-0 p-0"
            title="Color personalizado"
          />
        </div>
      </div>

      {renderField("Enlace al hacer click (opcional)", "link", "/tienda o https://...")}

      {/* Live preview */}
      {(form.title || form.imageUrl) && (
        <div className="space-y-1">
          <p className="text-xs text-[var(--text-tertiary)]">Vista previa</p>
          <BannerPreview banner={{ ...form, id: "preview", active: true }} />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dark transition-colors"
        >
          Guardar banner
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BannerEditor() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    setBanners(loadBanners());
  }, []);

  const persist = (next: Banner[]) => {
    setBanners(next);
    saveBanners(next);
  };

  const handleCreate = (form: FormState) => {
    const activeCount = banners.filter(b => b.active).length;
    const banner: Banner = {
      id:     `banner_${Date.now()}`,
      ...form,
      active: activeCount < MAX_ACTIVE,
    };
    persist([...banners, banner]);
    setCreating(false);
  };

  const handleEdit = (form: FormState) => {
    if (!editing) return;
    persist(banners.map(b => b.id === editing.id ? { ...b, ...form } : b));
    setEditing(null);
  };

  const handleToggle = (id: string) => {
    const banner = banners.find(b => b.id === id);
    if (!banner) return;
    const activeCount = banners.filter(b => b.active).length;
    if (!banner.active && activeCount >= MAX_ACTIVE) return;
    persist(banners.map(b => b.id === id ? { ...b, active: !b.active } : b));
  };

  const handleDelete = (id: string) => {
    persist(banners.filter(b => b.id !== id));
  };

  const handleDragStart = (id: string) => setDragging(id);
  const handleDragEnd   = () => { setDragging(null); setDragOver(null); };

  const handleDrop = (targetId: string) => {
    if (!dragging || dragging === targetId) { handleDragEnd(); return; }
    const from = banners.findIndex(b => b.id === dragging);
    const to   = banners.findIndex(b => b.id === targetId);
    if (from === -1 || to === -1) { handleDragEnd(); return; }
    const next = [...banners];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persist(next);
    handleDragEnd();
  };

  const activeCount = banners.filter(b => b.active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">Editor de Banners</SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            {activeCount}/{MAX_ACTIVE} banners activos en la tienda
          </p>
        </div>
        <button
          onClick={() => { setCreating(true); setEditing(null); }}
          disabled={creating}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
            creating
              ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] dark:bg-gray-800 cursor-not-allowed"
              : "bg-primary text-white hover:bg-primary-dark"
          )}
        >
          <Plus className="w-4 h-4" />
          Nuevo banner
        </button>
      </div>

      {activeCount >= MAX_ACTIVE && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Limite de {MAX_ACTIVE} banners activos. Desactiva uno para agregar otro.
        </div>
      )}

      {/* Create form */}
      {creating && (
        <BannerForm
          initial={emptyForm()}
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Banners list */}
      {banners.length === 0 && !creating && (
        <div className="text-center py-16 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
          <p className="text-sm">Sin banners configurados.</p>
          <p className="text-xs mt-1">Crea el primero para mostrar en la tienda.</p>
        </div>
      )}

      <div className="space-y-3">
        {banners.map(banner => (
          <div key={banner.id}>
            {editing?.id === banner.id ? (
              <BannerForm
                initial={{ title: banner.title, subtitle: banner.subtitle, imageUrl: banner.imageUrl, bgColor: banner.bgColor || "#2563EB", link: banner.link }}
                onSave={handleEdit}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div
                draggable
                onDragStart={() => handleDragStart(banner.id)}
                onDragEnd={handleDragEnd}
                onDragOver={e => { e.preventDefault(); setDragOver(banner.id); }}
                onDrop={() => handleDrop(banner.id)}
                className={cn(
                  "bg-[var(--surface-raised)] border rounded-xl overflow-hidden  transition-all cursor-grab active:cursor-grabbing",
                  dragging === banner.id ? "opacity-50 scale-[0.98]" : "",
                  dragOver === banner.id && dragging !== banner.id ? "border-primary ring-2 ring-primary/30" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
                )}
              >
                {/* Banner mini preview */}
                <BannerPreview banner={banner} />

                {/* Controls */}
                <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <GripVertical className="w-4 h-4 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] shrink-0" />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{banner.title}</p>
                    {banner.link && (
                      <p className="text-xs text-[var(--text-tertiary)] truncate">{banner.link}</p>
                    )}
                  </div>

                  {/* Active toggle */}
                  <button
                    onClick={() => handleToggle(banner.id)}
                    disabled={!banner.active && activeCount >= MAX_ACTIVE}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      banner.active
                        ? "bg-primary/10 text-primary dark:text-[#4a9e78]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                      !banner.active && activeCount >= MAX_ACTIVE ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    )}
                  >
                    {banner.active ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {banner.active ? "Activo" : "Inactivo"}
                  </button>

                  <button
                    onClick={() => { setEditing(banner); setCreating(false); }}
                    title="Editar"
                    className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-primary dark:hover:text-[#4a9e78] hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(banner.id)}
                    title="Eliminar"
                    className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] dark:hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {banners.length > 1 && (
        <p className="text-xs text-[var(--text-tertiary)] text-center">
          Arrastra los banners para cambiar el orden en que aparecen
        </p>
      )}
    </div>
  );
}
