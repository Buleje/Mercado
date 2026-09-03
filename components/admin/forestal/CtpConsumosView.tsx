"use client";

/**
 * La Sección 2 del Libro de Operaciones —CONSUMOS— en pantalla.
 *
 * Era la única de las cuatro secciones del formato sin vista propia: existía en
 * el Excel oficial, pero para ver qué se consumió había que abrir corrida por
 * corrida. Un fiscalizador pregunta "¿qué madera entró a la sierra este mes?" y
 * eso tiene que responderse de una.
 *
 * Las filas las arma `filasConsumo()`, la MISMA que la hoja "2. Consumos" del
 * Excel: pantalla y libro presentado no pueden declarar consumos distintos.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  Download,
  Flame,
  Gauge,
  Layers,
  Leaf,
  Loader2,
  RotateCcw,
  Ruler,
  Search,
  TreePine,
  X,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { unidadOficial } from "@/lib/forestal/loctp-campos";
import {
  filasConsumo,
  type FilaConsumo,
  type GrafoConsumos,
} from "@/lib/forestal/loctp-consumos";
import { consumosACsv, nombreArchivoSeccion } from "@/lib/forestal/ctp-secciones-csv";
import { ESTADO_LOTE, esLoteDeInventario, loteAserrioPorCorrida, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { pieTablarAserrableDe } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { trozasDelLote } from "@/lib/forestal/lote-programacion";
import CtpLotesTira from "./CtpLotesTira";
import CtpLoteCerradoFicha from "./CtpLoteCerradoFicha";
import CtpCargarSierra from "./CtpCargarSierra";
import CtpCubicacionParaConsumo from "./CtpCubicacionParaConsumo";
import CtpTrozasIngresadas from "./CtpTrozasIngresadas";
import CtpResumenPermisoModal from "./CtpResumenPermisoModal";
import CtpPatioFiltros from "./CtpPatioFiltros";
import CtpPatioKpis from "./CtpPatioKpis";
import CtpApartados, { useApartado, type Apartado } from "./ctp-apartados";
import { CtpPaginacion, usePaginacion } from "./ctp-tabla";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import { useRegistrarJornadas } from "./hooks/use-registrar-jornadas";
import { useFiltroPatio } from "./hooks/use-filtro-patio";
import { facetasDePatio } from "@/lib/forestal/patio-resumen";
import {
  agruparConsumos,
  juzgarRendimientoConsumo,
  resumenConsumos,
  type AgrupacionConsumo,
} from "@/lib/forestal/loctp-consumos-analisis";
import type { AgrupacionPatio } from "@/lib/forestal/consumo-trozas";
import { Celda, Cuadro, SinDatos, Texto, Th } from "./ctp-cuadro-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Sin tildes ni mayúsculas: se busca como se tipea, no como se escribió. */
const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const nf = (n: number) => n.toLocaleString("es-PE");

const fmtFecha = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

const CAMPO =
  "h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

/** Las cuatro lecturas del cuadro. El botón muestra la activa: un menú que
 *  guarda estado y no lo dice obliga a abrirlo para saber cómo quedó. */
const ETIQUETA_AGRUPAR: Record<AgrupacionConsumo, string> = {
  ninguna: "Sin agrupar",
  especie: "Por especie",
  guia: "Por guía",
  corrida: "Por corrida",
  permiso: "Por N° de permiso",
};

/** Mismo agrupado, ahora para la pila del patio (Brandon, 2026-09-01). */
const ETIQUETA_AGRUPAR_PATIO: Record<AgrupacionPatio, string> = {
  ninguna: "Sin agrupar",
  especie: "Por especie",
  guia: "Por guía",
  permiso: "Por N° de permiso",
};

/** Una fila del cuadro. Fuera del render para no re-montarla en cada estado. */
function filaConsumo(f: FilaConsumo) {
  return (
    <tr key={`${f.woodEntryId}-${f.corridaId}-${f.nro}`} className="hover:bg-[var(--surface-sunken)]">
      <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-tertiary)]">{f.nro}</td>
      <Texto v={fmtFecha(f.fecha)} className="whitespace-nowrap" />
      <Texto v={f.tipoProducto} />
      <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{f.especieComun}</td>
      <Texto v={f.especieCientifica} className="italic" />
      <Texto v={f.codigoOrigen} className="font-mono" />
      <Texto v={f.fuenteOrigen} className="font-mono" />
      <Texto v={unidadOficial(f.unidad)} />
      <Celda v={f.cantidad} />
      {/* (10) El lote de aserrío que entró a la sierra. Vacío en las corridas
          cargadas a mano: el libro admite huecos, no datos inventados. */}
      <Texto v={f.lote || null} className="font-mono" />
      {/* En una sola línea: apretada, la observación partía cada fila en cuatro
          renglones y el cuadro se leía como una escalera. El cuadro ya scrollea
          a lo ancho —es el formato oficial, tiene once casilleros. */}
      <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--text-secondary)]">
        <span className="font-mono font-bold text-[var(--text-primary)]">{f.gtf}</span> → {f.observaciones}
      </td>
    </tr>
  );
}

export default function CtpConsumosView({
  period,
  onIr,
  presetLoteId,
  onPresetLoteUsado,
}: {
  period: CtpPeriod;
  onIr?: (vista: string) => void;
  /** Lote que llega desde la pestaña Lotes con «Cargar» (ADR-342). */
  presetLoteId?: string | null;
  onPresetLoteUsado?: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaConsumo[]>([]);
  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState("");
  const [gtf, setGtf] = useState("");
  /** El grafo se guarda entero: el rendimiento y los huecos salen de él. */
  const [grafo, setGrafo] = useState<GrafoConsumos | null>(null);
  const [agrupar, setAgrupar] = useState<AgrupacionConsumo>("ninguna");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  /** Mismo "Opciones · agrupar" del cuadro, ahora también en la pila del patio
   *  (Brandon, 2026-09-01) — reemplaza al resumen de especies que estaba fijo
   *  debajo de los KPI: agrupar dice lo mismo, bajo demanda. */
  const [agruparPatio, setAgruparPatio] = useState<AgrupacionPatio>("ninguna");
  /** Modal «Resumen por N° de permiso» (Brandon, 2026-09-01): especie × piezas
   *  × m³ × pt de UN permiso, con salto directo a Distribución de rolliza. */
  const [resumenPermiso, setResumenPermiso] = useState(false);
  /**
   * El panel de cubicación del patio, ahora bajo demanda desde «Opciones».
   *
   * Se recuerda por dispositivo: quien está midiendo tablas toda la tarde no
   * tiene que volver a abrirlo en cada recarga, y quien sólo carga la sierra
   * no lo ve nunca.
   */
  const [cubicarAbierto, setCubicarAbierto] = useState(false);
  /** El lote que se está reabriendo, para que su fila del menú muestre el spinner. */
  const [reabriendo, setReabriendo] = useState<string | null>(null);
  useEffect(() => {
    try { setCubicarAbierto(localStorage.getItem("ctp-consumos-cubicar") === "1"); } catch { /* modo privado */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("ctp-consumos-cubicar", cubicarAbierto ? "1" : "0"); } catch { /* quota */ }
  }, [cubicarAbierto]);
  /** Cargar la sierra (ADR-340): el lote que se está aserrando y el día. */
  const [loteCarga, setLoteCarga] = useState("");
  const [fechaConsumo, setFechaConsumo] = useState(() => new Date().toISOString().slice(0, 10));
  const [aviso, setAviso] = useState<{ tono: "ok" | "aviso"; texto: string } | null>(null);
  /** Lo tildado en la tabla del patio. Vive acá porque el filtro que decide
   *  qué se ve también vive acá (ADR-345). */
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const { toasts, push: pushToast, dismiss: dismissToast } = useActionToasts();
  const lotes = useLotesAserrio();
  /* Del reparto al libro: N corridas, una por jornada (ADR-373). */
  const jornadas = useRegistrarJornadas(lotes);
  const lotesAbiertos = useMemo(() => lotes.lotes.filter((l) => l.status === "abierto"), [lotes.lotes]);
  /**
   * TODOS los lotes, no sólo los abiertos (Brandon, 2026-09-01: "tiene que
   * aparecer los lotes que he creado, sea que ya se consumió o tenga trozas").
   * Uno ya consumido no puede recibir piezas nuevas —el servidor lo bloquea a
   * propósito, para no corromper el rendimiento ya declarado de su corrida—
   * pero antes desaparecía del todo del combo, y un lote que "desaparece" se
   * lee como un lote perdido. Ahora se ve siempre, con su estado; el que no es
   * "abierto" abre una ficha de sólo lectura en vez del picker de trozas. */
  const lotesParaElegir = useMemo(
    () =>
      [...lotes.lotes].sort((a, b) => {
        const prioridad = { abierto: 0, consumido: 1, cerrado: 2 } as const;
        const dif = prioridad[a.status] - prioridad[b.status];
        return dif !== 0 ? dif : b.fechaApertura.localeCompare(a.fechaApertura);
      }),
    [lotes.lotes],
  );
  const loteElegido = useMemo(
    () => lotesParaElegir.find((l) => l.id === loteCarga) ?? null,
    [lotesParaElegir, loteCarga],
  );
  /** Cuánta madera de su especie tiene cada lote esperando: se elige con el dato
   *  a la vista, sin abrir el lote para enterarse. */
  const disponiblePorLote = useMemo(() => {
    const mapa = new Map<string, { piezas: number; volumen: number }>();
    for (const l of lotesAbiertos) {
      const suyas = trozasDelLote(lotes.trozas, l);
      mapa.set(l.id, {
        piezas: suyas.length,
        volumen: Math.round(suyas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
      });
    }
    return mapa;
  }, [lotesAbiertos, lotes.trozas]);

  /**
   * La pila sobre la que trabaja el patio. Con un lote elegido se acota sola a
   * lo que ESE lote puede tomar —su especie— (ADR-342): antes había que
   * acordarse de filtrar por especie a mano y el servidor rechazaba el resto.
   */
  const baseDelPatio = useMemo(
    () => (loteElegido ? trozasDelLote(lotes.trozas, loteElegido) : lotes.trozas),
    [loteElegido, lotes.trozas],
  );
  /* El lote va al filtro: sus piezas ya apartadas cuentan como disponibles
     PARA ÉL, o la tabla queda vacía mientras el botón promete seis piezas. */
  const patio = useFiltroPatio(baseDelPatio, { loteId: loteElegido?.id });
  /**
   * Los autofiltros de la cabecera de la tabla del patio (estilo Excel, Brandon
   * 2026-09-03): Guía (varias), Permiso y Especie escriben el MISMO estado que
   * el panel «Filtros». Las opciones llevan cuántas piezas hay detrás de cada
   * valor, sacadas de toda la pila (no de lo ya filtrado, o quitar un filtro no
   * se podría deshacer desde el propio selector).
   */
  const facetasPatio = useMemo(() => facetasDePatio(patio.delPatio), [patio.delPatio]);
  const filtrosPatioColumna = {
    guia: { value: patio.guia, options: facetasPatio.guias, onChange: patio.set.guia },
    permiso: { value: patio.permiso, options: facetasPatio.permisos, onChange: patio.set.permiso },
    especie: { value: patio.especie, options: facetasPatio.especies, onChange: patio.set.especie },
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const url = (base: string, extra: Record<string, string> = {}) => {
        const u = new URL(base, window.location.origin);
        for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
        applyCtpPeriodParams(u.searchParams, period);
        return u.toString();
      };
      /* Deduplicado (ADR-347): el grafo lo piden también la cabina y el
         semáforo de pendientes en el mismo montaje. */
      const pedir = <T,>(u: string): Promise<T> => ctpGet<T>(u);
      const [gra, lot] = await Promise.all([
        pedir<{ grafo?: GrafoConsumos }>(url("/api/admin/forestal/ctp", { grafo: "1" })),
        /* Los lotes de aserrío llenan el casillero (10) —«N° de lote
           consumido»— y NO se acotan al período: un lote armado en junio puede
           haberse aserrado en julio, y filtrarlo dejaría la columna vacía sobre
           un consumo que sí tiene lote.
           Va con su propio catch: es un dato SECUNDARIO de esta pantalla y si el
           endpoint falla tiene que faltar la columna (10), no la Sección 2
           entera. */
        pedir<{ lotes?: LoteAserrio[] }>("/api/admin/forestal/lotes-aserrio?limite=500").catch(() => ({ lotes: [] })),
      ]);
      setGrafo(gra.grafo ?? null);
      /* Los ingresos salen del propio grafo (ADR-347): trae sus casilleros y ya
         descarta anulados y rechazados en la consulta. Un fetch menos —y era el
         más pesado de la pantalla: 5000 ingresos enteros. */
      setFilas(filasConsumo(gra.grafo ?? null, undefined, loteAserrioPorCorrida(lot.lotes ?? [])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [period]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Las opciones salen de TODO el período, no de lo filtrado: si se achicaran
   *  con el filtro, quitar uno no se podría deshacer desde el propio selector. */
  const opcionesEspecie = useMemo(
    () => [...new Set(filas.map((f) => f.especieComun).filter((x) => x && x !== "—"))].sort(),
    [filas],
  );
  const opcionesGtf = useMemo(
    () => [...new Set(filas.map((f) => f.gtf).filter((x) => x && x !== "—"))].sort(),
    [filas],
  );

  const visibles = useMemo(() => {
    const t = norm(texto);
    return filas.filter((f) => {
      if (especie && norm(f.especieComun) !== norm(especie)) return false;
      if (gtf && norm(f.gtf) !== norm(gtf)) return false;
      if (t) {
        const campos = [f.gtf, f.especieComun, f.especieCientifica, f.codigoOrigen, f.fuenteOrigen, f.observaciones];
        if (!campos.some((c) => norm(c).includes(t))) return false;
      }
      return true;
    });
  }, [filas, texto, especie, gtf]);

  /** Los dos apartados de la pestaña, con su contador: el patio y el cuadro. */
  const piezasEnPatio = useMemo(
    () => lotes.trozas.filter((t) => t.guiaRecepcionada !== false && !t.consumidaEnId && !t.loteAserrioId).length,
    [lotes.trozas],
  );
  const apartados: Apartado[] = useMemo(
    () => [
      {
        id: "patio",
        label: "Trozas en el patio",
        hint: "La madera recibida que todavía no entró a la sierra — de acá se elige lo que se consume",
        contador: piezasEnPatio,
      },
      {
        id: "seccion2",
        label: "Sección 2 · Consumos",
        hint: "El cuadro oficial del libro: qué madera entró a la sierra en el período",
        contador: filas.length,
      },
    ],
    [piezasEnPatio, filas.length],
  );
  const { activo: apartado, ir: irApartado } = useApartado("consumos", apartados);

  /* El lote que mandó la pestaña Lotes se aplica cuando la lista ya cargó: antes
     sería un id que el `<select>` todavía no tiene entre sus opciones. Y lleva
     al patio: elegir un lote y quedarse en el cuadro no hace nada visible. */
  useEffect(() => {
    if (!presetLoteId || !lotesAbiertos.some((l) => l.id === presetLoteId)) return;
    setLoteCarga(presetLoteId);
    irApartado("patio");
    onPresetLoteUsado?.();
  }, [presetLoteId, lotesAbiertos, onPresetLoteUsado, irApartado]);

  const total = useMemo(() => visibles.reduce((a, f) => a + f.cantidad, 0), [visibles]);
  /* El cuadro se pagina cuando está SIN agrupar: agrupado ya son pocas filas
     de grupo, y cortarlas dejaría un subtotal sin sus líneas (ADR-344). */
  const { visibles: filasEnPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(visibles);
  const especies = useMemo(() => new Set(visibles.map((f) => f.especieComun)).size, [visibles]);

  /** Rendimiento y huecos de la cadena — lo que la tabla sola no dice. */
  const resumen = useMemo(() => resumenConsumos(visibles, grafo), [visibles, grafo]);
  const veredicto = useMemo(() => juzgarRendimientoConsumo(resumen.rendimientoPct), [resumen.rendimientoPct]);
  const grupos = useMemo(() => agruparConsumos(visibles, agrupar), [visibles, agrupar]);

  /** Cómo se está leyendo el cuadro, para que el botón lo diga sin abrirlo. */
  const opcionesCuadro: MenuAccion[] = useMemo(() => {
    const lista: MenuAccion[] = (Object.keys(ETIQUETA_AGRUPAR) as AgrupacionConsumo[]).map((clave) => ({
      id: `agrupar-${clave}`,
      label: ETIQUETA_AGRUPAR[clave],
      hint: clave === "ninguna" ? "Una fila por consumo" : "Subtotal arriba, el detalle se despliega",
      icon: Layers,
      activo: agrupar === clave,
      onSelect: () => { setAgrupar(clave); setAbiertos(new Set()); },
    }));
    lista.push({
      id: "resumen-permiso",
      label: "Ver resumen por permiso",
      hint: "Especie, piezas, m³ y pt de un N° de permiso — y distribuir su rolliza",
      icon: BarChart3,
      tone: "dark",
      onSelect: () => setResumenPermiso(true),
    });
    lista.push({
      id: "descargar",
      label: "Descargar en Excel",
      hint: `${visibles.length === 1 ? "El consumo" : `Los ${visibles.length} consumos`} de este filtro`,
      icon: Download,
      disabled: visibles.length === 0,
      onSelect: descargarCsv,
    });
    if (texto || especie || gtf) {
      lista.push({
        id: "limpiar",
        label: "Limpiar el filtro",
        hint: "Volver a ver los consumos de todo el período",
        icon: X,
        onSelect: () => { setTexto(""); setEspecie(""); setGtf(""); },
      });
    }
    return lista;
    // `descargarCsv` se redefine en cada render (cierra sobre `visibles`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agrupar, visibles.length, texto, especie, gtf]);

  /** El mismo botón, para la pila del patio (Brandon, 2026-09-01). */
  const opcionesPatio: MenuAccion[] = useMemo(
    () => [
      ...(Object.keys(ETIQUETA_AGRUPAR_PATIO) as AgrupacionPatio[]).map((clave) => ({
        id: `agrupar-patio-${clave}`,
        label: ETIQUETA_AGRUPAR_PATIO[clave],
        hint: clave === "ninguna" ? "Una fila por troza" : "Subtotal arriba, el detalle se despliega",
        icon: Layers,
        activo: agruparPatio === clave,
        onSelect: () => setAgruparPatio(clave),
      })),
      {
        id: "resumen-permiso-patio",
        label: "Ver resumen por permiso",
        hint: "Especie, piezas, m³ y pt de un N° de permiso — y distribuir su rolliza",
        icon: BarChart3,
        tone: "dark" as const,
        onSelect: () => setResumenPermiso(true),
      },
      {
        /* Cubicar entró al menú (Brandon, 2026-09-02: «que las funciones de
           cubicar madera entren dentro de opciones»). Estaba SIEMPRE abierto
           encima del patio, ocupando media pantalla en las nueve de cada diez
           veces que se entra sólo a mirar la pila o a cargar la sierra. */
        id: "cubicar-consumo",
        label: cubicarAbierto ? "Cerrar cubicación" : "Cubicar lo aserrado…",
        hint: "Medir las tablas que salieron y repartirlas entre las trozas tildadas",
        icon: Ruler,
        activo: cubicarAbierto,
        onSelect: () => setCubicarAbierto((v) => !v),
      },
    ],
    [agruparPatio, cubicarAbierto],
  );

  /**
   * Los lotes para cargar la sierra, con lo que cada uno TIENE de verdad.
   *
   * Las dos cifras que decidían la elección —cuántas piezas y cuántos m³— no
   * entraban en un `<option>` sin volverse un renglón ilegible, así que la de
   * m³ directamente no se mostraba: se elegía un lote a ciegas sobre el
   * volumen, que es justamente lo que después se declara.
   *
   * Los de INVENTARIO se marcan con su propio ícono: nacieron de una
   * declaración, no del patio pieza por pieza ([[ctp-lote-inventario-2026-08-31]]),
   * así que no tienen trozas que tildar — verlo antes de abrirlos evita buscar
   * una pila que no existe.
   */
  const opcionesLote: MenuAccion[] = useMemo(() => {
    const lista: MenuAccion[] = lotesParaElegir.map((l) => {
      const inventario = esLoteDeInventario(l);
      const hay = disponiblePorLote.get(l.id);
      const cerrado = l.status !== "abierto";
      /* Un lote ASERRADO se puede seguir cargando: se reabre y admite más
         madera de su especie (Brandon, 2026-09-02). Uno CERRADO no —«cerrado»
         es producido y despachado— y por eso sólo se abre su ficha. */
      const reabrible = l.status === "consumido";
      return {
        id: `lote-${l.id}`,
        label: `${l.code} · ${l.speciesCommon ?? "sin especie"}`,
        icon: inventario ? ClipboardList : reabrible ? RotateCcw : Boxes,
        activo: loteCarga === l.id,
        busy: reabriendo === l.id,
        hint: reabrible
          ? "Ya aserrado — se reabre para seguir cargándolo con más madera"
          : cerrado
            ? `${ESTADO_LOTE[l.status].label}${inventario ? " · declarado por inventario" : ""}`
            : inventario
              ? "Declarado por inventario: no tiene trozas que tildar"
              : hay && hay.piezas > 0
                ? "Listo para cargar la sierra"
                : "Sin madera de esa especie en el patio",
        /* Piezas Y m³: el volumen es lo que se declara, y elegir por conteo de
           piezas sin verlo dejaba la decisión a medias. */
        meta: cerrado
          ? undefined
          : hay && hay.piezas > 0
            ? `${hay.piezas} pza · ${fmtM3(hay.volumen)} m³`
            : "—",
        onSelect: () => {
          setSeleccion(new Set());
          if (!reabrible) {
            setLoteCarga(l.id);
            return;
          }
          /* Reabrir y dejarlo elegido: el gesto es uno solo —«seguir cargando
             este lote»— y partirlo en dos clicks obligaría a volver a buscarlo
             en el menú después de reabrirlo. */
          setReabriendo(l.id);
          lotes
            .reabrirLote(l.id)
            .then((r) => {
              setLoteCarga(l.id);
              pushToast({
                tono: "success",
                msg: `Lote ${r.code} reabierto`,
                detail: r.piezasConsumidas > 0
                  ? `Sus ${r.piezasConsumidas} pieza(s) ya aserradas siguen atadas a su corrida; ahora se le puede agregar más madera.`
                  : "Ahora se le puede agregar más madera.",
              });
            })
            .catch((err: unknown) => {
              pushToast({
                tono: "warning",
                msg: "No se pudo reabrir el lote",
                detail: err instanceof Error ? err.message : String(err),
              });
            })
            .finally(() => setReabriendo(null));
        },
      };
    });
    /* Salir del lote sin recargar la pantalla: sin esta fila, volver a ver el
       patio entero obligaba a elegir «Consumir en un lote…» en un `<select>`
       que ya no existe. */
    if (loteCarga) {
      lista.unshift({
        id: "lote-ninguno",
        label: "Ver todo el patio",
        icon: Layers,
        hint: "Sin lote: la pila completa, sin acotar a una especie",
        onSelect: () => {
          setLoteCarga("");
          setSeleccion(new Set());
        },
      });
    }
    return lista;
  }, [lotesParaElegir, disponiblePorLote, loteCarga, setLoteCarga, setSeleccion, lotes, pushToast, reabriendo]);

  /** Se baja lo que se está VIENDO — el filtro es parte de lo que se exporta. */
  function descargarCsv() {
    const csv = consumosACsv(visibles);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoSeccion("consumos", period.label);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (cargando) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-white px-4 py-6 text-sm text-[var(--text-secondary)] dark:bg-[var(--surface-raised)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Recorriendo la cadena de custodia del período…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>No se pudieron cargar los consumos: {error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Lo que TODAVÍA no entró a la sierra, arriba de lo que ya entró: sin
          esto, esta pantalla sólo cuenta el pasado. El armado del lote vive en
          su pestaña (ADR-334) — acá va el semáforo y el camino. */}
      {onIr && apartado === "patio" && !loteElegido && <CtpLotesTira onIr={() => onIr("lotes")} />}

      {aviso && (
        <p
          className={`flex items-start gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-bold ${
            aviso.tono === "ok"
              ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"
              : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
          }`}
        >
          <span className="flex-1">{aviso.texto}</span>
          {onIr && (
            <button type="button" onClick={() => onIr("produccion")} className="shrink-0 underline">
              Ir a Producción
            </button>
          )}
        </p>
      )}

      {/* Las cifras del período con el mismo peso que en Ingresos: es el mismo
          libro, no puede tener dos jerarquías según la pestaña. Reflejan lo
          FILTRADO —igual que el CSV— así el número y lo que se baja coinciden.
          Son las del CUADRO: en el apartado del patio manda `CtpPatioKpis`, que
          cuenta la pila (ADR-345). */}
      {apartado === "seccion2" && (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          density="compact"
          label="Consumos"
          value={nf(visibles.length)}
          subValue={visibles.length === filas.length ? period.label : `de ${nf(filas.length)} · filtrado`}
          icon={Flame}
          emphasis="neutral"
        />
        <StatCard
          density="compact"
          label="Volumen consumido"
          value={`${fmtM3(total)} m³`}
          subValue="Entró a la sierra"
          icon={TreePine}
          emphasis="success"
        />
        <StatCard
          density="compact"
          label="Especies"
          value={nf(especies)}
          subValue={especies === 1 ? "Una sola especie" : "Distintas en el período"}
          icon={Leaf}
          emphasis="neutral"
        />
        {/* Reemplaza a «guías de origen» —que ya se ve en el filtro— por la
            pregunta del negocio: de lo que entró a la sierra, ¿cuánto salió? */}
        <StatCard
          density="compact"
          label="Rendimiento"
          value={resumen.rendimientoPct != null ? `${resumen.rendimientoPct}%` : "—"}
          subValue={
            resumen.rendimientoPct != null
              ? `${fmtM3(Number(resumen.producido))} m³ producidos · ${veredicto.texto}`
              : resumen.corridasOtraUnidad > 0
                ? `${resumen.corridasOtraUnidad} corrida(s) en otra unidad`
                : "Sin producción declarada todavía"
          }
          icon={Gauge}
          emphasis={veredicto.tono === "ok" ? "success" : veredicto.tono === "neutro" ? "neutral" : "warning"}
        />
      </div>
      )}

      {/* Los del patio van en el MISMO renglón de la pantalla que los de arriba
          (ADR-345): el apartado cambia lo que dicen, no dónde están. */}
      {apartado === "patio" && (
        <CtpPatioKpis resumen={patio.resumen} totalSinFiltrar={patio.delPatio.length} />
      )}

      {/* El hueco de la cadena, arriba de todo: el libro admite una corrida sin
          origen declarado, el certificado de trazabilidad no. Se mide contra el
          período entero, no contra el filtro. */}
      {apartado === "seccion2" && resumen.corridasSinOrigen.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-bold">
            {resumen.corridasSinOrigen.length} corrida(s) produjeron sin declarar de qué guía salió la madera
            {resumen.producidoSinOrigen > 0 ? ` · ${fmtM3(resumen.producidoSinOrigen)} m³ sin respaldo` : ""}
          </span>
          <span className="text-[var(--text-secondary)]">
            {/* El label y no el N°: en el libro real varias corridas comparten
                lineNo y "#95000 · #95000" no señala ninguna. */}
            {resumen.corridasSinOrigen.slice(0, 3).map((c) => c.label).join(" · ")}
            {resumen.corridasSinOrigen.length > 3 ? ` y ${resumen.corridasSinOrigen.length - 3} más` : ""}
            {" — se atribuyen desde Producción."}
          </span>
        </div>
      )}

      {/* Cada apartado trae SUS controles (ADR-345): en el patio se elige el lote
          y el día —lo que se hace ahí es cargar la sierra—; en el cuadro se
          busca, se agrupa y se baja el CSV. Mezclados, la mitad de la barra no
          hacía nada sobre lo que se estaba mirando. */}
      {/*
        Los apartados van DENTRO de la fila de filtros, no en una caja propia
        arriba (Brandon, 2026-09-02). Envueltos en un flex con la barra: los
        dos botones a la izquierda —el ancho que necesiten— y la grilla de
        campos ocupando el resto.
      */}
      {apartado === "patio" && (
        <div className="flex flex-wrap items-start gap-2">
          <CtpApartados apartados={apartados} activo={apartado} onIr={irApartado} enLinea />
          <div className="min-w-[16rem] flex-1">
        <CtpPatioFiltros
          filtro={patio}
          enCabecera
          accion={
            <>
              {/* El lote y el día van PRIMEROS y dentro de la misma grilla que
                  el resto: son el filtro que más manda —acota la pila a su
                  especie— y estaban en otra barra, arriba de los KPI.
                  Ocupa dos celdas sólo mientras no hay fecha: con las dos, la
                  barra pasaba a un segundo renglón por un campo (ADR-347). */}
              {/*
                Menú y no `<select>` nativo (Brandon, 2026-09-02: «en el campo
                de consumir lote, al aparecer las opciones quiero que se vean
                las trozas n° y los m³ … y que los que son lotes de inventario
                lo diga con un ícono»).

                Un `<option>` sólo admite texto plano: no lleva ícono, no
                alinea cifras y todo termina apelmazado en un renglón con
                puntos medios. `ActionMenu` —el mismo de «Opciones» de esta
                vista— da ícono por fila, una línea de contexto y la cifra a la
                derecha en mono, que es lo que hace comparables las piezas y
                los m³ de un lote contra otro.
              */}
              {lotesParaElegir.length > 0 && (
                <ActionMenu
                  label={loteElegido ? `Lote ${loteElegido.code}` : "Consumir en un lote…"}
                  title="Elegí el lote que entra a la sierra, o revisá uno ya cerrado"
                  icon={Boxes}
                  variant={loteCarga ? "accent" : "outline"}
                  size="md"
                  className={`w-full ${loteCarga ? "" : "sm:col-span-2"}`}
                  actions={opcionesLote}
                />
              )}
              {loteCarga && (
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  {/* Corto: junto al `date` dentro de una celda de la grilla,
                      «Fecha de consumo» se cortaba a media palabra. */}
                  <span className="whitespace-nowrap">Fecha</span>
                  <input
                    type="date"
                    value={fechaConsumo}
                    onChange={(e) => setFechaConsumo(e.target.value)}
                    aria-label="Fecha del consumo"
                    className={`${CAMPO} w-full px-3`}
                  />
                </label>
              )}
              {/* Sin ningún lote —ni abierto ni cerrado—, un selector vacío no
                  es un filtro: es un cartel de «no hay». En su lugar va el camino. */}
              {lotesParaElegir.length === 0 && onIr && (
                <button
                  type="button"
                  onClick={() => onIr("lotes")}
                  className="h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] sm:col-span-2"
                >
                  Programar un lote para cargar la sierra
                </button>
              )}
            </>
          }
        />
          </div>
        </div>
      )}

      {apartado === "seccion2" && (
        /* La misma grilla que la del patio: los dos apartados alinean sus campos
           igual, y envueltos en flex quedaban de anchos distintos (ADR-345). */
        /* Una sola fila (ADR-347): con dos, la tabla del cuadro arrancaba a
           media pantalla y lo que se mira es la tabla. */
        <div className="flex flex-wrap items-start gap-2">
          <CtpApartados apartados={apartados} activo={apartado} onIr={irApartado} enLinea />
          <div className="grid min-w-[16rem] flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Guía, especie, código de origen…"
              aria-label="Buscar en los consumos"
              className={`${CAMPO} w-full pl-9 pr-3`}
            />
          </label>
          <select
            value={especie}
            onChange={(e) => setEspecie(e.target.value)}
            aria-label="Filtrar por especie"
            className={`${CAMPO} w-full px-3`}
          >
            <option value="">Todas las especies</option>
            {opcionesEspecie.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select
            value={gtf}
            onChange={(e) => setGtf(e.target.value)}
            aria-label="Filtrar por guía de ingreso"
            className={`${CAMPO} w-full px-3`}
          >
            <option value="">Todas las guías</option>
            {opcionesGtf.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {/* Cómo leer el cuadro y qué llevarse, en un solo botón (ADR-360): el
              agrupado eran cuatro opciones en un `<select>` que no se usan todos
              los días, y descargar/limpiar dos cuadraditos sin explicación. */}
          <ActionMenu
            /* «Opciones» siempre delante para que se lea como menú, y el
               agrupado activo detrás: si sólo dijera «Por especie», descargar
               el CSV quedaba escondido tras un botón que parece un filtro. */
            label={agrupar === "ninguna" ? "Opciones" : `Opciones · ${ETIQUETA_AGRUPAR[agrupar]}`}
            title="Agrupar el cuadro, descargarlo o limpiar el filtro"
            actions={opcionesCuadro}
            size="md"
            className="w-full"
          />
          </div>
        </div>
      )}

      {/**
       * Cubicar lo aserrado, del lado del consumo (ADR-370).
       *
       * En el patio se asierra primero y se anota después: la medición se hace
       * acá, se guarda, y el reparto dice qué le toca a cada troza tildada y a
       * cada día — que es como se declara el libro, jornada por jornada.
       */}
      {cubicarAbierto && apartado === "patio" && (!loteElegido || loteElegido.status === "abierto") && (
        <CtpCubicacionParaConsumo
          trozas={patio.libres
            .filter((t) => seleccion.has(t.id))
            .map((t) => ({
              id: t.id,
              etiqueta: t.codigoPlanta ?? t.codificacion ?? t.id.slice(-6),
              especie: t.especieComun ?? "",
              m3: Number(t.volumenM3 ?? 0),
            }))}
          lote={loteElegido ? { id: loteElegido.id, code: loteElegido.code } : null}
          fecha={fechaConsumo}
          registrar={(js, loteId) => jornadas.registrar(js, { loteId })}
          ocupado={jornadas.ocupado}
          avance={jornadas.avance}
          onAviso={(msg) => pushToast({ tono: "success", msg })}
        />
      )}

      {apartado === "patio" && (loteElegido && loteElegido.status !== "abierto" ? (
        <CtpLoteCerradoFicha lote={loteElegido} onIrAProduccion={onIr ? () => onIr("produccion") : undefined} />
      ) : loteElegido ? (
        <CtpCargarSierra
          lote={loteElegido}
          fecha={fechaConsumo}
          estado={lotes}
          filas={patio.visibles}
          libres={patio.libres}
          totalPatio={patio.delPatio.length}
          filtrando={patio.hayFiltro}
          seleccion={seleccion}
          onSeleccion={setSeleccion}
          onConsumido={(texto, tono, accion = "consumo") => {
            /* "adjuntar" no consumió nada — sólo apartó piezas en el lote — así
               que el toast no puede decir "Consumo registrado" sin mentir. */
            const okMsg = accion === "adjuntar" ? "Piezas adjuntadas" : "Consumo registrado";
            pushToast({
              tono: tono === "ok" ? "success" : "warning",
              msg: tono === "ok" ? okMsg : `${okMsg} con avisos`,
              detail: texto,
            });
            setAviso({ texto, tono });
            /* NO limpiar `loteCarga` ni saltar a Sección 2 (Brandon, 2026-09-01:
               "ese mismo lote seguirá ahí mismo... evitar que se desaparezca").
               Un consumo parcial deja el lote ABIERTO (ADR-356: aserrar una
               parte hoy, dejar el resto apartado) — saltar de pantalla forzaba
               a reelegirlo para seguir cargando la sierra. Si el lote se
               consumió entero, `loteElegido` cae solo (ya no está en
               `lotesAbiertos`) y la vista vuelve al patio sin lote. */
            void cargar();
          }}
        />
      ) : (
        <div className="space-y-2">
          <CtpTrozasIngresadas
            filas={patio.visibles}
            libres={patio.libres}
            totalPatio={patio.delPatio.length}
            filtrosColumna={filtrosPatioColumna}
            filtrando={patio.hayFiltro}
            cargando={lotes.cargando}
            seleccion={seleccion}
            onSeleccion={setSeleccion}
            seleccionable={false}
            agrupar={agruparPatio}
            menuAgrupar={
              <ActionMenu
                label={agruparPatio === "ninguna" ? "Opciones" : `Opciones · ${ETIQUETA_AGRUPAR_PATIO[agruparPatio]}`}
                title="Agrupar la pila del patio por especie, guía o permiso"
                actions={opcionesPatio}
                size="sm"
              />
            }
          />
          {lotesAbiertos.length > 0 && (
            <p className="text-sm text-[var(--text-tertiary)]">
              Para llevar piezas a la sierra, elegí un lote arriba en{" "}
              <b className="text-[var(--text-secondary)]">«Consumir en un lote…»</b>.
            </p>
          )}
        </div>
      ))}

      {apartado === "seccion2" && (
      <Cuadro
        pie={
          agrupar === "ninguna" ? (
            <CtpPaginacion
              rango={rango}
              porPagina={porPagina}
              onPorPagina={setPorPagina}
              onIr={ir}
              sustantivo="consumo"
              extra={<span className="font-mono tabular-nums">{fmtM3(total)} m³ en el filtro</span>}
            />
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">
              <span className="font-mono tabular-nums text-[var(--text-secondary)]">{grupos.length} grupo(s)</span> ·{" "}
              {visibles.length} consumos · {fmtM3(total)} m³
            </p>
          )
        }
        titulo="Sección 2 · Consumos"
        subtitulo="11 casilleros. Un consumo no es un registro suelto: es la madera de una guía entrando a una corrida. El casillero (10) trae el lote de aserrío con el que se cargó la sierra; queda vacío en las corridas declaradas a mano."
      >
        <thead className="border-b-2 border-[var(--rule-base)]">
          <tr>
            <Th ancho="w-14">(1) N°</Th>
            <Th>(2) Fecha</Th>
            <Th>(3) Tipo de producto</Th>
            <Th>(4) N. común</Th>
            <Th>(5) N. científico</Th>
            <Th>(6) Cód. origen/CTP</Th>
            <Th>(7) N° fuente</Th>
            <Th>(8) Unidad</Th>
            <Th>(9) Cantidad</Th>
            <Th>(10) Lote consumido</Th>
            <Th>(11) Observaciones</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-base)]">
          {visibles.length === 0 ? (
            <SinDatos cols={11}>
              {filas.length === 0
                ? "Sin consumos atribuidos en el período. Se registran al declarar de qué ingreso salió cada corrida de producción."
                : "Ningún consumo coincide con el filtro."}
            </SinDatos>
          ) : agrupar === "ninguna" ? (
            filasEnPagina.map(filaConsumo)
          ) : (
            // Agrupado: el subtotal arriba y el detalle plegado. Lo que se
            // busca casi siempre es el total del grupo, no sus veinte líneas.
            grupos.map((g) => {
              const abierto = abiertos.has(g.clave);
              return (
                <Fragment key={g.clave}>
                  <tr className="bg-[var(--surface-sunken)]">
                    <td colSpan={8} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setAbiertos((prev) => {
                          const s2 = new Set(prev);
                          if (s2.has(g.clave)) s2.delete(g.clave); else s2.add(g.clave);
                          return s2;
                        })}
                        aria-expanded={abierto}
                        className="flex items-center gap-2 text-left text-sm font-bold text-[var(--text-primary)]"
                      >
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-90" : ""}`}
                          aria-hidden
                        />
                        {g.clave}
                        <span className="font-normal text-[var(--text-tertiary)]">
                          {g.filas.length} consumo(s)
                          {agrupar !== "guia" && g.guias > 1 ? ` · ${g.guias} guías` : ""}
                          {/* Por permiso: la especie no se combina — cada permiso puede traer
                              más de una, y el total solo no dice de qué está hecho (Brandon,
                              2026-09-01). El pt es SIEMPRE aproximado (tope de rendimiento 56%,
                              no la corrida real) — nunca se muestra como si fuera el dato. */}
                          {agrupar === "permiso" && (
                            <>
                              {" · "}
                              {g.porEspecie.map((e) => `${e.especie} ${fmtM3(e.cantidad)} m³`).join(" · ")}
                              {` · ≈${pieTablarAserrableDe(g.cantidad, RENDIMIENTO_META).toLocaleString("es-PE")} pt aserrables (56%)`}
                            </>
                          )}
                        </span>
                      </button>
                    </td>
                    <Celda v={g.cantidad} />
                    {/* (10) no se totaliza: un grupo puede juntar varios lotes. */}
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-sm text-[var(--text-tertiary)]">
                      {total > 0 ? `${Math.round((g.cantidad / total) * 100)}% del filtro` : ""}
                    </td>
                  </tr>
                  {abierto && g.filas.map(filaConsumo)}
                </Fragment>
              );
            })
          )}
        </tbody>
      </Cuadro>
      )}

      <ActionToasts toasts={toasts} onDismiss={dismissToast} />

      <CtpResumenPermisoModal
        open={resumenPermiso}
        onClose={() => setResumenPermiso(false)}
        trozas={lotes.trozas}
        lotes={lotes.lotes}
      />
    </div>
  );
}
