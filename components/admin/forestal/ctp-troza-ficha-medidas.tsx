"use client";

/**
 * Las medidas de la troza en su ficha: D1, D2, largo y volumen, cada punta
 * con la MARCA de dónde salió (guía · P planta · R recibida · Ox Oxapampa,
 * las mismas de la tabla) y el control de Huber —¿esas puntas y ese largo dan
 * el volumen declarado?—. Si faltan puntas se dice qué falta y se ofrece
 * anotarlas, con el Ø medio que haría cuadrar como pista (derivado, no medida).
 */

import { AlertTriangle, Check, Ruler } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { controlHuber, medidasDeFicha, type FichaTroza } from "@/lib/forestal/troza-ficha-recorrido";
import { diametroEquivalenteCm, FUENTE_MEDIDA_META } from "@/lib/forestal/trozas-patio-medidas";
import { Btn } from "./ctp-shared";

const m3 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(4));
const cm = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function Celda({ label, valor, unidad, marca, marcaTitulo, falta, fuerte }: {
  label: string; valor: string | null; unidad: string; marca?: string; marcaTitulo?: string; falta?: boolean; fuerte?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-xl px-3 py-2.5 ${fuerte ? "bg-[var(--accent)]/8 ring-1 ring-inset ring-[var(--accent)]/25" : "bg-[var(--surface-sunken)]"}`}>
      <Kicker as="p" className="text-[var(--text-secondary)]">{label}</Kicker>
      {valor == null ? (
        <p className={`mt-0.5 text-sm font-bold ${falta ? "text-[var(--data-warning-ink)]" : "text-[var(--text-tertiary)]"}`}>
          {falta ? "Falta" : "—"}
        </p>
      ) : (
        <p className="mt-0.5 flex items-baseline gap-1 font-mono tabular-nums text-[var(--text-primary)]">
          <span className={fuerte ? "text-xl font-bold" : "text-lg font-bold"}>{valor}</span>
          <span className="text-xs text-[var(--text-secondary)]">{unidad}</span>
          {marca && (
            <abbr
              title={marcaTitulo}
              className="ml-0.5 rounded border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 font-sans text-[length:var(--ts-2xs)] font-bold no-underline text-[var(--text-secondary)]"
            >
              {marca}
            </abbr>
          )}
        </p>
      )}
    </div>
  );
}

export function MedidasDeLaTroza({ ficha, onAnotar }: { ficha: FichaTroza; onAnotar?: () => void }) {
  const t = ficha.troza;
  const med = medidasDeFicha(t);
  const fuente = med.fuente ? FUENTE_MEDIDA_META[med.fuente] : null;
  const huber = controlHuber(med.d1, med.d2, t.largoM, t.volumenM3);
  const faltan = med.d1 == null || med.d2 == null;
  const equivalente = faltan ? diametroEquivalenteCm(t.volumenM3, t.largoM) : null;
  const pct = huber ? Math.round(huber.desvio * 100) : 0;

  return (
    <section aria-labelledby="troza-ficha-medidas" className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Kicker as="h3" id="troza-ficha-medidas">Medidas</Kicker>
        <InfoTip
          title="De dónde sale cada medida"
          what="Cada punta lleva la marca de su fuente, igual que en la tabla. Sin marca = declarado en la guía. P = medido en planta (la guía no lo traía). R = medido al recibirla, llegó distinta. Ox = cubicación Oxapampa, pulgadas pasadas a cm."
          affects="El largo y el volumen son siempre los de la guía: son los que cuenta el libro."
          example="64 cm R: la guía decía otra cosa y en planta se midió 64."
        />
      </div>
      <div className="grid grid-cols-2 gap-2 @min-[34rem]:grid-cols-4">
        <Celda label="D1" valor={med.d1 != null ? cm(med.d1) : null} unidad="cm" marca={fuente?.marca} marcaTitulo={fuente?.label} falta />
        <Celda label="D2" valor={med.d2 != null ? cm(med.d2) : null} unidad="cm" marca={fuente?.marca} marcaTitulo={fuente?.label} falta />
        <Celda label="Largo" valor={t.largoM != null ? t.largoM.toFixed(2) : null} unidad="m" />
        <Celda label="Volumen" valor={t.volumenM3 != null ? m3(t.volumenM3) : null} unidad="m³" fuerte />
      </div>

      {huber ? (
        <p
          className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border px-3 py-2 text-xs ${
            huber.revisar ? "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10" : "border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
          }`}
        >
          {huber.revisar ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          ) : (
            <Check className="h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden />
          )}
          <span className="font-bold text-[var(--text-primary)]">{huber.revisar ? "No cuadra: revísala" : "Cuadra con el volumen"}</span>
          <span className="text-[var(--text-secondary)]">
            Huber con esas puntas da <span className="font-mono tabular-nums text-[var(--text-primary)]">{m3(huber.huberM3)} m³</span>{" "}
            contra {m3(huber.declaradoM3)} m³ declarados ·{" "}
            <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{pct > 0 ? "+" : ""}{pct} %</span>
          </span>
        </p>
      ) : faltan ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-2.5 @min-[34rem]:flex-row @min-[34rem]:items-center @min-[34rem]:justify-between">
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)]">
              {med.d1 == null && med.d2 == null ? "Le faltan D1 y D2." : `Le falta ${med.d1 == null ? "D1" : "D2"}.`}
            </span>{" "}
            Sin las dos puntas no se puede controlar el volumen.
            {equivalente != null && (
              <> El Ø medio que haría cuadrar ronda <span className="font-mono font-bold text-[var(--text-primary)]">≈{equivalente} cm</span> (sale del volumen y el largo: es una pista, no una medida).</>
            )}
          </p>
          {onAnotar && (
            <Btn variant="secondary" onClick={onAnotar} className="shrink-0">
              <Ruler className="h-4 w-4" aria-hidden /> Anotar D1 y D2
            </Btn>
          )}
        </div>
      ) : null}

      {(t.diametroCm != null || fuente) && (
        <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {fuente && <span>Puntas: {fuente.label.charAt(0).toLowerCase() + fuente.label.slice(1)}</span>}
          {t.diametroCm != null && <span>Ø para cubicar: <span className="font-mono">{t.diametroCm.toFixed(1)} cm</span></span>}
        </p>
      )}
    </section>
  );
}
