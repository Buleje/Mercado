"use client";

/**
 * Poner una especie a muchas filas del cubicador de una vez (Brandon,
 * 2026-10-24): a todas las que se ven, de la N° tal a la N° tal, o a las
 * marcadas. El menú va en la cabecera de «Especie»; la ventanita dice antes
 * cuántas filas cambian y qué especie se pisa, y el toast deja «Deshacer».
 * Después se sigue editando celda por celda como siempre.
 *
 * La cuenta es pura: `lib/forestal/cubicador-especie-en-lote.ts`.
 */

import { useCallback, useMemo, useState } from "react";
import { CheckSquare, Leaf, ListChecks } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { devolverEspecies, planDeEspecie, ponerEspecie, textoPisadas, tramoDeEspecie } from "@/lib/forestal/cubicador-especie-en-lote";
import { VARIADO_DEFAULT, desglosarVariado, esVariado } from "@/lib/forestal/variado-desglose";
import { CAMPO_CUENTA as CAMPO, ETIQUETA_CUENTA as ETIQUETA } from "./cubicacion-cuenta-persona";
import type { ActionToast } from "./cubicador-toasts";

export type BlancoEspecie = "todas" | "tramo" | "marcadas";

const filasTxt = (n: number) => `${n} ${n === 1 ? "fila" : "filas"}`;
const aNumero = (v: string): number | null => (v.trim() === "" ? null : Number(v.trim()));

/**
 * El «▾» de la cabecera de Especie. La cabecera se arrastra para mover la
 * columna: el toque en el menú no tiene que empezar ese arrastre (los eventos
 * de React suben aunque el panel vaya en un portal).
 */
export function MenuEspecieEnLote({ filas, marcadas, filtrando, onAbrir }: {
  filas: number;
  marcadas: number;
  filtrando: boolean;
  onAbrir: (blanco: BlancoEspecie) => void;
}) {
  const acciones: MenuAccion[] = [
    {
      id: "todas",
      label: "Poner una especie a todas…",
      hint: filtrando ? `A las ${filasTxt(filas)} que se ven con el filtro` : `A las ${filasTxt(filas)} del lote`,
      icon: Leaf,
      disabled: filas === 0,
      onSelect: () => onAbrir("todas"),
    },
    {
      id: "tramo",
      label: "Poner una especie de N° … a N° …",
      hint: "Un tramo, por el N° de la tabla",
      icon: ListChecks,
      disabled: filas === 0,
      onSelect: () => onAbrir("tramo"),
    },
  ];
  if (marcadas > 0) {
    acciones.push({ id: "marcadas", label: `Poner una especie a las ${filasTxt(marcadas)} marcadas…`, icon: CheckSquare, onSelect: () => onAbrir("marcadas") });
  }
  return (
    <span onPointerDown={(e) => e.stopPropagation()} className="ml-1 inline-flex align-middle normal-case tracking-normal">
      <ActionMenu label="Poner especie a varias filas" title="Poner una especie a varias filas" soloIcono size="xs" actions={acciones} />
    </span>
  );
}

/** Aplica y avisa con «Deshacer», que devuelve a cada fila SU especie de antes. */
export function usePonerEspecieEnLote({ leerFilas, persist, pushToast }: {
  leerFilas: () => PiezaCubicada[];
  persist: (next: PiezaCubicada[]) => void;
  pushToast: (t: Omit<ActionToast, "id" | "exiting">) => void;
}) {
  return useCallback((ids: readonly string[], especie: string) => {
    const { filas, antes } = ponerEspecie(leerFilas(), new Set(ids), especie);
    if (antes.size === 0) return;
    const pisadas = textoPisadas(planDeEspecie([...antes].map(([id, e]) => ({ id, especie: e })), especie).pisadas);
    persist(filas);
    pushToast({
      tono: "success",
      msg: `${filasTxt(antes.size)} → ${especie}`,
      detail: pisadas ?? "Cada celda se sigue cambiando a mano.",
      undo: () => persist(devolverEspecies(leerFilas(), antes)),
    });
  }, [leerFilas, persist, pushToast]);
}

/* Cortos: en la ventana chica un título largo se cortaba en «Poner una especie…». */
const TITULO: Record<BlancoEspecie, string> = {
  todas: "Especie a todas",
  tramo: "Especie por tramo",
  marcadas: "Especie a marcadas",
};

export function EspecieEnLoteModal({ blanco, filas, total, marcadas, especies, filtrando, onAplicar, onCerrar }: {
  blanco: BlancoEspecie;
  /** Las filas que se ven, con el N° que muestra la tabla. */
  filas: readonly { r: PiezaCubicada; numero: number }[];
  /** Filas del lote entero: el N° va de 1 a esto. */
  total: number;
  /** Las filas marcadas (del lote entero, se vean o no). */
  marcadas: readonly PiezaCubicada[];
  especies: readonly string[];
  filtrando: boolean;
  onAplicar: (ids: readonly string[], especie: string) => void;
  onCerrar: () => void;
}) {
  const [especie, setEspecie] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const tramo = useMemo(
    () => (blanco === "tramo" ? tramoDeEspecie(filas.map(({ r, numero }) => ({ id: r.id, numero })), aNumero(desde), aNumero(hasta), total) : null),
    [blanco, filas, desde, hasta, total],
  );
  const objetivo = useMemo<readonly PiezaCubicada[]>(() => {
    if (blanco === "marcadas") return marcadas;
    if (blanco === "todas") return filas.map(({ r }) => r);
    if (!tramo?.ok) return [];
    const ids = new Set(tramo.ids);
    return filas.filter(({ r }) => ids.has(r.id)).map(({ r }) => r);
  }, [blanco, marcadas, filas, tramo]);
  const plan = useMemo(() => planDeEspecie(objetivo, especie), [objetivo, especie]);
  const pisadas = especie ? textoPisadas(plan.pisadas) : null;
  /* «Variado» es sólo para paquetes 6×6: la MISMA regla que el aviso de la celda. */
  const no6x6 = useMemo(
    () => (esVariado(especie) ? objetivo.filter((r) => desglosarVariado([{ ...r, especie }], [], VARIADO_DEFAULT).sinDesglosar[0]?.motivo === "no-6x6").length : 0),
    [especie, objetivo],
  );
  const rango = useMemo(() => {
    if (tramo?.ok) return `N° ${tramo.desde} a ${tramo.hasta}`;
    if (blanco !== "todas" || filas.length === 0) return null;
    const nums = filas.map((f) => f.numero);
    return `N° ${Math.min(...nums)} a ${Math.max(...nums)}`;
  }, [tramo, blanco, filas]);
  const sinEspecieIds = useMemo(() => objetivo.filter((r) => !r.especie?.trim()).map((r) => r.id), [objetivo]);

  const aplicar = (ids: readonly string[]) => {
    if (!especie || ids.length === 0) return;
    onAplicar(ids, especie);
    onCerrar();
  };
  const listo = especie !== "" && plan.ids.length > 0;
  const yaTenian = plan.filas - plan.ids.length;
  const errorTramo = tramo && !tramo.ok && (desde.trim() !== "" || hasta.trim() !== "") ? tramo.error : null;

  return (
    <AdminModal
      open
      onClose={onCerrar}
      size="md"
      icon={Leaf}
      title={TITULO[blanco]}
      aboveModals
      ayuda={
        <InfoTip
          what="Cambia la especie de muchas filas de una vez. Después la sigues cambiando celda por celda, como siempre."
          affects={filtrando ? "Con un filtro puesto, sólo cuentan las filas que se ven." : "El N° es el de la tabla, el mismo del papel."}
          example="De la N° 12 a la 48 va Cumala; el resto, Tornillo."
        />
      }
      footer={
        <ModalFooter error={errorTramo}>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>Cancelar</button>
          {pisadas && sinEspecieIds.length > 0 && (
            <button type="button" onClick={() => aplicar(sinEspecieIds)} className={button({ variant: "secondary" })}>
              Sólo las {sinEspecieIds.length} sin especie
            </button>
          )}
          <button type="button" disabled={!listo} onClick={() => aplicar(plan.ids)} className={button({ variant: "accent" })} data-aplicar-especie>
            {listo ? `Poner ${especie} a ${filasTxt(plan.ids.length)}` : "Poner especie"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <label className="block">
          <span className={ETIQUETA}>Especie</span>
          <select autoFocus value={especie} onChange={(e) => setEspecie(e.target.value)} className={CAMPO} aria-label="Especie que se pone">
            <option value="" disabled>Elige una especie</option>
            {especies.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {blanco === "tramo" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={ETIQUETA}>Desde N°</span>
              <input value={desde} onChange={(e) => setDesde(e.target.value)} inputMode="numeric" placeholder="1" aria-invalid={errorTramo != null} className={`${CAMPO} tabular-nums`} />
            </label>
            <label className="block">
              <span className={ETIQUETA}>Hasta N°</span>
              <input value={hasta} onChange={(e) => setHasta(e.target.value)} inputMode="numeric" placeholder={String(total)} aria-invalid={errorTramo != null} className={`${CAMPO} tabular-nums`} />
            </label>
          </div>
        )}
        <p className="text-sm text-[var(--text-secondary)]" data-vista-previa-especie aria-live="polite">
          {blanco === "tramo" && !tramo?.ok
            ? `Escribe desde qué N° hasta qué N° (la tabla va del 1 al ${total}).`
            : !especie
            ? `${filasTxt(plan.filas)}${rango ? ` (${rango})` : ""}: elige la especie.`
            : plan.ids.length === 0
              ? plan.filas === 0 ? "Ninguna fila todavía." : `Las ${filasTxt(plan.filas)} ya tienen ${especie}.`
              : <>{plan.ids.length === 1 ? "Se cambia" : "Se cambian"} <b className="font-bold text-[var(--text-primary)]">{filasTxt(plan.ids.length)}</b>{rango ? ` (${rango})` : ""}{yaTenian > 0 ? ` · ${yaTenian} ya ${yaTenian === 1 ? "tenía" : "tenían"} ${especie}` : ""}.</>}
        </p>
        {pisadas && (
          <p className="rounded-xl bg-[var(--data-warning-50)] px-3 py-2 text-sm font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]" data-pisadas-especie>
            {pisadas}: {plan.pisadas.reduce((n, p) => n + p.filas, 0) === 1 ? "pasa" : "pasan"} a {especie}.
          </p>
        )}
        {no6x6 > 0 && (
          <p className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            {filasTxt(no6x6)} no {no6x6 === 1 ? "es" : "son"} 6×6: Variado es sólo para paquetes de 6×6.
          </p>
        )}
      </div>
    </AdminModal>
  );
}
