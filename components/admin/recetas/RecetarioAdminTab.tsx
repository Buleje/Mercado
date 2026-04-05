'use client';

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, X, Loader2, Trash2, ChevronUp, ChevronDown,
  Eye, EyeOff, Save, BookOpen, Clock, Users, BarChart3,
} from "lucide-react";
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
  dificultad: "Facil" | "Media" | "Dificil";
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
const DIFICULTADES: ("Facil" | "Media" | "Dificil")[] = ["Facil", "Media", "Dificil"];

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
  const [dificultad, setDificultad] = useState<"Facil" | "Media" | "Dificil">("Facil");
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
      .catch(() => {});
  }, []);

  // ── Form helpers ──
  const resetForm = () => {
    setNombre(""); setDescripcion(""); setEmoji(""); setTiempoMinutos(30);
    setPorciones(4); setDificultad("Facil"); setCategoria("Platos de fondo");
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/admin/recetario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg font-bold">
          <BookOpen className="h-3.5 w-3.5" />
          Recetas publicadas: {activas}
        </div>
        <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-lg font-bold">
          <BarChart3 className="h-3.5 w-3.5" />
          Ingredientes promedio: {avgIng}
        </div>
        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-3 py-1.5 rounded-lg font-bold">
          Costo promedio: {formatCurrency(avgCost)}
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar receta..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
          />
        </div>
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
        >
          <option value="">Todas las categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] shadow-sm transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nueva Receta
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#00B4A6]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <BookOpen className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500">{recetas.length === 0 ? "No hay recetas en el recetario" : "Sin resultados"}</p>
          {recetas.length === 0 && (
            <button onClick={openNew} className="text-xs text-[#00B4A6] hover:underline font-semibold mt-1">
              Crear la primera receta
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/5 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Receta</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden sm:table-cell">Categoria</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-center hidden md:table-cell">Ing.</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-right">Costo</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-center">Estado</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r._noteId || r.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{r.emoji}</span>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{r.nombre}</p>
                          <p className="text-[10px] text-gray-400 flex items-center gap-2">
                            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{r.tiempoMinutos}min</span>
                            <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{r.porciones}p</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden sm:table-cell">
                      <span className="text-xs bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-lg">{r.categoria}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300 hidden md:table-cell">{r.ingredientes?.length || 0}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(r.totalIngredientes || 0)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActiva(r)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors",
                          r.activa !== false
                            ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                            : "bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400"
                        )}
                      >
                        {r.activa !== false ? <><Eye className="h-3 w-3" /> Activa</> : <><EyeOff className="h-3 w-3" /> Inactiva</>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 hover:text-[#00B4A6] transition-colors"
                          title="Editar"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(r._noteId || null)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
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
            <motion.div key="del-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
            <motion.div key="del-modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
                <p className="text-base font-bold text-gray-900 dark:text-white">Eliminar receta?</p>
                <p className="text-sm text-gray-500">Esta accion no se puede deshacer. La receta se eliminara del recetario publico.</p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-colors">Cancelar</button>
                  <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors">Eliminar</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div key="modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => { setShowModal(false); resetForm(); }} />
            <motion.div
              key="modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && (() => { setShowModal(false); resetForm(); })()}
            >
              <div className="w-full max-w-2xl bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/5 shrink-0">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {editing ? "Editar Receta" : "Nueva Receta del Recetario"}
                  </h3>
                  <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-4 w-4 text-gray-500" />
                  </button>
                </div>

                {/* Modal Tabs */}
                <div className="flex gap-1 px-5 pt-3 border-b border-gray-100 dark:border-white/5 shrink-0">
                  {(["info", "ingredientes", "pasos", "preview"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setModalTab(t)}
                      className={cn(
                        "px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors",
                        modalTab === t
                          ? "border-[#00B4A6] text-[#00B4A6] dark:text-emerald-400"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      )}
                    >
                      {t === "info" ? "Info Basica" : t === "ingredientes" ? "Ingredientes" : t === "pasos" ? "Pasos" : "Vista previa"}
                    </button>
                  ))}
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  {/* A) Info Basica */}
                  {modalTab === "info" && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
                        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Ceviche Clasico" className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Descripcion</label>
                        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripcion de la receta..." rows={3} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Emoji</label>
                          <input type="text" value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍲" maxLength={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Tiempo (min)</label>
                          <input type="number" value={tiempoMinutos} onChange={e => setTiempoMinutos(Number(e.target.value))} min={1} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Porciones</label>
                          <input type="number" value={porciones} onChange={e => setPorciones(Number(e.target.value))} min={1} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Dificultad</label>
                          <select value={dificultad} onChange={e => setDificultad(e.target.value as typeof dificultad)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30">
                            {DIFICULTADES.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Categoria</label>
                          <select value={categoria} onChange={e => setCategoria(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30">
                            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">URL Video YouTube (opcional)</label>
                          <input type="text" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/..." className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* B) Ingredientes */}
                  {modalTab === "ingredientes" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Ingredientes ({ingredientes.length})</p>
                        <button onClick={addIngrediente} className="text-xs font-bold text-[#00B4A6] hover:underline flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Agregar ingrediente
                        </button>
                      </div>
                      {ingredientes.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-6">Agrega ingredientes para la receta</p>
                      )}
                      {ingredientes.map((ing, idx) => (
                        <div key={idx} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 space-y-2">
                          <div className="flex gap-2 items-start">
                            <div className="flex-1">
                              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Nombre del ingrediente</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={ing.nombre}
                                  onChange={e => updateIngrediente(idx, "nombre", e.target.value)}
                                  placeholder="Buscar producto o escribir..."
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30"
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
                                        className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md hover:bg-blue-100 transition-colors"
                                      >
                                        {p.name} — S/{p.price.toFixed(2)}
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => removeIngrediente(idx)} className="p-1 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors mt-4 shrink-0">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Cantidad</label>
                              <input type="number" step="0.01" min="0" value={ing.cantidad} onChange={e => updateIngrediente(idx, "cantidad", parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Unidad</label>
                              <select value={ing.unidad} onChange={e => updateIngrediente(idx, "unidad", e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30">
                                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-gray-400 mb-0.5">Precio (S/)</label>
                              <input type="number" step="0.01" min="0" value={ing.precio} onChange={e => updateIngrediente(idx, "precio", parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30" />
                            </div>
                          </div>
                        </div>
                      ))}
                      {ingredientes.length > 0 && (
                        <div className="flex items-center justify-between bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 rounded-xl p-3 border border-[#00B4A6]/20">
                          <span className="text-xs font-bold text-[#00B4A6]">Total ingredientes</span>
                          <span className="text-sm font-bold text-[#00B4A6]">{formatCurrency(totalIngredientes)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* C) Pasos */}
                  {modalTab === "pasos" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Pasos de preparacion ({pasos.filter(p => p.trim()).length})</p>
                        <button onClick={addPaso} className="text-xs font-bold text-[#00B4A6] hover:underline flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Agregar paso
                        </button>
                      </div>
                      {pasos.map((paso, idx) => (
                        <div key={idx} className="flex gap-2 items-start">
                          <span className="flex items-center justify-center h-7 w-7 rounded-full bg-[#00B4A6]/10 text-[#00B4A6] text-xs font-bold shrink-0 mt-1">{idx + 1}</span>
                          <textarea
                            value={paso}
                            onChange={e => updatePaso(idx, e.target.value)}
                            placeholder={`Paso ${idx + 1}...`}
                            rows={2}
                            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30"
                          />
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button onClick={() => movePaso(idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors">
                              <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                            </button>
                            <button onClick={() => movePaso(idx, 1)} disabled={idx === pasos.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors">
                              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                            </button>
                            <button onClick={() => removePaso(idx)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* D) Preview */}
                  {modalTab === "preview" && (
                    <div className="space-y-4">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Vista previa de la receta</p>
                      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
                        <div className="bg-gradient-to-r from-[#00B4A6] to-[#33C4B8] p-4 text-white">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{emoji || "🍽️"}</span>
                            <div>
                              <h4 className="text-lg font-bold">{nombre || "Nombre de la receta"}</h4>
                              <div className="flex items-center gap-3 text-white/70 text-xs mt-1">
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{tiempoMinutos} min</span>
                                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{porciones} porciones</span>
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                  dificultad === "Facil" ? "bg-green-500/30" : dificultad === "Media" ? "bg-amber-500/30" : "bg-red-500/30"
                                )}>{dificultad}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          {descripcion && <p className="text-sm text-gray-600 dark:text-gray-300">{descripcion}</p>}
                          {ingredientes.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-gray-900 dark:text-white mb-2">Ingredientes</p>
                              <div className="space-y-1">
                                {ingredientes.filter(i => i.nombre).map((ing, idx) => (
                                  <div key={idx} className="flex justify-between text-xs text-gray-600 dark:text-gray-300">
                                    <span>{ing.cantidad} {ing.unidad} de {ing.nombre}</span>
                                    <span className="font-bold">{formatCurrency(ing.precio * ing.cantidad)}</span>
                                  </div>
                                ))}
                                <div className="flex justify-between text-xs font-bold text-[#00B4A6] pt-1 border-t border-gray-100">
                                  <span>Total</span>
                                  <span>{formatCurrency(totalIngredientes)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          {pasos.filter(p => p.trim()).length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-gray-900 dark:text-white mb-2">Preparacion</p>
                              <ol className="space-y-1.5">
                                {pasos.filter(p => p.trim()).map((p, idx) => (
                                  <li key={idx} className="flex gap-2 text-xs text-gray-600 dark:text-gray-300">
                                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-[#00B4A6]/10 text-[#00B4A6] text-[10px] font-bold shrink-0">{idx + 1}</span>
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
                <div className="flex gap-2 px-5 py-4 border-t border-gray-100 dark:border-white/5 shrink-0">
                  <button onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !nombre.trim() || ingredientes.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 shadow-sm transition-colors"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editing ? "Actualizar" : "Guardar"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
