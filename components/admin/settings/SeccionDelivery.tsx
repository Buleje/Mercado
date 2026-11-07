import { DollarSign, Plus, Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { CLASE_CAMPO, FieldLabel, NumberInput, SectionCard } from "@/components/admin/settings/campos";
import type { AjustesEstado, DeliveryZone } from "@/components/admin/settings/use-ajustes";

/** Columnas de una zona: nombre · tarifa · minutos · quitar (48 px). */
const COLUMNAS = "grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_3rem] sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_3rem] items-center gap-2";

/**
 * Delivery (11-10): una zona = una fila con campos de 48 px y los rótulos una
 * sola vez arriba (antes cada fila tenía campos de 32 px sin rótulo y un
 * «Agregar zona» de texto chico). El marketplace lee nombre, tarifa y minutos.
 */
export function SeccionDelivery({ aj }: { aj: AjustesEstado }) {
  const { deliveryZones, setDeliveryZones, freeDeliveryMin, setFreeDeliveryMin } = aj;
  const cambiar = (idx: number, parte: Partial<DeliveryZone>) =>
    setDeliveryZones((p) => p.map((z, i) => (i === idx ? { ...z, ...parte } : z)));
  return (
    <div className="space-y-4">
      <SectionCard
        title="Zonas de delivery"
        desc="Define zonas con tarifas y tiempos diferentes, y desde qué monto el envío es gratis."
        accion={
          <button type="button" onClick={() => setDeliveryZones((p) => [...p, { name: "", fee: 0, estimatedMin: 30 }])} className={button({ variant: "secondary", className: "rounded-xl" })}>
            <Plus className="h-4 w-4" aria-hidden /> Agregar zona
          </button>
        }
      >
        {deliveryZones.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Todavía no tienes zonas: agrega la primera con su tarifa y cuánto demora.</p>
        ) : (
          <div className="space-y-2">
            <div className={cn(COLUMNAS, "text-sm font-semibold text-[var(--text-secondary)]")} aria-hidden>
              <span>Zona</span><span>Tarifa (S/)</span><span>Minutos</span><span />
            </div>
            {deliveryZones.map((zone, idx) => (
              <div key={idx} className={COLUMNAS}>
                <input id={`settings-zona-${idx}`} aria-label={`Nombre de la zona ${idx + 1}`} value={zone.name} onChange={(e) => cambiar(idx, { name: e.target.value })} placeholder="Centro" className={cn("w-full min-w-0", CLASE_CAMPO)} />
                <input type="number" aria-label={`Tarifa de la zona ${idx + 1} en soles`} value={zone.fee} onChange={(e) => cambiar(idx, { fee: Number(e.target.value) })} min={0} step={0.5} className={cn("w-full min-w-0 font-mono", CLASE_CAMPO)} />
                <input type="number" aria-label={`Minutos de entrega de la zona ${idx + 1}`} value={zone.estimatedMin} onChange={(e) => cambiar(idx, { estimatedMin: Number(e.target.value) })} min={0} className={cn("w-full min-w-0 font-mono", CLASE_CAMPO)} />
                <button type="button" aria-label={`Quitar la zona ${zone.name || idx + 1}`} title="Quitar zona" onClick={() => setDeliveryZones((p) => p.filter((_, i) => i !== idx))} className="grid h-12 w-12 place-items-center rounded-xl text-[var(--data-error-ink)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/15">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Envío gratis: era una tarjeta aparte para un solo campo */}
        <div className="pt-4 border-t border-[var(--rule-soft)] sm:max-w-sm">
          <FieldLabel htmlFor="settings-freeDeliveryMin" icon={<DollarSign className="h-3.5 w-3.5" />}>Envío gratis desde</FieldLabel>
          <NumberInput id="settings-freeDeliveryMin" value={freeDeliveryMin} onChange={setFreeDeliveryMin} min={0} suffix="soles (0 = no aplica)" />
        </div>
      </SectionCard>
    </div>
  );
}
