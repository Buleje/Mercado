"use client";

/**
 * LothLibroPermisoSelect — «¿De qué permiso es lo que estoy viendo?» en la
 * vista Secciones del Libro TH. Mismos rótulos que el selector del Control del
 * permiso (`LothTableroCabecera`): «Todos los permisos», «PO 12 · titular» y
 * «Sin plan» sólo si hay líneas sin plan (o si es lo que estaba elegido).
 *
 * El rótulo es «Ver libro de» y no «Permiso»: la banda de arriba ya tiene
 * «Elegir permiso» (el permiso de TRABAJO, que se propone en los formularios).
 * Éste sólo cambia lo que se MIRA; dos «permiso» en la misma pantalla
 * confundían a Brandon y al QA (memoria `boton-homonimo-de-la-banda-loth`).
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PERMISO_SIN_PLAN } from "@/lib/forestal/loth-filtro-permiso";
import { nombreDelPlan, type PlanTablero } from "@/lib/forestal/loth-tablero-permiso";

export default function LothLibroPermisoSelect({
  planes,
  planSel,
  onElegir,
  haySinPlan,
}: {
  planes: readonly PlanTablero[];
  planSel: string | null;
  onElegir: (id: string | null) => void;
  haySinPlan: boolean;
}) {
  const elegido = planes.find((p) => p.id === planSel) ?? null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="libro-permiso" className="shrink-0 text-sm font-semibold text-[var(--text-secondary)]">
        Ver libro de
      </label>
      <select
        id="libro-permiso"
        value={planSel ?? ""}
        onChange={(e) => onElegir(e.target.value || null)}
        title={elegido ? `${nombreDelPlan(elegido)} · ${elegido.titularName ?? ""}` : "Las líneas de todos los permisos del libro"}
        /* `dark:bg-…` saca al select del respaldo oscuro de globals.css, que le
           pisaba el borde con --rule-base: elegido, el borde de acento no se
           veía en oscuro (medido: rgb(58,66,84) con `border-[var(--accent)]`). */
        className={`h-10 w-auto max-w-full flex-1 rounded-xl border-2 bg-[var(--surface-raised)] px-3 sm:flex-none dark:bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none ${
          planSel ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
        }`}
      >
        <option value="">Todos los permisos</option>
        {planes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.titularName && p.titularName !== nombreDelPlan(p) ? `${nombreDelPlan(p)} · ${p.titularName}` : nombreDelPlan(p)}
          </option>
        ))}
        {(haySinPlan || planSel === PERMISO_SIN_PLAN) && <option value={PERMISO_SIN_PLAN}>Sin plan</option>}
      </select>
      <InfoTip
        title="Ver libro de"
        what="Muestra sólo las líneas del permiso (plan de manejo) elegido. No cambia el permiso de trabajo de la banda."
        affects="La tabla, los contadores de cada sección, el Excel y el PDF formato SERFOR. Las otras vistas no cambian."
        example="Con «PO 12», el PDF dice arriba «Permiso PO 12» y trae sólo sus líneas."
      />
    </div>
  );
}
