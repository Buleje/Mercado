"use client";

/**
 * Saldo grande por especie del plan elegido (24-10, Brandon: «autorizado ·
 * usado · queda»). Cada tarjeta: lo que queda en grande, lo autorizado y lo
 * usado, la barra, lo sin plan que cuenta acá y las guías que se lo llevaron
 * (clic = abre la guía en «Guías»).
 *
 * «Usado» es lo que mide T6 (`/loth/saldo-plan`, `medidasT6`): esta tarjeta y el
 * 422 del despacho dicen el mismo número.
 *
 * Cada guía atada a este plan se puede «Desatar» (25-10, admin/dueño): vuelve
 * a sin plan con sus líneas (`LothGtfDesatarPermiso`).
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown, Link2Off, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import type { SaldoDeEspecieConGuias, SaldoPlanRespuesta, UsoConGuia } from "@/lib/forestal/loth-saldo-plan-tipos";
import LothGtfDesatarPermiso from "./LothGtfDesatarPermiso";

const NUM = "font-mono tabular-nums";

/** Verde hasta el 80 %, coral hasta el techo, rojo pasado. */
function tono(e: SaldoDeEspecieConGuias): { barra: string; texto: string } {
  if (e.excedido) return { barra: "bg-[var(--data-error-500)]", texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" };
  if ((e.pctUsado ?? 0) >= 80) return { barra: "bg-[var(--data-warning-500)]", texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" };
  return { barra: "bg-[var(--data-success-500)]", texto: "text-[var(--text-primary)]" };
}

type Desatar = (g: UsoConGuia) => void;

function GuiasDeLaEspecie({ e, onVerGuia, onDesatar }: { e: SaldoDeEspecieConGuias; onVerGuia?: (gtfNumber: string) => void; onDesatar?: Desatar }) {
  const [abierto, setAbierto] = useState(false);
  if (e.guias.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)]"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
        {e.guias.length === 1 ? "La guía que la usó" : `Las ${e.guias.length} guías que la usaron`}
      </button>
      {abierto && (
        <ul className="mt-1 divide-y divide-[var(--rule-base)] text-sm">
          {e.guias.map((g) => (
            <li key={`${g.gtfNumber ?? "-"}:${g.sinPlan}`} className="flex items-center justify-between gap-2 py-1.5">
              {g.gtfNumber && onVerGuia ? (
                <button
                  type="button"
                  onClick={() => onVerGuia(g.gtfNumber as string)}
                  className="min-h-9 truncate rounded-lg px-1 text-left font-mono font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline"
                  title="Abrir la guía en «Guías»"
                >
                  GTF {g.gtfNumber}
                </button>
              ) : (
                <span className="truncate px-1 text-[var(--text-secondary)]">{g.gtfNumber ? `GTF ${g.gtfNumber}` : "Despachos sin N° de guía"}</span>
              )}
              <span className="flex shrink-0 items-center gap-2">
                {g.sinPlan && (
                  <span className="rounded-md bg-[var(--data-warning-50)] px-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                    sin plan
                  </span>
                )}
                <span className={`${NUM} text-[var(--text-secondary)]`}>
                  {g.trozas > 0 ? `${g.trozas} ${g.trozas === 1 ? "troza" : "trozas"} · ` : ""}
                  {fmtM3(g.m3)} m³
                </span>
                {!g.sinPlan && g.gtfId && onDesatar && (
                  <button
                    type="button"
                    onClick={() => onDesatar(g)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 text-sm font-semibold text-[var(--data-error-700)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/10"
                    title="La guía y sus líneas vuelven a sin plan (cuentan en el saldo de cada plan vigente)"
                  >
                    <Link2Off className="h-4 w-4" aria-hidden="true" /> Desatar
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TarjetaEspecie({ e, techo, onVerGuia, onDesatar }: { e: SaldoDeEspecieConGuias; techo: string; onVerGuia?: (gtfNumber: string) => void; onDesatar?: Desatar }) {
  const t = tono(e);
  const conTecho = e.autorizadoM3 != null && e.quedaM3 != null;
  return (
    <li data-testid="saldo-especie" data-especie={e.clave} className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="flex items-center justify-between gap-2">
        <span className="truncate text-base font-semibold text-[var(--text-primary)]">{e.especie}</span>
        {e.cites && <span className="shrink-0 rounded-md bg-[var(--surface-sunken)] px-1.5 text-xs font-semibold text-[var(--text-secondary)]">CITES</span>}
      </p>
      {conTecho ? (
        <>
          <p className={`${NUM} text-2xl font-bold ${t.texto}`}>
            {/* Pasado: la cifra con la misma forma que «quedan» (en una línea, a 1280 «Pasó por 0.892 m³» partía en dos). */}
            {fmtM3(Math.abs(e.quedaM3 as number))} m³
            <span className="ml-1.5 font-sans text-sm font-semibold text-[var(--text-secondary)]">{e.excedido ? "de más: se pasó" : "quedan"}</span>
          </p>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            role="meter"
            aria-label={`Usado de ${e.especie}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, e.pctUsado ?? 0)}
          >
            <div className={`h-full rounded-full ${t.barra}`} style={{ width: `${Math.min(100, Math.max(0, e.pctUsado ?? 0))}%` }} />
          </div>
          <p className={`${NUM} text-sm text-[var(--text-secondary)]`}>
            {techo} {fmtM3(e.autorizadoM3 as number)} · usado {fmtM3(e.usadoM3)} m³{e.pctUsado != null ? ` (${formatNumber(e.pctUsado, { max: 1 })} %)` : ""}
          </p>
        </>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          Sin volumen {techo.toLowerCase()}: no se frena · usado <span className={NUM}>{fmtM3(e.usadoM3)} m³</span>
        </p>
      )}
      {e.usadoSinPlanM3 > 0 && (
        <p className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <span className={NUM}>{fmtM3(e.usadoSinPlanM3)} m³</span> sin plan cuentan acá
        </p>
      )}
      <GuiasDeLaEspecie e={e} onVerGuia={onVerGuia} onDesatar={onDesatar} />
    </li>
  );
}

export default function LothPlanSaldoGrande({
  lectura,
  onVerGuia,
  onCambio,
}: {
  lectura: { dato: SaldoPlanRespuesta | null; cargando: boolean; error: string | null };
  onVerGuia?: (gtfNumber: string) => void;
  /** Se desató una guía: la vista relee planes, detalle y saldo. Sin él no se ofrece «Desatar». */
  onCambio?: () => void;
}) {
  const { dato, cargando, error } = lectura;
  const rol = useMiRol();
  /* Los roles que exige `DELETE /loth/guia-permiso`. */
  const puedeDesatar = !!onCambio && (rol === "admin" || rol === "owner" || rol === "superadmin");
  const [desatando, setDesatando] = useState<UsoConGuia | null>(null);
  if (cargando && !dato) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Midiendo el saldo del plan…
      </p>
    );
  }
  if (error) return <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>;
  const saldo = dato?.saldo;
  if (!dato?.plan || !saldo || saldo.especies.length === 0) return null;
  const techo = dato.plan.plantacion ? "Registrado" : "Autorizado";
  const { total } = saldo;
  return (
    <section data-testid="saldo-del-plan" aria-labelledby="saldo-del-plan-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <CardTitle id="saldo-del-plan-titulo">Saldo por especie</CardTitle>
          <InfoTip
            title="Cómo se lee"
            what={`Queda = lo ${techo.toLowerCase()} menos lo usado. Usado = lo que ya salió por guía de este plan y lo que no tiene plan (cuenta en todos los planes hasta que lo ates).`}
            affects="Es la misma cuenta que frena el despacho: una guía que pasa lo que queda no se puede despachar."
            example={`${techo} 159.086 m³, usado 38.434 m³ → quedan 120.652 m³.`}
          />
        </div>
        {!saldo.sinTecho && (
          <p className={`${NUM} text-sm font-semibold text-[var(--text-secondary)]`}>
            Quedan {fmtM3(total.quedaM3)} de {fmtM3(total.autorizadoM3)} m³
          </p>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {saldo.especies.map((e) => (
          <TarjetaEspecie key={e.clave} e={e} techo={techo} onVerGuia={onVerGuia} onDesatar={puedeDesatar ? setDesatando : undefined} />
        ))}
      </ul>
      {desatando?.gtfId && (
        <LothGtfDesatarPermiso
          gtf={{ id: desatando.gtfId, gtfNumber: desatando.gtfNumber ?? "" }}
          permiso={dato.plan.nombre}
          onClose={() => setDesatando(null)}
          onHecho={() => {
            setDesatando(null);
            onCambio?.();
          }}
        />
      )}
    </section>
  );
}
