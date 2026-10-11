"use client";

/**
 * Marketplace › Fidelidad (11-10, «pestaña por pestaña, sin duplicados»).
 *
 * Medido: es el MISMO programa que Campañas › Puntos — las dos leen y
 * escriben `Customer.loyaltyPoints` y `LoyaltyTransaction` del tenant (acá por
 * `/api/marketplace/loyalty`, allá por `/api/loyalty/*`). Puntos es la
 * completa (lista de clientes, ficha, canje, notas, referido, niveles), así
 * que la acción principal lleva allá. Se quedan aquí las dos cosas que
 * Puntos no tiene: el historial de movimientos de un cliente y sumarle
 * puntos a mano.
 *
 * Salió lo que decía otra cosa que el sistema: niveles por PUNTOS (500 / 1000)
 * cuando el nivel real sale de lo GASTADO (500 / 1500 / 5000, con diamante),
 * beneficios «5 % / 10 % + envío prioritario» que nada aplica y «100 pts = S/ 1»
 * cuando un punto vale S/ 0,10. Y el historial leía `points`, `description` y
 * `type`, que la API no manda (`amount`, `reason`, `metadata`): salía
 * «undefined pts» en rojo para cada compra.
 */
import { useState, type FormEvent } from "react";
import { ArrowRight, Plus, Search } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { solesDePuntos } from "@/components/admin/crecimiento/puntos/mensajes";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { diaDe, FilaDeVista, VacioDeUnaFrase } from "./cabecera-vista";

interface Movimiento {
  id: string;
  amount: number;
  reason: string;
  metadata?: { description?: string } | null;
  createdAt: string;
}

interface Ficha {
  name: string;
  phone: string;
  points: number;
  totalSpent: number;
  transactions: Movimiento[];
}

const HREF_PUNTOS = "/admin?tab=campanas&vista=puntos";
const CAMPO = "h-12 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary";
const MOTIVO: Record<string, string> = { purchase: "Compra", manual: "Puesto a mano", redemption: "Canje", referral: "Referido", bonus: "Bono", adjustment: "Ajuste" };

export function MarketplaceFidelidadTab() {
  const [phone, setPhone] = useState("");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [estado, setEstado] = useState<"inicio" | "buscando" | "listo" | "error">("inicio");
  const [sumar, setSumar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const buscar = async (tel = phone.trim()) => {
    if (!tel) return;
    setEstado("buscando");
    setAviso(null);
    try {
      const res = await fetch(`/api/marketplace/loyalty?phone=${encodeURIComponent(tel)}`);
      if (!res.ok) throw new Error(`loyalty ${res.status}`);
      const d = (await res.json()) as { data?: Ficha };
      setFicha(d.data ?? null);
      setEstado("listo");
    } catch {
      setFicha(null);
      setEstado("error");
    }
  };

  const alBuscar = (e: FormEvent) => {
    e.preventDefault();
    void buscar();
  };

  const puntos = Number(sumar);
  const sumaValida = Number.isInteger(puntos) && puntos > 0;
  const sumarPuntos = async () => {
    if (!ficha || !sumaValida) return;
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/marketplace/loyalty", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "earn", phone: ficha.phone, points: puntos, description: "Puntos asignados manualmente" }),
      });
      if (!res.ok) throw new Error(`earn ${res.status}`);
      setSumar("");
      setAviso(`Listo: +${formatNumber(puntos)} puntos.`);
      await buscar(ficha.phone);
    } catch {
      setAviso("No se pudieron sumar los puntos. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const sinCliente = estado === "listo" && (!ficha || (!ficha.name && ficha.points === 0 && ficha.transactions.length === 0));

  return (
    <div className="space-y-3 sm:space-y-4">
      <FilaDeVista
        titulo="Fidelidad"
        ayuda={{
          what: "Los puntos de tus clientes: 1 punto por cada S/ 1 que compran, en tu tienda y en el marketplace. Es el mismo programa de Campañas › Puntos.",
          affects: "Aquí ves el historial de un cliente y le sumas puntos a mano; la lista de clientes, el canje y los niveles están en Campañas › Puntos.",
          example: "Un cliente con 124 puntos tiene S/ 12,40 para canjear.",
        }}
        derecha={
          <EnlacePanel href={HREF_PUNTOS} apariencia="heredada" className={button({ variant: "primary", className: "h-12 shrink-0 rounded-xl" })}>
            Abrir Puntos <ArrowRight className="h-4 w-4" aria-hidden />
          </EnlacePanel>
        }
      >
        <form onSubmit={alBuscar} className="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-auto">
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Celular del cliente, p. ej. 961 234 567"
            aria-label="Celular del cliente"
            className={cn(CAMPO, "flex-1 sm:max-w-sm")}
          />
          <button type="submit" disabled={!phone.trim() || estado === "buscando"} className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-xl" })}>
            <Search className="h-4 w-4" aria-hidden /> {estado === "buscando" ? "Buscando…" : "Buscar"}
          </button>
        </form>
      </FilaDeVista>

      {estado === "inicio" && <VacioDeUnaFrase>Busca un cliente por su celular para ver su historial de puntos o sumarle puntos a mano.</VacioDeUnaFrase>}
      {estado === "error" && <VacioDeUnaFrase>No se pudo buscar ese celular. Intenta de nuevo.</VacioDeUnaFrase>}
      {sinCliente && <VacioDeUnaFrase>No hay un cliente con ese celular.</VacioDeUnaFrase>}

      {estado === "listo" && ficha && !sinCliente && (
        <section aria-label={`Puntos de ${ficha.name || ficha.phone}`} className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-base font-bold text-[var(--text-primary)]">{ficha.name || "Sin nombre"}</span>
            <span className="text-sm tabular-nums text-[var(--text-secondary)]">{ficha.phone}</span>
            <span className="ml-auto text-lg font-extrabold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">{formatNumber(ficha.points)} puntos</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Vale {solesDePuntos(ficha.points)} al canjear
            {ficha.totalSpent > 0 && ` · compró ${formatCurrency(ficha.totalSpent)} en total`}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={sumar}
              onChange={(e) => setSumar(e.target.value)}
              placeholder="Puntos"
              aria-label="Puntos para sumar"
              className={cn(CAMPO, "w-32")}
            />
            <button type="button" onClick={() => void sumarPuntos()} disabled={!sumaValida || guardando} className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-xl" })}>
              <Plus className="h-4 w-4" aria-hidden /> {guardando ? "Sumando…" : "Sumar a mano"}
            </button>
            {aviso && <span role="status" className="text-sm text-[var(--text-secondary)]">{aviso}</span>}
          </div>

          {ficha.transactions.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Todavía no tiene movimientos de puntos.</p>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-soft)]" aria-label="Historial de puntos">
              {ficha.transactions.map((tx) => {
                const suma = tx.amount >= 0;
                return (
                  <li key={tx.id} className="flex min-h-12 items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
                      {MOTIVO[tx.reason] ?? tx.reason}
                      {tx.metadata?.description && <span className="text-[var(--text-secondary)]"> · {tx.metadata.description}</span>}
                    </span>
                    <span className="text-sm text-[var(--text-secondary)]">{diaDe(tx.createdAt)}</span>
                    <span className={cn("w-20 text-right text-sm font-bold tabular-nums", suma ? "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]")}>
                      {suma ? "+" : "−"}{formatNumber(Math.abs(tx.amount))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
