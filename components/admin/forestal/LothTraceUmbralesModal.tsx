"use client";

/**
 * LothTraceUmbralesModal — a partir de cuánta merma hay que mirar el árbol.
 *
 * El 40/55% que viene por defecto es un punto de partida, no una verdad: una
 * especie de copa ancha pierde legítimamente más volumen entre el tocón y las
 * trozas que una de fuste recto. Antes esto era un `< 40` escondido en el
 * código y una sola regla para todo el bosque.
 *
 * Se guarda en el navegador, por tenant: es cómo LEE este operador su libro, no
 * un dato del libro.
 */

import { useEffect, useState, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import {
  ControlesDeVentana,
  TiradorDeVentana,
} from "@/components/admin/shared/modal-controles-ventana";
import { RotateCcw, Save, X } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  acotarUmbral,
  LIMITE_UMBRAL,
  normalizarEspecie,
  UMBRALES_DEFAULT,
  type UmbralesMerma,
} from "@/lib/forestal/loth-trace-umbrales";

const INPUT =
  "h-11 w-20 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-center font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]";

export default function LothTraceUmbralesModal({
  open,
  umbrales,
  especies,
  onClose,
  onGuardar,
}: {
  open: boolean;
  umbrales: UmbralesMerma;
  /** Especies presentes en el libro, para no pedir que se escriban a mano. */
  especies: string[];
  onClose: () => void;
  onGuardar: (u: UmbralesMerma) => void;
}) {
  /* Sin esto el foco se queda atrás del modal: Tab se va a la pantalla
     de abajo y Escape no cierra (hook medido en el módulo, 2026-09-09). */
  /* `activo: open` no es decorativo: el componente NO se desmonta al
     cerrarse —sólo su contenido— así que sin esto el efecto corre una vez
     con el ref vacío y no vuelve a mirar cuando el modal aparece. */
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: onClose, activo: open });
  /**
   * Ventana: se mueve, se achica y se fija (ADR-420).
   *
   * Un umbral no se elige en el aire: se elige mirando qué árboles quedan
   * marcados con él. Corriendo el modal a un lado queda a la vista la columna
   * de merma de la tabla de atrás, y se sube o baja el porcentaje viendo
   * cuántos rojos deja —en vez de guardar, mirar y volver a abrir.
   */
  const ventana = useVentanaDeModal(open, {
    ref: cajaRef,
    aplicarTranslate: true,
    claveMemoria: "loth-umbrales-merma",
  });
  const [draft, setDraft] = useState<UmbralesMerma>(umbrales);

  useEffect(() => {
    if (open) setDraft(umbrales);
  }, [open, umbrales]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const setGeneral = (campo: "aviso" | "grave", valor: number) =>
    setDraft((d) => ({ ...d, general: { ...d.general, [campo]: valor } }));

  const setEspecie = (especie: string, campo: "aviso" | "grave", valor: number | null) =>
    setDraft((d) => {
      const key = normalizarEspecie(especie);
      const porEspecie = { ...d.porEspecie };
      if (valor == null) {
        delete porEspecie[key];
      } else {
        porEspecie[key] = { ...(porEspecie[key] ?? d.general), [campo]: valor };
      }
      return { ...d, porEspecie };
    });

  const guardar = () => {
    const general = acotarUmbral(draft.general);
    const porEspecie: UmbralesMerma["porEspecie"] = {};
    for (const [k, v] of Object.entries(draft.porEspecie)) porEspecie[k] = acotarUmbral(v, general);
    onGuardar({ general, porEspecie });
    onClose();
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-modal-2 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      /* El velo es decorativo: el diálogo es la caja de adentro. Cerrar tocando
         afuera es un atajo —Escape y la X hacen lo mismo con teclado. */
      role="presentation"
      onClick={(e) => {
        /* Fijado quiere decir «lo dejo abierto para mirar la tabla de atrás»:
           el clic afuera deja de cerrar. La X y Escape siguen cerrando. */
        if (e.target === e.currentTarget && !ventana.fijado) onClose();
      }}
    >
      {/* El diálogo en sí: acá viven el foco, el arrastre y el tamaño —
          el velo de atrás no se mueve. */}
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Umbrales de merma por especie"
        /* `relative`: el tirador de redimensión se ancla a esta esquina. */
        className="relative flex max-h-[88vh] w-full max-w-[38rem] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
      >
        {/* Cabecera — y asa para arrastrar la ventana. */}
        <header
          {...ventana.asaProps}
          className="flex items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-3"
        >
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">Umbrales de merma</p>
            <InfoTip
              title="Umbrales de merma"
              what="Cuánta madera puede perderse entre el tocón y las trozas antes de que la pantalla marque la fila."
              example="Una especie de copa ancha pierde legítimamente más volumen que una de fuste recto: por eso se ajusta por especie."
            />
          </div>
          {/* `ml-auto`: la cabecera reparte con `justify-between`, así que sin
              esto los controles quedarían flotando en el medio. */}
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">Todas las especies</p>
                <p className="text-xs text-[var(--text-tertiary)]">El valor que se usa cuando la especie no tiene el suyo</p>
              </div>
              <div className="flex items-end gap-3">
                <Campo label="Avisa desde" valor={draft.general.aviso} onChange={(v) => setGeneral("aviso", v)} />
                <Campo label="Grave desde" valor={draft.general.grave} onChange={(v) => setGeneral("grave", v)} />
              </div>
            </div>
          </div>

          <Kicker as="p" className="mb-2 mt-4 text-[var(--text-secondary)]">
            Por especie del libro
          </Kicker>
          {especies.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Todavía no hay especies registradas en el libro.</p>
          ) : (
            <ul className="space-y-2">
              {especies.map((e) => {
                const key = normalizarEspecie(e);
                const propio = draft.porEspecie[key];
                return (
                  <li
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule-soft)] px-3 py-2"
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!propio}
                        onChange={() => setEspecie(e, "aviso", propio ? null : draft.general.aviso)}
                        className="h-4 w-4 cursor-pointer accent-[var(--data-info-600)]"
                      />
                      <span className="text-sm font-bold text-[var(--text-primary)]">{e}</span>
                    </label>
                    {propio ? (
                      <div className="flex items-end gap-3">
                        <Campo label="Avisa" valor={propio.aviso} onChange={(v) => setEspecie(e, "aviso", v)} />
                        <Campo label="Grave" valor={propio.grave} onChange={(v) => setEspecie(e, "grave", v)} />
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        usa el general ({draft.general.aviso}% / {draft.general.grave}%)
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule-base)] px-5 py-3">
          <button
            type="button"
            onClick={() => setDraft(UMBRALES_DEFAULT)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            <RotateCcw className="h-4 w-4" /> Volver al default
          </button>
          <button
            type="button"
            onClick={guardar}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white hover:opacity-90"
          >
            <Save className="h-4 w-4" /> Guardar
          </button>
        </footer>

        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}

function Campo({ label, valor, onChange }: { label: string; valor: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-[var(--text-secondary)]">{label} %</span>
      <input
        type="number"
        min={LIMITE_UMBRAL.min}
        max={LIMITE_UMBRAL.max}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className={INPUT}
      />
    </label>
  );
}
