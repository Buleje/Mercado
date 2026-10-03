/**
 * CtpPlantaCroquisLeyendaRutas — la leyenda de la capa «Flujo» del croquis: las
 * rutas numeradas del plano (1–4 principal, A cantear, B solo despuntar, 5
 * salida) con su color, y los tramos de cada una a un toque. Va DEBAJO del mapa
 * y no encima: a 400 px una tarjeta flotante tapaba medio plano.
 *
 * Sin estado propio (el `<details>` es nativo): no necesita "use client".
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { RutaFlujo } from "@/lib/forestal/planta-croquis";

function Trazo({ ruta }: { ruta: RutaFlujo }) {
  return (
    <span
      aria-hidden
      className="inline-block h-0 w-7 shrink-0 border-t-[3px]"
      style={{ borderColor: ruta.color, borderTopStyle: ruta.punteada ? "dotted" : "solid" }}
    />
  );
}

function Numero({ ruta, n }: { ruta: RutaFlujo; n: string }) {
  return (
    <span
      className="inline-flex h-5 min-w-[1.75rem] shrink-0 items-center justify-center rounded-md border-2 bg-[var(--surface-raised)] px-1 text-[length:var(--ts-2xs)] font-extrabold text-[var(--text-primary)]"
      style={{ borderColor: ruta.color }}
    >
      {n}
    </span>
  );
}

export default function CtpPlantaCroquisLeyendaRutas({ rutas, version }: { rutas: readonly RutaFlujo[]; version: number }) {
  return (
    <details className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Rutas del plano v{version}
          <InfoTip
            title="Rutas de producción"
            what="Las flechas numeradas de la lámina: por dónde viaja la madera desde el patio de trozas hasta la salida."
            affects="Es un dibujo fijo del plano, no datos: el Libro no registra el paso por coche, mesas, cinta ni despuntadora."
            example="Ruta B: de los rodillos (16) directo a la despuntadora (23), sin pasar por las mesas."
          />
        </span>
        {rutas.map((r) => (
          <span key={r.id} className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
            <Trazo ruta={r} />
            <Numero ruta={r} n={r.numero} />
            {r.nombre}
          </span>
        ))}
        <span className="text-xs font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]">Ver los tramos</span>
      </summary>
      <div className="mt-2 grid gap-3 border-t border-[var(--rule-soft)] pt-2 sm:grid-cols-2 xl:grid-cols-4">
        {rutas.map((r) => (
          <div key={r.id} className="min-w-0">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
              <Trazo ruta={r} />
              {r.numero} · {r.nombre}
            </p>
            <ol className="space-y-1">
              {r.tramos.map((t, i) => (
                <li key={`${t.n}-${i}`} className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)]">
                  <Numero ruta={r} n={t.n} />
                  <span className="min-w-0 pt-0.5">{t.texto}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </details>
  );
}
