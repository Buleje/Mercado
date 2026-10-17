/**
 * Lo que trae una plantilla antes de usarla (F28): sus ítems y condiciones, de
 * dónde es y de quién. Usarla NO copia cliente, fecha ni número: se dice acá.
 */
import { Building2, Monitor } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import type { PlantillaElegida } from "./use-plantillas";

const cifra = (n: number) => String(n).replace(".", ",");

export function OrigenPlantilla({ p }: { p: PlantillaElegida }) {
  const Icono = p.origen === "empresa" ? Building2 : Monitor;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {p.origen === "empresa" ? `De tu empresa · v${p.version ?? 1} · de ${p.propietario ?? "—"}` : "En este navegador"}
    </span>
  );
}

export function VistaPlantilla({ p, onUsar, onVolver }: { p: PlantillaElegida; onUsar: () => void; onVolver: () => void }) {
  const total = p.items.reduce((s, i) => s + i.cantidad * i.precioUnit * (1 - (i.descuento ?? 0) / 100), 0);
  return (
    <div className="space-y-3">
      <OrigenPlantilla p={p} />
      <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
        {p.items.map((i, idx) => (
          <li key={`${idx}-${i.descripcion}`} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block break-words font-semibold text-[var(--text-primary)]">{i.descripcion}</span>
              <span className="block tabular-nums text-[var(--text-secondary)]">
                {cifra(i.cantidad)} × {formatCurrency(i.precioUnit)}
                {(i.descuento ?? 0) > 0 ? ` · −${cifra(i.descuento ?? 0)} %` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-[var(--text-secondary)]">
        Base de referencia: <span className="font-semibold tabular-nums text-[var(--text-primary)]">{formatCurrency(total)}</span> (sin IGV, a los precios guardados)
      </p>
      {p.notas && (
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Condiciones: </span>
          {p.notas}
        </p>
      )}
      <p className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-primary)]">
        Copia sólo los ítems{p.notas ? " y las condiciones" : ""}: el cliente, la fecha y el número los eliges tú.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onVolver} className={button({ variant: "ghost", className: "rounded-xl px-4" })}>Volver</button>
        <button type="button" onClick={onUsar} className={button({ variant: "primary", className: "rounded-xl px-6" })}>Usar esta plantilla</button>
      </div>
    </div>
  );
}
