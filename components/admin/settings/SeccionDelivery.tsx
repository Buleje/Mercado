import { DollarSign, Plus, Trash2 } from "@buleje/design-system/icons";
import { FieldLabel, NumberInput, SectionCard, SaveButton } from "@/components/admin/settings/campos";
import type { AjustesEstado } from "@/components/admin/settings/use-ajustes";

export function SeccionDelivery({ aj }: { aj: AjustesEstado }) {
  const { deliveryZones, setDeliveryZones, freeDeliveryMin, setFreeDeliveryMin, patch, saving, savedSection } = aj;
  return (
    <div className="space-y-6">
      <SectionCard title="Zonas de delivery" desc="Define zonas con tarifas y tiempos diferentes, y desde qué monto el envío es gratis.">
        <div className="space-y-2">
          {deliveryZones.map((zone, idx) => (
            <div key={idx} className="flex items-center gap-2 p-3 bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input id={`settings-zona-${idx}`} aria-label="Nombre de la zona" value={zone.name} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, name: e.target.value } : z))} placeholder="Nombre" className="px-2 py-1.5 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm bg-[var(--surface-raised)] outline-none" />
                <div className="flex items-center gap-1">
                  <input type="number" value={zone.fee} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, fee: Number(e.target.value) } : z))} min={0} className="w-full px-2 py-1.5 rounded-xl border border-[var(--rule-base)] text-sm font-mono bg-[var(--surface-raised)] outline-none" />
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">S/</span>
                </div>
                <div className="flex items-center gap-1">
                  <input type="number" value={zone.estimatedMin} onChange={e => setDeliveryZones(p => p.map((z, i) => i === idx ? { ...z, estimatedMin: Number(e.target.value) } : z))} min={0} className="w-full px-2 py-1.5 rounded-xl border border-[var(--rule-base)] text-sm font-mono bg-[var(--surface-raised)] outline-none" />
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">min</span>
                </div>
              </div>
              <button aria-label="Eliminar" onClick={() => setDeliveryZones(p => p.filter((_, i) => i !== idx))} className="p-1.5 rounded-xl text-[var(--data-error-500)] hover:text-[var(--data-error-500)]"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setDeliveryZones(p => [...p, { name: "", fee: 0, estimatedMin: 30 }])} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"><Plus className="h-3.5 w-3.5" /> Agregar zona</button>
        </div>
        {/* Envío gratis: era una tarjeta aparte para un solo campo */}
        <div className="pt-4 border-t border-[var(--rule-soft)]"><div className="sm:max-w-xs"><FieldLabel htmlFor="settings-freeDeliveryMin" icon={<DollarSign className="h-3.5 w-3.5" />}>Envío gratis desde</FieldLabel><NumberInput id="settings-freeDeliveryMin" value={freeDeliveryMin} onChange={setFreeDeliveryMin} min={0} suffix="soles (0 = no aplica)" /></div></div>
      </SectionCard>

      <SaveButton saving={saving} saved={savedSection === "delivery"} onClick={() => patch({ deliveryZones, freeDeliveryMin })} />
    </div>
  );
}
