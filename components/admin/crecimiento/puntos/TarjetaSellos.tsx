"use client";

/**
 * La tarjeta de sellos del cliente elegido: «7 de 10 sellos» con sus casillas,
 * el aviso cuando le toca el premio y «Marcar canjeado». La cuenta viene del
 * servidor (compras cerradas desde el día que elegiste); aquí sólo se dibuja.
 * `soloLectura` = la ficha de Mis clientes: dice dónde está, sin el botón.
 */
import { useState } from "react";
import { Gift, Stamp } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { diaConNombre } from "@/lib/forestal/arbol-de-troza";
import type { CanjeSellos, EstadoSellos } from "@/lib/loyalty/sellos";
import { limaDateKey } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** 12 casillas de 20 px entran en una fila de la ficha (≈ 277 px a 1280); más de 20, sólo la barra. */
const MAX_CASILLAS = 20;

export function Casillas({ llenas, meta }: { llenas: number; meta: number }) {
  if (meta > MAX_CASILLAS) {
    return (
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (llenas / meta) * 100)}%` }} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1" aria-hidden>
      {Array.from({ length: meta }, (_, i) => (
        <span
          key={i}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full border",
            i < llenas ? "border-primary bg-primary text-[var(--surface-canvas)]" : "border-[var(--rule-strong)] bg-[var(--surface-canvas)]",
          )}
        >
          {i < llenas && <Stamp className="h-3 w-3" />}
        </span>
      ))}
    </div>
  );
}

export function TarjetaSellos({
  estado,
  canjes,
  premio,
  cargando,
  onCanjear,
}: {
  estado: EstadoSellos | null;
  canjes: CanjeSellos[];
  premio: string;
  cargando: boolean;
  /** Sin esto, la tarjeta es de sólo lectura (Mis clientes). */
  onCanjear?: () => Promise<string | null>;
}) {
  const [marcando, setMarcando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!estado) {
    return <p className="text-sm text-[var(--text-tertiary)]">{cargando ? "Contando sellos…" : "No se pudo contar sus sellos."}</p>;
  }
  const llenas = estado.premios > 0 ? estado.meta : estado.siguiente;
  const ultimo = canjes[0];

  const canjear = async () => {
    if (!onCanjear) return;
    setMarcando(true);
    setError(await onCanjear());
    setMarcando(false);
  };

  return (
    <div className="space-y-2">
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-[var(--text-primary)]">Tarjeta de sellos</span>
        <span className="font-bold tabular-nums text-[var(--text-primary)]">
          {llenas} de {estado.meta} sellos
        </span>
      </p>
      <Casillas llenas={llenas} meta={estado.meta} />
      {estado.premios > 0 ? (
        <div className="space-y-2 rounded-xl bg-[var(--data-success-50)] p-3 dark:bg-[var(--data-success-500)]/12">
          <p role="status" className="flex items-start gap-2 text-sm font-semibold text-[var(--data-success-ink)]">
            <Gift className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Le toca el premio: {premio}
              {estado.premios > 1 ? ` (${estado.premios} premios)` : ""}
              {estado.siguiente > 0 ? ` · ya lleva ${estado.siguiente} para la siguiente` : ""}
            </span>
          </p>
          {onCanjear ? (
            <button type="button" onClick={canjear} disabled={marcando} className={button({ variant: "primary", className: "w-full rounded-xl text-sm" })}>
              {marcando ? "Marcando…" : "Marcar canjeado"}
            </button>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">Márcalo en Campañas › Puntos cuando se lo entregues.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">
          {estado.meta - estado.siguiente === 1 ? "Le falta 1 compra" : `Le faltan ${estado.meta - estado.siguiente} compras`} para {premio}.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-[var(--data-error-ink)]">{error}</p>}
      {ultimo && (
        <p className="text-sm text-[var(--text-tertiary)]">
          Último premio: {diaConNombre(limaDateKey(ultimo.at))}
          {ultimo.por ? ` · lo marcó ${ultimo.por}` : ""}
          {estado.canjeados > 1 ? ` · ${estado.canjeados} en total` : ""}
        </p>
      )}
    </div>
  );
}
