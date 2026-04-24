"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import {
  ChefHat, Search, Plus, Pencil, Trash2, Image as ImageIcon,
  ToggleLeft, ToggleRight, RefreshCw, AlertCircle,
  CheckCircle2, XCircle, X, Clock, Users, Loader2,
} from "@buleje/design-system/icons";

// ── Types ────────────────────────────────────────────────────────────────────

interface RecetaRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  nombre: string;
  descripcion: string | null;
  emoji: string | null;
  tiempoMinutos: number | null;
  porciones: number | null;
  dificultad: string | null;
  categoria: string | null;
  pasosJson: string | null;
  imageUrl: string | null;
  costoTotal: number;
  activa: boolean;
  ingredientesCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

interface FormData {
  tenantId: string;
  nombre: string;
  descripcion: string;
  emoji: string;
  tiempoMinutos: string;
  porciones: string;
  dificultad: string;
  categoria: string;
  imageUrl: string;
  activa: boolean;
}

const EMPTY_FORM: FormData = {
  tenantId: "",
  nombre: "",
  descripcion: "",
  emoji: "",
  tiempoMinutos: "",
  porciones: "",
  dificultad: "",
  categoria: "",
  imageUrl: "",
  activa: true,
};

const CATEGORIAS = [
  "Entradas",
  "Platos de fondo",
  "Sopas",
  "Postres",
  "Bebidas",
];

const DIFICULTADES = ["Fácil", "Media", "Dificil"];

const DIFICULTAD_BADGE: Record<string, string> = {
  Fácil: "bg-[var(--data-success-100)] text-[var(--data-success)] dark:bg-[var(--data-success)]/30 dark:text-[var(--data-success)]",
  Media: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",
  Dificil: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]",
};

const inputCls =
  "w-full bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-[var(--text-primary)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--data-success)]/40 transition-shadow";
const selectCls = `${inputCls} appearance-none cursor-pointer`;
const labelCls = "block text-xs font-semibold text-[var(--text-secondary)] mb-1";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminRecetarioPage() {
  const [recetas, setRecetas] = useState<RecetaRow[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<RecetaRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadRecetas = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/recetario", { credentials: "include" });
      if (!res.ok) {
        setError(`Error ${res.status} al cargar recetas`);
        return;
      }
      const data = (await res.json()) as { recetas: RecetaRow[] };
      setRecetas(data.recetas ?? []);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/tenants", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { tenants: TenantOption[] };
        setTenants(
          (data.tenants ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
          })),
        );
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    void loadRecetas();
    void loadTenants();
  }, [loadRecetas, loadTenants]);

  const filtered = useMemo(() => {
    if (!search.trim()) return recetas;
    const q = search.toLowerCase();
    return recetas.filter(
      (r) =>
        r.nombre.toLowerCase().includes(q) ||
        (r.categoria?.toLowerCase().includes(q) ?? false) ||
        (r.tenantName?.toLowerCase().includes(q) ?? false),
    );
  }, [recetas, search]);

  // ── Form handlers ──────────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, tenantId: tenants[0]?.id ?? "" });
    setFormError("");
    setShowForm(true);
  }

  function openEdit(r: RecetaRow) {
    setEditingId(r.id);
    setForm({
      tenantId: r.tenantId,
      nombre: r.nombre,
      descripcion: r.descripcion ?? "",
      emoji: r.emoji ?? "",
      tiempoMinutos: r.tiempoMinutos?.toString() ?? "",
      porciones: r.porciones?.toString() ?? "",
      dificultad: r.dificultad ?? "",
      categoria: r.categoria ?? "",
      imageUrl: r.imageUrl ?? "",
      activa: r.activa,
    });
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
  }

  async function handleSave() {
    if (!form.nombre.trim()) {
      setFormError("El nombre es obligatorio");
      return;
    }
    if (!editingId && !form.tenantId) {
      setFormError("Selecciona un tenant");
      return;
    }

    setSaving(true);
    setFormError("");

    const payload: Record<string, unknown> = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || undefined,
      emoji: form.emoji.trim() || null,
      tiempoMinutos: form.tiempoMinutos ? parseInt(form.tiempoMinutos, 10) : null,
      porciones: form.porciones ? parseInt(form.porciones, 10) : null,
      dificultad: form.dificultad || null,
      categoria: form.categoria || null,
      imageUrl: form.imageUrl.trim() || null,
      activa: form.activa,
    };

    try {
      let res: Response;
      if (editingId) {
        res = await fetch(`/api/superadmin/recetario/${editingId}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        payload.tenantId = form.tenantId;
        res = await fetch("/api/superadmin/recetario", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setFormError(err.error ?? `Error ${res.status}`);
        return;
      }

      showToast(editingId ? "Receta actualizada" : "Receta creada");
      closeForm();
      void loadRecetas();
    } catch {
      setFormError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────────

  async function handleToggleActive(r: RecetaRow) {
    try {
      const res = await fetch(`/api/superadmin/recetario/${r.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !r.activa }),
      });
      if (res.ok) {
        setRecetas((prev) =>
          prev.map((x) => (x.id === r.id ? { ...x, activa: !x.activa } : x)),
        );
        showToast(r.activa ? "Receta desactivada" : "Receta activada");
      }
    } catch {
      showToast("Error al cambiar estado", false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/superadmin/recetario/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setRecetas((prev) => prev.filter((x) => x.id !== deleteTarget.id));
        showToast("Receta eliminada");
      } else {
        showToast("Error al eliminar", false);
      }
    } catch {
      showToast("Error de red", false);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-[var(--data-success)] dark:text-[var(--data-success)]" />
            Recetario Global
          </h1>
          <p className="text-[var(--text-tertiary)] text-sm mt-1">
            {filtered.length} receta{filtered.length !== 1 ? "s" : ""}
            {recetas.length !== filtered.length ? ` de ${recetas.length}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadRecetas()}
            disabled={loading}
            className="p-2 rounded-xl bg-[var(--surface-sunken)] hover:bg-gray-200 dark:hover:bg-gray-700 text-[var(--text-tertiary)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-white text-sm font-semibold transition-colors shadow-[var(--shadow-sm)]"
          >
            <Plus className="w-4 h-4" />
            Nueva Receta
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, categoria o tenant..."
          className={`${inputCls} pl-9`}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-3 bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)] text-[var(--data-error)] dark:text-[var(--data-error)] rounded-xl px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button type="button" onClick={() => void loadRecetas()} className="underline hover:no-underline text-xs shrink-0">
            Reintentar
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden animate-pulse"
            >
              <div className="h-32 bg-gray-200 dark:bg-gray-800" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-[var(--surface-sunken)] rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recipe grid */}
      {!loading && !error && (
        <>
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Card image area */}
                  <div className="relative h-36 bg-[var(--surface-sunken)] overflow-hidden">
                    {r.imageUrl ? (
                      <Image
                        src={r.imageUrl}
                        alt={r.nombre}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ChefHat className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                      </div>
                    )}
                    {/* Emoji badge */}
                    {r.emoji && (
                      <span className="absolute top-2 right-2 text-2xl select-none drop-shadow">
                        {r.emoji}
                      </span>
                    )}
                    {/* Active/inactive overlay */}
                    {!r.activa && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white text-xs font-bold bg-[var(--data-error)]/80 px-3 py-1 rounded-full">
                          Inactiva
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-4">
                    <h3 className="font-bold text-[var(--text-primary)] text-sm leading-snug line-clamp-1">
                      {r.nombre}
                    </h3>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      {r.tenantName}
                    </p>

                    {/* Meta badges */}
                    <div className="flex items-center flex-wrap gap-1.5 mt-2">
                      {r.categoria && (
                        <span className="text-[length:var(--ts-2xs)] font-semibold px-2 py-0.5 rounded-full bg-[var(--data-success-100)] text-[var(--data-success)] dark:bg-[var(--data-success)]/30 dark:text-[var(--data-success)]">
                          {r.categoria}
                        </span>
                      )}
                      {r.dificultad && (
                        <span
                          className={`text-[length:var(--ts-2xs)] font-semibold px-2 py-0.5 rounded-full ${DIFICULTAD_BADGE[r.dificultad] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
                        >
                          {r.dificultad}
                        </span>
                      )}
                      {r.tiempoMinutos != null && (
                        <span className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          <Clock className="w-3 h-3" /> {r.tiempoMinutos}m
                        </span>
                      )}
                      {r.porciones != null && (
                        <span className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          <Users className="w-3 h-3" /> {r.porciones}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--rule-base)]">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(r)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-[var(--text-secondary)] dark:hover:text-gray-200 transition-colors"
                        title={r.activa ? "Desactivar" : "Activar"}
                      >
                        {r.activa ? (
                          <ToggleRight className="w-5 h-5 text-[var(--data-success)]" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-gray-400" />
                        )}
                        {r.activa ? "Activa" : "Inactiva"}
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)] transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 text-[var(--text-tertiary)] hover:text-[var(--data-error)] dark:hover:text-[var(--data-error)] transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-xl bg-[var(--data-success-50)] dark:bg-[var(--data-success)]/20 flex items-center justify-center mb-4">
                <ChefHat className="w-8 h-8 text-[var(--data-success)]" />
              </div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">
                {search ? "Sin resultados" : "Sin recetas aun"}
              </h3>
              <p className="text-sm text-[var(--text-tertiary)] max-w-xs">
                {search
                  ? `No hay recetas que coincidan con "${search}".`
                  : "El recetario esta vacio. Crea la primera receta."}
              </p>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-4 text-sm text-[var(--data-success)] dark:text-[var(--data-success)] underline hover:no-underline"
                >
                  Limpiar busqueda
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Create/Edit Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl shadow-[var(--shadow-xl)] w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--rule-base)]">
              <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-[var(--data-success)] dark:text-[var(--data-success)]" />
                {editingId ? "Editar Receta" : "Nueva Receta"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form body */}
            <div className="p-5 space-y-4">
              {/* Tenant (only for create) */}
              {!editingId && (
                <div>
                  <label className={labelCls}>Tenant *</label>
                  <select
                    value={form.tenantId}
                    onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                    className={selectCls}
                  >
                    <option value="">Seleccionar tenant...</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Nombre */}
              <div>
                <label className={labelCls}>Nombre *</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Ceviche Clasico"
                  className={inputCls}
                  maxLength={200}
                />
              </div>

              {/* Descripcion */}
              <div>
                <label className={labelCls}>Descripcion</label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  placeholder="Descripcion breve de la receta..."
                  className={`${inputCls} min-h-[80px] resize-y`}
                  maxLength={2000}
                />
              </div>

              {/* Row: Categoria + Dificultad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Categoria</label>
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    className={selectCls}
                  >
                    <option value="">Sin categoria</option>
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Dificultad</label>
                  <select
                    value={form.dificultad}
                    onChange={(e) => setForm({ ...form, dificultad: e.target.value })}
                    className={selectCls}
                  >
                    <option value="">Sin dificultad</option>
                    {DIFICULTADES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row: Tiempo + Porciones + Emoji */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Tiempo (min)</label>
                  <input
                    type="number"
                    value={form.tiempoMinutos}
                    onChange={(e) => setForm({ ...form, tiempoMinutos: e.target.value })}
                    placeholder="30"
                    min={1}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Porciones</label>
                  <input
                    type="number"
                    value={form.porciones}
                    onChange={(e) => setForm({ ...form, porciones: e.target.value })}
                    placeholder="4"
                    min={1}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Emoji</label>
                  <input
                    type="text"
                    value={form.emoji}
                    onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                    placeholder="🍽️"
                    maxLength={10}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Image URL */}
              <div>
                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> URL de imagen
                  </span>
                </label>
                <input
                  type="url"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="https://ejemplo.com/imagen.jpg"
                  className={inputCls}
                />
                {form.imageUrl && (
                  <div className="relative mt-2 h-32 rounded-xl overflow-hidden border border-[var(--rule-base)]">
                    <Image
                      src={form.imageUrl}
                      alt="Vista previa"
                      fill
                      sizes="100vw"
                      className="object-cover"
                      unoptimized
                      onError={(e) => {
                        (e.target as HTMLImageElement).parentElement!.style.display = "none";
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Activa toggle */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-[var(--text-secondary)] font-medium">
                  Receta activa
                </span>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, activa: !form.activa })}
                  className="flex items-center gap-2 text-sm"
                >
                  {form.activa ? (
                    <ToggleRight className="w-6 h-6 text-[var(--data-success)]" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-gray-400" />
                  )}
                  <span className={form.activa ? "text-[var(--data-success)] font-semibold" : "text-gray-400"}>
                    {form.activa ? "Activa" : "Inactiva"}
                  </span>
                </button>
              </div>

              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 text-[var(--data-error)] dark:text-[var(--data-error)] text-sm bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)] rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-[var(--rule-base)]">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--surface-sunken)] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--data-success)] hover:bg-[var(--data-success)] text-white text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "Guardar cambios" : "Crear receta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl shadow-[var(--shadow-xl)] w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-xl bg-[var(--data-error-50)] dark:bg-red-950/30 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-[var(--data-error)]" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">
              Eliminar receta
            </h3>
            <p className="text-sm text-[var(--text-tertiary)] mb-6">
              Estas seguro de eliminar <strong>{deleteTarget.nombre}</strong>?
              Esta accion no se puede deshacer.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--surface-sunken)] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--data-error)] hover:bg-[var(--data-error)] text-white text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold text-white transition-all ${
            toast.ok ? "bg-[var(--data-success)]" : "bg-[var(--data-error)]"
          }`}
        >
          {toast.ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
