"use client";

/**
 * El formulario de una receta del recetario web (crear o editar): info básica,
 * ingredientes, pasos y vista previa. Se monta con `key` nueva cada vez que se
 * abre, así arranca con la receta que se edita (o vacío) sin efectos de reseteo.
 */
import { useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { Plus, X, Loader2, ChevronUp, ChevronDown, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { cn } from "@/lib/utils";
import { PanelIngredientesRecetario } from "./RecetarioPanelIngredientes";
import { VistaPreviaRecetario } from "./RecetarioVistaPrevia";
import { CATEGORIAS, DIFICULTADES, type Ingrediente, type ProductSearch, type RecetaPublica } from "./recetario-tipos";

interface Props {
  abierto: boolean;
  editando: RecetaPublica | null;
  products: ProductSearch[];
  onCerrar: () => void;
  onGuardada: () => void;
}

export function ModalRecetario({ abierto: showModal, editando: editing, products, onCerrar, onGuardada }: Props) {
  const [nombre, setNombre] = useState(editing?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(editing?.descripcion || "");
  const [emoji, setEmoji] = useState(editing?.emoji || "");
  const [tiempoMinutos, setTiempoMinutos] = useState(editing?.tiempoMinutos ?? 30);
  const [porciones, setPorciones] = useState(editing?.porciones ?? 4);
  const [dificultad, setDificultad] = useState<"Fácil" | "Media" | "Dificil">(editing?.dificultad ?? "Fácil");
  const [categoria, setCategoria] = useState(editing?.categoria ?? "Platos de fondo");
  const [videoUrl, setVideoUrl] = useState(editing?.videoUrl || "");
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>(() => (editing ? editing.ingredientes.map(i => ({ ...i })) : []));
  const [pasos, setPasos] = useState<string[]>(() => (editing ? [...editing.pasos] : [""]));
  const [modalTab, setModalTab] = useState<"info" | "ingredientes" | "pasos" | "preview">("info");
  const [saving, setSaving] = useState(false);

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

      const res = editing?._noteId
        ? await fetch(`/api/admin/recetario/${editing._noteId}`, {
            method: "PATCH",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(body),
          })
        : await fetch("/api/admin/recetario", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(typeof errBody?.error === "string" ? errBody.error : `No se pudo guardar la receta (error ${res.status})`);
        setSaving(false);
        return;
      }
      toast.success(editing ? "Receta actualizada" : "Receta creada");
      onCerrar();
      onGuardada();
    } catch (err) {
      console.warn("[RecetarioAdminTab] guardar receta falló", err);
      toast.error("No se pudo guardar la receta — revisa tu conexión.");
    }
    setSaving(false);
  };

  // ── Product autocomplete helper ──
  const selectProduct = (idx: number, prod: ProductSearch) => {
    setIngredientes(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, nombre: prod.name, precio: prod.price, productoId: prod.id } : ing
    ));
  };

  return (
      <AdminModal
        open={showModal}
        onClose={onCerrar}
        title={editing ? "Editar Receta" : "Nueva Receta del Recetario"}
        variant="wide"
      >
          {/* Modal Tabs */}
          <div className="flex gap-1 pt-3 border-b border-[var(--rule-soft)] px-5 py-5 sm:px-6">
            {(["info", "ingredientes", "pasos", "preview"] as const).map(t => (
              <button
                key={t}
                onClick={() => setModalTab(t)}
                className={cn(
                  "px-3 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors",
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
          <div className="px-5 py-4 space-y-4">
                  {/* A) Info Básica */}
                  {modalTab === "info" && (
                    <div className="space-y-3">
                      <Field label="Nombre *" labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Ceviche Clasico" className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </Field>
                      <Field label="Descripcion" labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripcion de la receta..." rows={3} className="w-full px-3 py-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </Field>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Field label="Emoji" labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                          <input type="text" value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍲" maxLength={2} className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </Field>
                        <Field label="Tiempo (min)" labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                          <input type="number" value={tiempoMinutos} onChange={e => setTiempoMinutos(Number(e.target.value))} min={1} className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </Field>
                        <Field label="Porciones" labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                          <input type="number" value={porciones} onChange={e => setPorciones(Number(e.target.value))} min={1} className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </Field>
                        <Field label="Dificultad" labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                          <select value={dificultad} onChange={e => setDificultad(e.target.value as typeof dificultad)} className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                            {DIFICULTADES.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Categoria" labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                          <select value={categoria} onChange={e => setCategoria(e.target.value)} className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </Field>
                        <Field label="URL Video YouTube (opcional)" labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                          <input type="text" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/..." className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                        </Field>
                      </div>
                    </div>
                  )}

                  {/* B) Ingredientes */}
                  {modalTab === "ingredientes" && (
                    <PanelIngredientesRecetario
                      ingredientes={ingredientes}
                      products={products}
                      totalIngredientes={totalIngredientes}
                      onAgregar={addIngrediente}
                      onQuitar={removeIngrediente}
                      onCambiar={updateIngrediente}
                      onElegirProducto={selectProduct}
                    />
                  )}

                  {/* C) Pasos */}
                  {modalTab === "pasos" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">Pasos de preparacion ({pasos.filter(p => p.trim()).length})</p>
                        <button onClick={addPaso} className="text-sm font-bold text-primary hover:underline flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Agregar paso
                        </button>
                      </div>
                      {pasos.map((paso, idx) => (
                        <div key={idx} className="flex gap-2 items-start">
                          <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-sm font-bold shrink-0 mt-1">{idx + 1}</span>
                          <textarea
                            value={paso}
                            onChange={e => updatePaso(idx, e.target.value)}
                            placeholder={`Paso ${idx + 1}...`}
                            rows={2}
                            className="flex-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button aria-label="Subir" onClick={() => movePaso(idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-[var(--rule-soft)] disabled:opacity-30 transition-colors">
                              <ChevronUp className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                            </button>
                            <button aria-label="Bajar" onClick={() => movePaso(idx, 1)} disabled={idx === pasos.length - 1} className="p-1 rounded hover:bg-[var(--rule-soft)] disabled:opacity-30 transition-colors">
                              <ChevronDown className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                            </button>
                            <button aria-label="Quitar" onClick={() => removePaso(idx)} className="p-1 rounded hover:bg-[var(--data-error-50)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* D) Preview */}
                  {modalTab === "preview" && (
                    <VistaPreviaRecetario emoji={emoji} nombre={nombre} tiempoMinutos={tiempoMinutos} porciones={porciones} dificultad={dificultad} descripcion={descripcion} ingredientes={ingredientes} pasos={pasos} totalIngredientes={totalIngredientes} />
                  )}
                </div>

          {/* Modal Footer */}
          <div className="flex gap-2 px-5 py-4 border-t border-[var(--rule-soft)]">
            <button onClick={onCerrar} className="flex-1 px-4 min-h-12 rounded-xl text-sm font-bold text-[var(--text-secondary)] bg-[var(--rule-soft)] hover:bg-[var(--rule-base)] transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !nombre.trim() || ingredientes.length === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 min-h-12 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? "Actualizar" : "Guardar"}
            </button>
          </div>
      </AdminModal>
  );
}
