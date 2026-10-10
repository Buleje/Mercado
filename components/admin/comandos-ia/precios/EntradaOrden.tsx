"use client";

import { useRef, useState, type Ref } from "react";
import { AlertCircle, Loader2, Sparkles } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BTN } from "./FilasDiferencia";

const EJEMPLOS = [
  "Sube 5 % todo Abarrotes menos el arroz y redondea a 10 céntimos",
  "Lleva a 30 % de margen las Bebidas",
  "Baja 10 céntimos los Snacks",
];

/**
 * «Ver la diferencia» con el error AL LADO, no debajo del botón: el aviso queda
 * donde estás mirando. Mientras piensa no se deshabilita (aria-disabled): un
 * botón `disabled` suelta el foco a <body> y al cerrar la diferencia el foco no
 * tenía a dónde volver.
 */
export function PedirDiferencia({
  pensando,
  deshabilitado,
  error,
  onPedir,
  ref,
}: {
  pensando: boolean;
  deshabilitado: boolean;
  error: string | null;
  onPedir: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      {error && (
        <span
          role="alert"
          className="flex min-w-0 flex-1 items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] [overflow-wrap:anywhere] max-sm:basis-full dark:text-[var(--data-error-500)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </span>
      )}
      <button
        ref={ref}
        type="button"
        disabled={deshabilitado}
        aria-disabled={pensando || undefined}
        aria-busy={pensando || undefined}
        onClick={onPedir}
        className={BTN.primario}
      >
        {pensando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
        Ver la diferencia
      </button>
    </div>
  );
}

/** Entrada (a): la orden en palabras. Las de siempre se entienden sin IA. */
export default function EntradaOrden({
  pensando,
  dudas,
  error,
  onPedir,
}: {
  pensando: boolean;
  dudas: { dudas: string[]; opciones: string[] } | null;
  error: string | null;
  onPedir: (orden: string) => void;
}) {
  const [orden, setOrden] = useState("");
  // Las opciones de «¿Quisiste decir…?» desaparecen al elegir una: el foco pasa al
  // botón para que, al cerrar la diferencia, vuelva ahí y no a <body>.
  const boton = useRef<HTMLButtonElement>(null);
  const pedir = (texto: string) => {
    const t = texto.trim();
    if (t.length >= 3 && !pensando) onPedir(t);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 text-base font-semibold text-[var(--text-primary)]">
        <label htmlFor="comandos-ia-orden">Tu orden</label>
        <InfoTip
          title="Orden en palabras"
          what="Di qué precios cambiar, cuánto y cómo redondear. Las órdenes comunes se entienden sin IA ($0); si no, la IA lee tu orden con los nombres de tus categorías, nunca tus precios."
          affects="Nada cambia hasta que ves la diferencia y tocas Aplicar."
          example="«Sube 5 % Abarrotes menos el arroz y redondea a 10 céntimos»"
        />
      </div>
      <textarea
        id="comandos-ia-orden"
        value={orden}
        onChange={(e) => setOrden(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) pedir(orden);
        }}
        rows={2}
        maxLength={400}
        placeholder="Ej.: sube 5 % todo Abarrotes menos el arroz"
        className="w-full resize-y rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
      />

      {dudas ? (
        <div role="status" className="space-y-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 dark:bg-[var(--surface-sunken)]">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">
            {dudas.dudas[0] ?? "No estoy seguro de lo que pides."} ¿Quisiste decir…?
          </span>
          <div className="flex flex-wrap gap-2">
            {dudas.opciones.slice(0, 3).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  setOrden(o);
                  boton.current?.focus();
                  pedir(o);
                }}
                className="rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:border-[var(--accent)]"
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2" aria-label="Ejemplos">
          {EJEMPLOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setOrden(e)}
              className="rounded-full border border-dashed border-[var(--rule-base)] px-3 py-1 text-left text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <PedirDiferencia ref={boton} pensando={pensando} deshabilitado={orden.trim().length < 3} error={error} onPedir={() => pedir(orden)} />
    </div>
  );
}
