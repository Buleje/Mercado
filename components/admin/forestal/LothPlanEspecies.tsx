"use client";

/**
 * El editor de las especies autorizadas por la resolución: alta, corrección de
 * los números (volumen, árboles, precio, VEN) y baja.
 *
 * Su tabla repite lo que la ficha de cada especie ya muestra —volumen,
 * árboles, precio—, pero es el único lugar para dar de alta y corregir. Por eso
 * arranca PLEGADA (con sus cifras en la bajada) y la preferencia se recuerda:
 * se abre para corregir, no para leer. Desde la ficha de una especie, «Editar»
 * y «Quitar del plan» llegan acá por `pedido` y abren la fila que corresponde.
 *
 * Las escrituras son las de `loth-plan-especies-api` (las mismas que usa el
 * registro de una plantación), y la especie lleva también su año de
 * instalación y superficie (ADR-459): un PO con parcelas reforestadas los usa.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardList, ListChecks, Loader2, Pencil, Plus, Trash2, TreePine, X } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import { agregarEspecie, corregirEspecie, numeroDe, quitarEspecie } from "./loth-plan-especies-api";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { ArbolCensoAutorizar } from "@/lib/forestal/loth-autorizar-lote";
import LothPlanAutorizarLote from "./LothPlanAutorizarLote";
import { n, soles, type Species } from "./loth-plan-shared";
import { AddBtn, BloquePlan, BotonPlegar, Cell, CitesPill, Field, Mono, Table, cls, editCls } from "./loth-plan-ui";

/** Clave de la preferencia. Exportada: la prueba en navegador la lee. */
export const CLAVE_AUTORIZACIONES_PLAN = "loth:plan:autorizaciones-abiertas";

const VACIO = {
  speciesCommon: "", cites: false, volumenAutorizadoM3: "", arbolesAutorizados: "",
  anioInstalacion: "", superficieHa: "", precioVentaSoles: "", valorEstadoNaturalSoles: "",
};

/** Un campo opcional: vacío viaja como `null` (borra), no como 0. */
const opcional = (v: string): number | null => {
  const n = numeroDe(v);
  return n == null || Number.isNaN(n) ? null : n;
};

/** Lo que pide la ficha de una especie. `n` cambia en cada pedido: dos veces
 *  «Editar» sobre la misma especie tiene que volver a abrirla. */
export interface PedidoEspecie { id: string; accion: "editar" | "borrar"; n: number }

/** Abrir la carga de varias especies, con una ya elegida (desde «Cupo por especie»). */
export interface PedidoLote { especie: string | null; n: number }

export default function LothPlanEspecies({ planId, species, onChange, pedido, censo = [], pedidoLote }: {
  planId: string;
  species: Species[];
  onChange: () => void;
  pedido?: PedidoEspecie | null;
  /** El censo del plan: de él salen las filas de «Cargar varias». */
  censo?: readonly ArbolCensoAutorizar[];
  pedidoLote?: PedidoLote | null;
}) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_AUTORIZACIONES_PLAN, false);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(VACIO);
  const [lote, setLote] = useState<{ especie: string | null } | null>(null);
  const loteAtendido = useRef(0);
  useEffect(() => {
    if (!pedidoLote || pedidoLote.n === loteAtendido.current) return;
    loteAtendido.current = pedidoLote.n;
    setLote({ especie: pedidoLote.especie });
  }, [pedidoLote]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ volumenAutorizadoM3: "", arbolesAutorizados: "", precioVentaSoles: "", valorEstadoNaturalSoles: "", anioInstalacion: "", superficieHa: "" });
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const setE = (k: keyof typeof edit, v: string) => setEdit((p) => ({ ...p, [k]: v }));
  const { confirm } = useConfirm();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !f.speciesCommon.trim() || !(Number(f.volumenAutorizadoM3) > 0)) return;
    setBusy(true);
    const matched = findSpeciesByCommonName(f.speciesCommon);
    const r = await agregarEspecie(planId, {
      speciesCommon: f.speciesCommon.trim(),
      speciesScientific: matched?.scientificName ?? null,
      cites: f.cites || matched?.cites || false,
      volumenAutorizadoM3: Number(f.volumenAutorizadoM3),
      arbolesAutorizados: opcional(f.arbolesAutorizados),
      anioInstalacion: opcional(f.anioInstalacion),
      superficieHa: opcional(f.superficieHa),
      precioVentaSoles: opcional(f.precioVentaSoles),
      valorEstadoNaturalSoles: opcional(f.valorEstadoNaturalSoles),
    });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setF(VACIO);
    onChange();
  }
  async function del(s: Species) {
    // La especie autorizada alimenta el balance y la rentabilidad del libro: se
    // confirma con el diálogo del DS (accesible, con foco atrapado), no con el
    // `window.confirm` del navegador, que además ignora el tema.
    const ok = await confirm({
      title: `¿Borrar ${s.speciesCommon} del plan?`,
      description: `Se quitan ${s.volumenAutorizadoM3 ?? "—"} m³ autorizados. Afecta el balance de saldo y la rentabilidad del libro. No se puede deshacer.`,
      intent: "danger",
      confirmLabel: "Sí, borrar la especie",
    });
    if (!ok) return;
    const r = await quitarEspecie(s.id, s.speciesCommon);
    if (!r.ok) { toast.error(r.error); return; }
    onChange();
  }

  function startEdit(s: Species) {
    setEditingId(s.id);
    setEdit({
      volumenAutorizadoM3: s.volumenAutorizadoM3 ?? "",
      arbolesAutorizados: s.arbolesAutorizados != null ? String(s.arbolesAutorizados) : "",
      precioVentaSoles: s.precioVentaSoles ?? "",
      valorEstadoNaturalSoles: s.valorEstadoNaturalSoles ?? "",
      anioInstalacion: s.anioInstalacion != null ? String(s.anioInstalacion) : "",
      superficieHa: s.superficieHa ?? "",
    });
  }
  async function saveEdit(id: string) {
    // PATCH: solo corrige los números de la autorización (vol/árboles/año/sup./precio/VEN).
    // El nombre de la especie no se edita acá (rompería el cruce del control) —
    // para cambiarlo, borrar y volver a agregar.
    if (busy || !(Number(edit.volumenAutorizadoM3) > 0)) return;
    setBusy(true);
    const r = await corregirEspecie(id, {
      volumenAutorizadoM3: Number(edit.volumenAutorizadoM3),
      arbolesAutorizados: opcional(edit.arbolesAutorizados),
      anioInstalacion: opcional(edit.anioInstalacion),
      superficieHa: opcional(edit.superficieHa),
      precioVentaSoles: opcional(edit.precioVentaSoles),
      valorEstadoNaturalSoles: opcional(edit.valorEstadoNaturalSoles),
    });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    setEditingId(null);
    onChange();
  }

  /* El pedido de la ficha: abrir esa fila en edición (o confirmar la baja) y
     traer el bloque a la vista. Sólo reacciona a un pedido NUEVO (`n`). */
  const atendido = useRef(0);
  useEffect(() => {
    if (!pedido || pedido.n === atendido.current) return;
    atendido.current = pedido.n;
    const s = species.find((x) => x.id === pedido.id);
    if (!s) return;
    if (pedido.accion === "editar") startEdit(s);
    else void del(s);
    requestAnimationFrame(() =>
      document.getElementById("loth-plan-autorizaciones-titulo")?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo el pedido dispara
  }, [pedido]);

  /* Con una fila en edición la tabla se ve aunque la preferencia sea plegada:
     no se edita a ciegas. Terminada la edición vuelve a lo que el usuario eligió. */
  const mostrar = abierto || editingId !== null;
  const volTotal = species.reduce((a, x) => a + Number(x.volumenAutorizadoM3 ?? 0), 0);
  /* Si a alguna especie le falta el N° de árboles, la suma sería menor que la
     real y se leería como dato: va «—». */
  const arbTotal = species.some((x) => x.arbolesAutorizados == null) ? null : species.reduce((a, x) => a + (x.arbolesAutorizados ?? 0), 0);

  return (
    <BloquePlan
      id="loth-plan-autorizaciones"
      titulo="Editar especies autorizadas"
      sub={
        species.length === 0
          ? "Sin especies: carga las aprobadas en la resolución («Cargar varias»)."
          : <>
              <span className="font-mono tabular-nums">{species.length}</span> {species.length === 1 ? "especie" : "especies"} ·{" "}
              <span className="font-mono tabular-nums">{volTotal.toFixed(2)}</span> m³ ·{" "}
              {arbTotal == null ? "—" : <span className="font-mono tabular-nums">{arbTotal}</span>} árboles autorizados en la resolución
            </>
      }
      acciones={
        <>
          {species.length > 0 && (
            <BotonPlegar
              abierto={mostrar}
              onClick={() => { setAbierto(!mostrar); if (mostrar) setEditingId(null); }}
              controla="loth-plan-autorizaciones-tabla"
              label={mostrar ? "Ocultar tabla" : "Ver y corregir"}
              icon={ListChecks}
              titulo="Se recuerda en este navegador"
            />
          )}
          <button
            type="button"
            onClick={() => setLote({ especie: null })}
            title="Todas las especies del censo en una tabla: m³ y árboles de la resolución, un solo guardar"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            data-cargar-varias
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            Cargar varias
          </button>
          <AddBtn onClick={() => setOpen(true)} />
        </>
      }
    >
      <LothPlanAutorizarLote
        open={lote != null}
        onClose={() => setLote(null)}
        planId={planId}
        censo={censo}
        species={species}
        especiePedida={lote?.especie ?? null}
        onGuardado={onChange}
      />
      <AdminModal
        open={open}
        onClose={() => setOpen(false)}
        title="Agregar especie autorizada"
        description="Lo que el plan permite aprovechar de esta especie. El libro controla el saldo contra este volumen."
        icon={TreePine}
        variant="wide"
      >
        <form onSubmit={add} className="space-y-4 px-5 py-5 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Especie *"><input value={f.speciesCommon} onChange={(e) => set("speciesCommon", e.target.value)} placeholder="Tornillo" autoFocus /* eslint-disable-line jsx-a11y/no-autofocus -- el modal se abre para escribir la especie de inmediato */ className={cls} /></Field>
            <Field label="Volumen autorizado (m³) *"><input type="number" step="0.0001" value={f.volumenAutorizadoM3} onChange={(e) => set("volumenAutorizadoM3", e.target.value)} placeholder="120.5" className={cls} /></Field>
            <Field label="N° de árboles autorizados"><input type="number" value={f.arbolesAutorizados} onChange={(e) => set("arbolesAutorizados", e.target.value)} placeholder="45" className={cls} /></Field>
            <Field label="Año de instalación"><input type="number" min="1900" max="2100" step="1" value={f.anioInstalacion} onChange={(e) => set("anioInstalacion", e.target.value)} placeholder="2018" className={cls} /></Field>
            <Field label="Superficie (ha)"><input type="number" min="0" step="0.01" value={f.superficieHa} onChange={(e) => set("superficieHa", e.target.value)} placeholder="12.5" className={cls} /></Field>
            <Field label="Precio de venta (S/ por m³)"><input type="number" step="0.01" value={f.precioVentaSoles} onChange={(e) => set("precioVentaSoles", e.target.value)} placeholder="850.00" className={cls} /></Field>
            <Field label="Valor en estado natural (S/ por m³)"><input type="number" step="0.01" value={f.valorEstadoNaturalSoles} onChange={(e) => set("valorEstadoNaturalSoles", e.target.value)} placeholder="12.50" className={cls} /></Field>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">El VEN es la base del derecho de aprovechamiento que se paga al Estado; el precio de venta alimenta la rentabilidad del libro.</p>
          <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="submit" disabled={busy || !f.speciesCommon.trim() || !(Number(f.volumenAutorizadoM3) > 0)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar especie
            </button>
          </div>
        </form>
      </AdminModal>
      <div id="loth-plan-autorizaciones-tabla" hidden={!mostrar || species.length === 0} className="p-3">
      <Table head={["Especie", "Vol. autoriz.", "N° árb.", "Año", "Sup. ha", "Precio/m³", "VEN/m³", ""]}>
        {species.map((s) => editingId === s.id ? (
          <tr key={s.id} className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
            <Cell><span className="font-medium text-[var(--text-primary)]">{s.speciesCommon}</span>{s.cites && <CitesPill />}</Cell>
            <Cell right><input type="number" step="0.0001" value={edit.volumenAutorizadoM3} onChange={(e) => setE("volumenAutorizadoM3", e.target.value)} aria-label={`Volumen autorizado de ${s.speciesCommon}`} className={editCls} /></Cell>
            <Cell right><input type="number" value={edit.arbolesAutorizados} onChange={(e) => setE("arbolesAutorizados", e.target.value)} aria-label={`Número de árboles autorizados de ${s.speciesCommon}`} className={editCls} /></Cell>
            <Cell right><input type="number" min="1900" max="2100" step="1" value={edit.anioInstalacion} onChange={(e) => setE("anioInstalacion", e.target.value)} aria-label={`Año de instalación de ${s.speciesCommon}`} className={editCls} /></Cell>
            <Cell right><input type="number" min="0" step="0.01" value={edit.superficieHa} onChange={(e) => setE("superficieHa", e.target.value)} aria-label={`Superficie en hectáreas de ${s.speciesCommon}`} className={editCls} /></Cell>
            <Cell right><input type="number" step="0.01" value={edit.precioVentaSoles} onChange={(e) => setE("precioVentaSoles", e.target.value)} aria-label={`Precio de venta por m³ de ${s.speciesCommon}`} className={editCls} /></Cell>
            <Cell right><input type="number" step="0.01" value={edit.valorEstadoNaturalSoles} onChange={(e) => setE("valorEstadoNaturalSoles", e.target.value)} aria-label={`Valor en estado natural por m³ de ${s.speciesCommon}`} className={editCls} /></Cell>
            <Cell right>
              <span className="inline-flex items-center gap-2">
                <button type="button" onClick={() => saveEdit(s.id)} disabled={busy} title="Guardar" aria-label={`Guardar ${s.speciesCommon}`} className="text-[var(--data-success-700)] hover:opacity-80 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>
                <button type="button" onClick={() => setEditingId(null)} title="Cancelar" aria-label="Cancelar la edición" className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><X className="h-4 w-4" /></button>
              </span>
            </Cell>
          </tr>
        ) : (
          <tr key={s.id} className="border-t border-[var(--rule-soft)]">
            <Cell><span className="font-medium text-[var(--text-primary)]">{s.speciesCommon}</span>{s.cites && <CitesPill />}{s.speciesScientific && <div className="text-xs italic text-[var(--text-tertiary)]">{s.speciesScientific}</div>}</Cell>
            <Cell right><Mono>{n(s.volumenAutorizadoM3)}</Mono></Cell>
            <Cell right>{s.arbolesAutorizados ?? "—"}</Cell>
            <Cell right>{s.anioInstalacion ?? "—"}</Cell>
            <Cell right>{s.superficieHa ? Number(s.superficieHa).toFixed(2) : "—"}</Cell>
            <Cell right>{soles(s.precioVentaSoles)}</Cell>
            <Cell right>{soles(s.valorEstadoNaturalSoles)}</Cell>
            <Cell right>
              <span className="inline-flex items-center gap-2">
                <button type="button" onClick={() => startEdit(s)} title="Editar autorización" aria-label={`Editar la autorización de ${s.speciesCommon}`} className="text-[var(--text-tertiary)] hover:text-[var(--accent)]"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => void del(s)} title={`Borrar ${s.speciesCommon}`} aria-label={`Borrar ${s.speciesCommon}`} className="text-[var(--data-error-600)] hover:text-[var(--data-error-700)]"><Trash2 className="h-4 w-4" /></button>
              </span>
            </Cell>
          </tr>
        ))}
      </Table>
      </div>
    </BloquePlan>
  );
}
