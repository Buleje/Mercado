"use client";

/**
 * Una corrida del día frente al lote mixto (ADR-441): lo que produjo (PT
 * primero), de cuánta troza saldría, el rendimiento, lo que dicen las reglas
 * de ADR-408 y las trozas que se proponen, lote por lote, para destildar las
 * que no entraron a la sierra (decisión 1 del dueño: por defecto van TODAS las
 * de su especie).
 */

import { AlertTriangle, Info, XCircle } from "@buleje/design-system/icons";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { fmtM3, fmtPct, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { PropuestaDeCorrida } from "@/lib/forestal/vincular-desde-mixto";
import { codigoDeTroza, plural } from "./armar-lote-escaneo-partes";

const LINEA = "flex items-start gap-2 rounded-xl px-3 py-2 text-sm";
const LINEA_ERROR = `${LINEA} bg-[var(--data-error-500)]/10 font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]`;
const LINEA_AVISO = `${LINEA} bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]`;
const LINEA_INFO = `${LINEA} bg-[var(--surface-sunken)] text-[var(--text-secondary)]`;

export default function CtpVincularMixtoCorrida({
  propuesta,
  ptProducido,
  trozaPorId,
  destildadas,
  onAlternar,
  bloqueado,
}: {
  propuesta: PropuestaDeCorrida;
  /** El PT que la corrida declaró (paquetes medidos o m³ × 424). */
  ptProducido: number;
  trozaPorId: ReadonlyMap<string, TrozaConsumible>;
  /** Trozas de ESTA especie que se destildaron: se pueden volver a tildar. */
  destildadas: readonly string[];
  onAlternar: (trozaId: string) => void;
  bloqueado: boolean;
}) {
  const { corrida: c, partes } = propuesta;
  const titulo = `${c.lineNo != null ? `N° ${c.lineNo} · ` : ""}${c.especie ?? "Sin especie"}`;
  return (
    <section
      aria-label={`Corrida ${titulo}`}
      className={`space-y-2 rounded-2xl border bg-[var(--surface-raised)] p-3 ${
        propuesta.puedeVincular ? "border-[var(--rule-base)]" : "border-[var(--data-warning-500)]"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-base font-bold text-[var(--text-primary)]">{titulo}</p>
        <p className="text-base font-bold tabular-nums text-[var(--text-primary)]">
          {fmtPt(ptProducido)} PT{" "}
          <span className="text-sm font-normal text-[var(--text-secondary)]">
            · {fmtM3(Number(c.volumenM3) || 0)} m³ producidos
          </span>
        </p>
      </div>

      {propuesta.piezas > 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          de <b className="tabular-nums text-[var(--text-primary)]">{fmtM3(propuesta.trozaM3)} m³</b> de troza (
          {plural(propuesta.piezas, "troza", "trozas")})
          {propuesta.rendimientoPct != null && (
            <>
              {" "}· rendimiento{" "}
              <b
                className={`tabular-nums ${
                  propuesta.sobreElTope ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]"
                }`}
              >
                {fmtPct(propuesta.rendimientoPct)} %
              </b>
            </>
          )}
        </p>
      )}

      {propuesta.mensaje && propuesta.frena !== "regla" && (
        <p className={propuesta.frena === "ya-tiene-origen" ? LINEA_INFO : LINEA_AVISO}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {propuesta.mensaje}
        </p>
      )}
      {/* Sin trozas, el mensaje ya lo dice: las reglas sobre una lista vacía son ruido. */}
      {propuesta.piezas > 0 && propuesta.hallazgos.map((h, i) => (
        <p key={`${h.regla}-${i}`} className={h.severidad === "error" ? LINEA_ERROR : LINEA_AVISO}>
          {h.severidad === "error" ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          {h.mensaje}
        </p>
      ))}

      {partes.map((p) => (
        <div key={p.loteId} className="space-y-1.5">
          <p className="text-sm font-bold text-[var(--text-secondary)]">
            {p.code ?? "Lote que sale al repartir"}
            {p.permiso ? ` · permiso ${p.permiso}` : " · sin permiso"} · {plural(p.piezas, "troza", "trozas")} ·{" "}
            <span className="tabular-nums">{fmtM3(p.volumenM3)} m³</span>
          </p>
          <ul className="flex flex-wrap gap-2">
            {p.trozaIds.map((id) => (
              <li key={id}>
                <ChipTroza troza={trozaPorId.get(id)} id={id} tildada onAlternar={onAlternar} bloqueado={bloqueado} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {destildadas.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-bold text-[var(--text-secondary)]">
            No entraron (quedan como saldo en su lote)
          </p>
          <ul className="flex flex-wrap gap-2">
            {destildadas.map((id) => (
              <li key={id}>
                <ChipTroza troza={trozaPorId.get(id)} id={id} tildada={false} onAlternar={onAlternar} bloqueado={bloqueado} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ChipTroza({
  troza,
  id,
  tildada,
  onAlternar,
  bloqueado,
}: {
  troza: TrozaConsumible | undefined;
  id: string;
  tildada: boolean;
  onAlternar: (trozaId: string) => void;
  bloqueado: boolean;
}) {
  const codigo = troza ? codigoDeTroza(troza) : id.slice(-6);
  return (
    <label
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent)]/40 ${
        tildada
          ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)]"
          : "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] line-through"
      }`}
    >
      <input
        type="checkbox"
        checked={tildada}
        disabled={bloqueado}
        onChange={() => onAlternar(id)}
        className="h-5 w-5 accent-[var(--accent)]"
        aria-label={`${codigo}: ${tildada ? "entró a la sierra" : "no entró"}`}
      />
      <span className="font-mono font-bold">{codigo}</span>
      {troza?.volumenM3 != null && <span className="tabular-nums">{fmtM3(Number(troza.volumenM3))} m³</span>}
    </label>
  );
}
