"use client";

/**
 * «Sin marcar» (Resúmenes › Rolliza): las líneas de los bloques que todavía no
 * se tildaron como distribuidas.
 *
 * Brandon, 2026-10-19: «en Sin marcar tipo tiene que unirse, es decir en una
 * tabla estarán ahí las medidas en una sola, y en esa tabla estará una columna
 * de permiso; pero el anexo 4 se pondrá de todo en uno solo». Una sola tabla,
 * ordenada por el código de cada línea, con su permiso al lado; un solo Anexo 04
 * con todo. El de a un permiso sigue en la pestaña «Anexo 04 por permiso».
 */

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { ArrowRight, CheckCheck, CheckCircle2, Download, FileText, Inbox } from "@buleje/design-system/icons";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import type { AnexoDePermiso } from "@/lib/forestal/anexo-por-permiso";
import type { PorDistribuir } from "@/lib/forestal/reparto-por-distribuir";
import { csvSinMarcar, tablaSinMarcar } from "@/lib/forestal/reparto-sin-marcar";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CifraCopiable } from "./cifra-copiable";
import { FilaConMedidas } from "./reparto-vistas";
import NombreEditable from "./reparto-nombre-editable";

const BTN =
  "inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50";
const UNIDAD = "font-sans font-normal text-[var(--text-tertiary)]";

const Cifras = ({ piezas, pt, m3 }: { piezas: number; pt: number; m3: number }) => (
  <span className="inline-flex flex-wrap items-center gap-x-3 font-mono text-sm font-bold tabular-nums text-[var(--text-secondary)]">
    <span><CifraCopiable valor={piezas} tipo="piezas" /> <span className={UNIDAD}>pzas</span></span>
    <span><CifraCopiable valor={m3} tipo="m3" /> <span className={UNIDAD}>m³</span></span>
    <span>{fmtPt(pt)} <span className={UNIDAD}>PT</span></span>
  </span>
);

function descargarCsv(texto: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const archivo = (nombre: string) =>
  `anexo04-${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sin-marcar"}.csv`;

export default function RepartoPorDistribuir({
  pd,
  anexos,
  dim,
  marcar,
  onAnexo,
  onPorPermiso,
  codigoDe,
  nombre,
  onNombre,
}: {
  /** Cómo se llama este bloque (por defecto «Sin marcar»). */
  nombre: string;
  onNombre: (n: string) => void;
  pd: PorDistribuir;
  /** El Anexo 04 de lo pendiente por permiso: sólo para saber si hay papel que armar. */
  anexos: readonly AnexoDePermiso[];
  dim: DimensionResumen;
  marcar: (claves: string[], estado?: boolean) => void;
  /** Abre el Anexo 04 de TODO lo sin marcar, en un solo papel. */
  onAnexo: () => void;
  /** Lleva a «Anexo 04 por permiso», en su modo «sin marcar». */
  onPorPermiso: () => void;
  codigoDe: (clave: string) => string | null;
}) {
  const t = useMemo(() => tablaSinMarcar(pd, codigoDe), [pd, codigoDe]);
  const conPapel = anexos.some((a) => a.piezas.length > 0);

  if (t.filas.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-4 text-sm text-[var(--text-secondary)]">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden />
        Todo está marcado como distribuido: no queda nada sin marcar.
      </div>
    );
  }

  const todas = t.filas.map((f) => f.clave);
  return (
    <div className="rounded-xl border-2 border-dashed border-[var(--accent)] bg-[var(--surface-canvas)]">
      {/* Cabecera en una fila: qué es, cuánto suma. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule-soft)] px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-base font-bold text-[var(--text-primary)]">
          <Inbox className="h-4 w-4 text-[var(--accent)]" aria-hidden /> <NombreEditable nombre={nombre} onGuardar={onNombre} />
          <InfoTip
            title={nombre}
            what={<span>Todo lo que no tildaste como distribuido, de todos los permisos, en una sola tabla. La columna Permiso dice de cuál es cada línea; el Código, de qué bloque viene. Tildar una línea la saca de acá.</span>}
            affects={<span>Su Anexo 04 lleva todo junto en un solo papel. Lo de acá sí tiene bloque y permiso, sólo falta tildarlo (no es la tarjeta «Falta por distribuir», que es aserrada que ningún bloque alcanzó a amparar).</span>}
            example={<span>Bloque 1 (PLT-2021-017) con Larga angosta sin tildar y bloque 3 con Corta sin tildar: salen las dos acá, 1-02 y 3-02, y van juntas en el Anexo 04.</span>}
          />
        </span>
        <span className="text-sm text-[var(--text-tertiary)]">
          {t.filas.length} {t.filas.length === 1 ? "línea" : "líneas"} · {t.porPermiso.length} {t.porPermiso.length === 1 ? "permiso" : "permisos"}
        </span>
        <span className="ml-auto"><Cifras {...t.totales} /></span>
      </div>

      {/* Lo de cada permiso, a la vista: la suma de estos es el total de arriba. */}
      {t.porPermiso.length > 1 && (
        <ul aria-label="Por permiso" className="flex flex-wrap gap-1.5 px-3 pt-2">
          {t.porPermiso.map((p) => (
            <li
              key={p.label}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--rule-base)] px-2.5 py-1 text-sm text-[var(--text-secondary)]"
            >
              <span className="font-bold text-[var(--text-primary)]">{p.label}</span>
              <span className="font-mono text-xs tabular-nums">
                <CifraCopiable valor={p.totales.piezas} tipo="piezas" /> <span className={UNIDAD}>pzas</span> ·{" "}
                <CifraCopiable valor={p.totales.m3} tipo="m3" /> <span className={UNIDAD}>m³</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => marcar(todas, true)}
          title={`Tilda como distribuidas las ${todas.length} líneas: pasan a «Marcado»`}
          className={BTN}
        >
          <CheckCheck className="h-4 w-4" aria-hidden /> Marcar todo lo que falta
        </button>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <button type="button" onClick={onPorPermiso} className={BTN} title="Ir a «Anexo 04 por permiso», con lo sin marcar">
              Por permiso <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <InfoTip
              title="Anexo 04 de lo sin marcar"
              what={<span>Este Anexo 04 junta todo lo sin marcar en un solo papel, de todos los permisos.</span>}
              affects={<span>La versión por permiso (la del papel SERFOR de a un permiso) está en Anexo 04 por permiso. El papel oficial no tiene columna de permiso: el CSV sí la trae, medida por medida, con su código.</span>}
              example={<span>Dos permisos sin marcar: acá sale un papel con los dos; en «Por permiso», uno de cada uno.</span>}
            />
          </span>
          <button
            type="button"
            onClick={() => descargarCsv(csvSinMarcar(t), archivo(nombre))}
            title="Descarga lo sin marcar medida por medida, con su permiso y su código"
            aria-label="Descargar CSV de lo sin marcar"
            className={BTN}
          >
            <Download className="h-4 w-4" aria-hidden /> CSV
          </button>
          <button
            type="button"
            onClick={onAnexo}
            disabled={!conPapel}
            title={`Anexo 04 «${nombre}»: todo lo que falta tildar, de todos los permisos`}
            className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-[var(--accent-dark)] px-3 text-sm font-bold text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" aria-hidden /> Anexo 04 de lo sin marcar
          </button>
        </span>
      </div>

      <div className="px-3 pb-3">
        <div className="overflow-x-auto rounded-lg border border-[var(--rule-soft)]">
          <DataTable className="w-full min-w-[820px] table-fixed">
            <thead>
              <tr>
                <th scope="col" className="w-24">Distribuido</th>
                <th scope="col" className="w-20">Código</th>
                <th scope="col" className="w-36">Permiso</th>
                <th scope="col">Tipo</th>
                <th scope="col" className="w-28 text-right">Piezas</th>
                <th scope="col" className="w-32 text-right">Ampara (m³)</th>
                <th scope="col" className="w-28 text-right">Pie tablar</th>
              </tr>
            </thead>
            <tbody>
              {t.filas.map((f) => (
                <FilaConMedidas
                  key={f.clave}
                  a={f.grupo}
                  dim={dim}
                  marcada={false}
                  onMarcar={() => marcar([f.clave], true)}
                  editable={false}
                  bloqueId={f.bloqueId}
                  overrideActual={null}
                  codigo={f.codigo}
                  permiso={f.permisoLabel}
                  nota={`${f.especie || "Sin especie"}${f.dias > 1 ? ` · día ${f.dia}` : ""}${f.aserradaDirecta ? " · ya aserrada" : ""}`}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                <td />
                <th scope="row" colSpan={3} className="text-left">Total sin marcar</th>
                <td className="text-right font-mono tabular-nums"><CifraCopiable valor={t.totales.piezas} tipo="piezas" /></td>
                <td className="text-right font-mono tabular-nums"><CifraCopiable valor={t.totales.m3} tipo="m3" /></td>
                <td className="text-right font-mono tabular-nums">{fmtPt(t.totales.pt)}</td>
              </tr>
            </tfoot>
          </DataTable>
        </div>
      </div>
    </div>
  );
}
