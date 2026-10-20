"use client";

/**
 * El bloque especial «Por distribuir» (Brandon, 2026-10-19).
 *
 * Junta las líneas que nadie tildó como distribuidas —la larga angosta del
 * bloque 1, la corta del bloque 3— en un solo lugar, por permiso, para sacar su
 * propio Anexo 04. No guarda nada: se arma de las casillas cada vez
 * (`porDistribuir`), así que tildar una línea acá o en su bloque la saca, y
 * destildarla la devuelve.
 *
 * Un permiso a la vez, como el Anexo 04 por permiso: un papel nunca junta dos
 * títulos habilitantes.
 */

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { CheckCheck, CheckCircle2, FileText, Inbox } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import type { AnexoDePermiso } from "@/lib/forestal/anexo-por-permiso";
import { sumarLineas, type BloquePendiente, type PorDistribuir } from "@/lib/forestal/reparto-por-distribuir";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { FilaConMedidas } from "./reparto-vistas";
import NombreEditable from "./reparto-nombre-editable";

const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50";

const Cifras = ({ piezas, pt, m3 }: { piezas: number; pt: number; m3: number }) => (
  <span className="inline-flex flex-wrap items-center gap-x-3 font-mono text-sm font-bold tabular-nums text-[var(--text-secondary)]">
    <span>{fmtPiezas(piezas)} <span className="font-sans font-normal text-[var(--text-tertiary)]">pzas</span></span>
    <span>{fmtPt(pt)} <span className="font-sans font-normal text-[var(--text-tertiary)]">PT</span></span>
    <span>{fmtM3(m3)} <span className="font-sans font-normal text-[var(--text-tertiary)]">m³</span></span>
  </span>
);

export default function RepartoPorDistribuir({
  pd,
  anexos,
  dim,
  marcar,
  onAnexo,
  nombre,
  onNombre,
}: {
  /** Cómo se llama este bloque (por defecto «Sin marcar»). */
  nombre: string;
  onNombre: (n: string) => void;
  pd: PorDistribuir;
  /** El Anexo 04 de lo pendiente, uno por permiso (`anexosPorPermiso` con `pendienteEn`). */
  anexos: readonly AnexoDePermiso[];
  dim: DimensionResumen;
  marcar: (claves: string[], estado?: boolean) => void;
  onAnexo: (anexo: AnexoDePermiso) => void;
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  const actual = useMemo(
    () => pd.porPermiso.find((p) => p.label === elegido) ?? pd.porPermiso[0],
    [pd.porPermiso, elegido],
  );
  const anexo = actual ? anexos.find((a) => a.label === actual.label) : undefined;

  if (!actual) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-4 text-sm text-[var(--text-secondary)]">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden />
        Todo está marcado como distribuido: no queda nada sin marcar.
      </div>
    );
  }

  const clavesPermiso = actual.bloques.flatMap((b) => b.lineas.map((l) => l.clave));
  return (
    <div className="rounded-xl border-2 border-dashed border-[var(--accent)] bg-[var(--surface-canvas)]">
      {/* Cabecera en una fila: qué es, cuánto suma y su papel. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule-soft)] px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-base font-bold text-[var(--text-primary)]">
          <Inbox className="h-4 w-4 text-[var(--accent)]" aria-hidden /> <NombreEditable nombre={nombre} onGuardar={onNombre} />
          <InfoTip
            title={nombre}
            what={<span>Se arma solo con lo que no tildaste; al tildar una fila sale de acá. Las líneas de los bloques que todavía no tildaste como distribuidas, juntas y separadas por permiso. Se arma solo con las casillas: tildar una línea la saca de acá, destildarla la devuelve.</span>}
            affects={<span>Su Anexo 04 va por permiso y lleva sólo estas líneas. Lo de acá sí tiene bloque y permiso, sólo falta tildarlo (no es la tarjeta «Falta por distribuir», que es aserrada que ningún bloque alcanzó a amparar).</span>}
            example={<span>Bloque 1: Comercial y Corta tildadas, Larga angosta sin tildar. La Larga angosta aparece acá, en su permiso, con sus 2 medidas.</span>}
          />
        </span>
        <span className="text-sm text-[var(--text-tertiary)]">
          {pd.lineas.length} {pd.lineas.length === 1 ? "línea" : "líneas"} · {pd.porPermiso.length} {pd.porPermiso.length === 1 ? "permiso" : "permisos"}
        </span>
        <span className="ml-auto"><Cifras {...pd.totales} /></span>
      </div>

      {/* Un permiso a la vez: un papel = un título habilitante. */}
      {pd.porPermiso.length > 1 && (
        <div role="tablist" aria-label="Permiso" className="flex flex-wrap gap-1.5 px-3 pt-2">
          {pd.porPermiso.map((p) => {
            const activo = p.label === actual.label;
            return (
              <button
                key={p.label}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => setElegido(p.label)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-colors ${
                  activo
                    ? "border-[var(--accent-dark)] bg-[var(--accent-dark)] text-white"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                }`}
              >
                {p.label}
                <span className={`font-mono text-xs tabular-nums ${activo ? "" : "text-[var(--text-tertiary)]"}`}>{fmtM3(p.totales.m3)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">{actual.label}</span>
        <span className="text-sm text-[var(--text-tertiary)]">
          {actual.bloques.length} {actual.bloques.length === 1 ? "bloque" : "bloques"} · {actual.lineas} {actual.lineas === 1 ? "tipo" : "tipos"}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => marcar(clavesPermiso, true)}
            title={`Tilda como distribuidas las ${clavesPermiso.length} líneas de ${actual.label}: pasan a «Marcado»`}
            className={BTN}
          >
            <CheckCheck className="h-4 w-4" aria-hidden /> Marcar todo lo que falta
          </button>
          <button
            type="button"
            onClick={() => anexo && onAnexo(anexo)}
            disabled={!anexo || anexo.piezas.length === 0}
            title={`Anexo 04 «${nombre}» de ${actual.label}: sólo lo que falta tildar`}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent-dark)] px-3 text-sm font-bold text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" aria-hidden /> Anexo 04 de este permiso
          </button>
        </span>
      </div>

      <div className="space-y-3 px-3 pb-3">
        {actual.bloques.flatMap(porJornada).map((b) => (
          <TablaDelBloque key={`${b.bloqueId}-${b.lineas[0]?.dia}`} b={b} dim={dim} marcar={marcar} />
        ))}
      </div>
    </div>
  );
}

/** Un bloque de varias jornadas se lee día por día, como en su tarjeta. */
function porJornada(b: BloquePendiente): BloquePendiente[] {
  if ((b.lineas[0]?.dias ?? 1) <= 1) return [b];
  const dias = [...new Set(b.lineas.map((l) => l.dia))].sort((x, y) => x - y);
  return dias.map((d) => {
    const lineas = b.lineas.filter((l) => l.dia === d);
    return { ...b, etiqueta: `${b.etiqueta} · día ${d}`, lineas, totales: sumarLineas(lineas) };
  });
}

/** Las líneas sin tildar de UN bloque de origen, con el mismo renglón que su tarjeta. */
function TablaDelBloque({
  b,
  dim,
  marcar,
}: {
  b: BloquePendiente;
  dim: DimensionResumen;
  marcar: (claves: string[], estado?: boolean) => void;
}) {
  const claves = b.lineas.map((l) => l.clave);
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--rule-soft)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[var(--surface-sunken)] px-3 py-1.5">
        <span className="text-sm font-bold text-[var(--text-primary)]">{b.etiqueta}</span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {b.especie || "Sin especie"}
          {b.aserradaDirecta ? " · ya aserrada" : ""}
        </span>
        <button
          type="button"
          onClick={() => marcar(claves, true)}
          title={`Tilda lo que falta de ${b.etiqueta}`}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Marcar lo del bloque
        </button>
      </div>
      <div className="overflow-x-auto">
        <DataTable className="w-full min-w-[620px] table-fixed">
          <thead>
            <tr>
              <th scope="col" className="w-24">Distribuido</th>
              <th scope="col">Tipo</th>
              <th scope="col" className="w-28 text-right">Piezas</th>
              <th scope="col" className="w-32 text-right">Pie tablar</th>
              <th scope="col" className="w-32 text-right">Ampara (m³)</th>
            </tr>
          </thead>
          <tbody>
            {b.lineas.map((l) => (
              <FilaConMedidas
                key={l.clave}
                a={l.grupo}
                dim={dim}
                marcada={false}
                onMarcar={() => marcar([l.clave], true)}
                editable={false}
                bloqueId={l.bloqueId}
                overrideActual={null}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <td />
              <th scope="row" className="text-left">Total sin marcar</th>
              <td className="text-right font-mono tabular-nums">{fmtPiezas(b.totales.piezas)}</td>
              <td className="text-right font-mono tabular-nums">{fmtPt(b.totales.pt)}</td>
              <td className="text-right font-mono tabular-nums">{fmtM3(b.totales.m3)}</td>
            </tr>
          </tfoot>
        </DataTable>
      </div>
    </div>
  );
}
