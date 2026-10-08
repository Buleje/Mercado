"use client";

/**
 * CubicadorTrozas — cubica madera ROLLIZA en patio, por voz o a mano.
 *
 * Dos fórmulas, cada una con SU lote (`cubicacion-trozas-formula.ts`):
 *   - Smalian (m³): Ø en cm, largo en m; se coteja contra lo que declara la GTF.
 *   - Oxapampina (PT): Ø en pulgadas, largo en pies, PT = Ø × Ø × L ÷ 24,5
 *     (ADR-440) — con lo que se compra, se vende y se paga el flete. Sin m³.
 * Un Ø al medio o dos puntas («2 diámetros», se promedian): el dictado va en
 * pares «Ø largo» o en tríos «Ø Ø largo». Una troza con medidas raras entra
 * RESALTADA, nunca se corrige sola. Persiste por tenant en localStorage; sin
 * DB — el ingreso legal se registra en el Libro CTP con su GTF.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import type { TrozaImportada } from "@/lib/forestal/cubicacion-trozas-import";
import {
  claveDiametrosTrozas, claveFormulaTrozas, claveLoteTrozas, conVolumen, diametroUnico, DIAMETROS_POR_DEFECTO,
  esDiametrosPorTroza, esFormulaTrozas, fueraDeRango, medidasEnVoz, patioACsv, RANGO_FORMULA, resumenDelPatio, totalesSegun,
  UNIDADES_FORMULA, type DiametrosPorTroza, type FormulaTrozas,
} from "@/lib/forestal/cubicacion-trozas-formula";
import { loadConfig } from "@/lib/forestal/cubicador-config";
import { useLecturaEnVoz, type ContextoLectura } from "@/hooks/use-lectura-en-voz";
import {
  acomodarAlOrden, enOrdenDelPapel, esOrdenFilas, ordenarFilas, textoPorTramos, ultimaAnotada,
  unidadDeLargoEnVoz, type LargoEnLectura, type OrdenFilas,
} from "@/lib/forestal/cubicador-bloques-especie";
import { formatNumber } from "@/lib/format";
import ControlLecturaFlotante from "./cubicador-lectura-flotante";
import ImportarTrozasModal from "./ImportarTrozasModal";
import { useEspeciesConCatalogo } from "./ctp-especie-campo";
import KpisPatioTrozas from "./cubicador-trozas-kpis";
import CotejoGtfBloque, { useCotejoGtf } from "./cubicador-trozas-gtf";
import TablaPatioTrozas, { type CampoTroza, type FilaTroza } from "./cubicador-trozas-tabla";
import BarraPatioTrozas, { COLS_DEFAULT_TROZA, type ColOpcionalTroza } from "./cubicador-trozas-barra";
import PanelVozTrozas from "./cubicador-trozas-voz";
import CuentaDelPatio from "./cubicador-trozas-guardadas";
import { useDictadoTrozas } from "./hooks/use-dictado-trozas";

type Fila = FilaTroza;

const tenantSlug = () => {
  try { return localStorage.getItem("active-tenant-slug") ?? "main"; } catch { return "main"; }
};
/** Clave base del tenant (la del lote Smalian): de ahí cuelgan `-cols`, `-orden`, `-gtf`, `-formula`, `-diametros`. */
const storageKey = () => claveLoteTrozas(tenantSlug(), "smalian");
const leerLote = (f: FormulaTrozas): Fila[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(claveLoteTrozas(tenantSlug(), f)) ?? "[]");
    return Array.isArray(v) ? (v as Fila[]) : [];
  } catch { return []; }
};
const guardarLote = (f: FormulaTrozas, rows: Fila[]) => {
  try { localStorage.setItem(claveLoteTrozas(tenantSlug(), f), JSON.stringify(rows)); } catch { /* quota */ }
};
const acomodarTrozas = (filas: Fila[], orden: OrdenFilas): Fila[] => acomodarAlOrden(filas, orden);

/** El largo al leer con «Largo fijo al leer»: en metros o en pies según la fórmula. */
const largoEnVoz = (formula: FormulaTrozas, diametros: DiametrosPorTroza): LargoEnLectura<Fila> => ({
  largo: (t) => t.largo,
  unidad: (_t, valor) => unidadDeLargoEnVoz(UNIDADES_FORMULA[formula].largo, valor),
  sinLargo: (t) => (diametros === 1 ? String(diametroUnico(t)) : `${t.d1}, ${t.d2}`),
});

export default function CubicadorTrozas() {
  const [rows, setRows] = useState<Fila[]>([]);
  const [especie, setEspecie] = useState("");
  const [lastAdded, setLastAdded] = useState<Fila | null>(null);
  const [importando, setImportando] = useState(false);
  /**
   * La fórmula elegida y cuántos Ø se miden con cada una — recordadas por
   * tenant. Por REF también: el reconocedor de voz las lee en medio de una frase.
   */
  const [formula, setFormula] = useState<FormulaTrozas>("smalian");
  const formulaRef = useRef<FormulaTrozas>("smalian");
  const [diametrosPor, setDiametrosPor] = useState<Record<FormulaTrozas, DiametrosPorTroza>>({ ...DIAMETROS_POR_DEFECTO });
  const diametros = diametrosPor[formula];
  const diametrosRef = useRef<DiametrosPorTroza>(diametros);
  diametrosRef.current = diametros;
  /** Columnas opcionales ocultas/mostradas — por tenant, hasta que se cambie. */
  const [colsVisibles, setColsVisibles] = useState<Record<ColOpcionalTroza, boolean>>(COLS_DEFAULT_TROZA);
  /**
   * Orden del patio: como se dictó, más nuevas primero o en bloques de especie
   * — la misma regla que el cubicador de aserrada. REORDENA las filas: el «#»,
   * la lectura y el CSV siguen lo que se ve. Se recuerda por tenant.
   */
  const [ordenFilas, setOrdenFilas] = useState<OrdenFilas>("dictado");
  const ordenRef = useRef<OrdenFilas>("dictado");
  useEffect(() => {
    try {
      const base = storageKey();
      const cols = localStorage.getItem(`${base}-cols`);
      if (cols) setColsVisibles({ ...COLS_DEFAULT_TROZA, ...(JSON.parse(cols) as Partial<Record<ColOpcionalTroza, boolean>>) });
      const orden = localStorage.getItem(`${base}-orden`);
      if (esOrdenFilas(orden)) { ordenRef.current = orden; setOrdenFilas(orden); }
      const f = localStorage.getItem(claveFormulaTrozas(tenantSlug()));
      if (esFormulaTrozas(f)) { formulaRef.current = f; setFormula(f); }
      const d = JSON.parse(localStorage.getItem(claveDiametrosTrozas(tenantSlug())) ?? "{}") as Partial<Record<FormulaTrozas, unknown>>;
      setDiametrosPor({
        smalian: esDiametrosPorTroza(d.smalian) ? d.smalian : DIAMETROS_POR_DEFECTO.smalian,
        oxapampina: esDiametrosPorTroza(d.oxapampina) ? d.oxapampina : DIAMETROS_POR_DEFECTO.oxapampina,
      });
    } catch { /* ignore */ }
    setRows(leerLote(formulaRef.current));
  }, []);
  useEffect(() => { try { localStorage.setItem(`${storageKey()}-cols`, JSON.stringify(colsVisibles)); } catch { /* quota */ } }, [colsVisibles]);
  const idRef = useRef(0);
  const especieRef = useRef(especie);
  useEffect(() => { especieRef.current = especie; }, [especie]);
  /* El catálogo de la planta (ADR-410), el mismo que el cubicador de aserrada. */
  const catalogoEspecies = useEspeciesConCatalogo();
  const rowsRef = useRef<Fila[]>(rows);
  rowsRef.current = rows;
  const saveLocal = (next: Fila[]) => guardarLote(formulaRef.current, next);

  const addTroza = (d1: number, d2: number, largo: number, sospechosa?: boolean) => {
    const fila: Fila = {
      ...conVolumen(formulaRef.current, { id: `t-${Date.now()}-${idRef.current++}`, d1, d2, largo, especie: especieRef.current || undefined }),
      sospechosa,
    };
    /* Con el orden por especie, la troza nueva cae al final de SU bloque. */
    setRows((prev) => { const next = acomodarTrozas([...prev, fila], ordenRef.current); saveLocal(next); return next; });
    setLastAdded(fila);
    return fila;
  };

  /* El dictado por voz (comandos, especie sola, pares y tríos): `use-dictado-trozas`. */
  const { voz, paused, olvidarSobrante } = useDictadoTrozas({
    formulaRef, diametrosRef, rowsRef, especieRef, setEspecie,
    especiesCatalogo: catalogoEspecies.nombres,
    addTroza,
    borrarUltima: () => {
      /* Agrupado por especie, la última fila no es la última dictada. */
      setRows((prev) => {
        if (!prev.length) return prev;
        const victima = ultimaAnotada(prev, ordenRef.current);
        const next = prev.filter((r) => r.id !== victima?.id);
        saveLocal(next);
        return next;
      });
      setLastAdded(null);
    },
  });

  const persist = (next: Fila[]) => { const acomodadas = acomodarTrozas(next, ordenRef.current); setRows(acomodadas); saveLocal(acomodadas); };
  const borrar = (id: string) => { persist(rows.filter((r) => r.id !== id)); if (lastAdded?.id === id) setLastAdded(null); };
  const deshacer = () => { if (lastAdded) borrar(lastAdded.id); };
  const limpiar = () => { persist([]); setLastAdded(null); olvidarSobrante(); };
  /** El import SUMA al patio, nunca reemplaza (mismo criterio que la aserrada). Se
   *  recubica con la fórmula del lote abierto: la plantilla Oxapampina viene en
   *  pulgadas y pies, y su volumen es PT, no m³. */
  const agregarImportadas = (nuevas: TrozaImportada[]) => {
    const f = formulaRef.current;
    persist([
      ...rows,
      ...nuevas.map(({ filaOrigen: _filaOrigen, sospechosa, ...t }) =>
        f === "smalian" ? { ...t, sospechosa } : { ...conVolumen(f, t), sospechosa: fueraDeRango(f, t.d1, t.d2, t.largo) || undefined },
      ),
    ]);
  };
  const editar = (id: string, campo: CampoTroza, valor: number) => {
    persist(rows.map((r) => {
      if (r.id !== id) return r;
      const upd = campo === "d" ? { ...r, d1: valor, d2: valor } : { ...r, [campo]: valor };
      return { ...conVolumen(formula, upd), sospechosa: undefined };
    }));
  };

  const totales = useMemo(() => totalesSegun(rows, formula), [rows, formula]);
  const resumen = useMemo(() => resumenDelPatio(rows, formula), [rows, formula]);
  const cotejo = useCotejoGtf(storageKey(), formula === "smalian" ? totales.volumen : 0);
  const u = UNIDADES_FORMULA[formula];
  const ox = formula === "oxapampina";

  /**
   * Leer el patio en voz alta, troza por troza — la misma mecánica que el
   * cubicador de madera (`use-lectura-en-voz`). Por tramos de especie y, con
   * «Largo fijo al leer», 5+ trozas del mismo largo se leen «largo fijo 12
   * pies» y después sólo los diámetros.
   */
  const lectura = useLecturaEnVoz<Fila>({
    rate: () => loadConfig().voiceRate,
    voiceURI: () => loadConfig().voiceURI,
    pitch: () => loadConfig().voicePitch,
    volume: () => loadConfig().voiceVolume,
    /* Micrófono y parlante no pueden ir a la vez: lo leído entraría como troza nueva. */
    onAntesDeArrancar: () => { if (voz.listening) voz.toggle(); },
    idDeFila: (id) => `troza-row-${id}`,
  });
  const textoTroza = useCallback(
    (t: Fila, ctx: ContextoLectura<Fila>) =>
      textoPorTramos(
        t, ctx, (x) => medidasEnVoz(x, diametrosRef.current),
        loadConfig().largoFijoAlLeer ? largoEnVoz(formulaRef.current, diametrosRef.current) : undefined,
      ),
    [],
  );
  const leerPatio = useCallback(() => lectura.leer(() => rowsRef.current, textoTroza), [lectura, textoTroza]);
  const sospechosas = rows.filter((r) => r.sospechosa).length;
  const especiesActuales = useMemo(
    () => [...new Set(rows.map((r) => r.especie?.trim()).filter((e): e is string => !!e))],
    [rows],
  );
  /** Con una sola especie no hay nada que agrupar, salvo para volver a como se dictó. */
  const hayQueAgrupar = especiesActuales.length + (rows.some((r) => !r.especie?.trim()) ? 1 : 0) > 1 || ordenFilas === "especie";
  /* «Más nuevas primero» (2026-09-23) sirve con una sola especie también. */
  const hayQueOrdenar = rows.length > 1 || ordenFilas !== "dictado";
  /** Cambia el orden y REORDENA el patio. Corta la lectura: seguir por el mismo
   *  índice en otro orden nombraría otra troza que la que se ve. */
  const cambiarOrden = (orden: OrdenFilas) => {
    ordenRef.current = orden;
    setOrdenFilas(orden);
    try { localStorage.setItem(`${storageKey()}-orden`, orden); } catch { /* ignore */ }
    if (lectura.activa()) lectura.detener();
    persist(ordenarFilas(rowsRef.current, orden));
  };
  /** Otra fórmula = OTRO lote: se abre el suyo, no se convierten las medidas. */
  const cambiarFormula = (f: FormulaTrozas) => {
    if (f === formulaRef.current) return;
    if (lectura.activa()) lectura.detener();
    formulaRef.current = f;
    setFormula(f);
    try { localStorage.setItem(claveFormulaTrozas(tenantSlug()), f); } catch { /* ignore */ }
    setRows(acomodarTrozas(leerLote(f), ordenRef.current));
    setLastAdded(null);
    olvidarSobrante();
  };
  const cambiarDiametros = (d: DiametrosPorTroza) => {
    const next = { ...diametrosPor, [formula]: d };
    setDiametrosPor(next);
    diametrosRef.current = d;
    olvidarSobrante(); // un sobrante de tríos no es la mitad de un par
    try { localStorage.setItem(claveDiametrosTrozas(tenantSlug()), JSON.stringify(next)); } catch { /* ignore */ }
  };

  const exportarCSV = () => {
    const csv = patioACsv(enOrdenDelPapel(rows, ordenFilas), formula, diametros);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `trozas-${ox ? "oxapampina-" : ""}${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const fmtVol = (v: number) => formatNumber(v, u.decimales);

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <KpisPatioTrozas formula={formula} totales={totales} resumen={resumen} cmpGtf={cotejo.cmpGtf} sospechosas={sospechosas} />
      )}

      <PanelVozTrozas
        voz={voz}
        paused={paused}
        formula={formula}
        onFormula={cambiarFormula}
        diametros={diametros}
        onDiametros={cambiarDiametros}
        especie={especie}
        onEspecie={setEspecie}
        especiesCatalogo={catalogoEspecies.nombres}
        onAbrirEspecies={catalogoEspecies.abrir}
        lastAdded={lastAdded}
        onDeshacer={deshacer}
        onAgregar={(d1, d2, l) => addTroza(d1, d2, l)}
      />

      {/* Tabla + comparación con la GTF */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <BarraPatioTrozas
          total={rows.length}
          etiquetaVolumen={u.volumen}
          onImportar={() => setImportando(true)}
          onEspecies={catalogoEspecies.abrir}
          ordenFilas={ordenFilas}
          hayQueOrdenar={hayQueOrdenar}
          hayQueAgrupar={hayQueAgrupar}
          onOrden={cambiarOrden}
          colsVisibles={colsVisibles}
          onCols={setColsVisibles}
          /* Mira `leyendoId` y no `estado`: el panel sobrevive al final de la
             lectura, y con `estado` el botón seguiría diciendo «Detener». */
          leyendo={!!lectura.leyendoId}
          onLeer={leerPatio}
          onCsv={exportarCSV}
          onVaciar={limpiar}
        />

        {sospechosas > 0 && (
          <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            {sospechosas === 1 ? "Hay una troza con medidas raras" : `Hay ${sospechosas} trozas con medidas raras`} (largo &gt;{RANGO_FORMULA[formula].largoMax} {u.largo} o Ø &lt;{RANGO_FORMULA[formula].diametroMin}{u.diametroCorto}): revisa las filas resaltadas — corrige el valor y la marca se va.
          </p>
        )}

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Todavía no cubicaste trozas{ox ? " en Oxapampina" : ""}. Dicta o carga la primera.</p>
        ) : (
          <TablaPatioTrozas
            rows={rows}
            formula={formula}
            diametros={diametros}
            verEspecie={colsVisibles.especie}
            verVolumen={colsVisibles.m3}
            ordenFilas={ordenFilas}
            total={totales.volumen}
            lastAddedId={lastAdded?.id}
            leyendoId={lectura.leyendoId}
            onEditar={editar}
            onBorrar={borrar}
            onLeerDesde={(id) => lectura.leerDesde(() => rowsRef.current, textoTroza, id)}
          />
        )}

        {/* Contra la guía: ¿lo que llegó coincide con lo declarado? Sólo en m³. */}
        <CotejoGtfBloque cotejo={cotejo} oxapampina={ox} onUsarSmalian={() => cambiarFormula("smalian")} />

        {/* Referencias */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ox ? (
            <>
              <Ref label="Total" value={`${fmtVol(totales.volumen)} PT`} />
              <Ref label="Por troza" value={`${fmtVol(totales.trozas > 0 ? totales.volumen / totales.trozas : 0)} PT`} hint="promedio del patio" />
            </>
          ) : (
            <>
              <Ref label="Total rolliza" value={`${fmtVol(totales.volumen)} m³`} />
              <Ref label="Equivalente volumétrico" value={`${formatNumber(totales.volumen * PT_POR_M3, { max: 0 })} PT`} hint={`1 m³ = ${PT_POR_M3} PT — el factor con el que se compra y se vende`} />
            </>
          )}
          <Ref label="Fórmula" value={u.nombre} hint={u.cuenta} />
        </div>

        {/* ADR-478: el patio con dueño, para descontarlo de su adelanto. */}
        <CuentaDelPatio rows={rows} formula={formula} diametros={diametros} claveLote={claveLoteTrozas(tenantSlug(), formula)} />
      </div>

      {/* Mientras lee, el control va con los ojos. */}
      <ControlLecturaFlotante
        estado={lectura.estado}
        onPausar={lectura.pausar}
        onReanudar={lectura.reanudar}
        onReiniciar={lectura.reiniciar}
        onIrAFila={lectura.irAFila}
        onCerrar={lectura.detener}
        etiqueta="Leyendo el patio"
        /* Las dos lecturas del patio son de la tabla entera. */
        numerarDesdeAbajo={ordenFilas === "recientes"}
      />

      {catalogoEspecies.modal}

      {importando && (
        <ImportarTrozasModal
          formula={formula}
          filasActuales={rows.length}
          especiesActuales={especiesActuales}
          onAgregar={agregarImportadas}
          onCerrar={() => setImportando(false)}
        />
      )}
    </div>
  );
}

function Ref({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{value}</div>
      {hint && <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</div>}
    </div>
  );
}
