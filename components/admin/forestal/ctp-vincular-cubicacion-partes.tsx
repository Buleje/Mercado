/**
 * Las piezas de «Agregar cubicación» (`CtpVincularCubicacionModal`): la lista
 * de corridas del día para tildar y la tabla del cuadre por especie y tipo.
 */

import { AlertTriangle, Check, Link2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import type { CorridaDelDia } from "@/lib/forestal/piezas-del-dia";
import { clasificacionCorta } from "@/lib/forestal/detalle-de-jornada";
import { MarcaConTexto } from "./ctp-casillero-marcas";
import { MARCA_ORIGEN, origenVisibleDeCorrida, type NecesarioDe } from "./marcas-del-dia";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { CuadreDelVinculo, TonoDelVinculo } from "./vincular-cubicacion-cuadre";
import { TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

const TINTA: Record<TonoDelVinculo, string> = {
  ok: "text-[var(--data-success-ink)]",
  aviso: "text-[var(--data-warning-ink)]",
  error: "text-[var(--data-error-ink)]",
};
const CELDA = "px-2.5 py-1.5";
const NUM = `${CELDA} text-right font-mono tabular-nums`;

/** Las corridas del día, para tildar a cuáles se ata la cubicación. */
export function CorridasAElegir({
  corridas,
  elegidas,
  atadas,
  necesario,
  onAlternar,
}: {
  corridas: readonly CorridaDelDia[];
  elegidas: ReadonlySet<string>;
  /** Las que la cubicación elegida YA ampara: van tildadas y no se sueltan desde acá. */
  atadas: ReadonlySet<string>;
  necesario: NecesarioDe;
  onAlternar: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {corridas.map((c) => {
        const os = c.origenYSalida;
        const atada = atadas.has(c.id);
        return (
          <li key={c.id}>
            {/* A 400 px el nombre toma su renglón y las cifras bajan debajo,
                alineadas con él: en uno solo, «N.º 95052 · Tornillo» quedaba
                en cuatro líneas (medido 27-09). */}
            <label className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-1.5 text-sm hover:bg-[var(--surface-sunken)]">
              <input
                type="checkbox"
                checked={atada || elegidas.has(c.id)}
                disabled={atada}
                onChange={() => onAlternar(c.id)}
                className="h-5 w-5 shrink-0 accent-[var(--accent)] disabled:cursor-not-allowed"
              />
              <b className="min-w-0 flex-1 basis-[14rem] text-[var(--text-primary)]">
                N.º <span className="tabular-nums">{c.lineNo}</span> · {c.especie ?? "sin especie"}
                {c.producto && (
                  <span className="font-normal text-[var(--text-secondary)]">
                    {" "}
                    · {clasificacionCorta(c.producto)}
                  </span>
                )}
              </b>
              <span className="flex items-center gap-2 max-sm:pl-[1.875rem]">
                <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                  {fmtM3(c.m3)} m³
                  {c.piezasAsiento > 0 ? ` · ${fmtPiezas(c.piezasAsiento)} pza` : ""}
                </span>
                {atada ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
                    <Link2 className="h-3.5 w-3.5" aria-hidden /> ya atada
                  </span>
                ) : (
                  os && (
                    <MarcaConTexto marca={MARCA_ORIGEN[origenVisibleDeCorrida(os, necesario)]} />
                  )
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * «Ya atada a N.º …»: lo que la cubicación elegida ya ampara, de este día o de
 * otros. Entra al cuadre de abajo — una medición no respalda dos veces la
 * misma madera.
 */
export function YaAtadaA({ corridas }: { corridas: readonly CorridaDelDia[] }) {
  if (corridas.length === 0) return null;
  return (
    <div
      className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-2 text-sm"
      data-ya-atada
    >
      <p className="flex items-center gap-1.5 font-bold text-[var(--text-secondary)]">
        <Link2 className="h-4 w-4 shrink-0" aria-hidden />
        Ya atada a {corridas.length === 1 ? "1 corrida" : `${corridas.length} corridas`}: cuentan en
        el cuadre
      </p>
      <ul className="mt-1 space-y-0.5">
        {corridas.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-[var(--text-primary)]"
          >
            <span>
              <b>
                N.º <span className="tabular-nums">{c.lineNo}</span>
              </b>{" "}
              · {c.especie ?? "sin especie"}{" "}
              <span className="text-[var(--text-tertiary)]">· {etiquetaLarga(c.dia)}</span>
            </span>
            <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
              {fmtM3(c.m3)} m³
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** «Cuadra» o por qué no, en una línea, arriba de la tabla. */
export function VeredictoDelCuadre({ cuadre }: { cuadre: CuadreDelVinculo }) {
  const ok = cuadre.cuadra;
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold",
        ok
          ? "border-[var(--data-success-500)]/50 bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)]"
          : "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]",
      )}
    >
      {ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      {ok
        ? `Cuadra por especie: ${fmtM3(cuadre.total.m3Cubicado)} m³ cubicados contra ${fmtM3(cuadre.total.m3Declarado)} m³ declarados.`
        : cuadre.motivo}
    </p>
  );
}

/** Declarado contra cubicación, por especie y tipo. A 400 px el tipo va debajo de la especie. */
export function TablaDelCuadre({ cuadre }: { cuadre: CuadreDelVinculo }) {
  if (cuadre.filas.length === 0) return null;
  return (
    <TablaCtp>
      <TheadCtp>
        {/* A 400 px las cabeceras cortas: «Cubicación» y «Diferencia» empujaban
            la última columna fuera de la vista (medido 27-09). */}
        <tr>
          <th className={`${CELDA} font-bold`}>Especie · tipo</th>
          <th className={`${CELDA} text-right font-bold`}>
            <span className="sm:hidden">Libro</span>
            <span className="max-sm:hidden">Declarado</span>
          </th>
          <th className={`${CELDA} text-right font-bold`}>
            <span className="sm:hidden">Medido</span>
            <span className="max-sm:hidden">Cubicación</span>
          </th>
          <th className={`${CELDA} text-right font-bold`}>
            <span className="sm:hidden">Dif.</span>
            <span className="max-sm:hidden">Diferencia</span>
          </th>
        </tr>
      </TheadCtp>
      <TbodyCtp>
        {cuadre.filas.map((f) => (
          <tr key={`${f.especie}|${f.tipo}`}>
            <td className={CELDA}>
              <b className="text-[var(--text-primary)]">{f.especie}</b>
              <span className="block text-xs text-[var(--text-secondary)] sm:inline">
                {" "}
                · {f.tipo}
                {f.tiposMedidos && (
                  <span className="text-[var(--text-tertiary)]">
                    {" "}
                    (medida: {f.tiposMedidos.join(", ")})
                  </span>
                )}
              </span>
            </td>
            <td className={NUM}>
              {fmtM3(f.m3Declarado)}
              {f.piezasDeclaradas > 0 && (
                <span className="block text-xs text-[var(--text-tertiary)]">
                  {fmtPiezas(f.piezasDeclaradas)} pza
                </span>
              )}
            </td>
            <td className={NUM}>
              {fmtM3(f.m3Cubicado)}
              {f.piezasCubicadas > 0 && (
                <span className="block text-xs text-[var(--text-tertiary)]">
                  {fmtPiezas(f.piezasCubicadas)} pza
                </span>
              )}
            </td>
            <td className={cn(NUM, "font-bold", TINTA[f.tono])} data-tono={f.tono}>
              {f.deltaM3 > 0 ? "+" : ""}
              {fmtM3(f.deltaM3)}
            </td>
          </tr>
        ))}
      </TbodyCtp>
      <tfoot>
        <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
          <th scope="row" className={`${CELDA} text-left`}>
            Total m³
          </th>
          <td className={NUM}>{fmtM3(cuadre.total.m3Declarado)}</td>
          <td className={NUM}>{fmtM3(cuadre.total.m3Cubicado)}</td>
          <td className={NUM}>
            {cuadre.total.deltaM3 > 0 ? "+" : ""}
            {fmtM3(cuadre.total.deltaM3)}
          </td>
        </tr>
      </tfoot>
    </TablaCtp>
  );
}
