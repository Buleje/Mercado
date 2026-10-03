"use client";

/**
 * El detalle de las dos pilas nuevas de «Volumen disponible» (Brandon
 * 2026-10-03): lo que le sobra a cada lote y lo que espera recepción.
 *
 * Las dos son de solo lectura: el trabajo se hace en su pestaña (Lotes de
 * aserrío, Ingresos) y el botón de cada encabezado lleva ahí.
 */

import { ArrowRight } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { fechaCorta } from "@/lib/forestal/plazo-de-apartado";
import { formatNumber } from "@/lib/format";
import type { FilaGuiaPorRecepcionar, FilaLoteSobrante } from "@/lib/forestal/volumen-disponible";
import { Dias } from "./ctp-patio-por-permiso-partes";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

const nf = (n: number) => formatNumber(n);
const celda = "px-3 py-2";
const SOLO_ANCHO = "max-sm:hidden!";

function Encabezado({
  titulo,
  ayuda,
  resumen,
  accion,
  onAccion,
}: {
  titulo: string;
  ayuda: { what: string; affects: string; example: string };
  resumen: string;
  accion: string;
  onAccion?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CardTitle as="h3" className="text-lg font-bold text-[var(--text-primary)]">
        {titulo}
      </CardTitle>
      <InfoTip title={titulo} {...ayuda} />
      <span className="text-sm tabular-nums text-[var(--text-secondary)]">{resumen}</span>
      {onAccion && (
        <button
          type="button"
          onClick={onAccion}
          className="ml-auto inline-flex h-12 items-center gap-2 rounded-2xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
        >
          {accion} <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

const suma = <T,>(filas: readonly T[], f: (x: T) => number) => filas.reduce((a, x) => a + f(x), 0);

export function PilaLotes({
  filas,
  cargando,
  onIrLotes,
}: {
  filas: readonly FilaLoteSobrante[];
  cargando: boolean;
  onIrLotes?: () => void;
}) {
  const sinAserrar = suma(filas, (f) => f.m3SinAserrar);
  const porDeclarar = suma(filas, (f) => f.m3PorDeclarar);
  const partes = [
    sinAserrar > 0 ? `${fmtM3(sinAserrar)} sin aserrar` : null,
    porDeclarar > 0 ? `${fmtM3(porDeclarar)} por declarar` : null,
  ].filter(Boolean);
  return (
    <section aria-label="Lotes" className="space-y-3">
      <Encabezado
        titulo="Volumen sobrante de los lotes"
        ayuda={{
          what: "Lo que le queda a cada lote, como en Lotes de aserrío: si está abierto, sus trozas sin aserrar; si ya se aserró, lo que todavía se puede declarar hasta el tope del 56 %.",
          affects: "La madera aserrada que le queda al lote ya cuenta en Productos: se muestra, pero no se suma acá.",
          example: "QA-SEM-L4 aserrado: entraron 6.285 m³, tope 3.520, declarados 2.999 → sobran 0.521 por declarar.",
        }}
        resumen={
          cargando && filas.length === 0
            ? "Leyendo…"
            : `${nf(filas.length)} ${filas.length === 1 ? "lote" : "lotes"} · ${partes.length > 1 ? `${partes.join(" + ")} = ` : ""}${fmtM3(sinAserrar + porDeclarar)} m³`
        }
        accion="Abrir Lotes de aserrío"
        onAccion={onIrLotes}
      />
      <TablaCtp>
        <caption className="sr-only">Volumen sobrante de cada lote</caption>
        <TheadCtp>
          <tr>
            <th scope="col" className={celda}>Lote</th>
            <th scope="col" className={celda}>Especie</th>
            <th scope="col" className={`${celda} ${SOLO_ANCHO}`}>Permiso</th>
            <th scope="col" className={`${celda} text-right`}>Sobrante m³</th>
            <th scope="col" className={`${celda} text-right`}>≈pt<span className="sr-only"> aprovechables, estimado</span></th>
            <th scope="col" className={`${celda} ${SOLO_ANCHO}`}>Cómo va</th>
            <th scope="col" className={`${celda} ${SOLO_ANCHO} text-right`}>
              Aserrada que queda<span className="sr-only">, ya contada en Productos</span>
            </th>
            <th scope="col" className={`${celda} ${SOLO_ANCHO}`}>Armado hace</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {cargando && filas.length === 0 && <FilaVacia cols={8}>Leyendo los lotes…</FilaVacia>}
          {!cargando && filas.length === 0 && <FilaVacia cols={8}>Ningún lote tiene volumen sobrante.</FilaVacia>}
          {filas.map((f) => (
            <tr key={f.id} className="hover:bg-[var(--surface-sunken)]">
              <td className={celda}>
                <span className="font-bold text-[var(--text-primary)]">{f.codigo}</span>
                {f.estado && <span className="block text-sm text-[var(--text-secondary)]">{f.estado}</span>}
              </td>
              <td className={`${celda} text-[var(--text-primary)]`}>{f.especie}</td>
              <td className={`${celda} ${SOLO_ANCHO} text-[var(--text-secondary)]`}>{f.permisos.join(", ") || "Sin permiso"}</td>
              <td className={`${celda} text-right tabular-nums`}>
                <span className="font-bold text-[var(--text-primary)]">{fmtM3(f.m3)}</span>
                <span className="block text-sm text-[var(--text-secondary)]">
                  {[
                    f.m3SinAserrar > 0 ? `${nf(f.trozas)} ${f.trozas === 1 ? "troza" : "trozas"} sin aserrar` : null,
                    f.m3PorDeclarar > 0 ? (f.m3SinAserrar > 0 ? `${fmtM3(f.m3PorDeclarar)} por declarar` : "por declarar") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </td>
              <td className={`${celda} text-right tabular-nums text-[var(--text-secondary)]`}>{nf(f.pt)}</td>
              <td className={`${celda} ${SOLO_ANCHO} text-[var(--text-secondary)]`}>{f.nivel ?? "—"}</td>
              <td className={`${celda} ${SOLO_ANCHO} text-right tabular-nums text-[var(--text-secondary)]`}>
                {f.m3Aserrada != null ? <span title="Ya cuenta en Productos: no suma acá">{fmtM3(f.m3Aserrada)}</span> : "—"}
              </td>
              <td className={`${celda} ${SOLO_ANCHO}`}>
                {f.diasAbierto != null ? <Dias dias={f.diasAbierto} /> : <span className="text-[var(--text-secondary)]">—</span>}
              </td>
            </tr>
          ))}
        </TbodyCtp>
      </TablaCtp>
    </section>
  );
}

export function PilaPorRecepcionar({
  filas,
  cargando,
  onIrIngresos,
}: {
  filas: readonly FilaGuiaPorRecepcionar[];
  cargando: boolean;
  onIrIngresos?: () => void;
}) {
  const m3 = suma(filas, (f) => f.m3);
  const trozas = suma(filas, (f) => f.trozas);
  return (
    <section aria-label="Por recepcionar" className="space-y-3">
      <Encabezado
        titulo="Ingresos por recepcionar"
        ayuda={{
          what: "Guías con sus trozas anotadas que todavía no se recepcionaron.",
          affects: "Es madera que viene: no entra a la sierra hasta recepcionarla. Las más viejas van primero.",
          example: "Recepciona la guía en Ingresos y su volumen pasa a Trozas.",
        }}
        resumen={cargando && filas.length === 0 ? "Leyendo…" : `${nf(filas.length)} ${filas.length === 1 ? "guía" : "guías"} · ${nf(trozas)} trozas · ${fmtM3(m3)} m³`}
        accion="Ir a recepcionar"
        onAccion={onIrIngresos}
      />
      <TablaCtp>
        <caption className="sr-only">Guías por recepcionar con su volumen</caption>
        <TheadCtp>
          <tr>
            <th scope="col" className={celda}>Guía</th>
            <th scope="col" className={`${celda} ${SOLO_ANCHO}`}>Proveedor</th>
            <th scope="col" className={`${celda} ${SOLO_ANCHO}`}>Permiso</th>
            <th scope="col" className={celda}>Especies</th>
            <th scope="col" className={`${celda} text-right`}>Trozas</th>
            <th scope="col" className={`${celda} text-right`}>m³</th>
            <th scope="col" className={`${celda} text-right`}>≈pt<span className="sr-only"> aserrable al 56 %</span></th>
            <th scope="col" className={celda}>Esperando</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {cargando && filas.length === 0 && <FilaVacia cols={8}>Leyendo las guías…</FilaVacia>}
          {!cargando && filas.length === 0 && <FilaVacia cols={8}>No hay guías por recepcionar.</FilaVacia>}
          {filas.map((f) => (
            <tr key={f.woodEntryId} className="hover:bg-[var(--surface-sunken)]">
              <td className={`${celda} font-bold tabular-nums text-[var(--text-primary)]`}>{f.guia}</td>
              <td className={`${celda} ${SOLO_ANCHO} text-[var(--text-primary)]`}>{f.proveedor || "—"}</td>
              <td className={`${celda} ${SOLO_ANCHO} text-[var(--text-secondary)]`}>{f.permiso || "Sin permiso"}</td>
              <td className={`${celda} text-[var(--text-primary)]`}>{f.especies.join(", ") || "Sin especie"}</td>
              <td className={`${celda} text-right tabular-nums text-[var(--text-primary)]`}>{nf(f.trozas)}</td>
              <td className={`${celda} text-right font-bold tabular-nums text-[var(--text-primary)]`}>{fmtM3(f.m3)}</td>
              <td className={`${celda} text-right tabular-nums text-[var(--text-secondary)]`}>{nf(f.pt)}</td>
              <td className={celda}>
                {f.fechaIngreso && f.diasEsperando != null ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5" title="Desde la fecha del asiento">
                    <span className="whitespace-nowrap tabular-nums text-[var(--text-primary)]">{fechaCorta(f.fechaIngreso)}</span>
                    <Dias dias={f.diasEsperando} />
                  </span>
                ) : (
                  <span className="text-[var(--text-secondary)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </TbodyCtp>
      </TablaCtp>
    </section>
  );
}
