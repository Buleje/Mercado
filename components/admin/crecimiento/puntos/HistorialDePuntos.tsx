"use client";

/**
 * El historial de puntos de UN cliente y sumarle puntos a mano, dentro de su
 * ficha en Campañas › Puntos (19-10, «juntar pestañas gemelas»).
 *
 * Vivía aparte en Marketplace › Fidelidad: el MISMO programa (las dos leen
 * `Customer.loyaltyPoints` y `LoyaltyTransaction`), pero ahí había que volver
 * a escribir el celular y la ficha no tenía canje ni niveles. Se mudó la pieza
 * tal cual, con su API (`/api/marketplace/loyalty`: GET con `?phone=` trae los
 * movimientos; POST `earn` suma, sólo dueño o encargado). Las APIs no se
 * fundieron.
 *
 * Se monta con `next/dynamic` al abrir su plegable: el historial sólo se pide
 * cuando alguien lo quiere ver.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "@buleje/design-system/icons";
import { diaDe } from "@/components/admin/marketplace/tabs/cabecera-vista";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Movimiento {
  id: string;
  amount: number;
  reason: string;
  metadata?: { description?: string } | null;
  createdAt: string;
}

const CAMPO = "h-12 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary";
const MOTIVO: Record<string, string> = { purchase: "Compra", manual: "Puesto a mano", redemption: "Canje", referral: "Referido", bonus: "Bono", adjustment: "Ajuste" };

interface Props {
  phone: string;
  /** Se sumaron puntos: la ficha y la lista vuelven a leer el saldo. */
  onSumado: (puntos: number) => void;
}

export default function HistorialDePuntos({ phone, onSumado }: Props) {
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [error, setError] = useState(false);
  const [sumar, setSumar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /* Una lectura vieja (otro cliente, otra vuelta) no pisa a la nueva. */
  const pedido = useRef(0);

  const leer = useCallback(async () => {
    const n = ++pedido.current;
    setError(false);
    try {
      const res = await fetch(`/api/marketplace/loyalty?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`loyalty ${res.status}`);
      const d = (await res.json()) as { data?: { transactions?: Movimiento[] } };
      if (n === pedido.current) setMovimientos(d.data?.transactions ?? []);
    } catch {
      if (n === pedido.current) setError(true);
    }
  }, [phone]);

  useEffect(() => {
    void leer();
  }, [leer]);

  const puntos = Number(sumar);
  const sumaValida = Number.isInteger(puntos) && puntos > 0;
  const sumarPuntos = async () => {
    if (!sumaValida) return;
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/marketplace/loyalty", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "earn", phone, points: puntos, description: "Puntos asignados manualmente" }),
      });
      if (res.status === 403) {
        // El cajero no suma puntos a mano (lib/loyalty/roles-ajuste.ts): decirlo, no «intenta de nuevo».
        setAviso("Sólo el dueño o el encargado suman puntos a mano.");
        return;
      }
      if (!res.ok) throw new Error(`earn ${res.status}`);
      setSumar("");
      setAviso(`Listo: +${formatNumber(puntos)} puntos.`);
      onSumado(puntos);
      await leer();
    } catch {
      setAviso("No se pudieron sumar los puntos. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={sumar}
          onChange={(e) => setSumar(e.target.value)}
          placeholder="Puntos"
          aria-label="Puntos para sumar a mano"
          className={cn(CAMPO, "w-28 flex-1")}
        />
        <button type="button" onClick={() => void sumarPuntos()} disabled={!sumaValida || guardando} className={button({ variant: "secondary", className: "h-12 shrink-0 gap-1.5 rounded-xl px-4 text-sm" })}>
          <Plus className="h-4 w-4" aria-hidden /> {guardando ? "Sumando…" : "Sumar a mano"}
        </button>
      </div>
      {aviso && <p role="status" className="text-sm text-[var(--text-secondary)]">{aviso}</p>}

      {error ? (
        <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
          No se pudo leer el historial.{" "}
          <button type="button" onClick={() => void leer()} className="min-h-12 font-semibold underline">Reintentar</button>
        </p>
      ) : movimientos === null ? (
        <p className="text-sm text-[var(--text-tertiary)]">Cargando el historial…</p>
      ) : movimientos.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">Todavía no tiene movimientos de puntos.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-[var(--rule-soft)] overflow-y-auto" aria-label="Historial de puntos">
          {movimientos.map((tx) => {
            const suma = tx.amount >= 0;
            return (
              <li key={tx.id} className="flex min-h-12 items-center gap-2 py-2">
                <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
                  {MOTIVO[tx.reason] ?? tx.reason}
                  {tx.metadata?.description && <span className="text-[var(--text-secondary)]"> · {tx.metadata.description}</span>}
                  <span className="block text-sm text-[var(--text-tertiary)]">{diaDe(tx.createdAt)}</span>
                </span>
                <span className={cn("shrink-0 text-sm font-bold tabular-nums", suma ? "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]")}>
                  {suma ? "+" : "−"}{formatNumber(Math.abs(tx.amount))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
