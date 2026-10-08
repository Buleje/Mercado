import { SectionTitle } from "@buleje/design-system";
import { Coins, Plus } from "@buleje/design-system/icons";
import CuentasPorPersona from "../cuentas/CuentasPorPersona";

/** Sin actividad todavía → guía de 2 pasos en vez del muro de ceros. */
export default function ResumenSinActividad({ onGoTab }: { onGoTab: (tab: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-2xl rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Coins className="h-8 w-8 text-primary" />
        </div>
        <SectionTitle className="text-2xl">Empieza a registrar adelantos</SectionTitle>
        <p className="mt-2 text-base text-[var(--text-secondary)]">
          Un adelanto es plata que le das a alguien y se va liquidando con lo que te entrega (producto o servicio).
        </p>
        <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white">1</span>
            <p className="mt-2 text-base font-bold text-[var(--text-primary)]">Agrega una persona</p>
            <p className="text-sm text-[var(--text-secondary)]">A quién le vas a adelantar plata.</p>
          </div>
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white">2</span>
            <p className="mt-2 text-base font-bold text-[var(--text-primary)]">Registra el adelanto</p>
            <p className="text-sm text-[var(--text-secondary)]">El monto y cómo se va a liquidar.</p>
          </div>
        </div>
        <button
          onClick={() => onGoTab("personas")}
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-base font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <Plus className="h-5 w-5" /> Agregar primera persona
        </button>
      </div>

      {/* Un tenant sin UNA sola ficha en Adelantos puede igual tener deuda
          forestal (aserríos, ventas) contra partes del directorio: sin esto
          la guía de onboarding la tapaba por completo. */}
      <CuentasPorPersona onGoTab={onGoTab} />
    </div>
  );
}
