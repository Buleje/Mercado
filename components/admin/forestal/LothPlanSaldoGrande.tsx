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
import type {
  SaldoDeEspecieConGuias,
  SaldoPlanRespuesta,
  UsoConGuia,
} from "@/lib/forestal/loth-saldo-plan-tipos";
import type { PreliminarDeEspecie } from "@/lib/forestal/loth-plan-preliminares";
import LothGtfDesatarPermiso from "./LothGtfDesatarPermiso";
import { KpiPreliminares, PreliminarEnLaTarjeta } from "./loth-plan-preliminar-saldo";

const NUM = "font-mono tabular-nums";

/** Verde hasta el 80 %, coral hasta el techo, rojo pasado. */
function tono(e: SaldoDeEspecieConGuias): { barra: string; texto: string } {
  if (e.excedido)
    return {
      barra: "bg-[var(--data-error-500)]",
      texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    };
  if ((e.pctUsado ?? 0) >= 80)
    return {
      barra: "bg-[var(--data-warning-500)]",
      texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    };
  return { barra: "bg-[var(--data-success-500)]", texto: "text-[var(--text-primary)]" };
}

type Desatar = (g: UsoConGuia) => void;

/** El botón de las guías va en la fila de «usado»; la lista se abre debajo, a lo ancho. */
function ListaGuias({
  id,
  e,
  onVerGuia,
  onDesatar,
}: {
  id: string;
  e: SaldoDeEspecieConGuias;
  onVerGuia?: (gtfNumber: string) => void;
  onDesatar?: Desatar;
}) {
  return (
    <ul id={id} className="divide-y divide-[var(--rule-base)] text-sm">
      {e.guias.map((g) => (
        <li
          key={`${g.gtfNumber ?? "-"}:${g.sinPlan}`}
          className="flex items-center justify-between gap-2 py-1.5"
        >
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
            <span className="truncate px-1 text-[var(--text-secondary)]">
              {g.gtfNumber ? `GTF ${g.gtfNumber}` : "Despachos sin N° de guía"}
            </span>
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
  );
}

function TarjetaEspecie({
  e,
  techo,
  pre,
  onVerGuia,
  onDesatar,
}: {
  e: SaldoDeEspecieConGuias;
  techo: string;
  /** Lo preliminar de la especie (GTF hechas a mano por registrar): sólo se muestra, no frena. */
  pre?: PreliminarDeEspecie;
  onVerGuia?: (gtfNumber: string) => void;
  onDesatar?: Desatar;
}) {
  const t = tono(e);
  const [verGuias, setVerGuias] = useState(false);
  /* La clave puede traer espacios («cedro colorado»): un id no. */
  const idGuias = `guias-de-${e.clave.replace(/[^\w-]+/g, "-")}`;
  const conTecho = e.autorizadoM3 != null && e.quedaM3 != null;
  return (
    <li
      data-testid="saldo-especie"
      data-especie={e.clave}
      className="space-y-1.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5"
    >
      {/* La especie y lo que le queda en UNA fila (26-10, «más compacto»): era
          una fila para el nombre y otra para la cifra grande. */}
      <p className="flex flex-wrap items-baseline justify-between gap-x-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-base font-semibold text-[var(--text-primary)]">
            {e.especie}
          </span>
          {e.cites && (
            <span className="shrink-0 rounded-md bg-[var(--surface-sunken)] px-1.5 text-xs font-semibold text-[var(--text-secondary)]">
              CITES
            </span>
          )}
        </span>
        {conTecho && (
          <span className={`whitespace-nowrap text-xl font-extrabold tabular-nums ${t.texto}`}>
            {/* Pasado: la cifra con la misma forma que «quedan». Sans con cifras tabulares, como el StatCard del DS: la mono no entraba al lado del nombre en 3 columnas a 1280 (26-10). */}
            {fmtM3(Math.abs(e.quedaM3 as number))} m³
            <span className="ml-1 font-sans text-sm font-semibold text-[var(--text-secondary)]">
              {e.excedido ? "de más: se pasó" : "quedan"}
            </span>
          </span>
        )}
      </p>
      {conTecho ? (
        <div className="flex items-center gap-2">
          <div
            className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            role="meter"
            aria-label={`Usado de ${e.especie}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, e.pctUsado ?? 0)}
          >
            <div
              className={`h-full rounded-full ${t.barra}`}
              style={{ width: `${Math.min(100, Math.max(0, e.pctUsado ?? 0))}%` }}
            />
          </div>
          {e.pctUsado != null && (
            <span className={`${NUM} shrink-0 text-sm font-semibold ${t.texto}`}>
              {formatNumber(e.pctUsado, { max: 1 })} %
            </span>
          )}
        </div>
      ) : null}
      {/* Lo usado contra el techo y el botón de sus guías en UNA fila (26-10):
          eran dos renglones y la línea del techo partía en dos a 1280. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        {conTecho ? (
          <p
            className="min-w-0 text-sm text-[var(--text-secondary)]"
            title={`${techo} ${fmtM3(e.autorizadoM3 as number)} m³ · usado ${fmtM3(e.usadoM3)} m³`}
          >
            Usado <span className={NUM}>{fmtM3(e.usadoM3)}</span> de{" "}
            <span className={NUM}>{fmtM3(e.autorizadoM3 as number)} m³</span>
            <span className="sr-only"> {techo.toLowerCase()}s</span>
          </p>
        ) : (
          <p className="min-w-0 text-sm text-[var(--text-secondary)]">
            Sin volumen {techo.toLowerCase()}: no se frena · usado{" "}
            <span className={NUM}>{fmtM3(e.usadoM3)} m³</span>
          </p>
        )}
        {e.guias.length > 0 && (
          <button
            type="button"
            onClick={() => setVerGuias((v) => !v)}
            aria-expanded={verGuias}
            aria-controls={idGuias}
            title={verGuias ? "Ocultar las guías" : "Las guías que usaron esta especie"}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)]"
          >
            {e.guias.length === 1 ? "1 guía" : `${e.guias.length} guías`}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${verGuias ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      {e.usadoSinPlanM3 > 0 && (
        <p className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <span className={NUM}>{fmtM3(e.usadoSinPlanM3)} m³</span> sin plan cuentan acá
        </p>
      )}
      <PreliminarEnLaTarjeta pre={pre} />
      {verGuias && <ListaGuias id={idGuias} e={e} onVerGuia={onVerGuia} onDesatar={onDesatar} />}
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
  if (error)
    return (
      <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        {error}
      </p>
    );
  const saldo = dato?.saldo;
  if (!dato?.plan || !saldo || saldo.especies.length === 0) return null;
  const techo = dato.plan.plantacion ? "Registrado" : "Autorizado";
  const { total } = saldo;
  const preliminar = new Map((dato.preliminares?.porEspecie ?? []).map((p) => [p.clave, p]));
  return (
    <section
      data-testid="saldo-del-plan"
      aria-labelledby="saldo-del-plan-titulo"
      className="space-y-3"
    >
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
      {dato.preliminares && <KpiPreliminares resumen={dato.preliminares.resumen} />}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {saldo.especies.map((e) => (
          <TarjetaEspecie
            key={e.clave}
            e={e}
            techo={techo}
            pre={preliminar.get(e.clave)}
            onVerGuia={onVerGuia}
            onDesatar={puedeDesatar ? setDesatando : undefined}
          />
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
