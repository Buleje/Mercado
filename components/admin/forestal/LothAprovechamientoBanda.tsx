/**
 * «Aprovechamiento»: la cifra que manda en la cabecera del plan (Brandon
 * 07-10-2026: «mejora el KPI de aprovechamiento ingresando más detalles y
 * mejor formato»).
 *
 *   · arriba, el % grande y contra qué se mide, en una línea;
 *   · el ritmo contra el plazo, en días («vas 12 días atrasado»);
 *   · la barra apilada con la marca del 100 % y la de hoy;
 *   · la leyenda: m³ y % de cada tramo;
 *   · el exceso en rojo y en palabras, total y por especie;
 *   · el desglose por especie (top 5 + el resto plegado).
 *
 * Cómo se lee cada cifra va en los ⓘ, no en párrafos (ley de la vista 9).
 * Todo sale de `analizarAprovechamiento`; acá no se suma nada.
 */

import { AlertTriangle, TrendingUp } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { tonoAprovechamiento, type Aprovechamiento, type RitmoAprovechamiento } from "@/lib/forestal/loth-aprovechamiento";
import LothAprovechamientoBarra, { COLOR_TRAMO } from "./LothAprovechamientoBarra";
import LothAprovechamientoEspecies from "./LothAprovechamientoEspecies";

const m3 = (v: number) => `${formatNumber(v, 3)} m³`;
const ROTULO = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const AMBAR = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

/** Qué explica cada tramo (va en el ⓘ de la leyenda). */
const QUE_ES: Record<string, string> = {
  despachado: "Salió con guía (GTF).",
  patio: "Trozado y esperando despacho.",
  talado: "Talado que todavía no está en patio ni despachado: sin trozar, transformado en el TH o merma.",
  enPie: "Lo que todavía no se tala.",
};

export default function LothAprovechamientoBanda({ a, especies }: {
  a: Aprovechamiento;
  /** Cuántas especies tiene la base (para la nota de arriba). */
  especies: number;
}) {
  const tono = tonoAprovechamiento(a);
  const colorPct = tono === "danger" ? ROJO : tono === "warn" ? AMBAR : "text-[var(--text-primary)]";
  const esPlantacion = a.modo === "plantacion";
  const borde = tono === "danger" ? "border-[var(--data-error-500)]/50" : "border-[var(--rule-base)]";
  return (
    <section aria-labelledby="loth-aprovechamiento-titulo" className={`space-y-3 rounded-2xl border bg-[var(--surface-raised)] p-4 ${borde}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" />
            <span id="loth-aprovechamiento-titulo" className={ROTULO}>Aprovechamiento</span>
            <InfoTip
              title="Aprovechamiento"
              what={esPlantacion
                ? "Cuánto de lo registrado ya se taló. La tala descuenta del registro; el despacho y el patio salen de lo talado."
                : "Cuánto de lo autorizado ya se movilizó con guía. Es la cifra que fiscaliza OSINFOR; lo que no sale antes de vencer la vigencia se pierde."}
              affects="Sale del balance del plan: la misma cuenta que la pestaña de especies y el panel de zafra."
              example={esPlantacion
                ? "Registraste 100 m³ y talaste 40 m³: vas en 40 %. Si talaste 105 m³, la barra pasa la marca del 100 % y se pinta de rojo."
                : "Te autorizaron 500 m³ y movilizaste 150 m³: vas en 30 %. Con la mitad del plazo corrido, vas atrasado."}
              side="bottom"
            />
          </div>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span data-aprovechamiento-pct className={`font-mono text-3xl font-bold leading-none tabular-nums ${colorPct}`}>
              {a.pct == null ? "—" : `${formatNumber(a.pct, 1)} %`}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">
              <b className="font-mono tabular-nums text-[var(--text-primary)]">{m3(a.avance)}</b> {a.nombreAvance}s de{" "}
              <b className="font-mono tabular-nums text-[var(--text-primary)]">{m3(a.base)}</b> {a.nombreBase}s
            </span>
          </p>
          <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">
            {especies} {especies === 1 ? "especie" : "especies"} · quedan {m3(a.saldo)} {esPlantacion ? "en pie" : "por movilizar"}
            {a.ptEnPie != null && ` · ≈ ${formatNumber(a.ptEnPie, 0)} pt aserrable`}
          </p>
        </div>
        {a.ritmo && <Ritmo r={a.ritmo} pierde={a.saldo > 0} />}
      </div>

      {a.sinDatos ? (
        <p className="text-sm text-[var(--text-tertiary)]">
          {esPlantacion ? "Todavía no hay m³ registrados ni tala en el libro." : "Todavía no hay volumen autorizado ni movimientos."}
        </p>
      ) : (
        <>
          <LothAprovechamientoBarra a={a} />
          <Leyenda a={a} />
        </>
      )}

      {(a.excesos.length > 0 || a.especiesExcedidas.length > 0) && <Excesos a={a} />}

      {a.taladoSinRegistrar > 0 && (
        <p className={`flex items-start gap-1.5 text-sm font-semibold ${AMBAR}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>+{m3(a.taladoSinRegistrar)} talados de especies sin registrar: no descuentan de nada.</span>
          <InfoTip title="Especies sin registrar" what="El libro taló especies que este registro no tiene. Esos m³ no entran en el %." example="Agrégalas al registro con su volumen desde «Registro y saldo»." side="bottom" />
        </p>
      )}

      <LothAprovechamientoEspecies a={a} />
    </section>
  );
}

/** El ritmo contra el plazo: titular en días y la comparación en el ⓘ. */
function Ritmo({ r, pierde }: { r: RitmoAprovechamiento; pierde: boolean }) {
  const tono =
    r.estado === "atrasado" || (r.estado === "vencida" && pierde)
      ? "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 " + AMBAR
      : r.estado === "adelantado" || r.estado === "en_ritmo"
        ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
        : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return (
    <div data-ritmo={r.estado} className={`inline-flex max-w-full items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold ${tono}`}>
      <span className="min-w-0">{r.titular}</span>
      <InfoTip
        title="Ritmo contra el plazo"
        what={r.detalle}
        example="Si con la mitad del plazo corrido vas en 30 %, vas atrasado: el volumen hecho equivale a menos días de los que ya pasaron."
        side="left"
      />
    </div>
  );
}

function Leyenda({ a }: { a: Aprovechamiento }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4" aria-label="Tramos de la barra">
      {a.tramos.map((t) => (
        <li key={t.id} data-leyenda={t.id} className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COLOR_TRAMO[t.id]}`} aria-hidden="true" />
            <span className={`${ROTULO} truncate`} title={QUE_ES[t.id]}>{t.label}</span>
          </span>
          <span className="mt-0.5 block font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{m3(t.m3)}</span>
          <span className="block text-xs text-[var(--text-tertiary)]">
            {t.pctBase == null ? "—" : `${formatNumber(t.pctBase, 1)} % de lo ${a.nombreBase}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Excesos({ a }: { a: Aprovechamiento }) {
  const nombres = a.especiesExcedidas.slice(0, 3).map((e) => `${e.especie} (+${formatNumber(e.excesoM3, 3)} m³)`);
  const mas = a.especiesExcedidas.length - nombres.length;
  return (
    <div role="alert" className={`flex items-start gap-1.5 rounded-xl border border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/8 px-3 py-2 text-sm font-semibold ${ROJO}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        {a.excesos.length > 0 && <span className="block">{a.excesos.join(" · ")}.</span>}
        {nombres.length > 0 && (
          <span className="block">
            {a.especiesExcedidas.length === 1 ? "Especie pasada de" : "Especies pasadas de"} lo {a.nombreBase}: {nombres.join(", ")}
            {mas > 0 ? ` y ${mas} más` : ""}.
          </span>
        )}
      </span>
    </div>
  );
}
