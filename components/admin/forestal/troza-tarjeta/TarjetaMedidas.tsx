/**
 * Las medidas de la troza en casilleros grandes: D1, D2 y largo SIEMPRE (la que
 * falta dice «sin medir», no se esconde), y debajo lo que rinde: el pie tablar
 * primero —la unidad con que se habla en el aserradero— y el m³ del libro.
 */

import { Kicker } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { MedidaTarjeta, PtDeTarjeta } from "@/lib/forestal/tarjeta-troza";

const CASILLERO = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-3 text-center";

function Casillero({ m, enPlanta }: { m: MedidaTarjeta; enPlanta: boolean }) {
  return (
    <div className={CASILLERO}>
      <dt className="text-sm font-bold text-[var(--text-secondary)]">{m.rotulo}</dt>
      <dd
        className={cn(
          "mt-1 font-mono text-3xl font-extrabold leading-none tabular-nums",
          m.medida ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
        )}
      >
        {m.valor}
      </dd>
      <dd className="mt-1.5 text-sm text-[var(--text-secondary)]">
        {m.medida ? m.unidad : "sin medir"}
        {m.medida && enPlanta && m.clave !== "largo" && <span className="block text-xs">en planta</span>}
      </dd>
    </div>
  );
}

export default function TarjetaMedidas({
  medidas,
  diametroUnico,
  pt,
  m3,
  medidoEnPlanta,
}: {
  medidas: readonly MedidaTarjeta[];
  /** El diámetro declarado como UN número, cuando no hay D1/D2 («Ø 60 cm»). */
  diametroUnico: string | null;
  pt: PtDeTarjeta;
  m3: string;
  medidoEnPlanta: boolean;
}) {
  return (
    <section aria-labelledby="tarjeta-medidas" className="space-y-3 p-5 sm:p-6">
      <Kicker as="h2" id="tarjeta-medidas" className="text-[var(--text-secondary)]">
        Medidas
      </Kicker>
      <dl className="grid grid-cols-3 gap-2">
        {medidas.map((m) => (
          <Casillero key={m.clave} m={m} enPlanta={medidoEnPlanta} />
        ))}
      </dl>
      {diametroUnico && (
        <p className="text-sm text-[var(--text-secondary)]">
          Diámetro declarado en la guía: <span className="font-mono font-semibold text-[var(--text-primary)]">Ø {diametroUnico} cm</span>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-2">
        {pt?.tipo === "oxapampa" ? (
          <div className="rounded-xl border-2 border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-3" data-pt="oxapampa">
            <dt className="text-sm font-bold text-[var(--text-primary)]">PT Oxapampa</dt>
            <dd className="mt-1 whitespace-nowrap font-mono text-2xl font-extrabold leading-none tabular-nums text-[var(--text-primary)] sm:text-3xl">
              {pt.valor} <span className="text-base font-bold">pt</span>
            </dd>
            {pt.medidas && <dd className="mt-1.5 whitespace-nowrap text-sm tabular-nums text-[var(--text-secondary)]">{pt.medidas}</dd>}
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-3" data-pt={pt ? "aserrable" : "ninguno"}>
            <dt className="flex items-center gap-1 text-sm font-bold text-[var(--text-secondary)]">
              PT aserrable
              <InfoTip
                title="Pie tablar estimado"
                what="Lo que daría al aserrarla al 56 % de rendimiento: m³ × 0,56 × 424."
                affects="Es una estimación, no lo declara la guía. El que se paga es el PT Oxapampa, medido en el patio."
              />
            </dt>
            <dd className="mt-1 whitespace-nowrap font-mono text-2xl font-extrabold leading-none tabular-nums text-[var(--text-primary)] sm:text-3xl">
              {pt ? `≈ ${pt.valor}` : "—"} <span className="text-base font-bold">pt</span>
            </dd>
            <dd className="mt-1.5 text-sm text-[var(--text-secondary)]">estimado</dd>
          </div>
        )}
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-3">
          <dt className="text-sm font-bold text-[var(--text-secondary)]">Volumen</dt>
          <dd className="mt-1 whitespace-nowrap font-mono text-2xl font-extrabold leading-none tabular-nums text-[var(--text-primary)] sm:text-3xl">
            {m3} <span className="text-base font-bold">m³</span>
          </dd>
          <dd className="mt-1.5 text-sm text-[var(--text-secondary)]">del libro</dd>
        </div>
      </dl>
    </section>
  );
}
