"use client";

/**
 * Las guías que no cuadran consigo mismas, TODAS juntas (ADR-353).
 *
 * Hasta acá el descuadre se descubría de a uno: entrando a la guía, o —peor— al
 * intentar consumirla. Este barrido es el mismo cruce que hace un fiscalizador
 * de entrada: *¿algún ingreso declara un volumen que no coincide con la lista de
 * piezas que lo ampara?*
 *
 * **No filtra por período a propósito.** Una guía de julio sin cuadrar bloquea el
 * consumo de hoy: esconderla porque el chequeo mira agosto sería tapar
 * justamente lo que traba.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Scale } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import CtpCuadrarGuiaModal from "./CtpCuadrarGuiaModal";
import { Btn } from "./ctp-shared";
import { TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Cuánto del libro se barre. Si se corta, se DICE (un tope callado se lee como «no hay más»). */
const PAGINA = 200;
const PAGINAS_MAX = 5;

interface EntryListado {
  id: string;
  libroNro?: number | null;
  gtfNumber: string;
  speciesCommonName?: string | null;
  volumeM3: number | string;
  trozasM3?: number | null;
  trozasCount?: number | null;
  status?: string | null;
}

interface FilaDescuadre {
  id: string;
  libroNro: number | null;
  gtfNumber: string;
  especie: string;
  declarado: number;
  lista: number;
  brecha: number;
  status: string;
}

export default function CtpDescuadresPanel() {
  const [filas, setFilas] = useState<FilaDescuadre[] | null>(null);
  const [truncado, setTruncado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cuadre, setCuadre] = useState<{ gtfNumber: string; ids: string[] } | null>(null);

  const barrer = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const todos: EntryListado[] = [];
      let total = 0;
      let corto = false;
      for (let p = 0; p < PAGINAS_MAX; p++) {
        const r = await ctpGet<{ entries?: EntryListado[]; total?: number }>(
          `/api/admin/forestal/wood-entries?limit=${PAGINA}&offset=${p * PAGINA}`,
        );
        const lote = r.entries ?? [];
        total = r.total ?? todos.length + lote.length;
        todos.push(...lote);
        if (lote.length === 0 || todos.length >= total) break;
        if (p === PAGINAS_MAX - 1) corto = true;
      }
      setTruncado(corto);
      setFilas(
        todos
          .map((e) => {
            const c = cuadreDeIngreso(Number(e.volumeM3), e.trozasM3, e.trozasCount ?? 0);
            if (!descuadra(c)) return null;
            const declarado = Number(e.volumeM3);
            const lista = Number(e.trozasM3 ?? 0);
            return {
              id: e.id,
              libroNro: e.libroNro ?? null,
              gtfNumber: e.gtfNumber,
              especie: e.speciesCommonName ?? "—",
              declarado,
              lista,
              brecha: Number((lista - declarado).toFixed(4)),
              status: e.status ?? "—",
            } satisfies FilaDescuadre;
          })
          .filter((f): f is FilaDescuadre => f !== null)
          .sort((a, b) => Math.abs(b.brecha) - Math.abs(a.brecha)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void barrer();
  }, [barrer]);

  /** Los asientos descuadrados de una guía se cuadran juntos: es un documento. */
  const idsDe = useCallback(
    (gtf: string) => (filas ?? []).filter((f) => f.gtfNumber === gtf).map((f) => f.id),
    [filas],
  );

  const brechaTotal = useMemo(
    () => (filas ?? []).reduce((a, f) => a + Math.abs(f.brecha), 0),
    [filas],
  );
  const guias = useMemo(() => new Set((filas ?? []).map((f) => f.gtfNumber)).size, [filas]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-[var(--data-warning-600)]" />
          <CardTitle className="text-sm font-bold">
            Guías que no cuadran{" "}
            {filas != null && <span className="text-[var(--text-tertiary)]">({filas.length})</span>}
          </CardTitle>
        </div>
        <Btn variant="secondary" onClick={() => void barrer()} disabled={cargando}>
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Rebarrer
        </Btn>
      </div>

      <p className="text-sm text-[var(--text-secondary)]">
        Lo que cruza un fiscalizador al entrar: si un asiento declara un volumen y su lista de trozas suma otro. Se
        barre <b>todo el libro</b>, no sólo el período — una guía vieja sin cuadrar traba el consumo de hoy.
      </p>

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {filas == null ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cruzando cada ingreso con su lista de piezas…
        </p>
      ) : filas.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-[var(--data-success-500)]/10 p-3 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Todos los ingresos con lista de piezas cuadran con lo que declaran.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
            <TablaCtp>
              <TheadCtp>
                <tr>
                  <th className="px-3 py-2 text-left font-bold">N° libro</th>
                  <th className="px-3 py-2 text-left font-bold">Guía</th>
                  <th className="px-3 py-2 text-left font-bold">Especie</th>
                  <th className="px-3 py-2 text-right font-bold">Declara (37)</th>
                  <th className="px-3 py-2 text-right font-bold">Lista (35)</th>
                  <th className="px-3 py-2 text-right font-bold">Brecha</th>
                  <th className="px-3 py-2 text-right font-bold">Acción</th>
                </tr>
              </TheadCtp>
              <TbodyCtp>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-tertiary)]">
                      {f.libroNro ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{f.gtfNumber}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{f.especie}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {fmtM3(f.declarado)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {fmtM3(f.lista)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      {f.brecha > 0 ? "+" : ""}
                      {fmtM3(f.brecha)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Btn
                        variant="secondary"
                        onClick={() => setCuadre({ gtfNumber: f.gtfNumber, ids: idsDe(f.gtfNumber) })}
                      >
                        <Scale className="h-4 w-4" /> Cuadrar
                      </Btn>
                    </td>
                  </tr>
                ))}
              </TbodyCtp>
            </TablaCtp>
          </div>

          <p className="text-xs text-[var(--text-tertiary)]">
            <b className="font-mono tabular-nums">{fmtM3(brechaTotal)} m³</b> de brecha en {guias} guía
            {guias === 1 ? "" : "s"}.
            {truncado && ` Se barrieron los primeros ${PAGINA * PAGINAS_MAX} ingresos del libro: puede haber más.`}
          </p>
        </>
      )}

      {cuadre && (
        <CtpCuadrarGuiaModal
          gtfNumber={cuadre.gtfNumber}
          subtitulo="Desde el chequeo del libro"
          entryIds={cuadre.ids}
          onCuadrada={() => {
            invalidarCtp("wood-entries");
            void barrer();
          }}
          onClose={() => setCuadre(null)}
        />
      )}
    </section>
  );
}
