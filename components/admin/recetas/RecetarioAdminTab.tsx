'use client';

import { CardTitle, LoadingState } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";

import { useState, useEffect, useCallback } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Search, Plus, X, Loader2, Trash2, ChevronUp, ChevronDown,
  Eye, EyeOff, Save, BookOpen, Clock, Users, BarChart3,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────
type Ingrediente = {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  productoId?: number | null;
};

type RecetaPublica = {
  id: string;
  _noteId?: string;
  nombre: string;
  descripcion: string;
  emoji: string;
  tiempoMinutos: number;
  porciones: number;
  dificultad: "Fácil" | "Media" | "Dificil";
  categoria: string;
  videoUrl: string | null;
  ingredientes: Ingrediente[];
  totalIngredientes: number;
  pasos: string[];
  activa: boolean;
  createdAt?: string;
};

type ProductSearch = {
  id: number;
  name: string;
  price: number;
};

const CATEGORIAS = ["Entradas", "Platos de fondo", "Sopas", "Postres", "Bebidas"];
const UNIDADES = ["unidad", "kg", "litro", "atado", "botella", "bolsa", "sobre", "lata", "paquete", "pack"];
const DIFICULTADES: ("Fácil" | "Media" | "Dificil")[] = ["Fácil", "Media", "Dificil"];

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }

// ── Main Component ───────────────────────────────────────────
export default function RecetarioAdminTab() {
  const [recetas, setRecetas] = useState<RecetaPublica[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RecetaPublica | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductSearch[]>([]);

  // ── Form state ──
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [emoji, setEmoji] = useState("");
  const [tiempoMinutos, setTiempoMinutos] = useState(30);
  const [porciones, setPorciones] = useState(4);
  const [dificultad, setDificultad] = useState<"Fácil" | "Media" | "Dificil">("Fácil");
  const [categoria, setCategoria] = useState("Platos de fondo");
  const [videoUrl, setVideoUrl] = useState("");
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [pasos, setPasos] = useState<string[]>([""]);
  const [modalTab, setModalTab] = useState<"info" | "ingredientes" | "pasos" | "preview">("info");

  // ── Fetch recetas ──
  const fetchRecetas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/recetario");
      if (res.ok) {
        const data = await res.json();
        setRecetas(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRecetas(); }, [fetchRecetas]);

  // ── Fetch products for autocomplete ──
  useEffect(() => {
    fetch("/api/products?limit=500")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setProducts(d); })
      .catch((err) => console.warn("[RecetarioAdminTab] products fetch failed:", err));
  }, []);

  // ── Form helpers ──
  const resetForm = () => {
    setNombre(""); setDescripcion(""); setEmoji(""); setTiempoMinutos(30);
    setPorciones(4); setDificultad("Fácil"); setCategoria("Platos de fondo");
    setVideoUrl(""); setIngredientes([]); setPasos([""]); setModalTab("info");
    setEditing(null);
  };

  const openNew = () => { resetForm(); setShowModal(true); };

  const openEdit = (r: RecetaPublica) => {
    setEditing(r);
    setNombre(r.nombre);
    setDescripcion(r.descripcion || "");
    setEmoji(r.emoji || "");
    setTiempoMinutos(r.tiempoMinutos);
    setPorciones(r.porciones);
    setDificultad(r.dificultad);
    setCategoria(r.categoria);
    setVideoUrl(r.videoUrl || "");
    setIngredientes(r.ingredientes.map(i => ({ ...i })));
    setPasos([...r.pasos]);
    setModalTab("info");
    setShowModal(true);
  };

  const addIngrediente = () => {
    setIngredientes(prev => [...prev, { nombre: "", cantidad: 1, unidad: "unidad", precio: 0 }]);
  };

  const removeIngrediente = (idx: number) => {
    setIngredientes(prev => prev.filter((_, i) => i !== idx));
  };

  const updateIngrediente = (idx: number, field: keyof Ingrediente, value: string | number) => {
    setIngredientes(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing));
  };

  const addPaso = () => setPasos(prev => [...prev, ""]);
  const removePaso = (idx: number) => setPasos(prev => prev.filter((_, i) => i !== idx));
  const updatePaso = (idx: number, val: string) => setPasos(prev => prev.map((p, i) => i === idx ? val : p));
  const movePaso = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= pasos.length) return;
    setPasos(prev => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const totalIngredientes = ingredientes.reduce((s, i) => s + i.precio * i.cantidad, 0);

  // ── Save (create or update) ──
  const handleSave = async () => {
    if (!nombre.trim() || ingredientes.length === 0 || pasos.filter(p => p.trim()).length === 0) return;
    setSaving(true);
    try {
      const body = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        emoji,
        tiempoMinutos,
        porciones,
        dificultad,
        categoria,
        videoUrl: videoUrl.trim() || null,
        ingredientes: ingredientes.filter(i => i.nombre.trim()),
        pasos: pasos.filter(p => p.trim()),
        activa: true,
      };

      if (editing?._noteId) {
        await fetch(`/api/admin/recetario/${editing._noteId}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/admin/recetario", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
      }
      setShowModal(false);
      resetForm();
      fetchRecetas();
    } catch { /* silent */ }
    setSaving(false);
  };

  // ── Toggle activa ──
  const toggleActiva = async (r: RecetaPublica) => {
    if (!r._noteId) return;
    try {
      await fetch(`/api/admin/recetario/${r._noteId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ activa: !r.activa }),
      });
      fetchRecetas();
    } catch { /* silent */ }
  };

  // ── Delete ──
  const handleDelete = async (noteId: string) => {
    try {
      await fetch(`/api/admin/recetario/${noteId}`, { method: "DELETE" });
      setDeleteConfirm(null);
      fetchRecetas();
    } catch { /* silent */ }
  };

  // ── Filter ──
  const filtered = recetas.filter(r => {
    const matchSearch = !searchTerm || r.nombre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = !filterCat || r.categoria === filterCat;
    return matchSearch && matchCat;
  });

  // ── Stats ──
  const activas = recetas.filter(r => r.activa !== false).length;
  const avgIng = recetas.length > 0 ? Math.round(recetas.reduce((s, r) => s + (r.ingredientes?.length || 0), 0) / recetas.length) : 0;
  const avgCost = recetas.length > 0 ? recetas.reduce((s, r) => s + (r.totalIngredientes || 0), 0) / recetas.length : 0;

  // ── Product autocomplete helper ──
  const selectProduct = (idx: number, prod: ProductSearch) => {
    setIngredientes(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, nombre: prod.name, precio: prod.price, productoId: prod.id } : ing
    ));
  };

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5 bg-[var(--accent-soft)] text-[var(--data-success-500)] px-3 py-1.5 rounded-lg font-bold">
          <BookOpen className="h-3.5 w-3.5" />
          Recetas publicadas: {activas}
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--accent-soft)] text-[var(--data-success-500)] px-3 py-1.5 rounded-lg font-bold">
          <BarChart3 className="h-3.5 w-3.5" />
          Ingredientes promedio: {avgIng}
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--data-warning-50)] text-[var(--data-warning-500)] px-3 py-1.5 rounded-lg font-bold">
          Costo promedio: {formatCurrency(avgCost)}
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar receta..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todas las categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark  transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nueva Receta
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <BookOpen className="h-8 w-8 text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-secondary)]">{recetas.length === 0 ? "No hay recetas en el recetario" : "Sin resultados"}</p>
          {recetas.length === 0 && (
            <button onClick={openNew} className="text-xs text-primary hover:underline font-semibold mt-1">
              Crear la primera receta
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl overflow-hidden ">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] text-left">
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Receta</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] hidden sm:table-cell">Categoria</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-center hidden md:table-cell">Ing.</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-right">Costo</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-center">Estado</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r._noteId || r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{r.emoji}</span>
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">{r.nombre}</p>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] flex items-center gap-2">
                            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{r.tiempoMinutos}min</span>
                            <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{r.porciones}p</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] hidden sm:table-cell">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded-lg">{r.categoria}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-[var(--text-secondary)] hidden md:table-cell">{r.ingredientes?.length || 0}</td>
                    <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">{formatCurrency(r.totalIngredientes || 0)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActiva(r)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[length:var(--ts-2xs)] font-bold transition-colors",
                          r.activa !== false
                            ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                            : "bg-gray-100 text-[var(--text-secondary)]"
                        )}
                      >
                        {r.activa !== false ? <><Eye className="h-3 w-3" /> Activa</> : <><EyeOff className="h-3 w-3" /> Inactiva</>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-[var(--text-tertiary)] hover:text-primary transition-colors"
                          title="Editar"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(r._noteId || null)}
                          className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteConfirm && (
          <>
            <m.div key="del-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={() => setDeleteConfirm(null)} />
            <m.div key="del-modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-[var(--color-card)] rounded-xl p-6 max-w-sm w-full space-y-4">
                <p className="text-base font-bold text-[var(--text-primary)]">Eliminar receta?</p>
                <p className="text-sm text-[var(--text-secondary)]">Esta accion no se puede deshacer. La receta se eliminara del recetario público.</p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200 transition-colors">Cancelar</button>
                  <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold bg-[var(--data-error-500)] text-white hover:bg-[var(--data-error-500)] transition-colors">Eliminar</button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <m.div key="modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={() => { setShowModal(false); resetForm(); }} />
            <m.div
              key="modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && (() => { setShowModal(false); resetForm(); })()}
            >
              <div className="w-full max-w-2xl bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl max-h-[90vh] flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] shrink-0">
                  <CardTitle className="text-lg font-bold text-[var(--text-primary)]">
                    {editing ? "Editar Receta" : "Nueva Receta del Recetario"}
                  </CardTitle>
                  <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-gray-100">
                    <X className="h-4 w-4 text-[var(--text-secondary)]" />
                  </button>
                </div>

                {/* Modal Tabs */}
                <div className="flex gap-1 px-5 pt-3 border-b border-[var(--rule-soft)] shrink-0">
                  {(["info", "ingredientes", "pasos", "preview"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setModalTab(t)}
                      className={cn(
                        "px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors",
                        modalTab === t
                          ? "border-primary text-primary"
                          : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                      )}
                    >
                      {t === "info" ? "Info Básica" : t === "ingredientes" ? "Ingredientes" : t === "pasos" ? "Pasos" : "Vista previa"}
                    </button>
                  ))}
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  {/* A) Info Básica */}
                  {modalTab === "info" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Nombre *</label>
                        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Ceviche Clasico" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Descripcion</label>
                        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripcion de la receta..." rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Emoji</label>
                          <input type="text" value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍲" maxLength={2} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Tiempo (min)</label>
                          <input type="number" value={tiempoMinutos} onChange={e => setTiempoMinutos(Number(e.target.value))} min={1} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Porciones</label>
                          <input type="number" value={porciones} onChange={e => setPorciones(Number(e.target.value))} min={1} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Dificultad</label>
                          <select value={dificultad} onChange={e => setDificultad(e.target.value as typeof dificultad)} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                            {DIFICULTADES.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Categoria</label>
                          <select value={categoria} onChange={e => setCategoria(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">URL Video YouTube (opcional)</label>
                          <input type="text" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/..." className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* B) Ingredientes */}
                  {modalTab === "ingredientes" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">Ingredientes ({ingredientes.length})</p>
                        <button onClick={addIngrediente} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Agregar ingrediente
                        </button>
                      </div>
                      {ingredientes.length === 0 && (
                        <p className="text-xs text-[var(--text-tertiary)] text-center py-6">Agrega ingredientes para la receta</p>
                      )}
                      {ingredientes.map((ing, idx) => (
                        <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2">
                          <div className="flex gap-2 items-start">
                            <div className="flex-1">
                              <label className="block text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-0.5">Nombre del ingrediente</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={ing.nombre}
                                  onChange={e => updateIngrediente(idx, "nombre", e.target.value)}
                                  placeholder="Buscar producto o escribir..."
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                                  list={`prod-list-${idx}`}
                                />
                                <datalist id={`prod-list-${idx}`}>
                                  {products
                                    .filter(p => p.name.toLowerCase().includes((ing.nombre || "").toLowerCase()))
                                    .slice(0, 8)
                                    .map(p => (
                                      <option key={p.id} value={p.name} onClick={() => selectProduct(idx, p)} />
                                    ))}
                                </datalist>
                              </div>
                              {/* Quick product select buttons */}
                              {ing.nombre && ing.nombre.length >= 2 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {products
                                    .filter(p => p.name.toLowerCase().includes(ing.nombre.toLowerCase()))
                                    .slice(0, 3)
                                    .map(p => (
                                      <button
                                        key={p.id}
                                        onClick={() => selectProduct(idx, p)}
                                        className="text-[length:var(--ts-2xs)] bg-[var(--accent-soft)] text-[var(--data-success-500)] px-2 py-0.5 rounded-md hover:bg-[var(--accent-soft)] transition-colors"
                                      >
                                        {p.name} — S/{Number(p.price).toFixed(2)}
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => removeIngrediente(idx)} className="p-1 rounded-lg hover:bg-[var(--data-error-100)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors mt-4 shrink-0">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-0.5">Cantidad</label>
                              <input type="number" step="0.01" min="0" value={ing.cantidad} onChange={e => updateIngrediente(idx, "cantidad", parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                            </div>
                            <div>
                              <label className="block text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-0.5">Unidad</label>
                              <select value={ing.unidad} onChange={e => updateIngrediente(idx, "unidad", e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs focus:outline-none focus:ring-1 focus:ring-primary/30">
                                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-0.5">Precio (S/)</label>
                              <input type="number" step="0.01" min="0" value={ing.precio} onChange={e => updateIngrediente(idx, "precio", parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                            </div>
                          </div>
                        </div>
                      ))}
                      {ingredientes.length > 0 && (
                        <div className="flex items-center justify-between bg-primary/5 rounded-xl p-3 border border-primary/20">
                          <span className="text-xs font-bold text-primary">Total ingredientes</span>
                          <span className="text-sm font-bold text-primary">{formatCurrency(totalIngredientes)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* C) Pasos */}
                  {modalTab === "pasos" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">Pasos de preparacion ({pasos.filter(p => p.trim()).length})</p>
                        <button onClick={addPaso} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Agregar paso
                        </button>
                      </div>
                      {pasos.map((paso, idx) => (
                        <div key={idx} className="flex gap-2 items-start">
                          <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-1">{idx + 1}</span>
                          <textarea
                            value={paso}
                            onChange={e => updatePaso(idx, e.target.value)}
                            placeholder={`Paso ${idx + 1}...`}
                            rows={2}
                            className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button onClick={() => movePaso(idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors">
                              <ChevronUp className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                            </button>
                            <button onClick={() => movePaso(idx, 1)} disabled={idx === pasos.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors">
                              <ChevronDown className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                            </button>
                            <button onClick={() => removePaso(idx)} className="p-1 rounded hover:bg-[var(--data-error-50)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* D) Preview */}
                  {modalTab === "preview" && (
                    <div className="space-y-6">
                      <p className="text-xs font-bold text-[var(--text-tertiary)]">Vista previa de la receta</p>
                      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl overflow-hidden ">
                        <div className="bg-[var(--brand-ink)] p-4 text-[var(--surface-canvas)]">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{emoji || "🍽️"}</span>
                            <div>
                              <h4 className="text-lg font-bold">{nombre || "Nombre de la receta"}</h4>
                              <div className="flex items-center gap-3 text-white/70 text-xs mt-1">
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{tiempoMinutos} min</span>
                                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{porciones} porciones</span>
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold",
                                  dificultad === "Fácil" ? "bg-[var(--accent-soft)]" : dificultad === "Media" ? "bg-[var(--data-warning-500)]/30" : "bg-[var(--data-error-500)]/30"
                                )}>{dificultad}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          {descripcion && <p className="text-sm text-[var(--text-secondary)]">{descripcion}</p>}
                          {ingredientes.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-[var(--text-primary)] mb-2">Ingredientes</p>
                              <div className="space-y-1">
                                {ingredientes.filter(i => i.nombre).map((ing, idx) => (
                                  <div key={idx} className="flex justify-between text-xs text-[var(--text-secondary)]">
                                    <span>{ing.cantidad} {ing.unidad} de {ing.nombre}</span>
                                    <span className="font-bold">{formatCurrency(ing.precio * ing.cantidad)}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between text-xs font-bold text-primary pt-1 border-t border-[var(--rule-soft)]">
                                  <span>Total</span>
                                  <span>{formatCurrency(totalIngredientes)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          {pasos.filter(p => p.trim()).length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-[var(--text-primary)] mb-2">Preparacion</p>
                              <ol className="space-y-1.5">
                                {pasos.filter(p => p.trim()).map((p, idx) => (
                                  <li key={idx} className="flex gap-2 text-xs text-[var(--text-secondary)]">
                                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[length:var(--ts-2xs)] font-bold shrink-0">{idx + 1}</span>
                                    {p}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex gap-2 px-5 py-4 border-t border-[var(--rule-soft)] shrink-0">
                  <button onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !nombre.trim() || ingredientes.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50  transition-colors"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editing ? "Actualizar" : "Guardar"}
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
