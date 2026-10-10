"use client";

/**
 * La barra de acciones del lote cubicado.
 *
 * Vivían trece botones sueltos en dos renglones —Guardadas, Guardar, Nueva,
 * Enviar al Libro, Resumen, Apartados, Leer tabla, Liquidación, WhatsApp,
 * Anexo 04, Excel, CSV, Vaciar— todos del mismo tamaño y del mismo peso. Con
 * todo al mismo nivel no hay jerarquía: «Vaciar» (que borra el trabajo del día)
 * se veía igual que «CSV», y las dos acciones que de verdad importan —guardar
 * el lote y mandarlo al Libro— se perdían en el montón.
 *
 * Quedan dos botones a la vista y tres menús, agrupados por la pregunta que
 * contesta cada uno:
 *
 * | Grupo | Qué contesta | Qué trae |
 * |---|---|---|
 * | (sueltos) | lo que hago con el trabajo | Guardar · Enviar al Libro |
 * | Ver | mirar el lote de otra forma, sin salir | Resumen · Apartados · Liquidación · Leer tabla |
 * | Descargar | lo que sale en papel o archivo | Anexo 04 · Excel · CSV · WhatsApp |
 * | Lote | cambiar de lote | Guardadas · Nueva · Vaciar |
 *
 * Los contadores que cambian LO QUE SALE (piezas marcadas) suben al botón del
 * menú: si el Anexo va a traer 12 piezas y no las 700, eso no puede quedar
 * escondido detrás de un desplegable.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";

export interface AccionMenu {
  key: string;
  label: string;
  Icono?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  /** El panel que abre está abierto: la acción vuelve a cerrarlo. */
  activo?: boolean;
  /** Lo que se ve al pasar el mouse — el porqué, no el qué. */
  hint?: string;
  /** Borra trabajo: va al fondo, separada y en rojo. */
  peligro?: boolean;
  /** Un número que cambia el resultado («· 12» piezas marcadas). */
  badge?: string;
  disabled?: boolean;
}

const BOTON =
  "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50";
const NEUTRO = "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]";
const DESTACADO = "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";

/** Un botón suelto de la barra. Acento = mueve el trabajo hacia adelante. */
export function AccionLote({
  label,
  Icono,
  onClick,
  hint,
  destacado,
  disabled,
}: {
  label: string;
  Icono?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  hint?: string;
  destacado?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      disabled={disabled}
      className={`${BOTON} ${destacado ? `${DESTACADO} hover:brightness-95` : NEUTRO}`}
    >
      {Icono && <Icono className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

export function MenuAcciones({
  etiqueta,
  Icono,
  items,
  badge,
  alineacion = "izquierda",
}: {
  etiqueta: string;
  Icono?: React.ComponentType<{ className?: string }>;
  items: AccionMenu[];
  /** Sube al botón lo que cambia el resultado, para que no quede escondido. */
  badge?: string;
  alineacion?: "izquierda" | "derecha";
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);
  /* Cierra con click afuera y con Escape. Un menú que sólo cierra volviendo a
     tocar su botón deja al operador tapando la tabla que quería mirar. */
  useEffect(() => {
    if (!abierto) return;
    const alClick = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("click", alClick);
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("click", alClick);
      window.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  /* Lo que borra trabajo baja al fondo, detrás de una línea: nunca pegado a
     «Excel», donde un click de más cuesta el lote del día. */
  const normales = items.filter((i) => !i.peligro);
  const peligrosas = items.filter((i) => i.peligro);
  /* El botón se marca cuando algo suyo está pasando: un panel abierto o piezas
     marcadas. Sin eso, plegar los botones esconde el estado además del botón. */
  const hayActivo = items.some((i) => i.activo);

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className={`${BOTON} ${abierto || hayActivo || badge ? DESTACADO : NEUTRO}`}
      >
        {Icono && <Icono className="h-3.5 w-3.5" />}
        {etiqueta}
        {badge && <span className="font-mono tabular-nums">{badge}</span>}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {abierto && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-1 min-w-[230px] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)] ${
            alineacion === "derecha" ? "right-0" : "left-0"
          }`}
        >
          {normales.map((i) => (
            <ItemMenu key={i.key} item={i} onCerrar={() => setAbierto(false)} />
          ))}
          {peligrosas.length > 0 && (
            <>
              <div className="my-1 border-t border-[var(--rule-base)]" />
              {peligrosas.map((i) => (
                <ItemMenu key={i.key} item={i} onCerrar={() => setAbierto(false)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ItemMenu({ item, onCerrar }: { item: AccionMenu; onCerrar: () => void }) {
  const { Icono } = item;
  return (
    <button
      type="button"
      role="menuitem"
      title={item.hint}
      disabled={item.disabled}
      onClick={() => {
        item.onClick();
        onCerrar();
      }}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-bold transition-colors disabled:opacity-40 ${
        item.peligro
          ? "text-[var(--data-error-700)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)]"
          : item.activo
            ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
      }`}
    >
      {Icono && <Icono className="h-4 w-4 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{item.badge}</span>
      )}
      {/* Un panel abierto se dice con la palabra, no con un color que hay que
          aprender: la acción de esta fila ahora es cerrarlo. */}
      {item.activo && !item.badge && (
        <span className="shrink-0 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)]">
          abierto
        </span>
      )}
    </button>
  );
}
