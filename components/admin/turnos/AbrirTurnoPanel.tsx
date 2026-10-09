"use client";

/**
 * Sin turno abierto: el formulario para abrir (quién atiende + con cuánto abre)
 * y, al costado, el último turno cerrado y la meta del turno.
 * Enter en el monto abre el turno: sin pasos de más.
 */
import { useState } from "react";
import { CalendarDays, Loader2, Play, Trophy, UserPlus } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { diaConFecha, type Cajero, type Turno } from "./tipos";

const ROTULO = "block text-sm font-semibold text-[var(--text-secondary)] mb-1.5";
const CAMPO = "w-full h-11 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
const MONTOS_RAPIDOS = [100, 200, 300, 500];

type Props = {
  cajeros: Cajero[];
  cajerosLoading: boolean;
  cajeroElegido: string;
  setCajeroElegido: (id: string) => void;
  opening: boolean;
  onAbrir: (monto: number, cajeroId: string) => Promise<boolean>;
  onNuevaCajera: () => void;
  ultimoTurno: Turno | null;
  nombreDe: (t: Turno) => string;
  metaVentas: number;
  onEditarMeta: () => void;
};

export function AbrirTurnoPanel(p: Props) {
  const [efectivo, setEfectivo] = useState("");
  const abrir = async () => {
    const ok = await p.onAbrir(parseFloat(efectivo), p.cajeroElegido);
    if (ok) { setEfectivo(""); p.setCajeroElegido(""); }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px] lg:items-start">
      <section aria-label="Abrir turno" className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quién atiende" labelClassName={ROTULO}>
            {(id) => (
              <div className="flex gap-2">
                <select id={id} value={p.cajeroElegido} onChange={(e) => p.setCajeroElegido(e.target.value)} className={cn(CAMPO, "flex-1 min-w-0")}>
                  <option value="">Yo mismo (usuario actual)</option>
                  {p.cajeros.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
                </select>
                <button
                  type="button"
                  onClick={p.onNuevaCajera}
                  title="Crear una cajera nueva sin salir de Turnos"
                  aria-label="Nueva cajera"
                  className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors"
                >
                  {p.cajerosLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            )}
          </Field>
          <Field
            label={<span className="inline-flex items-center gap-1">Efectivo inicial
              <InfoTip title="Efectivo inicial" what="El dinero con el que abre el cajón (sencillo para vueltos)." example="S/ 200 en monedas y billetes chicos" />
            </span>}
            labelClassName={ROTULO}
          >
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={efectivo}
              onChange={(e) => setEfectivo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && efectivo !== "") abrir(); }}
              placeholder="S/ 0.00"
              className={cn(CAMPO, "px-4 text-lg font-bold text-right font-mono tabular-nums placeholder:font-normal placeholder:text-[var(--text-tertiary)]")}
            />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {MONTOS_RAPIDOS.map((amount) => {
            const activo = parseFloat(efectivo || "0") === amount;
            return (
              <button
                key={amount}
                type="button"
                aria-pressed={activo}
                onClick={() => setEfectivo(String(amount))}
                className={cn(
                  "px-3.5 min-h-10 rounded-xl text-sm font-semibold border transition-colors",
                  activo ? "bg-primary text-white border-primary" : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-primary/40 hover:text-primary",
                )}
              >
                S/ {amount}
              </button>
            );
          })}
          <button
            type="button"
            onClick={abrir}
            disabled={p.opening || efectivo === ""}
            className="ml-auto inline-flex items-center justify-center gap-2 px-6 min-h-11 rounded-xl text-base font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-sm"
          >
            {p.opening ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Play className="h-5 w-5" strokeWidth={2} aria-hidden />}
            Abrir turno
          </button>
        </div>
      </section>

      <aside className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-2xl p-4 grid grid-cols-2 lg:grid-cols-1 gap-4 content-start">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-tertiary)] mb-1.5">Último turno</p>
          {p.ultimoTurno ? (
            <div className="space-y-1 text-sm text-[var(--text-secondary)]">
              <p className="text-base font-bold text-[var(--text-primary)] truncate">{p.nombreDe(p.ultimoTurno)}</p>
              <p className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
                {diaConFecha(p.ultimoTurno.cerroEn || p.ultimoTurno.abrioEn)}
              </p>
              <p>Vendió <span className="font-bold text-[var(--data-success-500)] tabular-nums">{formatCurrency(p.ultimoTurno.ventasTotal)}</span></p>
              {p.ultimoTurno.cierreEfectivo != null && !p.ultimoTurno.cerradoPorSistema && (
                <p>Cerró con <span className="font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(p.ultimoTurno.cierreEfectivo)}</span></p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">Este será el primero.</p>
          )}
        </div>
        <div className="min-w-0 lg:border-t lg:border-[var(--rule-soft)] lg:pt-3">
          <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-tertiary)] mb-1.5">Meta del turno</p>
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-base font-bold text-[var(--text-primary)] tabular-nums truncate">
              <Trophy className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" aria-hidden />{formatCurrency(p.metaVentas)}
            </p>
            <button type="button" onClick={p.onEditarMeta} className="text-sm font-semibold text-primary hover:underline shrink-0">Editar</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
