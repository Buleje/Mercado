"use client";

/**
 * Descuentos del lote en la cubicación comercial (ADR-483 D5): por especie
 * (− PT y luego %) y al final un % general. Bruto → neto en vivo con
 * `aplicarDescuentoLote`, la misma función con la que el servidor guarda.
 * Un descuento que deja negativo una especie se avisa acá y el servidor lo
 * rechaza igual (422 `DESCUENTO_INVALIDO`).
 */
import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtVolumen } from "@/lib/forestal/cubicacion-cuenta";
import { PCT_DESCUENTO_MAX } from "@/lib/forestal/cubicacion-comercial-tipos";
import type { DescuentosForm, VistaComercial } from "./hooks/use-cubicacion-comercial-despacho";

const CAMPO =
  "h-10 w-20 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right text-base tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ROTULO = "flex items-center gap-1 text-sm text-[var(--text-secondary)]";

export default function DescuentosDelLote({
  vista, form, onForm,
}: {
  vista: VistaComercial;
  form: DescuentosForm;
  onForm: (f: DescuentosForm) => void;
}) {
  if (!vista) return null;
  const brutas = vista.brutas;
  const netas = "netas" in vista ? vista.netas : null;
  const especie = (clave: string, campo: "pct" | "menos", v: string) => {
    const previo = form.porEspecie[clave] ?? { pct: "", menos: "" };
    onForm({ ...form, porEspecie: { ...form.porEspecie, [clave]: { ...previo, [campo]: v } } });
  };
  const descontado = "netas" in vista ? Math.round((vista.bruto - vista.neto) * 100) / 100 : null;

  return (
    <div className="space-y-2" data-vista="cubicacion-descuentos">
      <p className="flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]">
        Descuentos
        <InfoTip
          what="Lo que no se cobra: madera rajada, con hueco, mal canteada o lo que acuerdes."
          affects="Primero se resta el PT de cada especie, después su %, y al final el % general. La cubicación oficial del libro no cambia."
          example={`Tornillo 1 000 PT − 50 PT − 5 % = 902,5 PT; con 2 % general = 884,45 PT. Tope: ${PCT_DESCUENTO_MAX} %.`}
        />
      </p>
      <ul className="divide-y divide-[var(--rule-soft)] rounded-2xl border border-[var(--rule-soft)]">
        {brutas.map((l) => {
          const d = form.porEspecie[l.clave] ?? { pct: "", menos: "" };
          const neta = netas?.find((x) => x.clave === l.clave);
          return (
            <li key={l.clave} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
              <div className="min-w-[8rem] flex-1">
                <p className="font-semibold text-[var(--text-primary)]">{l.nombre}</p>
                <p className="text-sm tabular-nums text-[var(--text-tertiary)]">{fmtVolumen(l.volumen, "tablar")}</p>
              </div>
              <label className={ROTULO}>
                −
                <input className={CAMPO} inputMode="decimal" value={d.menos} placeholder="0" aria-label={`PT que no se cobran de ${l.nombre}`}
                  onChange={(e) => especie(l.clave, "menos", e.target.value)} />
                PT
              </label>
              <label className={ROTULO}>
                −
                <input className={CAMPO} inputMode="decimal" value={d.pct} placeholder="0" aria-label={`Castigo en % de ${l.nombre}`}
                  onChange={(e) => especie(l.clave, "pct", e.target.value)} />
                %
              </label>
              <span className="w-28 text-right font-bold tabular-nums text-[var(--text-primary)]">{neta ? fmtVolumen(neta.volumen, "tablar") : "—"}</span>
            </li>
          );
        })}
        <li className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-[var(--surface-sunken)] px-3 py-2">
          <span className="flex-1 text-sm font-semibold text-[var(--text-secondary)]">General, a todo el lote</span>
          <label className={ROTULO}>
            −
            <input className={CAMPO} inputMode="decimal" value={form.pct} placeholder="0" aria-label="Descuento general en %"
              onChange={(e) => onForm({ ...form, pct: e.target.value })} />
            %
          </label>
        </li>
      </ul>
      {"error" in vista ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {vista.error}
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-[var(--surface-sunken)] px-4 py-3" aria-live="polite">
          <span className="text-sm text-[var(--text-secondary)]">
            Bruto {fmtVolumen(vista.bruto, "tablar")}
            {descontado ? ` − ${fmtVolumen(descontado, "tablar")} de descuento` : " · sin descuentos"}
          </span>
          <span className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">Neto {fmtVolumen(vista.neto, "tablar")}</span>
        </div>
      )}
    </div>
  );
}
