"use client";

/**
 * Sin turno abierto: quién atiende, con cuánto abre y «Abrir turno» en UNA fila
 * (a 1280 px), y debajo una línea con el último turno y la meta.
 * Enter en el monto abre el turno: sin pasos de más.
 *
 * Abrir el turno abre la caja o, si ya hay una abierta (alguien la abrió desde
 * Caja), la usa: el formulario lo dice y su fondo es el efectivo inicial (lo fija el servidor).
 *
 * Hasta el 10-10 eran dos tarjetas (formulario + «Último turno» y «Meta» al
 * costado, 1 pantalla para tres datos).
 */
import { useState } from "react";
import { Loader2, Play, Trophy, Unlock, UserPlus } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { diaConFecha, type Cajero, type Turno } from "./tipos";
import type { CajaSinTurno } from "./use-turnos";

const ROTULO = "block text-sm font-semibold text-[var(--text-secondary)] mb-1.5";
const CAMPO = "w-full h-12 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
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
  cajaAbierta: CajaSinTurno | null;
};

export function AbrirTurnoPanel(p: Props) {
  const [efectivo, setEfectivo] = useState("");
  /* Con la caja ya abierta, el efectivo inicial ES su fondo (el servidor lo toma
     de la caja): el campo lo muestra y no se edita. */
  const fondoDeLaCaja = p.cajaAbierta ? String(p.cajaAbierta.fondo) : null;
  const valor = fondoDeLaCaja ?? efectivo;
  const abrir = async () => {
    const ok = await p.onAbrir(parseFloat(valor), p.cajeroElegido);
    if (ok) { setEfectivo(""); p.setCajeroElegido(""); }
  };
  const u = p.ultimoTurno;

  return (
    <section aria-label="Abrir turno" className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      {p.cajaAbierta && (
        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          <Unlock className="mr-1.5 inline h-4 w-4 align-text-bottom text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          La caja ya está abierta desde el {diaConFecha(p.cajaAbierta.abiertaEn)}, {formatTime(p.cajaAbierta.abiertaEn)}, con{" "}
          <b className="tabular-nums text-[var(--text-primary)]">{formatCurrency(p.cajaAbierta.fondo)}</b>: el turno la usa.{" "}
          <InfoTip
            title="Una sola caja"
            what="Abrir el turno no abre otra caja: usa la que ya está abierta. El esperado del cierre sale de esa caja y de su fondo."
            affects="Por eso el efectivo inicial del turno es el fondo de la caja y no se cambia: así el historial y el esperado parten de la misma cifra."
          />
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto_auto] xl:items-end">
        <Field label="Quién atiende" labelClassName={ROTULO}>
          {(id) => (
            <div className="flex gap-2">
              <select id={id} value={p.cajeroElegido} onChange={(e) => p.setCajeroElegido(e.target.value)} className={cn(CAMPO, "flex-1 min-w-0")}>
                <option value="">Yo mismo</option>
                {p.cajeros.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
              </select>
              <button
                type="button"
                onClick={p.onNuevaCajera}
                title="Crear una cajera nueva sin salir de Turnos"
                aria-label="Nueva cajera"
                className="h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors"
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
            value={valor}
            readOnly={fondoDeLaCaja !== null}
            onChange={(e) => setEfectivo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && valor !== "") abrir(); }}
            placeholder="S/ 0.00"
            className={cn(CAMPO, "px-4 text-lg font-bold text-right font-mono tabular-nums placeholder:font-normal placeholder:text-[var(--text-tertiary)] read-only:bg-[var(--surface-sunken)] read-only:cursor-default")}
          />
        </Field>
        <div role="group" aria-label="Montos rápidos" className="flex gap-2 sm:col-span-2 xl:col-span-1">
          {MONTOS_RAPIDOS.map((amount) => {
            const activo = parseFloat(valor || "0") === amount;
            return (
              <button
                key={amount}
                type="button"
                aria-pressed={activo}
                disabled={fondoDeLaCaja !== null}
                onClick={() => setEfectivo(String(amount))}
                className={cn(
                  "flex-1 xl:flex-none px-3 min-h-12 rounded-xl text-sm font-semibold border tabular-nums transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed",
                  activo
                    ? "border-primary bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-primary/40 hover:text-[var(--text-primary)]",
                )}
              >
                S/ {amount}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={abrir}
          disabled={p.opening || valor === ""}
          className={button({ variant: "primary", className: "rounded-xl sm:col-span-2 xl:col-span-1" })}
        >
          {p.opening ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Play className="h-5 w-5" strokeWidth={2} aria-hidden />}
          Abrir turno
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--rule-soft)] pt-2 text-sm text-[var(--text-secondary)]">
        <p className="min-w-0">
          {u ? (
            <>
              Último turno: <b className="text-[var(--text-primary)]">{p.nombreDe(u)}</b> · {diaConFecha(u.cerroEn || u.abrioEn)} · vendió{" "}
              <b className="tabular-nums text-[var(--text-primary)]">{formatCurrency(u.ventasTotal)}</b>
              {u.cierreEfectivo != null && !u.cerradoPorSistema && (
                <> · cerró con <b className="tabular-nums text-[var(--text-primary)]">{formatCurrency(u.cierreEfectivo)}</b></>
              )}
            </>
          ) : (
            "Este será el primer turno."
          )}
        </p>
        <p className="ml-auto flex items-center gap-1.5">
          <Trophy className="h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
          Meta del turno <b className="tabular-nums text-[var(--text-primary)]">{formatCurrency(p.metaVentas)}</b>
          <button type="button" onClick={p.onEditarMeta} className="min-h-12 rounded-xl px-2 font-semibold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Editar
          </button>
        </p>
      </div>
    </section>
  );
}
