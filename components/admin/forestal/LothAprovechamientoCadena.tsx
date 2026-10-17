/**
 * La cadena del aprovechamiento: autorizado (o registrado) → talado →
 * trozado → despachado → recibido en el CTP, cada paso con su % del anterior
 * y de la base. Lo que el libro tiene trozado sin su tala (llegó con una guía
 * importada) entra como su propio tramo, «Entró con guía»: así la cadena de
 * Blas —0 talas, 22 trozas— no arranca en 0.
 *
 * Sin estado ni cuentas: los pasos vienen hechos de `cadenaDelAprovechamiento`.
 */

import { ChevronRight, LogIn } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import type { Aprovechamiento } from "@/lib/forestal/loth-aprovechamiento";
import type { PasoAprov } from "@/lib/forestal/loth-aprovechamiento-cadena";

const ROTULO = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const pct = (v: number | null) => (v == null ? "—" : `${formatNumber(v, 1)} %`);

export default function LothAprovechamientoCadena({ a }: { a: Aprovechamiento }) {
  return (
    <div data-aprovechamiento-cadena className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className={ROTULO}>Cadena</span>
        <InfoTip
          title="Cadena del aprovechamiento"
          what={`Por dónde va la madera, de lo ${a.nombreBase} a lo que recibió el CTP. Cada paso dice qué parte del anterior llegó hasta ahí y qué parte de lo ${a.nombreBase} es.`}
          affects="«Entró con guía» son trozas que el libro tiene sin su tala: llegaron con una guía importada. El trozado se mide contra lo talado más eso. Lo recibido es lo que el Libro CTP ya tiene enlazado a estas trozas."
          example="Talaste 100 m³, trozaste 90 m³ (90 % del talado), despachaste 60 m³ (66,7 % del trozado) y el CTP recibió 60 m³ (100 % de lo despachado)."
          side="bottom"
        />
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none" aria-label="Cadena del aprovechamiento">
        {a.cadena.map((p, i) => (
          <Paso key={p.id} p={p} nombreBase={a.nombreBase} flecha={i > 0} estado={a.estadoHechos} />
        ))}
      </ol>
    </div>
  );
}

function Paso({ p, nombreBase, flecha, estado }: {
  p: PasoAprov;
  nombreBase: string;
  flecha: boolean;
  estado: Aprovechamiento["estadoHechos"];
}) {
  const sinDato = p.m3 == null;
  const borde = p.entrada
    ? "border-dashed border-[var(--accent)]/60 bg-[var(--accent-soft)]"
    : "border-[var(--rule-base)] bg-[var(--surface-sunken)]";
  return (
    <li data-paso={p.id} className={`relative min-w-0 rounded-xl border px-3 py-2 ${borde}`}>
      {flecha && (
        <ChevronRight
          className="absolute -left-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-[var(--surface-raised)] text-[var(--text-tertiary)] lg:block"
          aria-hidden="true"
        />
      )}
      <span className={`flex items-center gap-1 ${ROTULO}`}>
        {p.entrada && <LogIn className="h-3 w-3 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" />}
        <span className="truncate">{p.label}</span>
      </span>
      <span className="mt-0.5 block font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
        {sinDato ? (estado === "error" ? "—" : "…") : `${formatNumber(p.m3 ?? 0, 3)} m³`}
      </span>
      {sinDato ? (
        <span className="block text-xs text-[var(--text-tertiary)]">
          {estado === "error" ? "No se pudo leer el CTP" : "Leyendo el CTP…"}
        </span>
      ) : (
        <>
          <span className="block text-xs text-[var(--text-tertiary)]">
            {p.entrada ? "Sin tala en el libro" : p.id === "base" ? "La base" : `${pct(p.pctAnterior)} del anterior`}
          </span>
          {p.id !== "base" && (
            <span className="block text-xs text-[var(--text-tertiary)]">{pct(p.pctBase)} de lo {nombreBase}</span>
          )}
        </>
      )}
    </li>
  );
}
