"use client";
import { CardTitle } from "@buleje/design-system";
import { Clock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type {
  DiaSemana,
  HorarioSemana,
  MarketplaceStoreData,
} from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import type { SetStore } from "./shared";

const DIAS: Array<{ id: DiaSemana; label: string }> = [
  { id: "mon", label: "Lunes" },
  { id: "tue", label: "Martes" },
  { id: "wed", label: "Miércoles" },
  { id: "thu", label: "Jueves" },
  { id: "fri", label: "Viernes" },
  { id: "sat", label: "Sábado" },
  { id: "sun", label: "Domingo" },
];

/** Atajo para arrancar: lunes a sábado 8:00–20:00, domingo cerrado. */
function horarioBase(): HorarioSemana {
  const h: HorarioSemana = {};
  for (const d of DIAS) h[d.id] = { open: "08:00", close: "20:00", closed: d.id === "sun" };
  return h;
}

const INPUT =
  "h-11 w-[7.5rem] px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium tabular-nums text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50";

/**
 * Horario de atención (Store.hoursJson). Con él, el marketplace dice
 * «abierto / cerrado / abre a las…» en tu tarjeta; sin él, no puede decirlo.
 * Se guarda con «Guardar cambios».
 */
export function TiendaHorario({ store, setStore }: { store: MarketplaceStoreData; setStore: SetStore }) {
  const horas = store.hours ?? null;

  const cambiarDia = (dia: DiaSemana, cambio: { open?: string; close?: string; closed?: boolean }) =>
    setStore((p) => {
      const base = p.hours ?? horarioBase();
      return { ...p, hours: { ...base, [dia]: { ...base[dia], ...cambio } } };
    });

  return (
    <section
      id="tienda-horario"
      className="scroll-mt-24 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden"
    >
      <header className="flex items-center gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
          <Clock className="h-5 w-5" />
        </span>
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Horario de atención</CardTitle>
        <InfoTip
          what="Los días y horas en que atiendes pedidos del marketplace."
          affects="Tu tarjeta muestra «Abierto» o «Abre a las 8:00» según este horario."
          example="Lunes a sábado 8:00–20:00, domingo cerrado."
        />
      </header>

      {!horas ? (
        <div className="p-6 flex flex-wrap items-center gap-3">
          <p className="text-base text-[var(--text-secondary)]">Todavía no pusiste tu horario.</p>
          <button
            type="button"
            onClick={() => setStore((p) => ({ ...p, hours: horarioBase() }))}
            className="h-11 px-4 rounded-xl border border-[var(--rule-base)] text-base font-semibold text-[var(--text-primary)] hover:border-primary hover:text-primary"
          >
            Empezar con lunes a sábado 8:00–20:00
          </button>
        </div>
      ) : (
        <ul className="p-4 sm:p-6 divide-y divide-[var(--rule-soft)]">
          {DIAS.map((d) => {
            const dia = horas[d.id] ?? {};
            const cerrado = Boolean(dia.closed);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                <span className="w-24 text-base font-semibold text-[var(--text-primary)]">{d.label}</span>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={!cerrado}
                    onChange={(e) => cambiarDia(d.id, { closed: !e.target.checked })}
                    className="h-5 w-5 accent-[var(--accent)]"
                  />
                  Abierto
                </label>
                <span className={cn("inline-flex items-center gap-2", cerrado && "opacity-60")}>
                  <input
                    type="time"
                    aria-label={`${d.label}: abre`}
                    value={dia.open ?? ""}
                    disabled={cerrado}
                    onChange={(e) => cambiarDia(d.id, { open: e.target.value || undefined })}
                    className={INPUT}
                  />
                  <span className="text-sm text-[var(--text-tertiary)]">a</span>
                  <input
                    type="time"
                    aria-label={`${d.label}: cierra`}
                    value={dia.close ?? ""}
                    disabled={cerrado}
                    onChange={(e) => cambiarDia(d.id, { close: e.target.value || undefined })}
                    className={INPUT}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
