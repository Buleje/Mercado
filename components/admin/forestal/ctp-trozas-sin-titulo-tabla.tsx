"use client";

/**
 * La tabla del modal «Sin título declarado»: las piezas agrupadas por la guía
 * que las ampara, porque el título se corrige UNA vez por guía (en su
 * ingreso), no pieza por pieza. Cada grupo abre con su renglón —guía,
 * proveedor, cuántas piezas y m³— y el pie suma lo mostrado.
 */

import { DataTable } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { diasParada, ESTADO_META, estadoDeTroza } from "@/lib/forestal/trozas-patio";
import { medidasDePieza } from "@/lib/forestal/trozas-patio-medidas";
import { claseDias, n, NUM, tituloDias } from "./ctp-trozas-lista-shared";
import { BotonAnotarMedidas, ValorMedida } from "./ctp-trozas-medidas-ui";
import { puntoDeTono } from "./ctp-trozas-ui";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

export interface GrupoSinTitulo {
  gtf: string;
  proveedor: string | null;
  resolucion: string | null;
  piezas: TrozaPatioAPI[];
  m3: number;
  especies: string[];
}

/** Agrupa por guía, la de más m³ primero: es la que más origen legal deja sin acreditar. */
export function agruparPorGuia(trozas: readonly TrozaPatioAPI[]): GrupoSinTitulo[] {
  const m = new Map<string, GrupoSinTitulo>();
  for (const t of trozas) {
    const k = t.gtfNumber ?? "Sin guía";
    const g = m.get(k) ?? { gtf: k, proveedor: t.proveedor, resolucion: t.resolucion, piezas: [], m3: 0, especies: [] };
    g.piezas.push(t);
    g.m3 += t.volumenM3 ?? 0;
    const esp = t.especieComun?.trim();
    if (esp && !g.especies.includes(esp)) g.especies.push(esp);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.m3 - a.m3 || a.gtf.localeCompare(b.gtf));
}

const COLUMNAS = 8;

export default function CtpTrozasSinTituloTabla({
  grupos, hoy, onVerFicha, onAnotar,
}: {
  grupos: GrupoSinTitulo[];
  hoy: Date;
  onVerFicha: (id: string) => void;
  onAnotar: (id: string) => void;
}) {
  const piezas = grupos.reduce((a, g) => a + g.piezas.length, 0);
  const m3 = grupos.reduce((a, g) => a + g.m3, 0);
  return (
    <DataTable stickyHeader wrapperClassName="max-h-[56vh]" className="w-full text-sm">
      <thead>
        <tr>
          <th>Código</th>
          <th>Especie</th>
          <th className="text-right" title="Diámetro 1, en cm">D1 (cm)</th>
          <th className="text-right" title="Diámetro 2, en cm">D2 (cm)</th>
          <th className="text-right">Largo (m)</th>
          <th className="text-right">Volumen (m³)</th>
          <th>Estado</th>
          <th className="text-right" title="Días que lleva parada">Parada</th>
        </tr>
      </thead>
      {grupos.map((g) => (
        <tbody key={g.gtf}>
          <tr className="bg-[var(--surface-sunken)]">
            <td colSpan={COLUMNAS} className="!py-1.5">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-xs font-bold text-[var(--text-primary)]">GTF {g.gtf}</span>
                {g.proveedor && <span className="text-xs text-[var(--text-secondary)]">{g.proveedor}</span>}
                {g.resolucion && <span className="text-xs text-[var(--text-tertiary)]">Res. {g.resolucion}</span>}
                <span className="ml-auto font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                  {g.piezas.length} {g.piezas.length === 1 ? "pieza" : "piezas"} · {fmtM3(g.m3)} m³
                  {g.especies.length > 0 && ` · ${g.especies.join(", ")}`}
                </span>
              </span>
            </td>
          </tr>
          {g.piezas.map((t) => {
            const e = estadoDeTroza(t);
            const d = diasParada(t, hoy);
            const md = medidasDePieza(t);
            const falta = md.d1 == null || md.d2 == null;
            return (
              <tr
                key={t.id}
                tabIndex={0}
                onClick={() => onVerFicha(t.id)}
                onKeyDown={(ev) => {
                  if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) {
                    ev.preventDefault();
                    onVerFicha(t.id);
                  }
                }}
                aria-label={`Ver ficha de ${t.codificacion ?? t.codigoPlanta ?? "la pieza"}`}
                className="cursor-pointer"
              >
                <td className="whitespace-nowrap font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? t.codigoPlanta ?? "—"}</td>
                <td className="whitespace-nowrap text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
                <td className={NUM}>
                  {falta && md.d1 == null ? <BotonAnotarMedidas onClick={() => onAnotar(t.id)} /> : <ValorMedida v={md.d1} fuente={md.fuente} />}
                </td>
                <td className={NUM}><ValorMedida v={md.d2} fuente={md.fuente} /></td>
                <td className={`${NUM} text-[var(--text-secondary)]`}>{n(t.largoM)}</td>
                <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{t.volumenM3 == null ? "—" : fmtM3(t.volumenM3)}</td>
                <td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5" title={ESTADO_META[e].hint}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: puntoDeTono(ESTADO_META[e].tono) }} aria-hidden="true" />
                    <span className="text-xs font-bold text-[var(--text-secondary)]">{ESTADO_META[e].label}</span>
                  </span>
                </td>
                <td className={NUM}>
                  <span className={`inline-block font-bold ${claseDias(d)}`} title={tituloDias(d)}>{d == null ? "—" : `${d} d`}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      ))}
      <tfoot className="sticky bottom-0 border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        <tr>
          <td colSpan={5} className="text-right text-sm font-bold text-[var(--text-primary)]">
            Total · {piezas} {piezas === 1 ? "pieza" : "piezas"} en {grupos.length} {grupos.length === 1 ? "guía" : "guías"}
          </td>
          <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(m3)}</td>
          <td colSpan={2} />
        </tr>
      </tfoot>
    </DataTable>
  );
}
