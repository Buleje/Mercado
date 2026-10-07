"use client";

/**
 * «Volumen del permiso» (ADR-459): dónde está HOY lo autorizado (o lo
 * registrado, en una plantación) — en pie, talado sin trozar, en el patio,
 * despachado o consumido en el TH. Sale de `cascadaDelPlan`: cada casillero
 * es una resta de la etapa anterior, nunca una suma de tala+trozado+despacho
 * (la misma madera se asienta tres veces).
 *
 * La barra va siempre; la tabla por especie (`LothTableroVolumenEspecies`, con
 * el autofiltro en cada cabecera) se pliega y se recuerda.
 */

import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, ChevronDown, Map as MapIcon, RefreshCw } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { ptAserrableDeRolliza } from "@/lib/forestal/loth-restante";
import type { CascadaEspecie, CascadaPlan } from "@/lib/forestal/loth-saldo-cascada";
import type { BandaPermiso } from "@/lib/forestal/loth-tablero-permiso";
import { Btn } from "./ctp-shared";
import LothTableroVolumenEspecies from "./LothTableroVolumenEspecies";

/** Los casilleros de la cascada, en el orden en que viaja la madera. */
const TRAMOS = [
  { k: "enPieM3", label: "En pie", color: "bg-[var(--data-4)]" },
  { k: "taladoSinTrozarM3", label: "Talado sin trozar", color: "bg-[var(--data-7)]" },
  { k: "enPatioM3", label: "En patio", color: "bg-[var(--data-5)]" },
  { k: "despachadoM3", label: "Despachado", color: "bg-[var(--data-6)]" },
  { k: "consumidoM3", label: "Consumido en el TH", color: "bg-[var(--data-8)]" },
] as const satisfies readonly { k: keyof CascadaEspecie; label: string; color: string }[];

const pct = (v: number, base: number) => (base > 0 ? `${Math.round((v / base) * 1000) / 10}%` : "—");

export default function LothTableroVolumen({
  banda,
  cascada,
  cargando,
  error,
  onReintentar,
  onIrAlPlan,
}: {
  banda: BandaPermiso;
  cascada: CascadaPlan | null;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  onIrAlPlan?: () => void;
}) {
  const [abierta, setAbierta] = useLocalStorage<boolean>("loth-tablero:por-especie", false);
  const base = banda.baseLabel;
  const t = cascada?.total ?? null;

  const titulo = (
    <span className="inline-flex items-center gap-1.5">
      <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
        Volumen del permiso
      </CardTitle>
      <InfoTip
        title="Volumen del permiso"
        what={`Dónde está hoy lo ${base.toLowerCase()} de cada especie: en pie, talado sin trozar, en el patio, despachado o consumido.`}
        affects="Cada tramo es lo que quedó de la etapa anterior: la misma madera no se suma dos veces."
        example="Autorizado 80 m³, talado 5 m³: en pie 75 m³."
      />
    </span>
  );

  if (cargando && !cascada) {
    return (
      <section className="space-y-2" aria-busy="true">
        {titulo}
        <div className="h-16 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
      </section>
    );
  }
  if (error) {
    return (
      <section className="space-y-2">
        {titulo}
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          {error}
          <Btn size="sm" variant="secondary" onClick={onReintentar}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
          </Btn>
        </div>
      </section>
    );
  }
  if (!cascada || !t || cascada.especies.length === 0) {
    return (
      <section className="space-y-2">
        {titulo}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--rule-base)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          Este permiso no tiene especies {banda.esPlantacion ? "registradas" : "autorizadas"} todavía: sin ellas no hay contra qué descontar.
          {onIrAlPlan && (
            <Btn size="sm" variant="secondary" onClick={onIrAlPlan}>
              <MapIcon className="h-4 w-4" aria-hidden="true" /> Ir al Plan de manejo
            </Btn>
          )}
        </div>
      </section>
    );
  }

  /* El ancho de la barra: lo autorizado, o lo que se movió si se pasó. */
  const tramos = TRAMOS.map((x) => ({ ...x, v: Math.max(0, t[x.k] as number) }));
  const escala = Math.max(t.baseM3, tramos.reduce((a, x) => a + x.v, 0), 0.001);

  return (
    <section className="space-y-2" data-volumen-permiso>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {titulo}
        <span className="text-sm tabular-nums text-[var(--text-secondary)]">
          {base} <b className="font-mono text-[var(--text-primary)]">{fmtM3(t.baseM3)}</b> m³
          {t.baseM3 > 0 && (
            <span title="Pie tablar aserrable de referencia (56 % del m³ en rollizo). El libro declara m³.">
              {" "}≈ {formatNumber(ptAserrableDeRolliza(t.baseM3), 0)} pt
            </span>
          )}
          {t.pctTalado != null && <> · talado {t.pctTalado}%</>}
        </span>
      </div>
      <div className="space-y-2.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="img" aria-label={tramos.map((x) => `${x.label} ${fmtM3(x.v)} m³`).join(", ")}>
          {tramos.map((x) =>
            x.v > 0 ? <span key={x.k} className={`h-full ${x.color}`} style={{ width: `${(x.v / escala) * 100}%` }} title={`${x.label}: ${fmtM3(x.v)} m³`} /> : null,
          )}
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {tramos.map((x) => (
            <li key={x.k} className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${x.color}`} aria-hidden="true" />
                {x.label}
              </span>
              <span className="block font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {fmtM3(x.v)} <span className="font-sans text-xs font-normal text-[var(--text-tertiary)]">m³ · {pct(x.v, t.baseM3)}</span>
              </span>
              {x.v > 0 && (
                <span className="block text-xs tabular-nums text-[var(--text-tertiary)]" title="Pie tablar aserrable de referencia (56 %)">
                  ≈ {formatNumber(ptAserrableDeRolliza(x.v), 0)} pt
                </span>
              )}
            </li>
          ))}
        </ul>
        {t.excedido && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t.enPieM3 < 0 ? `Se taló ${fmtM3(-t.enPieM3)} m³ más de lo ${base.toLowerCase()}.` : `Una especie se pasó de lo ${base.toLowerCase()}.`}
          </p>
        )}
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-[var(--accent-dark)] hover:underline dark:text-[var(--accent)]"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
          {abierta ? "Ocultar" : "Ver"} por especie ({cascada.especies.length})
        </button>
        {abierta && (
          <div className="min-w-0">
            <LothTableroVolumenEspecies especies={cascada.especies} total={t} base={base} tramos={TRAMOS} />
          </div>
        )}
      </div>
    </section>
  );
}
