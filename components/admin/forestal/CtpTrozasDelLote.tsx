"use client";

/**
 * «Lista de trozas del lote» — la tabla del LO-CTP del SNIFFS.
 *
 * Las mismas columnas del formato oficial y en su orden: fecha de consumo, N° de
 * GTF, nombre científico / común, código de planta (con su buscador en la
 * cabecera, como el papel), D1, D2, largo, volumen y **Seleccionar**.
 *
 * Es una tabla distinta de la del patio (`CtpTrozasIngresadas`) a propósito: esa
 * ayuda a ARMAR el lote —muestra estado, lote donde está apartada, qué la
 * bloquea— y ésta muestra lo que un fiscalizador lee de una corrida. Acá el
 * operador no elige de dónde saca la madera: elige cuáles de SUS trozas entran
 * hoy a la sierra.
 *
 * En `soloLectura` la misma tabla sirve para MIRAR una corrida que ya consumió:
 * esas piezas son un hecho registrado y no se destildan. Es la misma lista, con
 * las mismas columnas del formato — cambiarla por otra tabla haría que la madera
 * se lea distinto según desde dónde se la mire.
 */

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Search } from "@buleje/design-system/icons";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

/** `AAAA-MM-DD` o ISO → `DD/MM/AAAA` en UTC (las fechas del libro son date-only). */
const fmtDia = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00.000Z` : v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
};
const num = (v: number | null | undefined, dec: number) => (v == null ? "—" : Number(v).toFixed(dec));

/** Sin selección (modo lectura): una constante, no un `new Set()` por render. */
const SIN_SELECCION: ReadonlySet<string> = new Set<string>();

export default function CtpTrozasDelLote({
  trozas,
  seleccion,
  onSeleccion,
  /** Día que se va a declarar como consumo: la columna lo muestra por adelantado. */
  fechaConsumo,
  cargando,
  vacio,
  /** La franja del formato. En una corrida ya consumida no son «del lote». */
  titulo = "Lista de trozas del lote",
  /** Ya entraron a la sierra: se miran, no se eligen. */
  soloLectura = false,
  /**
   * Qué significa tildar en ESTA tabla. Armando el lote es «Seleccionar» (cuáles
   * entran); mirando una corrida es «A producción» (cuáles quedan adentro).
   * Misma columna, dos preguntas — y el encabezado tiene que decir cuál.
   */
  etiquetaSeleccion = "Seleccionar",
}: {
  trozas: TrozaConsumible[];
  /** Opcionales en `soloLectura`: ahí no hay nada que tildar. */
  seleccion?: ReadonlySet<string>;
  onSeleccion?: (s: Set<string>) => void;
  fechaConsumo: string;
  cargando?: boolean;
  vacio?: string;
  titulo?: string;
  soloLectura?: boolean;
  etiquetaSeleccion?: string;
}) {
  /** Buscador de la cabecera «Cod. Planta», igual que el formato. */
  const [busca, setBusca] = useState("");
  const marcadas = seleccion ?? SIN_SELECCION;

  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return trozas;
    return trozas.filter((t) =>
      [t.codigoPlanta, t.codificacion, t.gtfNumber].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [trozas, busca]);

  const todas = filas.length > 0 && filas.every((t) => marcadas.has(t.id));
  /* En lectura la cuenta es la de TODA la corrida: no hay elegidas y decir
     «0 de 12» sobre madera que ya entró a la sierra sería mentir. */
  const elegidas = soloLectura ? trozas : trozas.filter((t) => marcadas.has(t.id));
  const volumen = Math.round(elegidas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000;

  const alternarTodas = (checked: boolean) => {
    const s = new Set(marcadas);
    for (const t of filas) {
      if (checked) s.add(t.id);
      else s.delete(t.id);
    }
    onSeleccion?.(s);
  };

  /**
   * SHIFT + clic tilda el rango, como cualquier tabla.
   *
   * Con sesenta piezas, ir de a una es el cuello de botella real del turno: el
   * operador sabe que entran «de la 3037752 a la 3037790» y tenía que dar
   * treinta y nueve clics. El ancla es la última fila tocada, y el rango se
   * cuenta sobre lo que se VE (filas filtradas), no sobre el array entero —
   * si no, un rango visual tildaría piezas escondidas por el buscador.
   */
  const ancla = useRef<number | null>(null);
  const alTocarFila = (indice: number, shift: boolean) => {
    const fila = filas[indice];
    if (!fila) return;
    const s = new Set(marcadas);
    const destino = !marcadas.has(fila.id);
    if (shift && ancla.current != null && ancla.current !== indice) {
      const desde = Math.min(ancla.current, indice);
      const hasta = Math.max(ancla.current, indice);
      for (let i = desde; i <= hasta; i++) {
        if (destino) s.add(filas[i].id);
        else s.delete(filas[i].id);
      }
    } else if (destino) {
      s.add(fila.id);
    } else {
      s.delete(fila.id);
    }
    ancla.current = indice;
    onSeleccion?.(s);
  };

  /**
   * Y el rango POR CÓDIGO, que es como se habla en el patio: «de la 752 a la
   * 790». Los códigos de planta son un correlativo numérico, así que se comparan
   * como números cuando lo son; si alguien numeró a mano (29/A), cae a texto.
   * Se aplica sobre las filas visibles, por lo mismo que el shift.
   */
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const codigoDe = (t: TrozaConsumible) => (t.codigoPlanta || t.codificacion || "").trim();
  const enRango = (codigo: string, a: string, b: string) => {
    const [na, nb, nc] = [Number(a), Number(b), Number(codigo)];
    if (Number.isFinite(na) && Number.isFinite(nb) && Number.isFinite(nc) && codigo !== "") {
      return nc >= Math.min(na, nb) && nc <= Math.max(na, nb);
    }
    const [x, y] = a.localeCompare(b) <= 0 ? [a, b] : [b, a];
    return codigo.localeCompare(x) >= 0 && codigo.localeCompare(y) <= 0;
  };
  const enElRango = useMemo(() => {
    if (!desde.trim() || !hasta.trim()) return [];
    return filas.filter((t) => {
      const c = codigoDe(t);
      return c !== "" && enRango(c, desde.trim(), hasta.trim());
    });
  }, [filas, desde, hasta]);
  const aplicarRango = (sumar: boolean) => {
    const s = new Set(marcadas);
    for (const t of enElRango) {
      if (sumar) s.add(t.id);
      else s.delete(t.id);
    }
    onSeleccion?.(s);
  };

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {/* La franja de título del formato. */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] bg-[var(--data-success-50)] px-4 py-2 dark:bg-[var(--data-success-500)]/10">
        <p className="text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          {titulo}
        </p>
        <p className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
          {soloLectura ? (
            <>
              <b className="text-[var(--text-primary)]">{trozas.length}</b> troza
              {trozas.length === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <b className="text-[var(--text-primary)]">{elegidas.length}</b> de {trozas.length} elegida
              {elegidas.length === 1 ? "" : "s"}
            </>
          )}{" "}
          · {volumen.toFixed(4)} m³ · {pieTablarDe(volumen).toLocaleString("es-PE")} pt
        </p>
      </header>

      {/**
       * Elegir por CÓDIGO y no fila por fila. Aparece sólo con suficientes
       * piezas: con cuatro trozas, dos inputs de rango son más ruido que ayuda.
       */}
      {!soloLectura && trozas.length > 5 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Elegir por código
          </span>
          <input
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            placeholder="desde"
            aria-label="Código de planta desde"
            className="h-9 w-28 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          <span className="text-sm text-[var(--text-tertiary)]">a</span>
          <input
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            placeholder="hasta"
            aria-label="Código de planta hasta"
            className="h-9 w-28 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
          {/* Cuántas caen en el rango, ANTES de aplicarlo: un botón que dice
              «tildar» sin decir cuántas invita a probar y deshacer. */}
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            {desde.trim() && hasta.trim() ? `${enElRango.length} en el rango` : "—"}
          </span>
          <button
            type="button"
            disabled={enElRango.length === 0}
            onClick={() => aplicarRango(true)}
            className="h-9 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-40"
          >
            Tildar
          </button>
          <button
            type="button"
            disabled={enElRango.length === 0}
            onClick={() => aplicarRango(false)}
            className="h-9 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] disabled:opacity-40"
          >
            Destildar
          </button>
          <span className="ml-auto text-sm text-[var(--text-tertiary)]">
            o <b className="text-[var(--text-secondary)]">Shift + clic</b> para tildar de una fila a otra
          </span>
        </div>
      )}

      <TablaCtp className="rounded-none border-0" altoMax="max-h-[52vh]">
        <TheadCtp>
          <tr>
            <th className="px-3 py-2 font-bold">Fecha consumo</th>
            <th className="px-3 py-2 font-bold">Nro GTF</th>
            <th className="px-3 py-2 font-bold">Nombre científico / Nombre común</th>
            <th className="px-3 py-2 font-bold">
              <span className="block">Cod. planta</span>
              {/* El buscador vive en la cabecera de su columna, como el formato:
                  con sesenta piezas, encontrar «la 3037752» es lo primero. */}
              <span className="relative mt-1 block">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar"
                  aria-label="Buscar una troza por código de planta o GTF"
                  className="h-8 w-full min-w-28 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] pl-7 pr-2 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </span>
            </th>
            <th className="px-3 py-2 text-right font-bold">D1 (cm)</th>
            <th className="px-3 py-2 text-right font-bold">D2 (cm)</th>
            <th className="px-3 py-2 text-right font-bold">Long. (m)</th>
            <th className="px-3 py-2 text-right font-bold">Volumen (m³)</th>
            <th className="px-3 py-2 text-center font-bold">
              {soloLectura ? (
                <span className="block">Estado</span>
              ) : (
                <>
                  <span className="block whitespace-nowrap">{etiquetaSeleccion}</span>
                  <input
                    type="checkbox"
                    checked={todas}
                    onChange={(e) => alternarTodas(e.target.checked)}
                    aria-label={`${etiquetaSeleccion}: todas las trozas de la lista`}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  />
                </>
              )}
            </th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {filas.length === 0 && (
            <FilaVacia cols={9}>
              {cargando
                ? "Leyendo las trozas del lote…"
                : trozas.length === 0
                  ? (vacio ?? "Este lote no tiene trozas apartadas.")
                  : "Ninguna troza coincide con la búsqueda."}
            </FilaVacia>
          )}
          {filas.map((t, indice) => {
            /* En lectura la fila va marcada siempre: esa madera YA entró. */
            const elegida = soloLectura || marcadas.has(t.id);
            return (
              <tr
                key={t.id}
                className={elegida ? "bg-[var(--data-success-500)]/10" : "hover:bg-[var(--surface-sunken)]"}
              >
                {/* La fecha que se va a declarar: en blanco no dice nada, y el
                    operador tiene que ver con qué día va a quedar el consumo. */}
                <td className="px-3 py-2 text-sm tabular-nums text-[var(--text-secondary)]">
                  {elegida ? fmtDia(fechaConsumo) : <span className="text-[var(--text-tertiary)]">—</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{t.gtfNumber ?? "—"}</td>
                <td className="px-3 py-2 text-sm text-[var(--text-secondary)]">
                  {t.especieCientifica && <i className="block text-[var(--text-tertiary)]">{t.especieCientifica}</i>}
                  {t.especieComun ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-sm font-bold text-[var(--text-primary)]">
                  {t.codigoPlanta || t.codificacion || "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{num(t.d1Cm, 2)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{num(t.d2Cm, 2)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{num(t.largoM, 2)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                  {num(t.volumenM3, 4)}
                </td>
                <td className="px-3 py-2 text-center">
                  {soloLectura ? (
                    <span
                      className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                      title="Esta pieza ya entró a la sierra en esta corrida: es un hecho registrado."
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      En la sierra
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={elegida}
                      /* En `onClick` y no en `onChange`: es el único que trae el
                         `shiftKey`, que es lo que convierte un clic en un rango.
                         `preventDefault` deja que el estado mande — si no, el
                         navegador tilda por su cuenta y parpadea. */
                      onClick={(ev) => {
                        ev.preventDefault();
                        alTocarFila(indice, ev.shiftKey);
                      }}
                      onChange={() => {}}
                      aria-label={`Elegir la troza ${t.codigoPlanta || t.codificacion || t.id}`}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </TbodyCtp>
      </TablaCtp>
    </section>
  );
}
