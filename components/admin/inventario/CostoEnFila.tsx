"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { leerCostoEnCentimos, centimosDelCosto, textoDeCentimos } from "@/lib/inventario/costo-en-fila";

/** Guarda el costo (céntimos; null = sin costo). Devuelve el error en una frase, o null si salió bien. */
export type GuardarCosto = (productId: number, centimos: number | null) => Promise<string | null>;

const ATRIBUTO = "data-costo-en-fila";

/** Casillas de costo que se ven (la tabla y las tarjetas conviven en el DOM; una está en display:none). */
function casillasVisibles(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[${ATRIBUTO}]`)).filter((el) => el.offsetParent !== null);
}

/** Id del producto de la casilla que sigue a `actual` (el próximo que falta llenar). */
function siguienteCasilla(actual: HTMLInputElement): string | null {
  const todas = casillasVisibles();
  const i = todas.indexOf(actual);
  return i >= 0 ? (todas[i + 1]?.getAttribute(ATRIBUTO) ?? null) : null;
}

function enfocarCasilla(id: string) {
  // Tras guardar con el filtro «Sin costo», la fila se va y la lista se
  // re-pinta: se busca la casilla en el cuadro siguiente.
  requestAnimationFrame(() => {
    const el = casillasVisibles().find((x) => x.getAttribute(ATRIBUTO) === id);
    el?.focus();
    el?.select();
  });
}

interface Props {
  productId: number;
  nombre: string;
  costPrice: number | string | null | undefined;
  guardar: GuardarCosto;
}

/**
 * Costo de un producto editable en su fila: Enter guarda y baja al siguiente
 * que falta, Esc cancela, salir sin Enter NO guarda (es plata: nada se escribe
 * sin confirmar). Sin costo = casilla a la vista; con costo = la cifra, y un
 * toque la abre para corregirla (vacía = quitar el costo).
 */
export default function CostoEnFila({ productId, nombre, costPrice, guardar }: Props) {
  const base = centimosDelCosto(costPrice);
  const [baseVista, setBaseVista] = useState(base);
  const [texto, setTexto] = useState(textoDeCentimos(base));
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<"quieto" | "guardando" | "guardado">("quieto");
  const ref = useRef<HTMLInputElement>(null);
  const ocupado = useRef(false);
  const errorId = useId();

  // El costo cambió afuera (guardado, deshecho, recarga): la casilla lo sigue.
  if (base !== baseVista) {
    setBaseVista(base);
    setTexto(textoDeCentimos(base));
    setError(null);
  }

  useEffect(() => {
    if (estado !== "guardado") return;
    const t = setTimeout(() => setEstado("quieto"), 2000);
    return () => clearTimeout(t);
  }, [estado]);

  useEffect(() => {
    if (!editando) return;
    ref.current?.focus();
    ref.current?.select();
  }, [editando]);

  const lectura = leerCostoEnCentimos(texto);
  const pendiente = lectura.ok ? lectura.centimos !== base : texto.trim() !== "";
  const guardando = estado === "guardando";

  const confirmar = async () => {
    if (ocupado.current || !ref.current) return;
    if (!lectura.ok) {
      setError(lectura.error);
      return;
    }
    const destino = siguienteCasilla(ref.current);
    if (lectura.centimos === base) {
      setEditando(false);
      if (destino) enfocarCasilla(destino);
      return;
    }
    ocupado.current = true;
    setEstado("guardando");
    const fallo = await guardar(productId, lectura.centimos);
    ocupado.current = false;
    if (fallo) {
      setEstado("quieto");
      setError(fallo);
      return;
    }
    setEstado("guardado");
    setEditando(false);
    if (destino) enfocarCasilla(destino);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void confirmar();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setTexto(textoDeCentimos(base));
      setError(null);
      setEditando(false);
      ref.current?.blur();
    }
  };

  if (base != null && !editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        title="Toca para corregir el costo"
        aria-label={`Costo de ${nombre}: ${formatCurrency(base / 100)}. Toca para corregirlo`}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
      >
        {formatCurrency(base / 100)}
        {estado === "guardado" && <Check className="h-3.5 w-3.5 text-[var(--data-success-500)]" aria-label="Guardado" />}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative inline-flex items-center">
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          {...{ [ATRIBUTO]: String(productId) }}
          aria-label={`Costo de ${nombre} en soles`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-busy={guardando || undefined}
          title={pendiente && !error ? "Sin guardar: pulsa Enter (Esc cancela)" : "Enter guarda · Esc cancela"}
          placeholder="S/ 0.00"
          value={texto}
          readOnly={guardando}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          // Salir sin cambios cierra la corrección; con cambios la casilla
          // queda abierta y marcada «sin guardar» (nunca guarda sola).
          onBlur={() => {
            if (!pendiente && !guardando) setEditando(false);
          }}
          className={cn(
            "h-8 w-24 rounded-md border bg-[var(--surface-raised)] px-2 pr-6 font-mono text-xs tabular-nums text-[var(--text-primary)] dark:bg-[var(--surface-sunken)]",
            "placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]",
            error
              ? "border-[var(--data-error-500)]"
              : pendiente
                ? "border-[var(--data-warning-500)]"
                : "border-[var(--rule-base)] focus:border-[var(--accent)]",
          )}
        />
        {guardando && <Loader2 className="absolute right-1.5 h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" aria-hidden />}
      </div>
      {error && (
        <span id={errorId} role="alert" className="max-w-[12rem] text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </span>
      )}
    </div>
  );
}
