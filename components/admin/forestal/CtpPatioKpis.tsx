"use client";

/**
 * Las cifras del patio (ADR-345).
 *
 * Cuando el apartado que se está mirando es la pila, los cuatro números de
 * arriba tienen que hablar de la pila: cuánta madera hay, de qué es, cuánta se
 * puede mandar hoy a la sierra y hace cuánto que está parada. Antes esa franja
 * mostraba siempre lo del cuadro —los consumos ya registrados— y se leía "3
 * consumos" con treinta trozas delante.
 *
 * Se calculan sobre lo FILTRADO, igual que el pie de la tabla: dos cifras para
 * la misma madera que no coinciden enseñan a no mirar ninguna.
 */

import { Clock, Layers, PackageOpen, TreePine } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { CHART_PALETTE } from "@/lib/chart-theme";
import { DIAS_PATIO_ANEJO, type ResumenPatio } from "@/lib/forestal/patio-resumen";

const nf = (n: number) => n.toLocaleString("es-PE");

/** Los colores de la barra: la paleta categórica del proyecto, no una propia. */
const TINTES = CHART_PALETTE;

export default function CtpPatioKpis({
  resumen,
  /** Cuántas piezas tiene el patio sin filtrar — para decir qué quedó afuera. */
  totalSinFiltrar,
}: {
  resumen: ResumenPatio;
  totalSinFiltrar: number;
}) {
  const r = resumen;
  const filtrado = r.piezas !== totalSinFiltrar;
  const lider = r.porEspecie[0] ?? null;
  /* Las que se dibujan en la barra: cinco y el resto junto. Con quince especies
     una barra de quince tramos no dice nada. */
  const top = r.porEspecie.slice(0, 5);
  const restoPct = Math.max(0, Math.round((100 - top.reduce((a, e) => a + e.pctVolumen, 0)) * 10) / 10);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          density="compact"
          label="Trozas en el patio"
          value={nf(r.piezas)}
          subValue={
            r.piezas === 0
              ? "Sin madera esperando"
              : `${nf(r.libres)} libres · ${nf(r.apartadas)} en lotes` +
                (r.bloqueadas > 0 ? ` · ${nf(r.bloqueadas)} bloqueadas` : "")
          }
          icon={PackageOpen}
          emphasis="neutral"
        />
        {/* La unidad va en el rótulo: con «m³» pegado, los cuatro decimales del
            libro parten el número en dos renglones y estiran toda la fila. */}
        <StatCard
          density="compact"
          label="Volumen en patio (m³)"
          value={r.volumenM3.toFixed(4)}
          subValue={`${nf(r.pieTablar)} pt · ${r.volumenLibreM3.toFixed(4)} libres hoy`}
          icon={TreePine}
          emphasis="success"
        />
        <StatCard
          density="compact"
          label="Especies en la pila"
          value={nf(r.especies)}
          subValue={
            lider ? `${lider.especie} · ${lider.pctVolumen}% del volumen` : "Sin especie declarada"
          }
          icon={Layers}
          emphasis="neutral"
        />
        {/* La pregunta que nadie hace hasta que la madera se manchó: ¿hace cuánto
            que está parada? El promedio escondería justo la pieza vieja. */}
        <StatCard
          density="compact"
          label="Espera en el patio"
          value={r.esperaMaxDias != null ? `${nf(r.esperaMaxDias)} d` : "—"}
          subValue={
            r.esperaMaxDias == null
              ? "Sin fecha de recepción"
              : r.anejas > 0
                ? `${nf(r.anejas)} pza · ${DIAS_PATIO_ANEJO} días o más`
                : `Ninguna pasa los ${DIAS_PATIO_ANEJO} días`
          }
          icon={Clock}
          emphasis={r.anejas > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* Una sola caja debajo de las tarjetas: de qué es el patio y de dónde
          vino. Sueltas eran dos bloques con distinto margen y la fila de abajo
          no alineaba con nada. El reparto va sobre el VOLUMEN — cuatro trozas
          gruesas pesan en la sierra más que veinte delgadas. */}
      {r.piezas > 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {top.length > 0 && r.volumenM3 > 0 && (
            <div className="px-4 py-3">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                {top.map((e, i) => (
                  <div
                    key={e.especie}
                    style={{ width: `${e.pctVolumen}%`, backgroundColor: TINTES[i % TINTES.length] }}
                    title={`${e.especie}: ${e.volumenM3.toFixed(4)} m³ (${e.pctVolumen}%)`}
                  />
                ))}
              </div>
              <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                {top.map((e, i) => (
                  <li key={e.especie} className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: TINTES[i % TINTES.length] }}
                    />
                    <b className="truncate text-[var(--text-primary)]">{e.especie}</b>
                    <span className="ml-auto shrink-0 font-mono tabular-nums">
                      {nf(e.piezas)} pza · {e.volumenM3.toFixed(4)} m³ · {e.pctVolumen}%
                    </span>
                  </li>
                ))}
                {restoPct > 0.5 && (
                  <li className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
                    y {r.especies - top.length} especie(s) más
                    <span className="ml-auto shrink-0 font-mono tabular-nums">{restoPct}%</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* La letra chica: cómo es la pieza promedio y de dónde viene esa
              madera. No son cuatro tarjetas más porque no se miran a diario. */}
          <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--rule-base)] px-4 py-2.5 text-sm text-[var(--text-tertiary)]">
            <span>
              Pieza promedio{" "}
              <b className="font-mono tabular-nums text-[var(--text-secondary)]">
                {r.promedioM3?.toFixed(4) ?? "—"} m³
              </b>
              {r.mayorM3 != null && (
                <>
                  {" "}· la mayor{" "}
                  <b className="font-mono tabular-nums text-[var(--text-secondary)]">{r.mayorM3.toFixed(4)} m³</b>
                </>
              )}
            </span>
            <span>
              De <b className="text-[var(--text-secondary)]">{nf(r.guias)}</b> guía(s)
              {r.permisos > 0 && (
                <>
                  {" "}· <b className="text-[var(--text-secondary)]">{nf(r.permisos)}</b> permiso(s)
                </>
              )}
              {r.proveedores > 0 && (
                <>
                  {" "}· <b className="text-[var(--text-secondary)]">{nf(r.proveedores)}</b> proveedor(es)
                </>
              )}
            </span>
            {filtrado && <span>Cifras del filtro · el patio tiene {nf(totalSinFiltrar)} piezas</span>}
          </p>
        </div>
      )}
    </div>
  );
}
