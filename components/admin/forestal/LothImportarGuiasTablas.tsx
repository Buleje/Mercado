/**
 * Las tablas de la vista previa de «Importar guías despachadas» (ADR-461):
 * las trozas de la guía y la tala referencial que se armaría por árbol, con el
 * estado de cada fila. Separadas de `LothImportarGuiasGuia` (02-10 noche) para
 * que la tarjeta de la guía sume «Datos de la guía» y «Directorio» sin pasar
 * de las 300 líneas.
 */

import { CheckCircle2 } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { ptAserrableDeRolliza } from "@/lib/forestal/loth-restante";
import type { TalaReferencial, TrozaImportada } from "@/lib/forestal/loth-importar-guia-tipos";

export const TONO = {
  ok: "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]",
  aviso: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]",
  error:
    "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
} as const;

const m = (v: number | null, d = 2) => (v == null ? "—" : formatNumber(v, d));
const TH =
  "whitespace-nowrap px-2 py-1.5 text-left text-xs font-semibold text-[var(--text-tertiary)]";
const TD = "whitespace-nowrap px-2 py-1.5";

function EstadoFila({
  estado,
  detalle,
}: {
  estado: "nueva" | "ya_trozada" | "renombrada" | "conflicto" | "ampliar" | "existente";
  detalle: string | null;
}) {
  if (estado === "nueva")
    return <CheckCircle2 className="h-4 w-4 text-[var(--data-success-ink)]" aria-label="Nueva" />;
  const texto = {
    ya_trozada: "Ya está",
    /* ADR-477: todas entran con su código único; el chip marca sólo las que repiten el código de otra guía del permiso. */
    renombrada: "Repite código",
    conflicto: "Choca",
    ampliar: "Se amplía",
    existente: "Ya tiene tala",
  }[estado];
  const tono =
    estado === "conflicto"
      ? TONO.error
      : estado === "ampliar" || estado === "renombrada"
        ? TONO.aviso
        : TONO.neutro;
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${tono}`}
      title={detalle ?? undefined}
    >
      {texto}
    </span>
  );
}

/*
 * A 400 px las dos tablas siguen siendo tablas, con su propio scroll.
 * ADR-477: «Código en la guía» es el impreso; «Código único» el del libro
 * («12A-0001», siempre lleno); se resaltan las que repiten el código de otra guía del permiso.
 */
export function TablaTrozas({ trozas }: { trozas: TrozaImportada[] }) {
  return (
    <div className="overflow-x-auto px-1 pb-2">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={TH}>Código en la guía</th>
            <th className={TH}>Código único</th>
            <th className={TH}>Árbol</th>
            <th className={TH}>Especie</th>
            <th className={`${TH} text-right`}>D1 (m)</th>
            <th className={`${TH} text-right`}>D2 (m)</th>
            <th className={`${TH} text-right`}>Largo (m)</th>
            <th className={`${TH} text-right`}>m³</th>
            <th className={`${TH} text-right`}>≈pt</th>
            <th className={TH}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {trozas.map((t) => (
            <tr key={t.indice} className="border-t border-[var(--rule-soft)]">
              <td className={`${TD} font-mono text-[var(--text-secondary)]`}>
                {t.codificacionGuia ?? "—"}
              </td>
              <td
                className={`${TD} font-mono font-semibold ${
                  t.estado === "renombrada"
                    ? "text-[var(--data-warning-ink)]"
                    : "text-[var(--text-primary)]"
                }`}
              >
                {t.trozaCode}
                {t.sinCodigo && (
                  <span className="ml-1.5 font-sans text-xs font-semibold text-[var(--data-warning-ink)]">
                    sin código
                  </span>
                )}
              </td>
              <td className={`${TD} font-mono`}>{t.treeCode ?? "—"}</td>
              <td className={TD}>{t.speciesCommon ?? "—"}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.diamMayorM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.diamMenorM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.lengthM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>
                {t.volumeM3 == null ? "—" : fmtM3(t.volumeM3)}
              </td>
              <td className={`${TD} text-right tabular-nums text-[var(--text-secondary)]`}>
                {t.volumeM3 == null ? "—" : fmtPt(ptAserrableDeRolliza(t.volumeM3))}
              </td>
              <td className={TD}>
                <EstadoFila estado={t.estado} detalle={t.detalle} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TablaTalas({ talas }: { talas: TalaReferencial[] }) {
  return (
    <div className="overflow-x-auto px-1 pb-2">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={TH}>Árbol</th>
            <th className={TH}>Trozas</th>
            <th className={TH}>Especie</th>
            <th className={`${TH} text-right`}>Largo (m)</th>
            <th className={`${TH} text-right`}>D1 (m)</th>
            <th className={`${TH} text-right`}>D2 (m)</th>
            <th className={`${TH} text-right`}>m³</th>
            <th className={TH}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {talas.map((t) => (
            <tr key={t.treeCode} className="border-t border-[var(--rule-soft)]">
              <td className={`${TD} font-mono font-semibold text-[var(--text-primary)]`}>
                {t.treeCode}
              </td>
              <td className={`${TD} font-mono text-[var(--text-secondary)]`}>
                {t.trozas.join(" + ")}
              </td>
              <td className={TD}>{t.speciesCommon ?? "—"}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.lengthM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.diamMayorM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>{m(t.diamMenorM)}</td>
              <td className={`${TD} text-right font-mono tabular-nums`}>
                {t.volumeM3 == null ? "—" : fmtM3(t.volumeM3)}
              </td>
              <td className={TD}>
                <EstadoFila estado={t.estado} detalle={t.detalle} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
