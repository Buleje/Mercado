"use client";

/**
 * LothMapaElegirPermiso — «¿En qué permiso?» sobre el mapa (ADR-462, 02-10-2026).
 *
 * Con «Todos» en la banda se ven las áreas de todos los permisos, pero lo que
 * se dibuja tiene que ser de UNO. Al tocar cualquier herramienta de dibujo sale
 * esta barra: elegir un permiso lo pone en la banda (no es un selector más) y
 * la herramienta arranca cuando el área de ese permiso ya se leyó.
 * «Líneas sin permiso» es la del negocio, la de siempre. Escape cancela.
 */

import { useEffect, useRef } from "react";
import { Layers, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PERMISO_SIN_PLAN } from "@/lib/forestal/loth-filtro-permiso";
import { nombreDelPlan } from "@/lib/forestal/loth-tablero-permiso";
import { useLothPermiso } from "./hooks/use-loth-libro-permiso";
import type { AccionConPermiso } from "./hooks/use-loth-mapa-dibujo";

const QUE: Record<AccionConPermiso, string> = {
  area: "dibujas el área",
  predio: "dibujas el predio",
  via: "trazas la vía",
  referencia: "marcas la referencia",
  "pegar-area": "pegas el área",
  "pegar-predio": "pegas el predio",
};

const BARRA =
  "absolute inset-x-3 top-3 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--accent)] bg-[var(--surface-raised)]/95 px-3 py-2 shadow-lg backdrop-blur";
const OPCION =
  "inline-flex h-9 max-w-[16rem] items-center truncate rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

interface Props {
  accion: AccionConPermiso;
  onElegir: (id: string) => void;
  onCancelar: () => void;
}

export default function LothMapaElegirPermiso({ accion, onElegir, onCancelar }: Props) {
  const libro = useLothPermiso();
  const planes = libro?.planes ?? [];
  /** El foco va a la primera opción: con teclado se elige sin buscar la barra. */
  const primera = useRef<HTMLButtonElement>(null);
  useEffect(() => primera.current?.focus(), []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCancelar]);

  return (
    <div role="group" aria-label="¿En qué permiso?" className={BARRA} data-elegir-permiso>
      <Layers className="h-4 w-4 shrink-0 text-[var(--accent-dark)] dark:text-[var(--accent)]" aria-hidden="true" />
      <span className="text-xs font-bold text-[var(--text-primary)]">¿En qué permiso {QUE[accion]}?</span>
      <InfoTip
        title="¿En qué permiso?"
        what="Con «Todos» ves las áreas de todos tus permisos, pero lo que dibujas se guarda en uno. Elegirlo cambia el permiso de la banda."
        affects="El área, el predio, las vías y las referencias de ese permiso: su plano y su EUDR."
        example="Eliges PLANTACION 096: la banda pasa a ese permiso y empiezas a dibujar su área."
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {planes.map((p, i) => (
          <button key={p.id} ref={i === 0 ? primera : undefined} type="button" onClick={() => onElegir(p.id)} title={p.titularName ?? undefined} className={OPCION}>
            {nombreDelPlan(p)}
          </button>
        ))}
        <button
          ref={planes.length === 0 ? primera : undefined}
          type="button"
          onClick={() => onElegir(PERMISO_SIN_PLAN)}
          className={`${OPCION} font-semibold text-[var(--text-secondary)]`}
        >
          Líneas sin permiso
        </button>
      </div>
      <button
        type="button"
        onClick={onCancelar}
        aria-label="Cancelar"
        title="Cancelar (Esc)"
        className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
