"use client";

/**
 * La tabla de trabajo: el mismo «por especie y tipo», pero para tantear.
 *
 * Brandon, 2026-09-09: *«al lado de la tabla por especie y tipo, la misma tabla
 * pero manipulable —tipo un clon para cambiar datos— y ese cambio no afecta a
 * ninguna sección ni pestaña, es interno de la tabla»*.
 *
 * Para qué sirve en el patio: antes de declarar, el maderero prueba números
 * —«¿y si pongo 90 piezas en vez de 94?», «¿cuánto me da si el comercial sube a
 * 4 m³?»— y quiere ver el total y el importe moverse. Hacerlo sobre la tabla
 * real sería editar el lote; hacerlo en papel es la calculadora de siempre.
 *
 * ## Lo que NO hace, a propósito
 *
 * No escribe en el lote del cubicador, ni en el reparto, ni en el papel. Vive
 * en `localStorage` (por tenant) para que no se pierda al cambiar de pestaña, y
 * el botón **Reiniciar** lo devuelve a los números reales. Cada celda tocada se
 * marca, y el pie dice cuánto se apartó de lo real: un borrador que no se
 * distingue del dato es la forma más rápida de declarar un número inventado.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { RotateCcw } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { slugKey } from "@/lib/forestal/sembrar-reparto";

/** Una fila REAL de la tabla de especie · tipo. */
export interface FilaTrabajo {
  clave: string;
  especie: string;
  tipo: string;
  piezas: number;
  m3: number;
  pt: number;
  /** Precio por pie tablar de ese grupo (0 = sin precio cargado). */
  precioPt: number;
}

/** Lo tipeado por celda — texto crudo: convertirlo en cada tecla come el «.». */
type Tocado = Partial<Record<"piezas" | "m3" | "pt", string>>;

const CLAVE = () => slugKey("-tabla-trabajo");
const TH = "px-2 py-1.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm";
const NUM = `${TD} text-right font-mono tabular-nums`;
const CELDA =
  "h-8 w-full rounded-lg border bg-[var(--surface-canvas)] px-1.5 text-right font-mono text-sm tabular-nums outline-none focus:border-[var(--accent)]";

/** Número desde lo tipeado; vacío o ilegible = el valor real. */
const leer = (txt: string | undefined, real: number): number => {
  if (txt == null || txt.trim() === "") return real;
  const n = Number(txt.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : real;
};

export default function TablaDeTrabajo({ filas, conValor }: {
  filas: FilaTrabajo[];
  conValor: boolean;
}) {
  const [tocado, setTocado] = useState<Record<string, Tocado>>({});

  /* Se hidrata en un efecto: `localStorage` no existe en el server. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLAVE());
      if (raw) setTocado(JSON.parse(raw) as Record<string, Tocado>);
    } catch { /* json corrupto → borrador vacío */ }
  }, []);

  const escribir = useCallback((clave: string, campo: keyof Tocado, valor: string) => {
    setTocado((prev) => {
      const next = { ...prev, [clave]: { ...prev[clave], [campo]: valor } };
      /* Sin valor no se guarda la celda: así «vacío» vuelve al número real. */
      if (valor.trim() === "") delete next[clave]?.[campo];
      try { localStorage.setItem(CLAVE(), JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const reiniciar = useCallback(() => {
    setTocado({});
    try { localStorage.removeItem(CLAVE()); } catch { /* quota */ }
  }, []);

  const conValores = useMemo(
    () => filas.map((f) => {
      const t = tocado[f.clave] ?? {};
      const piezas = leer(t.piezas, f.piezas);
      const m3 = leer(t.m3, f.m3);
      const pt = leer(t.pt, f.pt);
      return {
        ...f, piezas, m3, pt,
        importe: pt * f.precioPt,
        cambiada: piezas !== f.piezas || m3 !== f.m3 || pt !== f.pt,
      };
    }),
    [filas, tocado],
  );

  const total = useMemo(
    () => conValores.reduce(
      (a, f) => ({
        piezas: a.piezas + f.piezas, m3: a.m3 + f.m3, pt: a.pt + f.pt, importe: a.importe + f.importe,
      }),
      { piezas: 0, m3: 0, pt: 0, importe: 0 },
    ),
    [conValores],
  );
  const real = useMemo(
    () => filas.reduce(
      (a, f) => ({ piezas: a.piezas + f.piezas, m3: a.m3 + f.m3, pt: a.pt + f.pt }),
      { piezas: 0, m3: 0, pt: 0 },
    ),
    [filas],
  );
  const cambiadas = conValores.filter((f) => f.cambiada).length;

  if (filas.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-dashed border-[var(--rule-strong)] bg-[var(--surface-canvas)] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-display text-lg text-[var(--text-primary)]">Tabla de trabajo</span>
          <span className="ml-2 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            borrador
          </span>
        </div>
        {cambiadas > 0 && (
          <button
            type="button"
            onClick={reiniciar}
            title="Volver a los números reales del lote"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reiniciar ({cambiadas})
          </button>
        )}
      </div>
      <p className="mb-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
        Tantea acá: cambiá piezas, m³ o pie tablar y mirá el total. <b>No toca nada</b> — ni el lote
        del cubicador, ni el reparto, ni el papel. Se guarda en este equipo hasta que lo reinicies.
      </p>

      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
        <DataTable className={`w-full text-sm ${conValor ? "min-w-[520px]" : "min-w-[420px]"}`}>
          <caption className="sr-only">Tabla de trabajo por especie y tipo (borrador, no afecta al lote)</caption>
          <thead className="bg-[var(--surface-sunken)]">
            <tr>
              <th scope="col" className={TH}>Tipo</th>
              <th scope="col" className={`${TH} text-right`}>Piezas</th>
              <th scope="col" className={`${TH} text-right`}>Volumen m³</th>
              <th scope="col" className={`${TH} text-right`}>Pie tablar</th>
              {conValor && <th scope="col" className={`${TH} text-right`}>Importe S/</th>}
            </tr>
          </thead>
          <tbody>
            {conValores.map((f) => {
              const t = tocado[f.clave] ?? {};
              const celda = (campo: keyof Tocado, real: number, paso: string) => (
                <input
                  value={t[campo] ?? ""}
                  onChange={(e) => escribir(f.clave, campo, e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  placeholder={paso}
                  aria-label={`${campo} de ${f.tipo} (${f.especie})`}
                  title={`Real: ${paso}`}
                  className={`${CELDA} ${t[campo] ? "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`}
                />
              );
              return (
                <tr key={f.clave} className={`border-t border-[var(--rule-soft)] ${f.cambiada ? "bg-[var(--accent)]/8" : ""}`}>
                  <td className={`${TD} font-bold text-[var(--text-primary)]`}>
                    {f.tipo}
                    <span className="block text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">{f.especie}</span>
                  </td>
                  <td className={TD}>{celda("piezas", f.piezas, fmtPiezas(filas.find((x) => x.clave === f.clave)!.piezas))}</td>
                  <td className={TD}>{celda("m3", f.m3, fmtM3(filas.find((x) => x.clave === f.clave)!.m3))}</td>
                  <td className={TD}>{celda("pt", f.pt, fmtPt(filas.find((x) => x.clave === f.clave)!.pt))}</td>
                  {conValor && (
                    <td className={`${NUM} font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]`}>
                      {fmtSoles(f.importe)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <th scope="row" className={`${TD} text-left`}>Total del borrador</th>
              <td className={NUM}>{fmtPiezas(total.piezas)}</td>
              <td className={NUM}>{fmtM3(total.m3)}</td>
              <td className={NUM}>{fmtPt(total.pt)}</td>
              {conValor && <td className={NUM}>{fmtSoles(total.importe)}</td>}
            </tr>
            {cambiadas > 0 && (
              /* Contra lo REAL: sin esta fila, el borrador se lee como el lote. */
              <tr className="border-t border-[var(--rule-soft)] text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                <th scope="row" className={`${TD} text-left font-normal`}>Real del lote</th>
                <td className={NUM}>{fmtPiezas(real.piezas)}</td>
                <td className={NUM}>{fmtM3(real.m3)}</td>
                <td className={NUM}>{fmtPt(real.pt)}</td>
                {conValor && <td className={NUM} />}
              </tr>
            )}
          </tfoot>
        </DataTable>
      </div>
    </div>
  );
}
