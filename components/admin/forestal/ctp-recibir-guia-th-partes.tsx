"use client";

/**
 * Piezas de «Recibir la guía del Libro TH»: los datos de la guía, lo que entra
 * al libro por especie (con lo que llegó y lo que falta, ADR-450) y lo que
 * quedó registrado al recibirla.
 */

import { AlertTriangle, CheckCircle2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { MAX_TEXTO_RECIBIR, foliosEnTexto, type RecibidaTh } from "@/lib/forestal/guia-th-al-ctp";
import type { ResumenConteo } from "@/lib/forestal/conteo-guia-th";

const TH = "whitespace-nowrap px-2 py-2 text-left text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] sm:px-3";
const TD = "px-2 py-2 text-sm text-[var(--text-primary)] sm:px-3";
const NUM = "text-right font-mono tabular-nums";

/** «42/300»: cuánto queda, igual que el tope del servidor. */
export function Cuenta({ id, n }: { id: string; n: number }) {
  return (
    <span id={id} className="self-end text-xs tabular-nums text-[var(--text-tertiary)]" aria-live="polite">
      {n}/{MAX_TEXTO_RECIBIR}
    </span>
  );
}

export function Dato({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{label}</p>
      <p className={`truncate text-sm font-bold text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`} title={valor}>
        {valor}
      </p>
    </div>
  );
}

/**
 * Un renglón del libro por especie: lo que declara la guía, lo que llegó y lo
 * que falta. El m³ del ingreso es SIEMPRE el de la guía (I2): «Falta» no lo
 * baja, lo deja a la vista.
 */
export function ResumenPorEspecie({ resumen }: { resumen: ResumenConteo }) {
  const falta = Math.max(0, Math.round((resumen.m3Declarado - resumen.m3Recibido) * 10000) / 10000);
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
      <table className="w-full min-w-[18rem] border-collapse">
        <caption className="sr-only">Lo que entra al libro, por especie: guía, llegó y falta</caption>
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            <th scope="col" className={TH}>Especie</th>
            <th scope="col" className={`${TH} text-right`}>Guía m³</th>
            <th scope="col" className={`${TH} text-right`}>Llegó m³</th>
            <th scope="col" className={`${TH} text-right`}>Falta m³</th>
          </tr>
        </thead>
        <tbody>
          {resumen.porEspecie.map((e) => (
            <tr key={e.especie} className="border-t border-[var(--rule-soft)]">
              <th scope="row" className={`${TD} text-left`}>
                <span className="block font-bold">{e.especie}</span>
                <span className="block text-xs font-normal tabular-nums text-[var(--text-secondary)]">
                  llegaron {e.llegaron} de {e.trozas}
                </span>
              </th>
              <td className={`${TD} ${NUM}`}>{fmtM3(e.m3Guia)}</td>
              <td className={`${TD} ${NUM} font-bold`}>{fmtM3(e.m3Llego)}</td>
              <td className={`${TD} ${NUM} ${e.m3Falta > 0 ? "font-bold text-[var(--data-warning-ink)]" : "text-[var(--text-tertiary)]"}`}>
                {e.m3Falta > 0 ? fmtM3(e.m3Falta) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        {resumen.porEspecie.length > 1 && (
          <tfoot>
            <tr className="border-t-2 border-[var(--rule-base)]">
              <th scope="row" className={`${TD} text-left`}>
                <span className="block font-bold">Total</span>
                <span className="block text-xs font-normal tabular-nums text-[var(--text-secondary)]">
                  llegaron {resumen.llegaron} de {resumen.total}
                </span>
              </th>
              <td className={`${TD} ${NUM} font-bold`}>{fmtM3(resumen.m3Declarado)}</td>
              <td className={`${TD} ${NUM} font-bold`}>{fmtM3(resumen.m3Recibido)}</td>
              <td className={`${TD} ${NUM} font-bold`}>{falta > 0 ? fmtM3(falta) : "—"}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Avisos que no frenan (del servidor o del conteo): se leen antes de recibir. */
export function ListaDeAvisos({ avisos, id }: { avisos: readonly string[]; id?: string }) {
  if (avisos.length === 0) return null;
  return (
    <ul id={id} className="flex flex-col gap-1 text-sm text-[var(--data-warning-ink)]">
      {avisos.map((a) => (
        <li key={a} className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {a}
        </li>
      ))}
    </ul>
  );
}

const llego = (n: number) => (n === 1 ? "llegó" : "llegaron");

/** «Entraron 8: 7 llegaron, 1 no llegó» · «Entraron las 8 trozas: llegaron todas». */
export function fraseDeRecibida(r: Pick<RecibidaTh, "trozas" | "llegaron" | "noLlegaron">): string {
  const no = r.noLlegaron.length;
  if (no === 0) return r.trozas === 1 ? "Entró la troza: llegó" : `Entraron las ${r.trozas} trozas: llegaron todas`;
  return `Entraron ${r.trozas}: ${r.llegaron} ${llego(r.llegaron)}, ${no} no ${llego(no)}`;
}

/** Lo que quedó en el libro al recibir: cuántas llegaron, en qué asientos y qué falta. */
export function GuiaRecibida({ r }: { r: RecibidaTh }) {
  const falta = r.brechaM3 > 0.0005;
  return (
    <div className="flex flex-col gap-3" data-testid="guia-th-recibida">
      <div
        role="status"
        className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-4 dark:bg-[var(--data-success-500)]/10"
      >
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-base font-bold text-[var(--text-primary)]">{fraseDeRecibida(r)}</p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            {r.ingresos.length === 1 ? "Quedó en el asiento" : "Quedó en los asientos"} {foliosEnTexto(r.ingresos.map((i) => i.libroNro))} ·{" "}
            <span className="font-mono tabular-nums">{fmtM3(r.totalM3)} m³</span> de la guía
            {falta && (
              <>
                {" "}· llegaron <span className="font-mono tabular-nums">{fmtM3(r.m3Recibido)} m³</span>
              </>
            )}
          </p>
          {r.noLlegaron.length > 0 && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              No {llego(r.noLlegaron.length)}: <span className="font-mono font-bold text-[var(--text-primary)]">{r.noLlegaron.join(", ")}</span>
            </p>
          )}
        </div>
      </div>

      <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
        {r.ingresos.map((i) => (
          <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-sm">
            <span className="font-bold text-[var(--text-primary)]">
              {i.libroNro != null ? `N° ${i.libroNro}` : "Sin N°"} · {i.especie}
            </span>
            <span className="font-mono tabular-nums text-[var(--text-secondary)]">
              {i.pieces} {i.pieces === 1 ? "troza" : "trozas"} · {fmtM3(i.volumeM3)} m³
            </span>
          </li>
        ))}
      </ul>

      {!r.recibida && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] p-3 text-sm font-bold text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          El ingreso quedó registrado, pero falta recibirlo: {r.motivoSinRecibir ?? "recíbelo desde la tabla de Ingresos."}
        </p>
      )}
      <ListaDeAvisos avisos={r.avisos} />
    </div>
  );
}
