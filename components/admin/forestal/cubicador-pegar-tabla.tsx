"use client";

/**
 * La «tabla para pegar» del cubicador (Brandon 25-10: «quiero una tabla para
 * pegarlo con sus respectivas columnas… copiar una columna entera y pegarlo, o
 * varias columnas»). Se usa como Excel: clic en una celda y Ctrl+V pega desde
 * ahí hacia abajo y a la derecha; con títulos, cada columna cae en la suya.
 * Flechas, Enter, Supr, Ctrl+Z y Ctrl+C como en la hoja. La cuenta de cada
 * fila es la del cubicador (`lib/forestal/cubicacion-pegar.ts`).
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { DataTable } from "@buleje/design-system";
import { Eraser, Undo2, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Btn } from "./ctp-shared";
import { useTecladoGrilla } from "./celdas-excel";
import {
  COLUMNAS_PEGAR, pareceTabla, rangoATexto, tituloDeColumna, type ResumenPegado, type UnidadesPegar,
} from "@/lib/forestal/cubicacion-pegar";
import { esRangoDeVarias, useTablaPegar } from "./hooks/use-tabla-pegar";
import { FilaParaPegar, GRILLA_PEGAR, LISTA_ESPECIES_PEGAR, type ManejoCeldas } from "./cubicador-pegar-fila";

const COLUMNAS_IDX = COLUMNAS_PEGAR.map((_, k) => k);
const FLECHAS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const ANCHO_COL: Record<(typeof COLUMNAS_PEGAR)[number], string> = {
  cantidad: "w-16", espesor: "w-24", ancho: "w-24", largo: "w-24", especie: "w-36", dueno: "w-32", observacion: "w-40",
};
const UNIDADES_DE: Partial<Record<(typeof COLUMNAS_PEGAR)[number], { columna: keyof UnidadesPegar; opciones: [string, string][] }>> = {
  espesor: { columna: "espesor", opciones: [["pulg", "″"], ["cm", "cm"]] },
  ancho: { columna: "ancho", opciones: [["pulg", "″"], ["cm", "cm"]] },
  largo: { columna: "largo", opciones: [["pies", "pies"], ["m", "m"]] },
};
/** La celda de la tabla donde pasó el evento (`null` = la caja, fuera de una celda). */
function celdaDe(el: EventTarget) {
  if (!(el instanceof HTMLElement) || el.dataset.fila === undefined) return null;
  return { fila: Number(el.dataset.fila), col: Number(el.dataset.col) };
}

const SELECT_UNIDAD =
  "h-8 w-full max-w-20 rounded-md border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-1 text-xs font-semibold normal-case text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function TablaParaPegar({
  textoInicial, especies, onCambio,
}: {
  /** Lo que se pegó con Ctrl+V en la vista Cargar: la tabla abre ya llena. */
  textoInicial: string | null;
  /** Las especies del negocio: lo escrito se ajusta a ellas; la que falta entra con aviso. */
  especies: readonly string[];
  onCambio: (r: ResumenPegado) => void;
}) {
  const t = useTablaPegar(textoInicial, especies);
  const { filas, unidades, rango, leidas, resumen, pegar, escribir, seleccionar, extender, borrarRango, deshacer } = t;
  useEffect(() => { onCambio(resumen); }, [resumen, onCambio]);

  const cajaRef = useRef<HTMLDivElement>(null);
  const rangoRef = useRef(rango);
  rangoRef.current = rango;
  const filasRef = useRef(filas);
  filasRef.current = filas;
  const arrastrando = useRef(false);

  const navegar = useTecladoGrilla({ grilla: GRILLA_PEGAR, totalFilas: filas.length, columnas: COLUMNAS_IDX });

  const manejo = useMemo<ManejoCeldas>(() => ({
    onEscribir: escribir,
    onFoco: (fila, col) => seleccionar({ fila, col }, false),
    onKeyDown: (e) => {
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (k === "z" || k === "Z")) { e.preventDefault(); deshacer(); return; }
      if (e.shiftKey && FLECHAS[k]) { e.preventDefault(); extender(...FLECHAS[k]); return; }
      if ((k === "Delete" || k === "Backspace") && esRangoDeVarias(rangoRef.current)) { e.preventDefault(); borrarRango(); return; }
      navegar(e);
    },
    onMouseDown: (e) => {
      const celda = celdaDe(e.currentTarget);
      if (!celda) return;
      if (e.shiftKey) { e.preventDefault(); seleccionar(celda, true); return; }
      arrastrando.current = true;
    },
    onMouseEnter: (e) => {
      const celda = celdaDe(e.currentTarget);
      if (celda && arrastrando.current && e.buttons === 1) seleccionar(celda, true);
    },
  }), [escribir, seleccionar, deshacer, extender, borrarRango, navegar]);

  /* Escape en una celda sale de la celda, no cierra la ventana con lo pegado:
     Radix escucha Escape en `document` en captura, así que hay que llegar antes
     (en `window`). Con el foco en la caja, el segundo Escape sí cierra (lo
     cargado queda guardado para cuando vuelvas). */
  useEffect(() => {
    const alEscape = (e: KeyboardEvent) => {
      const el = e.target;
      if (e.key !== "Escape" || !(el instanceof HTMLElement) || el === cajaRef.current || !cajaRef.current?.contains(el)) return;
      e.stopPropagation();
      e.preventDefault();
      cajaRef.current.focus({ preventScroll: true });
    };
    const soltar = () => { arrastrando.current = false; };
    window.addEventListener("keydown", alEscape, true);
    window.addEventListener("mouseup", soltar);
    return () => { window.removeEventListener("keydown", alEscape, true); window.removeEventListener("mouseup", soltar); };
  }, []);

  const alPegar = useCallback((e: React.ClipboardEvent) => {
    const texto = e.clipboardData.getData("text/plain");
    const r = rangoRef.current;
    const celda = celdaDe(e.target);
    /* Lo marcado manda sólo si se pega DENTRO de lo marcado: una celda de afuera
       es un clic nuevo que el render todavía no pasó al ref. */
    const enLoMarcado = esRangoDeVarias(r) && (!celda || (celda.fila >= r.f0 && celda.fila <= r.f1 && celda.col >= r.c0 && celda.col <= r.c1));
    // Un valor suelto en una celda sola: que lo pegue el navegador, como siempre.
    if (!texto || (!pareceTabla(texto) && !enLoMarcado)) return;
    e.preventDefault();
    pegar(texto, enLoMarcado ? { fila: r.f0, col: r.c0 } : celda);
  }, [pegar]);

  const alCopiar = useCallback((e: React.ClipboardEvent) => {
    const r = rangoRef.current;
    if (!esRangoDeVarias(r)) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", rangoATexto(filasRef.current, r));
  }, []);

  const titulos = useMemo(() => COLUMNAS_PEGAR.map((c) => tituloDeColumna(c, unidades)), [unidades]);
  const varias = esRangoDeVarias(rango);
  const fueraDeLista = useMemo(
    () => [...new Set(leidas.flatMap((l) => (l.avisos.especie && l.pieza?.especie ? [l.pieza.especie] : [])))],
    [leidas],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="flex min-w-0 flex-1 items-start gap-1.5 text-sm text-[var(--text-secondary)] max-sm:basis-full">
          {t.aviso ?? "Haz clic en una celda y pega con Ctrl+V: una columna baja desde ahí; varias, a la derecha."}
          {t.aviso && (
            <button type="button" onClick={t.cerrarAviso} aria-label="Cerrar el aviso" className="shrink-0 rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X className="h-4 w-4" />
            </button>
          )}
        </p>
        <InfoTip
          icono="ayuda"
          title="Pegar desde Excel"
          what="Copia en tu Excel una columna o varias (con sus títulos, si quieres) y pégalas acá. Con títulos, cada columna va a la suya aunque estén en otro orden; sin títulos, desde la celda donde hiciste clic."
          affects="Coma o punto decimal, «2 1/2» y celdas vacías valen. La fila en rojo dice por qué y no entra al lote; PT y m³ se ven por fila con la cuenta del cubicador."
          example="Copias Largo de 30 tablas → clic en Largo de la fila 1 → Ctrl+V. Marcas varias celdas (Shift+flechas o arrastrando) y Supr las vacía; Ctrl+Z deshace."
        />
        <Btn variant="ghost" size="sm" onClick={deshacer} disabled={!t.puedeDeshacer}>
          <Undo2 className="h-4 w-4" /> Deshacer
        </Btn>
        <Btn variant="ghost" size="sm" onClick={t.vaciar} disabled={resumen.piezas.length === 0 && resumen.filasConError === 0}>
          <Eraser className="h-4 w-4" /> Vaciar
        </Btn>
      </div>

      <div
        ref={cajaRef}
        tabIndex={-1}
        data-grilla={GRILLA_PEGAR}
        onPaste={alPegar}
        onCopy={alCopiar}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <DataTable
          planilla
          stickyHeader
          wrapperClassName="max-h-[min(55vh,480px)] overflow-auto"
          /* hoja-grilla: en el celular sigue siendo tabla (sin ella el DataTable la vuelve tarjetas) y se desplaza en su caja. */
          className="hoja-grilla min-w-[56rem] table-fixed [&_thead_th]:align-top [&_tbody_td]:!px-1 [&_tbody_td]:!py-1 [&_thead_th]:!px-1.5 [&_thead_th]:!py-1.5"
        >
          <thead>
            <tr>
              <th className="w-10 text-center">#</th>
              {COLUMNAS_PEGAR.map((c, k) => {
                const u = UNIDADES_DE[c];
                return (
                  <th key={c} className={ANCHO_COL[c]}>
                    {/* La unidad en una 2.ª línea: al lado del título no entraba («pie» salía cortado). */}
                    <span className="flex flex-col items-start gap-1">
                      {u ? tituloDeColumna(c, unidades).split(" ")[0] : titulos[k]}
                      {u && (
                        <select
                          aria-label={`Unidad del ${tituloDeColumna(c, unidades).split(" ")[0].toLowerCase()}`}
                          value={unidades[u.columna]}
                          onChange={(e) => t.cambiarUnidad(u.columna, e.target.value)}
                          className={SELECT_UNIDAD}
                        >
                          {u.opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      )}
                    </span>
                  </th>
                );
              })}
              <th className="w-16 text-right">PT</th>
              <th className="w-20 text-right">m³</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const enRango = varias && rango && i >= rango.f0 && i <= rango.f1;
              return (
                <FilaParaPegar
                  key={i}
                  i={i}
                  fila={f}
                  leida={leidas[i]}
                  selC0={enRango ? rango.c0 : -1}
                  selC1={enRango ? rango.c1 : -1}
                  titulos={titulos}
                  manejo={manejo}
                />
              );
            })}
          </tbody>
        </DataTable>
        <datalist id={LISTA_ESPECIES_PEGAR}>
          {especies.map((e) => <option key={e} value={e} />)}
        </datalist>
      </div>

      {/* Piezas, PT y m³ van en el pie de la ventana, a la vista aunque la tabla se desplace. */}
      {fueraDeLista.length > 0 && (
        <p className="text-sm text-[var(--data-warning-ink)]">
          No están en tu lista (entran igual): {fueraDeLista.join(", ")}
        </p>
      )}
    </div>
  );
}
