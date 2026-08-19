"use client";

/**
 * ResumenReparto — qué parte de lo aserrado ampara cada bloque de rolliza.
 *
 * Cada bloque tiene una CAPACIDAD (`m³ × % aprovechable`) y ampara hasta ahí, ni
 * un metro más. La aserrada se va asignando bloque por bloque en el orden
 * cargado; lo que no entra pasa al siguiente, y lo que no entra en ninguno cae
 * en la tabla de **faltante por distribuir** — la madera que espera la próxima
 * troza.
 *
 * No es un prorrateo, y la diferencia importa: el respaldo de volumen es lo que
 * se declara, y declarar de más es el hueco por donde se blanquea madera.
 *
 * La cuenta vive en `lib/forestal/cubicacion-reparto.ts` (pura, 33 tests); acá
 * está el editor de bloques y el dibujo.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2, Download, Share2, AlertTriangle, Layers, ArrowDown, FileText, FileSpreadsheet, Scale, HelpCircle, SlidersHorizontal, Combine, X } from "@buleje/design-system/icons";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  DIMENSIONES_RESUMEN, ETIQUETA_DIMENSION, type DimensionResumen, type PrecioPt,
} from "@/lib/forestal/cubicacion-resumen";
import {
  APROVECHABLE_DEFAULT, aprovechableDe, bloquesDesdeTrozas, claveOverrideLinea, distribucionACsv,
  distribuirPorCapacidad, juzgarRendimiento,
  type BloqueDistribuido, type BloqueRolliza, type FiltroLargo,
} from "@/lib/forestal/cubicacion-reparto";
import { exportarDistribucionExcel, exportarDistribucionPDF, filtrarPorEspecies, type FirmaResponsable } from "@/lib/forestal/distribucion-export";
// Pie tablar entero y m³ con 3 decimales: la misma regla que el resto de Resúmenes.
import { fmtM3, fmtPct, fmtPiezas, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { ESPECIES_MADERA, toFeet } from "@/lib/forestal/cubicacion";
import { KpiResumen, SeccionResumen } from "./resumen-tabla";
import { BloqueEspecie } from "./reparto-vistas";
import { DiferenciaDistribucion } from "./reparto-diferencia";
import { AlertaDescuadre, OpcionesExportacion } from "./reparto-opciones";
import { FiltroLargoCelda } from "./reparto-filtro-largo";
import Anexo04Modal from "./Anexo04Modal";


/** Mismo botón que la cabecera de Resúmenes: un solo alto para toda la pestaña. */
const BTN = "inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:border-[var(--rule-base)]";

const TONO = {
  success: "text-[var(--data-success-600)] dark:text-[var(--data-success-500)]",
  warning: "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]",
  neutral: "text-[var(--text-tertiary)]",
} as const;

/**
 * Encabezado de columna con ícono de ayuda: el `title` nativo del navegador
 * es invisible hasta que alguien lo descubre por accidente — acá el «?» se ve
 * siempre, y al pasar (o enfocar con teclado) despliega la explicación en el
 * mismo tooltip que ya usa el resto del admin (`AdminTooltip`, Radix).
 */
function ThAyuda({ children, ayuda, alinear = "right" }: { children: ReactNode; ayuda: ReactNode; alinear?: "left" | "right" }) {
  return (
    <th scope="col" className={`whitespace-nowrap px-2 py-2 ${alinear === "right" ? "text-right" : "text-left"}`}>
      <span className={`inline-flex items-center gap-1 whitespace-nowrap ${alinear === "right" ? "flex-row-reverse" : ""}`}>
        {children}
        <AdminTooltip content={ayuda} className="max-w-[220px] font-normal normal-case tracking-normal">
          <button type="button" aria-label={`Qué significa ${typeof children === "string" ? children : "esta columna"}`} className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </AdminTooltip>
      </span>
    </th>
  );
}

function tenantSlug(): string {
  try { return localStorage.getItem("active-tenant-slug") ?? "main"; } catch { return "main"; }
}
/** Derivados del lote de aserrada: `…-{slug}-precio`, `-meta`, `-rolliza`. */
const claveLocal = (sufijo: string) => `buleje-cubicacion-${tenantSlug()}${sufijo}`;
/**
 * El lote de TROZAS tiene el slug al final (`buleje-cubicacion-trozas-{slug}`),
 * no el patrón de los derivados. No es un capricho: es otro lote, no un anexo
 * del de aserrada. Leerlo con el orden equivocado dejaba el botón «Traer del
 * cubicador de trozas» muerto en silencio.
 */
const claveTrozas = () => `buleje-cubicacion-trozas-${tenantSlug()}`;

function leerTrozas(): { especie?: string; m3: number }[] {
  try {
    const raw = localStorage.getItem(claveTrozas());
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as { especie?: string; m3: number }[]) : [];
  } catch {
    return [];
  }
}

let contador = 0;
const nuevoId = () => `blq-${Date.now().toString(36)}-${contador++}`;

/**
 * Las piezas de un bloque, en el formato que entiende el Anexo 04.
 *
 * La asignación guarda MEDIDAS con su conteo (12 piezas de 2×8×10); el anexo
 * pide filas de pieza cubicada. Se reconstruyen con sus dimensiones y unidades
 * originales —no se recalcula el volumen— así el papel declara exactamente lo
 * que la pantalla repartió.
 */
function piezasDelBloque(b: BloqueDistribuido, especie: string): PiezaCubicada[] {
  const out: PiezaCubicada[] = [];
  for (const g of b.asignado) {
    for (const m of g.medidas) {
      if (m.piezas <= 0) continue;
      out.push({
        id: `${b.bloque.id}-${g.clave}-${m.clave}`,
        cantidad: m.piezas,
        espesor: m.espesor,
        ancho: m.ancho,
        largo: m.largo,
        uEspesor: m.uEspesor as PiezaCubicada["uEspesor"],
        uAncho: m.uAncho as PiezaCubicada["uAncho"],
        uLargo: m.uLargo as PiezaCubicada["uLargo"],
        especie,
        /* El tipo se conserva: el Anexo 04 abre UN bloque por especie + tipo de
           producto, así que perderlo mezclaría paquetería con comercial. */
        tipo: g.label as PiezaCubicada["tipo"],
        pieTablar: m.pieTablar,
        m3: m.m3,
      });
    }
  }
  return out;
}

export default function ResumenReparto({ rows, precioDe }: { rows: PiezaCubicada[]; precioDe: PrecioPt }) {
  const [bloques, setBloques] = useState<BloqueRolliza[]>([]);
  const [dim, setDim] = useState<DimensionResumen>("tipo");
  const [hayTrozas, setHayTrozas] = useState(0);
  /**
   * Líneas ya registradas en el Libro de Operaciones. Se guardan porque el
   * aserradero registra de a poco: se marca lo que se pasó hoy y mañana se sigue
   * desde ahí — si se perdiera al recargar, no serviría para nada.
   */
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  /** Quién firma el PDF. Se persiste: es la misma persona semana a semana. */
  const [firmaNombre, setFirmaNombre] = useState("");
  const [firmaCargo, setFirmaCargo] = useState("");
  /** Especies a exportar. Vacío = todas — filtrar es la excepción, no la regla. */
  const [soloEspecies, setSoloEspecies] = useState<Set<string>>(new Set());
  const [opcionesAbiertas, setOpcionesAbiertas] = useState(false);
  /**
   * Bloques marcados para JUNTAR en un solo Anexo 04 — «bloque 1 + bloque 3»
   * como si fuera una sola guía. Vive acá (no por bloque) porque la unión es
   * un conjunto que se arma y se descarta entre bloques que ni siquiera son
   * vecinos en la tabla.
   */
  const [seleccionAnexo, setSeleccionAnexo] = useState<Set<string>>(new Set());

  /**
   * Buffer de texto crudo por campo decimal (m³, % aprovechable, ampara m³
   * manual, S/ por m³) — separado del NÚMERO que se guarda en `bloques`.
   *
   * Sin esto, el input mostraba directamente `bloque.m3` (ya convertido a
   * Number en cada tecla): escribir "23.5" se volvía "235", porque al tipear
   * el "." el valor se colapsaba a 23 y el "." desaparecía de la pantalla —
   * el 5 siguiente se pegaba al entero en vez de ser el decimal. Con el
   * buffer, el input muestra EXACTAMENTE lo tipeado hasta que se sale del
   * campo; recién ahí vuelve a mostrar el número ya canonizado.
   */
  const [buffer, setBuffer] = useState<Record<string, string>>({});
  const claveBuffer = (id: string, campo: string) => `${id}:${campo}`;
  const valorTexto = (id: string, campo: string, actual: number | null | undefined, mostrarCero: boolean) => {
    const clave = claveBuffer(id, campo);
    if (clave in buffer) return buffer[clave];
    if (mostrarCero) return actual == null ? "" : String(actual);
    return actual ? String(actual) : "";
  };
  const onCambioDecimal = (id: string, campo: "m3" | "aprovechablePct" | "amparaManualM3" | "costoM3") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Sólo dígitos y un separador decimal — el resto de la validación
      // (coma peruana, número inválido → 0) ya la hace `editar`.
      const crudo = e.target.value.replace(/[^\d.,]/g, "");
      setBuffer((prev) => ({ ...prev, [claveBuffer(id, campo)]: crudo }));
      editar(id, campo, crudo);
    };
  const onBlurDecimal = (id: string, campo: string) => () => {
    setBuffer((prev) => {
      const clave = claveBuffer(id, campo);
      if (!(clave in prev)) return prev;
      const next = { ...prev };
      delete next[clave];
      return next;
    });
  };
  /** El filtro de largo ya no es texto: cada largo trae su % — se guarda directo, sin buffer. */
  const setLargoFiltro = (id: string, next: FiltroLargo[] | null) =>
    guardar(bloques.map((b) => (b.id === id ? { ...b, largoFiltro: next } : b)));

  // Los bloques se persisten: en el aserradero se cubica hoy y se costea mañana.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveLocal("-rolliza"));
      if (raw) setBloques(JSON.parse(raw) as BloqueRolliza[]);
      const m = localStorage.getItem(claveLocal("-rolliza-marcas"));
      if (m) setMarcadas(new Set(JSON.parse(m) as string[]));
      const s = localStorage.getItem(claveLocal("-rolliza-anexo-sel"));
      if (s) setSeleccionAnexo(new Set(JSON.parse(s) as string[]));
      const f = localStorage.getItem(claveLocal("-rolliza-firma"));
      if (f) {
        const j = JSON.parse(f) as { nombre?: string; cargo?: string };
        setFirmaNombre(j.nombre ?? "");
        setFirmaCargo(j.cargo ?? "");
      }
    } catch { /* ignore */ }
    setHayTrozas(leerTrozas().length);
  }, []);

  /**
   * Escribe la firma al tiro del cambio, no desde un efecto que mira
   * `[firmaNombre, firmaCargo]`: ese efecto corría también en el MISMO commit
   * del mount (antes de que el `setFirmaNombre` del efecto de lectura llegara
   * a pintar), así que pisaba lo recién leído con `""` — la firma no
   * sobrevivía un F5 (auditoría 2026-08-17). Mismo patrón que `marcar`/`guardar`.
   */
  const guardarFirmaNombre = (v: string) => {
    setFirmaNombre(v);
    try { localStorage.setItem(claveLocal("-rolliza-firma"), JSON.stringify({ nombre: v, cargo: firmaCargo })); } catch { /* quota */ }
  };
  const guardarFirmaCargo = (v: string) => {
    setFirmaCargo(v);
    try { localStorage.setItem(claveLocal("-rolliza-firma"), JSON.stringify({ nombre: firmaNombre, cargo: v })); } catch { /* quota */ }
  };

  /** Marca o desmarca líneas; `estado` fuerza el valor (para «todo el día»). */
  const marcar = useCallback((claves: string[], estado?: boolean) => {
    setMarcadas((prev) => {
      const next = new Set(prev);
      const encender = estado ?? !claves.every((k) => prev.has(k));
      for (const k of claves) {
        if (encender) next.add(k); else next.delete(k);
      }
      try { localStorage.setItem(claveLocal("-rolliza-marcas"), JSON.stringify([...next])); } catch { /* quota */ }
      return next;
    });
  }, []);
  const guardar = useCallback((next: BloqueRolliza[]) => {
    setBloques(next);
    try { localStorage.setItem(claveLocal("-rolliza"), JSON.stringify(next)); } catch { /* quota */ }
  }, []);

  /**
   * Persiste la selección del Anexo 04 conjunto — mismo patrón que `marcar`:
   * si no sobrevive un F5, quien viene marcando bloque por bloque durante el
   * día los pierde apenas recarga la pestaña.
   */
  const guardarSeleccionAnexo = (next: Set<string>) => {
    setSeleccionAnexo(next);
    try { localStorage.setItem(claveLocal("-rolliza-anexo-sel"), JSON.stringify([...next])); } catch { /* quota */ }
  };
  /** Marca/desmarca un bloque para juntarlo con otros en un solo Anexo 04. */
  const alternarSeleccionAnexo = (id: string) => {
    const next = new Set(seleccionAnexo);
    if (next.has(id)) next.delete(id); else next.add(id);
    guardarSeleccionAnexo(next);
  };
  /** Borrar un bloque lo saca también de la selección para el Anexo 04 conjunto. */
  const quitarBloque = (id: string) => {
    guardar(bloques.filter((x) => x.id !== id));
    if (seleccionAnexo.has(id)) {
      const next = new Set(seleccionAnexo);
      next.delete(id);
      guardarSeleccionAnexo(next);
    }
  };

  const traerDeTrozas = () => {
    const nuevos = bloquesDesdeTrozas(leerTrozas());
    if (nuevos.length === 0) return;
    // Reemplaza los que ya vinieron de trozas y conserva los cargados a mano:
    // re-importar no puede borrar lo que alguien tipeó.
    guardar([...bloques.filter((b) => b.origen !== "trozas"), ...nuevos]);
  };

  /**
   * El botón «Agregar bloque» de la zona de descuadre: crea un bloque YA
   * cargado con la especie y los m³ de rolliza que hacen falta para cubrir el
   * faltante — la misma cuenta que ya muestra «pide X m³ de troza», no una
   * nueva. La etiqueta queda vacía a propósito: es un bloque SUGERIDO, no una
   * GTF real todavía, y no hay que inventarle un número que el fiscalizador
   * después no puede cruzar contra ningún papel.
   */
  const agregarBloqueSugerido = (especie: string, m3: number) => {
    guardar([...bloques, { id: nuevoId(), etiqueta: "", especie: especie === "Sin especie" ? "" : especie, m3, origen: "manual", costoM3: null, aprovechablePct: null }]);
    // El bloque aparece arriba, en «Rolliza que entró» — sin esto, quien tocó
    // el botón (más abajo, en el resultado) no ve que pasó nada.
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[aria-label="Etiqueta del bloque de rolliza"]');
      const ultimo = inputs[inputs.length - 1];
      ultimo?.scrollIntoView({ behavior: "smooth", block: "center" });
      ultimo?.focus();
    });
  };

  const editar = (
    id: string,
    campo: "etiqueta" | "especie" | "m3" | "costoM3" | "aprovechablePct" | "dias" | "amparaManualM3" | "piezasManual",
    valor: string,
  ) =>
    guardar(bloques.map((b) => {
      if (b.id !== id) return b;
      const n = () => Number(valor.replace(",", ".")) || 0;
      if (campo === "m3") return { ...b, m3: n() };
      // Días vacío = 1 jornada (`null`), no 0: un bloque siempre se aserró
      // algún día. El saneado real vive en `diasDe` — acá sólo se guarda.
      if (campo === "dias") return { ...b, dias: valor.trim() === "" ? null : Math.max(1, Math.floor(n())) };
      if (campo === "aprovechablePct") return { ...b, aprovechablePct: valor.trim() === "" ? null : n() };
      /* Vacío = «que lo calcule el sistema». 0 es un dato: un bloque que todavía
         no dio nada. Por eso no se puede colapsar vacío con cero. */
      if (campo === "amparaManualM3") return { ...b, amparaManualM3: valor.trim() === "" ? null : n() };
      if (campo === "piezasManual") return { ...b, piezasManual: valor.trim() === "" ? null : Math.max(0, Math.floor(n())) };
      // Costo vacío = `null` (no se conoce), NUNCA 0: un 0 diría que la madera
      // fue gratis y el costo por producto saldría mal sin avisar.
      if (campo === "costoM3") return { ...b, costoM3: valor.trim() === "" ? null : n() };
      return { ...b, [campo]: valor };
    }));

  /**
   * Override manual de UNA LÍNEA del resultado ya distribuido (ej. sólo
   * «Comercial» dentro de un bloque), en vez del bloque entero. Vive aparte de
   * `editar()` porque no es un campo de `BloqueRolliza` sino una entrada del
   * mapa `overridesLinea`, con su propia clave por línea (`claveOverrideLinea`,
   * que incluye el `dim` vigente para no aplicar un override armado bajo otra
   * vista). Piezas y m³ en blanco a la vez = sin override: se borra la
   * entrada, no se arrastra un objeto vacío en el estado.
   */
  const editarLinea = (bloqueId: string, claveGrupo: string, campo: "piezas" | "m3", valor: string) => {
    const clave = claveOverrideLinea(dim, claveGrupo);
    guardar(bloques.map((b) => {
      if (b.id !== bloqueId) return b;
      const actuales = b.overridesLinea ?? {};
      const actual = actuales[clave] ?? {};
      const vacio = valor.trim() === "";
      const n = () => Number(valor.replace(",", ".")) || 0;
      const next = campo === "piezas"
        ? { ...actual, piezas: vacio ? null : Math.max(0, Math.floor(n())) }
        : { ...actual, m3: vacio ? null : Math.max(0, n()) };
      const overridesLinea = { ...actuales };
      if (next.piezas == null && next.m3 == null) delete overridesLinea[clave];
      else overridesLinea[clave] = next;
      return { ...b, overridesLinea };
    }));
  };
  const idLinea = (bloqueId: string, claveGrupo: string) => `${bloqueId}|linea|${claveGrupo}`;
  const onCambioDecimalLinea = (bloqueId: string, claveGrupo: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const crudo = e.target.value.replace(/[^\d.,]/g, "");
      setBuffer((prev) => ({ ...prev, [claveBuffer(idLinea(bloqueId, claveGrupo), "m3")]: crudo }));
      editarLinea(bloqueId, claveGrupo, "m3", crudo);
    };
  const onBlurDecimalLinea = (bloqueId: string, claveGrupo: string) => onBlurDecimal(idLinea(bloqueId, claveGrupo), "m3");
  const valorTextoLinea = (bloqueId: string, claveGrupo: string, actual: number | null | undefined) =>
    valorTexto(idLinea(bloqueId, claveGrupo), "m3", actual, true);

  /** Largos (pies) que de verdad hay pendientes de cubicar — para que el
   * filtro se elija de una lista real, no se adivine a mano. */
  const largosDisponibles = useMemo(
    () => Array.from(new Set(rows.map((r) => Math.round(toFeet(r.largo, r.uLargo))))).sort((a, b) => a - b),
    [rows],
  );

  const dist = useMemo(() => distribuirPorCapacidad(bloques, rows, dim, precioDe), [bloques, rows, dim, precioDe]);
  const t = dist.totales;
  /** Cada bloque YA distribuido, con su especie — para poder buscarlo por id
   *  sin importar bajo qué grupo de especie terminó cayendo. */
  const bloquesDistribuidos = useMemo(
    () => dist.especies.flatMap((e) => e.bloques.map((b) => ({ b, especie: e.especie }))),
    [dist],
  );
  /**
   * Lo que juntan los bloques marcados con el checkbox «Anexo 4»: sus piezas
   * concatenadas (cada una ya trae su propia especie, así que mezclar especies
   * no las confunde — el Anexo 04 las separa de nuevo en sus propios bloques
   * especie × tipo) y un rótulo con las etiquetas de origen, para no perder de
   * qué guías salió el papel conjunto.
   */
  const combinadoAnexo = useMemo(() => {
    const elegidos = bloquesDistribuidos.filter(({ b }) => seleccionAnexo.has(b.bloque.id));
    const piezas = elegidos.flatMap(({ b, especie }) => piezasDelBloque(b, especie));
    return {
      piezas,
      amparaM3: elegidos.reduce((a, { b }) => a + b.capacidadM3, 0),
      etiqueta: elegidos.map(({ b }) => b.bloque.etiqueta || "sin etiqueta").join(" + "),
      especies: [...new Set(elegidos.map(({ especie }) => especie).filter(Boolean))],
      cantidad: elegidos.length,
      /** Lo REALMENTE distribuido (aserrada) de estos bloques — no confundir
       *  con `amparaM3` (la capacidad de la rolliza): son las piezas que ya
       *  quedaron asignadas, la misma cuenta que va al Anexo 04. */
      piezasCant: piezas.reduce((a, p) => a + p.cantidad, 0),
      pieTablar: piezas.reduce((a, p) => a + p.pieTablar, 0),
      m3Aserrado: piezas.reduce((a, p) => a + p.m3, 0),
    };
  }, [bloquesDistribuidos, seleccionAnexo]);
  const conCosto = dist.especies.some((e) => e.costoRolliza != null && e.rollizaM3 > 0);
  const juicio = juzgarRendimiento(t.rendimientoPct);
  /** El % aprovechable declarado, ponderado por volumen: lo que se ESPERABA sacar. */
  const aprovechableEsperado = t.rollizaM3 > 0 ? (t.capacidadM3 / t.rollizaM3) * 100 : null;

  const exportar = () => {
    const blob = new Blob([`﻿${distribucionACsv(filtrarPorEspecies(dist, soloEspecies), ETIQUETA_DIMENSION[dim])}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "distribucion-rolliza-aserrada.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /**
   * PDF y Excel traen jsPDF/exceljs por import dinámico: la primera vez tarda,
   * así que el botón lo dice en vez de parecer que no respondió.
   */
  /**
   * El bloque cuyo ANEXO 04 se está viendo. El papel se emite POR BLOQUE: cada
   * uno ampara una guía distinta, y un anexo que mezclara dos no se puede
   * presentar contra ninguna.
   */
  const [anexoDe, setAnexoDe] = useState<{ piezas: PiezaCubicada[]; especie: string; etiqueta: string } | null>(null);
  const [bajando, setBajando] = useState<"pdf" | "excel" | null>(null);
  const [errorBajar, setErrorBajar] = useState<string | null>(null);
  const bajar = async (que: "pdf" | "excel") => {
    setBajando(que);
    setErrorBajar(null);
    try {
      const etiqueta = ETIQUETA_DIMENSION[dim].replace("Por ", "");
      const firma: FirmaResponsable | undefined = firmaNombre.trim() ? { nombre: firmaNombre.trim(), cargo: firmaCargo.trim() || undefined } : undefined;
      // Las marcas viajan al papel: el que recibe el archivo ve qué líneas ya
      // están en el Libro y cuáles no — que es la mitad del valor de tildarlas.
      if (que === "pdf") await exportarDistribucionPDF(dist, etiqueta, marcadas, firma, soloEspecies);
      else await exportarDistribucionExcel(dist, etiqueta, marcadas, firma, soloEspecies);
    } catch (err) {
      // Un `catch` vacío dejaría el botón en «Generando…» para siempre y nadie
      // sabría por qué no bajó el archivo.
      console.error("[distribucion-export] falló la descarga", err);
      setErrorBajar(err instanceof Error ? err.message : String(err));
    } finally {
      setBajando(null);
    }
  };

  return (
    <SeccionResumen
      icon={Share2}
      titulo="Distribución de rolliza sobre lo aserrado"
      hint={
        <>
          Cada bloque ampara hasta su <b>capacidad</b> (m³ × % aprovechable) y no más. Lo que no entra pasa al bloque
          siguiente; lo que no entra en ninguno queda abajo, en <b>Falta por distribuir</b>.
        </>
      }
      acciones={
        <>
          {/* Con el label visible al lado, no hay que abrir el desplegable para
              saber qué controla — antes sólo lo decía el aria-label, invisible. */}
          <label className="flex items-center gap-1.5">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Agrupar</span>
            <select
              value={dim}
              onChange={(e) => setDim(e.target.value as DimensionResumen)}
              aria-label="Cómo agrupar la aserrada"
              className="h-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              {DIMENSIONES_RESUMEN.filter((d) => d !== "especie").map((d) => (
                <option key={d} value={d}>{ETIQUETA_DIMENSION[d]}</option>
              ))}
            </select>
          </label>
          {/* Separador — agrupar es una cosa (cómo se lee la tabla), exportar
              es otra (qué te llevás); antes las cuatro cosas se leían como un
              solo racimo de controles sueltos. */}
          <div className="h-6 w-px shrink-0 bg-[var(--rule-base)]" aria-hidden />
          {/* Tres salidas para tres usos: el PDF se firma y se archiva, el
              Excel se cruza contra la planilla del contador, el CSV es el
              pegado rápido. Los tres bajan hasta la MEDIDA. */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void bajar("pdf")} disabled={bloques.length === 0 || bajando !== null} className={BTN}>
              <FileText className="h-4 w-4" /> {bajando === "pdf" ? "Generando…" : "PDF"}
            </button>
            <button type="button" onClick={() => void bajar("excel")} disabled={bloques.length === 0 || bajando !== null} className={BTN}>
              <FileSpreadsheet className="h-4 w-4" /> {bajando === "excel" ? "Generando…" : "Excel"}
            </button>
            <button type="button" onClick={exportar} disabled={bloques.length === 0} className={BTN}>
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              type="button"
              onClick={() => setOpcionesAbiertas((v) => !v)}
              disabled={bloques.length === 0}
              aria-expanded={opcionesAbiertas}
              title="Firma del responsable y qué especies incluir en el papel"
              className={`${BTN} ${soloEspecies.size > 0 || firmaNombre.trim() ? "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""}`}
            >
              <SlidersHorizontal className="h-4 w-4" /> Opciones
            </button>
          </div>
        </>
      }
    >

      <AlertaDescuadre libreM3={t.libreM3} faltanteM3={t.faltanteM3} />

      {opcionesAbiertas && (
        <OpcionesExportacion
          firmaNombre={firmaNombre} onFirmaNombre={guardarFirmaNombre}
          firmaCargo={firmaCargo} onFirmaCargo={guardarFirmaCargo}
          especies={dist.especies.map((e) => e.especie)}
          soloEspecies={soloEspecies} setSoloEspecies={setSoloEspecies}
        />
      )}

      {/* ── Lo que entró ───────────────────────────────────────────────────── */}
      <div className="mb-4 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Rolliza que entró {bloques.length > 0 && `· ${fmtM3(t.rollizaM3)} m³ (R) → ampara ${fmtM3(t.capacidadM3)} m³ (A)`}
          </span>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button type="button" onClick={traerDeTrozas} disabled={hayTrozas === 0} title={hayTrozas === 0 ? "No hay trozas cubicadas en este dispositivo" : `Traer ${hayTrozas} trozas ya cubicadas`} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40">
              <Layers className="h-3.5 w-3.5" /> Traer del cubicador de trozas{hayTrozas > 0 ? ` (${hayTrozas})` : ""}
            </button>
            <button type="button" onClick={() => guardar([...bloques, { id: nuevoId(), etiqueta: "", especie: "", m3: 0, origen: "manual", costoM3: null, aprovechablePct: null }])} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <Plus className="h-3.5 w-3.5" /> Agregar bloque
            </button>
          </div>
        </div>

        {bloques.length === 0 ? (
          <p className="py-3 text-center text-sm text-[var(--text-tertiary)]">
            Cargá la rolliza que entró (GTF, lote o troza) para distribuirla sobre lo que salió aserrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Bloques de rolliza" className="w-full min-w-[1040px] text-base">
              <thead>
                <tr className="border-b-2 border-[var(--rule-base)] text-left text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  <ThAyuda alinear="left" ayuda="El número de guía (GTF) o el código del lote de la troza que entró. Sirve para rastrear de dónde salió este bloque.">
                    Etiqueta (GTF / lote)
                  </ThAyuda>
                  <ThAyuda alinear="left" ayuda="La especie de la rolliza de este bloque (Tornillo, Cedro, etc.) — se usa para agrupar y declarar por especie.">
                    Especie
                  </ThAyuda>
                  <ThAyuda ayuda="Metros cúbicos de ROLLIZA (R) que entraron en este bloque — la troza tal como llegó, antes de aserrar.">
                    m³ (R)
                  </ThAyuda>
                  <ThAyuda ayuda="En cuántas jornadas se aserró este bloque. El Libro de Operaciones se registra día por día: si tardó más de una, contalas acá.">
                    Días
                  </ThAyuda>
                  <ThAyuda ayuda="Qué parte de esa rolliza se convierte en madera aserrada. Sin dato propio, se usa un supuesto del centro del rango normal de aserrío (55 %).">
                    % aprovechable
                  </ThAyuda>
                  <ThAyuda ayuda="Metros cúbicos de madera ASERRADA (A) que este bloque respalda — lo que declarás como salido de esta rolliza. Se calcula solo (m³ × % aprovechable) salvo que lo escribas a mano.">
                    Ampara m³ (A)
                  </ThAyuda>
                  <ThAyuda ayuda="Cuántas piezas aserradas salieron de este bloque. Vacío = entran todas las que alcancen por volumen.">
                    Piezas
                  </ThAyuda>
                  <ThAyuda ayuda="Cuánto pagaste por cada metro cúbico de esta rolliza — opcional, solo para calcular el costo del bloque.">
                    S/ por m³
                  </ThAyuda>
                  <ThAyuda alinear="left" ayuda={<>Prioridad para estos largos (en pies) — «esta troza va primero a 12 pies». Escribí o elegí de la lista (son los largos que hay pendientes de cubicar) para agregar uno; tocá su chip para decidir si se lleva TODO lo pendiente de ese largo (completo) o sólo una parte (parcial, en %; el resto queda reservado para otro lado). Si a esos largos les sobra capacidad al bloque, SE COMPLETA con lo que haya (otros largos, otros tipos) — no se desperdicia. Vacío = cualquier largo, sin prioridad, como siempre.</>}>
                    Largo (pies)
                  </ThAyuda>
                  <th scope="col" className="whitespace-nowrap px-2 py-2 text-center">
                    <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
                      Anexo 4
                      <AdminTooltip
                        content="Marcá dos o más bloques para juntarlos en un solo Anexo 04 — como si fuera una sola guía. Cada pieza conserva su especie, así que da igual si los bloques marcados son de especies distintas."
                        className="max-w-[220px] font-normal normal-case tracking-normal"
                      >
                        <button type="button" aria-label="Qué significa Anexo 4" className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]">
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </AdminTooltip>
                    </span>
                  </th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {bloques.map((b) => {
                  const ap = aprovechableDe(b);
                  return (
                    <tr key={b.id} className="border-t border-[var(--rule-soft)] transition-colors hover:bg-primary/5">
                      <td className="px-2 py-1.5">
                        <input value={b.etiqueta} onChange={(e) => editar(b.id, "etiqueta", e.target.value)} placeholder="GTF-0231" aria-label="Etiqueta del bloque de rolliza" className="h-9 w-full min-w-[140px] rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={b.especie} onChange={(e) => editar(b.id, "especie", e.target.value)} aria-label="Especie del bloque" className="h-9 w-full min-w-[110px] rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
                          <option value="">Sin especie</option>
                          {ESPECIES_MADERA.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={valorTexto(b.id, "m3", b.m3, false)} onChange={onCambioDecimal(b.id, "m3")} onBlur={onBlurDecimal(b.id, "m3")} inputMode="decimal" placeholder="20" aria-label="Metros cúbicos de rolliza" className="h-9 w-20 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
                      </td>
                      <td className="px-2 py-1.5">
                        {/* Un día es lo normal; el placeholder lo dice sin
                            escribirlo, igual que el % aprovechable. */}
                        <input value={b.dias ?? ""} onChange={(e) => editar(b.id, "dias", e.target.value)} inputMode="numeric" placeholder="1" aria-label="Días de aserrío del bloque" title="Se reparte lo amparado entre estas jornadas" className={`h-9 w-16 rounded-lg border-2 bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold tabular-nums outline-none focus:border-[var(--accent)] ${b.dias == null || b.dias <= 1 ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        {/* El placeholder muestra el default en vez de escribirlo:
                            un 55 tipeado se lee como un dato medido, y es un supuesto. */}
                        <input value={valorTexto(b.id, "aprovechablePct", b.aprovechablePct, true)} onChange={onCambioDecimal(b.id, "aprovechablePct")} onBlur={onBlurDecimal(b.id, "aprovechablePct")} inputMode="decimal" placeholder={String(APROVECHABLE_DEFAULT)} aria-label="Porcentaje aprovechable del bloque" title={b.aprovechablePct == null ? `Supuesto: ${APROVECHABLE_DEFAULT} % (centro del rango normal de aserrío). Escribí el tuyo.` : undefined} className={`h-9 w-20 rounded-lg border-2 bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold tabular-nums outline-none focus:border-[var(--accent)] ${b.aprovechablePct == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`} />
                      </td>
                      {/* Editable: lo MEDIDO le gana al porcentaje supuesto. El
                          placeholder muestra lo que calcularía el sistema. */}
                      <td className="px-2 py-1.5">
                        <input
                          value={valorTexto(b.id, "amparaManualM3", b.amparaManualM3, true)}
                          onChange={onCambioDecimal(b.id, "amparaManualM3")}
                          onBlur={onBlurDecimal(b.id, "amparaManualM3")}
                          inputMode="decimal"
                          placeholder={fmtM3((Number(b.m3) || 0) * (ap / 100))}
                          aria-label="Metros cúbicos que ampara el bloque"
                          title={b.amparaManualM3 == null ? "Se calcula como m³ × % aprovechable. Escribí el tuyo para decirlo a mano." : "Dicho a mano: manda sobre el % aprovechable"}
                          className={`h-9 w-24 rounded-lg border-2 bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold tabular-nums outline-none focus:border-[var(--accent)] ${b.amparaManualM3 == null ? "border-dashed border-[var(--rule-base)] text-[var(--accent)]" : "border-[var(--accent)] text-[var(--accent)]"}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={b.piezasManual ?? ""}
                          onChange={(e) => editar(b.id, "piezasManual", e.target.value)}
                          inputMode="numeric"
                          placeholder="todas"
                          aria-label="Tope de piezas del bloque"
                          title="Cuántas piezas salieron de este bloque. Vacío = las que entren por volumen."
                          className={`h-9 w-20 rounded-lg border-2 bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums outline-none focus:border-[var(--accent)] ${b.piezasManual == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={valorTexto(b.id, "costoM3", b.costoM3, true)} onChange={onCambioDecimal(b.id, "costoM3")} onBlur={onBlurDecimal(b.id, "costoM3")} inputMode="decimal" placeholder="opcional" aria-label="Costo por metro cúbico de rolliza" className="h-9 w-24 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
                      </td>
                      <td className="px-2 py-1.5">
                        <FiltroLargoCelda
                          valor={b.largoFiltro}
                          onChange={(next) => setLargoFiltro(b.id, next)}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={seleccionAnexo.has(b.id)}
                          onChange={() => alternarSeleccionAnexo(b.id)}
                          aria-label={`Juntar el bloque ${b.etiqueta || "sin etiqueta"} en un Anexo 04 conjunto`}
                          title="Juntar este bloque con otros en un solo Anexo 04"
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button type="button" onClick={() => quitarBloque(b.id)} aria-label={`Quitar el bloque ${b.etiqueta || "sin etiqueta"}`} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-600)]">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* El cierre de la tabla: cuánta rolliza entró y cuánto ampara en
                  total. Es la primera comparación que se hace y estaba sólo en
                  el rótulo de arriba. */}
              <tfoot>
                <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 text-base font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <th scope="row" colSpan={2} className="px-2 py-2.5 text-left">
                    Total · {bloques.length} bloque{bloques.length === 1 ? "" : "s"}
                  </th>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">{fmtM3(t.rollizaM3)}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                    {bloques.reduce((a, b) => a + (Number(b.dias) > 1 ? Number(b.dias) : 1), 0)}
                  </td>
                  <td className="px-2 py-2.5" />
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">{fmtM3(t.capacidadM3)}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                    {dist.especies.reduce((a, e) => a + e.bloques.reduce((x, b) => x + b.asignado.reduce((y, g) => y + g.piezas, 0), 0), 0)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                    {t.costoRolliza != null ? `S/ ${fmtSoles(t.costoRolliza)}` : "—"}
                  </td>
                  <td className="px-2 py-2.5" />
                  <td className="px-2 py-2.5" />
                </tr>
              </tfoot>
            </table>
            <datalist id="largos-disponibles">
              {largosDisponibles.map((l) => <option key={l} value={l} />)}
            </datalist>
          </div>
        )}
        {bloques.length > 1 && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
            <ArrowDown className="h-3 w-3" aria-hidden /> Se llenan en este orden: el sobrante del primero pasa al siguiente.
          </p>
        )}
        {/* ── Juntar bloques marcados en un solo Anexo 04 ──────────────────── */}
        {seleccionAnexo.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-primary/5 px-3 py-2 print:hidden">
            <Combine className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {combinadoAnexo.cantidad} bloque{combinadoAnexo.cantidad === 1 ? "" : "s"} marcado{combinadoAnexo.cantidad === 1 ? "" : "s"}
              <span className="ml-1 font-normal text-[var(--text-tertiary)]">
                ({combinadoAnexo.etiqueta || "sin etiqueta"} · ampara {fmtM3(combinadoAnexo.amparaM3)} m³)
              </span>
            </span>
            {/* Lo YA distribuido de estos bloques — la misma cuenta que va al
                Anexo 04, para saber de un vistazo cuánto junta antes de abrirlo. */}
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 whitespace-nowrap font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
              <span>{fmtPiezas(combinadoAnexo.piezasCant)} <span className="font-sans font-normal text-[var(--text-tertiary)]">piezas</span></span>
              <span>{fmtPt(combinadoAnexo.pieTablar)} <span className="font-sans font-normal text-[var(--text-tertiary)]">PT</span></span>
              <span>{fmtM3(combinadoAnexo.m3Aserrado)} <span className="font-sans font-normal text-[var(--text-tertiary)]">m³ aserrados</span></span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => guardarSeleccionAnexo(new Set())}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden /> Limpiar
              </button>
              <button
                type="button"
                disabled={combinadoAnexo.piezas.length === 0}
                title={combinadoAnexo.piezas.length === 0 ? "Los bloques marcados todavía no tienen piezas asignadas" : "Abrir un solo Anexo 04 con las piezas de todos los bloques marcados"}
                onClick={() => setAnexoDe({
                  piezas: combinadoAnexo.piezas,
                  especie: combinadoAnexo.especies.length === 1 ? combinadoAnexo.especies[0] : "",
                  etiqueta: combinadoAnexo.etiqueta,
                })}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 disabled:opacity-40 dark:text-[var(--accent)]"
              >
                <FileText className="h-4 w-4" aria-hidden /> Anexo 04 conjunto
              </button>
            </div>
          </div>
        )}
      </div>

      {errorBajar && (
        <p className="mb-3 rounded-lg border-2 border-[var(--data-error-500)] px-3 py-2 text-sm text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">
          No se pudo generar el archivo: {errorBajar}
        </p>
      )}

      {/* ── Lo que no cruza ────────────────────────────────────────────────── */}
      {(dist.rollizaHuerfana.length > 0 || dist.aserradaHuerfana.length > 0) && (
        <ul className="mb-3 space-y-1">
          {dist.rollizaHuerfana.map((h) => (
            <li key={`r-${h.especie}`} className="flex items-start gap-2 text-sm text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span><b>{fmtM3(h.m3)} m³ de {h.especie}</b> entraron en troza y no hay aserrada de esa especie.</span>
            </li>
          ))}
          {dist.aserradaHuerfana.map((h) => (
            <li key={`a-${h.especie}`} className="flex items-start gap-2 text-sm text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span><b>{fmtM3(h.m3)} m³ de {h.especie}</b> aserrados sin rolliza declarada: quedan enteros en el faltante.</span>
            </li>
          ))}
        </ul>
      )}

      {dist.especies.map((e) => (
        <BloqueEspecie
          key={e.especie}
          e={e}
          dim={dim}
          conCosto={conCosto}
          marcadas={marcadas}
          marcar={marcar}
          onAnexo={(b) => setAnexoDe({ piezas: piezasDelBloque(b, e.especie), especie: e.especie, etiqueta: b.bloque.etiqueta || "Sin etiqueta" })}
          editarBloque={editar}
          valorTexto={valorTexto}
          onCambioDecimal={onCambioDecimal}
          onBlurDecimal={onBlurDecimal}
          onAgregarBloqueSugerido={agregarBloqueSugerido}
          onEditarLinea={editarLinea}
          valorTextoLinea={valorTextoLinea}
          onCambioDecimalLinea={onCambioDecimalLinea}
          onBlurDecimalLinea={onBlurDecimalLinea}
        />
      ))}

      {/* ── El diferenciador: lo repartido contra lo que falta ─────────────── */}
      {(t.aserradaM3 > 0 || t.faltanteM3 > 0) && (
        <div className="mb-4 space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Scale className="h-4 w-4 text-[var(--accent)]" aria-hidden /> Cuánto falta por distribuir
          </span>
          <DiferenciaDistribucion dist={dist} />
        </div>
      )}

      {/* ── El cierre general ──────────────────────────────────────────────── */}
      {(t.rollizaM3 > 0 || t.aserradaM3 > 0) && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiResumen label="Rolliza que entró" value={fmtM3(t.rollizaM3)} unidad="m³" hint={`ampara ${fmtM3(t.capacidadM3)} m³`} />
          <KpiResumen label="Aserrada amparada" value={fmtM3(t.amparadaM3)} unidad="m³" hint={`de ${fmtM3(t.aserradaM3)} m³ producidos`} />
          <KpiResumen
            label="Falta por distribuir"
            value={fmtM3(t.faltanteM3)}
            unidad="m³"
            hint={t.faltanteM3 > 0 ? `pide ${fmtM3(t.rollizaFaltanteM3)} m³ de troza` : "todo tiene respaldo"}
            tono={t.faltanteM3 > 0 ? TONO.warning : TONO.success}
          />
          <KpiResumen
            label="Rendimiento general"
            value={t.rendimientoPct == null ? "—" : fmtPct(t.rendimientoPct)}
            unidad={t.rendimientoPct == null ? undefined : "%"}
            /* El real y el aprovechable declarado son dos números distintos y la
               pantalla los mostraba sueltos: se lee «22 %, bajo para aserrío»
               justo debajo de un «50 %» tipeado a mano y parece un error de
               cuenta. No lo es — sobró troza sin aserrar — pero eso hay que
               decirlo acá, que es donde se mira. */
            hint={
              t.libreM3 > 0 && aprovechableEsperado != null
                ? `esperabas ${fmtPct(aprovechableEsperado)} % · sobran ${fmtM3(t.libreM3)} m³ sin aserrar`
                : juicio.label
            }
            tono={TONO[juicio.tono]}
          />
        </div>
      )}
      {conCosto && t.costoRolliza != null && (
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">
          Costo de la rolliza cargada: <b className="text-[var(--text-secondary)]">S/ {fmtSoles(t.costoRolliza)}</b>
        </p>
      )}
      {/* El Anexo 04 del bloque: el mismo papel del cubicador, con las piezas
          que ESTE bloque ampara. Se emite por bloque porque cada uno responde a
          una guía distinta. */}
      {anexoDe && (
        <Anexo04Modal
          rows={anexoDe.piezas}
          especieGlobal={anexoDe.especie}
          onCerrar={() => setAnexoDe(null)}
        />
      )}
    </SeccionResumen>
  );
}
