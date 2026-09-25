/**
 * distribucion-export — el papel de la distribución de rolliza sobre aserrada.
 *
 * Lo que el aserradero necesita mostrar (al contador, al cliente, al
 * fiscalizador) no es el total: es **qué piezas de qué medida entraron en cada
 * bloque de rolliza**. Por eso las dos salidas bajan hasta la medida —2×8×10,
 * 3×10×12— con su conteo ENTERO de piezas, y no se quedan en el tipo comercial.
 *
 * Cuatro partes, las mismas en Excel y en PDF:
 *   1. **Por bloque y tipo** — el vistazo rápido: bloque, especie, tipo,
 *      piezas, pie tablar y m³, sin bajar a la medida exacta («GTF-0231:
 *      Comercial tanto, Corta tanto»). Es la primera hoja/sección: la que se
 *      lee antes de entrar al detalle.
 *   2. **Medidas distribuidas** — ítem por ítem: bloque, especie, tipo, piezas,
 *      espesor, ancho, largo, pie tablar y m³, con subtotal por bloque.
 *   3. **Resumen por bloque** — qué entró, qué ampara, qué usó y qué le queda.
 *   4. **Falta por distribuir** — las piezas que ningún bloque alcanzó a cubrir.
 *
 * Mismas reglas que `cubicador-export`: client-only con imports dinámicos (fuera
 * del bundle inicial), medidas convertidas a pulgadas y pies (que es como mide
 * SERFOR) y .xlsx real en vez de CSV, para que cada columna caiga en su celda
 * sin depender del separador del Excel del usuario.
 */
import type { Workbook, Worksheet } from "exceljs";
import { toInches, toFeet, type Unidad } from "./cubicacion";
import { claveMarca, esAserradaDirecta, type Distribucion, type EspecieDistribucion } from "./cubicacion-reparto";

const TEAL = "FF008060";
const GRIS = "FFE6F4F0";
const ROJO = "FFC93B2C";
const fecha = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Debajo de esto un volumen es ruido de coma flotante, no madera. */
const EPS_FILTRO = 1e-6;

/**
 * Recorta la distribución a sólo estas especies para el papel — sin `soloEspecies`
 * o vacío, pasa de largo. Los totales se recalculan SUMANDO los subtotales que
 * cada especie ya trae (misma fórmula que `distribuirPorCapacidad`), nunca
 * corriendo el reparto de nuevo: filtrar el PAPEL no puede cambiar qué bloque
 * amparó qué pieza.
 */
export function filtrarPorEspecies(d: Distribucion, soloEspecies?: ReadonlySet<string>): Distribucion {
  if (!soloEspecies || soloEspecies.size === 0) return d;
  const especies = d.especies.filter((e) => soloEspecies.has(e.especie));
  const sum = (f: (e: EspecieDistribucion) => number) => r4(especies.reduce((a, e) => a + f(e), 0));
  const totRolliza = sum((e) => e.rollizaM3);
  const totAserrada = sum((e) => e.aserradaM3);
  const totAmparadaDirecta = sum((e) => e.amparadaDirectaM3);
  return {
    especies,
    totales: {
      rollizaM3: totRolliza,
      aserradaDirectaM3: sum((e) => e.aserradaDirectaM3),
      amparadaDirectaM3: totAmparadaDirecta,
      capacidadM3: sum((e) => e.capacidadM3),
      aserradaM3: totAserrada,
      aserradaPt: r2(especies.reduce((a, e) => a + e.aserradaPt, 0)),
      amparadaM3: sum((e) => e.amparadaM3),
      amparadaPt: r2(especies.reduce((a, e) => a + e.amparadaPt, 0)),
      faltanteM3: sum((e) => e.faltanteM3),
      libreM3: sum((e) => e.libreM3),
      rollizaFaltanteM3: sum((e) => e.rollizaFaltanteM3),
      /* Mismo criterio que `distribuirPorCapacidad`: lo amparado por bloques
         de aserrada directa no entra al rendimiento de la sierra. */
      rendimientoPct: totRolliza > EPS_FILTRO ? r2(((totAserrada - totAmparadaDirecta) / totRolliza) * 100) : null,
      costoRolliza: especies.some((e) => e.costoRolliza == null && e.rollizaM3 > EPS_FILTRO)
        ? null
        : r2(especies.reduce((a, e) => a + (e.costoRolliza ?? 0), 0)),
    },
    rollizaHuerfana: d.rollizaHuerfana.filter((h) => soloEspecies.has(h.especie)),
    aserradaHuerfana: d.aserradaHuerfana.filter((h) => soloEspecies.has(h.especie)),
  };
}
/** El volumen del negocio va en 3 decimales: es como se mide y se declara. */
const m3 = (n: number) => n.toFixed(3);
/** Igual, pero `null` (un bloque sin troza de origen) se escribe como «—», no como 0. */
const m3Opt = (n: number | null) => (n == null ? "—" : n.toFixed(3));
const pulg = (v: number, u: string) => r2(toInches(v, u as Unidad));
const pies = (v: number, u: string) => r2(toFeet(v, u as Unidad));
/** El encabezado de la dimensión elegida ("tipo" → "Tipo"). */
const titulo = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Una fila del papel: las piezas de UNA medida, de UN día, dentro de UN bloque. */
export interface FilaMedida {
  /** Ítem correlativo del listado — el número con el que se cita una fila. */
  n: number;
  bloque: string;
  /** Jornada dentro del bloque (1…N). */
  dia: number;
  /** Jornadas del bloque: con 1 la columna «Día» no aporta nada. */
  dias: number;
  /** Ya se pasó al Libro de Operaciones (lo que se tildó en pantalla). */
  registrado: boolean;
  especie: string;
  /** El grupo de la dimensión elegida (tipo comercial, largo, sección…). */
  tipo: string;
  /** Piezas ENTERAS de esta medida que ampara el bloque. */
  piezas: number;
  espesor: number;
  ancho: number;
  largo: number;
  pieTablar: number;
  m3: number;
}

/**
 * Una fila de RESUMEN por bloque y tipo: cuánto de ESE tipo ampara ESE
 * bloque —piezas, pie tablar, m³— sin bajar a la medida exacta.
 *
 * Es la vista que falta entre el cierre del bloque (un solo total, sin tipo)
 * y el detalle por medida (2×8×10, demasiado fino para un vistazo). «El
 * bloque GTF-0231: Comercial tanto, Corta tanto» — que es literalmente lo que
 * ya se ve en pantalla por bloque (`AsignacionGrupo` en
 * `cubicacion-reparto.ts`), acá aplanado para el papel.
 */
export interface FilaBloqueTipo {
  n: number;
  bloque: string;
  /** N° de permiso (título habilitante) de origen del bloque, si se conoce. */
  permiso: string | null;
  /**
   * m³ (R) — la rolliza que entró a ESTE bloque, la misma cifra en cada tipo.
   * En un bloque de ASERRADA DIRECTA es `null`: no hubo troza que entrara, y
   * repetir ahí su m³ de tabla lo declararía como rolliza.
   */
  rollizaM3: number | null;
  /** Cómo se cargó el bloque — "Rolliza" o "Aserrada directa". */
  cargadoComo: "Rolliza" | "Aserrada directa";
  especie: string;
  dias: number;
  /** Día en que se aserró el bloque (AAAA-MM-DD), o `null` si no se dijo. */
  fecha: string | null;
  tipo: string;
  piezas: number;
  pieTablar: number;
  m3: number;
}

/**
 * Aplana la distribución a filas de (bloque × tipo) — single source para el
 * PDF y el Excel, mismo criterio que `filasDeMedidas`.
 */
export function filasPorBloqueYTipo(d: Distribucion): FilaBloqueTipo[] {
  const out: FilaBloqueTipo[] = [];
  for (const e of d.especies) {
    for (const b of e.bloques) {
      for (const g of b.asignado) {
        out.push({
          n: out.length + 1,
          bloque: b.bloque.etiqueta || "Sin etiqueta",
          permiso: b.bloque.permiso ?? null,
          rollizaM3: esAserradaDirecta(b.bloque) ? null : b.bloque.m3,
          cargadoComo: esAserradaDirecta(b.bloque) ? "Aserrada directa" : "Rolliza",
          especie: e.especie,
          dias: b.dias,
          fecha: b.bloque.fecha ?? null,
          tipo: g.label,
          piezas: g.piezas,
          pieTablar: g.pieTablar,
          m3: g.m3,
        });
      }
    }
  }
  return out;
}

/** El cierre de un bloque: lo que entró y lo que efectivamente amparó. */
export interface ResumenBloque {
  especie: string;
  bloque: string;
  dias: number;
  /** Día en que se aserró el bloque (AAAA-MM-DD), o `null` si no se dijo. */
  fecha: string | null;
  /** `null` en un bloque de aserrada directa: no entró troza. */
  rollizaM3: number | null;
  /** `null` en un bloque de aserrada directa: no hay nada que aprovechar. */
  aprovechablePct: number | null;
  /** Cómo se cargó el bloque — "Rolliza" o "Aserrada directa". */
  cargadoComo: "Rolliza" | "Aserrada directa";
  capacidadM3: number;
  usadoM3: number;
  libreM3: number;
  piezas: number;
  pieTablar: number;
  costoRolliza: number | null;
  costoPorM3Aserrada: number | null;
}

/** Una medida sin respaldo, con la troza que pediría. */
export interface FilaFaltante {
  n: number;
  especie: string;
  tipo: string;
  piezas: number;
  espesor: number;
  ancho: number;
  largo: number;
  pieTablar: number;
  m3: number;
  rollizaNecesariaM3: number;
}

/**
 * Aplana la distribución a filas de MEDIDA por bloque.
 *
 * Single source de las dos salidas: si el PDF y el Excel armaran sus filas por
 * separado, el papel que se firma y el archivo que se manda por correo dirían
 * cosas distintas del mismo lote.
 */
export function filasDeMedidas(d: Distribucion, marcadas?: ReadonlySet<string>): FilaMedida[] {
  const out: FilaMedida[] = [];
  for (const e of d.especies) {
    for (const b of e.bloques) {
      // Por JORNADA y no por bloque: el Libro se registra día a día, así que el
      // papel tiene que traer la línea del día, no el acumulado de la GTF.
      for (const dia of b.porDia) {
        for (const g of dia.grupos) {
        for (const m of g.medidas) {
          out.push({
            n: out.length + 1,
            bloque: b.bloque.etiqueta || "Sin etiqueta",
            dia: dia.dia,
            dias: b.dias,
            registrado: marcadas?.has(claveMarca(b.bloque.id, dia.dia, g.clave)) ?? false,
            especie: e.especie,
            tipo: g.label,
            piezas: m.piezas,
            espesor: pulg(m.espesor, m.uEspesor),
            ancho: pulg(m.ancho, m.uAncho),
            largo: pies(m.largo, m.uLargo),
            pieTablar: m.pieTablar,
            m3: m.m3,
          });
        }
        }
      }
    }
  }
  return out;
}

/** El cierre por bloque, en el mismo orden en que se cargaron. */
export function resumenDeBloques(d: Distribucion): ResumenBloque[] {
  const out: ResumenBloque[] = [];
  for (const e of d.especies) {
    for (const b of e.bloques) {
      out.push({
        especie: e.especie,
        bloque: b.bloque.etiqueta || "Sin etiqueta",
        dias: b.dias,
        fecha: b.bloque.fecha ?? null,
        rollizaM3: esAserradaDirecta(b.bloque) ? null : b.bloque.m3,
        aprovechablePct: esAserradaDirecta(b.bloque) ? null : b.aprovechablePct,
        cargadoComo: esAserradaDirecta(b.bloque) ? "Aserrada directa" : "Rolliza",
        capacidadM3: b.capacidadM3,
        usadoM3: b.usadoM3,
        libreM3: b.libreM3,
        piezas: b.asignado.reduce((a, g) => a + g.piezas, 0),
        pieTablar: r2(b.asignado.reduce((a, g) => a + g.pieTablar, 0)),
        costoRolliza: b.costoRolliza,
        costoPorM3Aserrada: b.costoPorM3Aserrada,
      });
    }
  }
  return out;
}

/** Las medidas que quedaron sin respaldo, aplanadas igual que las asignadas. */
export function filasDeFaltante(d: Distribucion): FilaFaltante[] {
  const out: FilaFaltante[] = [];
  for (const e of d.especies) {
    for (const f of e.faltante) {
      // La rolliza necesaria del grupo se reparte entre sus medidas en la misma
      // proporción: una medida suelta también tiene que poder decir cuánta
      // troza pide, o el faltante sólo sirve leído entero.
      for (const m of f.medidas) {
        const parte = f.m3 > 0 ? m.m3 / f.m3 : 0;
        out.push({
          n: out.length + 1,
          especie: e.especie,
          tipo: f.label,
          piezas: m.piezas,
          espesor: pulg(m.espesor, m.uEspesor),
          ancho: pulg(m.ancho, m.uAncho),
          largo: pies(m.largo, m.uLargo),
          pieTablar: m.pieTablar,
          m3: m.m3,
          rollizaNecesariaM3: Math.round(f.rollizaNecesariaM3 * parte * 1000) / 1000,
        });
      }
    }
  }
  return out;
}

/**
 * Conteo de piezas. Entero por construcción desde que el reparto va por piezas
 * enteras; el `~` queda como red por si alguna vez vuelve a llegar un prorrateo.
 *
 * ASCII a propósito: las fuentes estándar de jsPDF son WinAnsi y el `≈` que usa
 * la pantalla salía como «"H D .» en el papel. Se descubrió rasterizando el PDF
 * con ghostscript — ningún gate estático ve un carácter que no existe en la
 * fuente.
 */
const piezasTxt = (v: number) => (Number.isInteger(v) ? String(v) : `~ ${v.toFixed(2)}`);

/** Quién responde por la distribución — va al pie del PDF, con línea para firmar. */
export interface FirmaResponsable {
  nombre: string;
  cargo?: string;
}

export async function exportarDistribucionPDF(d: Distribucion, etiquetaDim: string, marcadas?: ReadonlySet<string>, firma?: FirmaResponsable, soloEspecies?: ReadonlySet<string>): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  d = filtrarPorEspecies(d, soloEspecies);
  const t = d.totales;
  const dimCol = titulo(etiquetaDim);
  const finalY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Distribución de rolliza sobre lo aserrado", 40, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(
    /* «ampara» acá es lo que ampara LA ROLLIZA: la capacidad de un bloque de
       aserrada directa es su propio m³ y se declara aparte, en la frase
       siguiente. Sumarlas decía «9 m³ de rolliza amparan 6.450» cuando
       amparan 4.950 y el resto ya venía aserrado. */
    `Fecha: ${fecha()} · Agrupado: ${etiquetaDim} · Rolliza ${m3(t.rollizaM3)} m³ · ampara ${m3(t.capacidadM3 - t.aserradaDirectaM3)} m³ · amparado ${m3(t.amparadaM3)} m³ de ${m3(t.aserradaM3)} producidos` +
    (t.aserradaDirectaM3 > EPS_FILTRO ? ` · Aserrada directa ${m3(t.aserradaDirectaM3)} m³ (A), sin troza de origen, ampara ${m3(t.amparadaDirectaM3)} m³` : "") +
    (soloEspecies && soloEspecies.size > 0 ? ` · Filtrado a: ${[...soloEspecies].join(", ")}` : ""),
    40, 62,
  );
  doc.text(
    "Cada bloque ampara hasta su capacidad (m³ × % aprovechable) y reparte PIEZAS ENTERAS entre los tipos pendientes, en proporción al volumen." +
    (t.aserradaDirectaM3 > EPS_FILTRO ? " Los bloques de aserrada directa amparan su propio m³ (A) y no cuentan como rolliza ni en el rendimiento." : ""),
    40, 76,
  );

  // ── 1. Resumen por bloque: qué entró y qué amparó cada uno ───────────────
  const bloques = resumenDeBloques(d);
  autoTable(doc, {
    head: [["Bloque (GTF / lote)", "Cargado como", "Especie", "Días", "Fecha", "Rolliza m³", "% aprov.", "Ampara m³", "Usa m³", "Libre m³", "Piezas", "Pie tablar"]],
    body: bloques.map((b) => [
      b.bloque, b.cargadoComo, b.especie, String(b.dias), b.fecha ?? "", m3Opt(b.rollizaM3),
      b.aprovechablePct == null ? "—" : b.aprovechablePct.toFixed(1), m3(b.capacidadM3),
      m3(b.usadoM3), m3(b.libreM3), piezasTxt(b.piezas), b.pieTablar.toFixed(2),
    ]),
    foot: [["TOTAL", "", "", "", "", m3(t.rollizaM3), "", m3(t.capacidadM3), m3(t.amparadaM3), m3(t.libreM3),
      piezasTxt(bloques.reduce((a, b) => a + b.piezas, 0)), t.amparadaPt.toFixed(2)]],
    startY: 90,
    // Sin esto el pie se repite en cada página y el TOTAL aparece ANTES de las
    // filas que suma — se lee como si la tabla ya hubiera terminado.
    showFoot: "lastPage",
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: [0, 128, 96], textColor: 255 },
    footStyles: { fillColor: [0, 128, 96], textColor: 255, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" } },
  });

  // ── 2. Distribución por bloque y tipo: comercial tanto, corta tanto… ──────
  // La vista que falta entre el resumen (un total por bloque) y el detalle
  // por medida (demasiado fino para un vistazo): dice, bloque por bloque,
  // cuánto de cada tipo comercial amparó — sin bajar a espesor·ancho·largo.
  const porTipo = filasPorBloqueYTipo(d);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 96, 72);
  doc.text("Distribución por bloque y tipo", 40, finalY() + 24);

  const bodyTipo: string[][] = [];
  const subtotalesTipo = new Set<number>();
  let bloqueTipoActual = "";
  let accBloqueTipo = { piezas: 0, pt: 0, m3: 0 };
  const cerrarBloqueTipo = () => {
    if (!bloqueTipoActual) return;
    subtotalesTipo.add(bodyTipo.length);
    bodyTipo.push(["", "", `Subtotal ${bloqueTipoActual}`, "", piezasTxt(accBloqueTipo.piezas), accBloqueTipo.pt.toFixed(2), m3(accBloqueTipo.m3)]);
  };
  for (const f of porTipo) {
    if (f.bloque !== bloqueTipoActual) {
      cerrarBloqueTipo();
      bloqueTipoActual = f.bloque;
      accBloqueTipo = { piezas: 0, pt: 0, m3: 0 };
    }
    accBloqueTipo.piezas += f.piezas; accBloqueTipo.pt += f.pieTablar; accBloqueTipo.m3 += f.m3;
    bodyTipo.push([f.bloque, m3Opt(f.rollizaM3), f.especie, f.tipo, piezasTxt(f.piezas), f.pieTablar.toFixed(2), m3(f.m3)]);
  }
  cerrarBloqueTipo();
  if (bodyTipo.length === 0) bodyTipo.push(["", "", "Ningún bloque amparó aserrada todavía.", "", "", "", ""]);

  autoTable(doc, {
    head: [["Bloque (GTF / lote)", "m³ (R)", "Especie", etiquetaDim.replace("Por ", "").replace(/^./, (c) => c.toUpperCase()), "Piezas", "Pie tablar", "m³"]],
    body: bodyTipo,
    foot: [["", m3(t.rollizaM3), "TOTAL AMPARADO", "", piezasTxt(porTipo.reduce((a, f) => a + f.piezas, 0)), t.amparadaPt.toFixed(2), m3(t.amparadaM3)]],
    startY: finalY() + 34,
    showFoot: "lastPage",
    styles: { fontSize: 8, cellPadding: 3.5 },
    headStyles: { fillColor: [0, 128, 96], textColor: 255 },
    footStyles: { fillColor: [0, 128, 96], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section === "body" && subtotalesTipo.has(data.row.index)) {
        data.cell.styles.fillColor = [230, 244, 240];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ── 3. Medidas distribuidas: el detalle que pide el papel ────────────────
  const filas = filasDeMedidas(d, marcadas);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 96, 72);
  doc.text("Medidas distribuidas", 40, finalY() + 24);

  const body: string[][] = [];
  const subtotales = new Set<number>();
  let bloqueActual = "";
  let diaActual = 0;
  let diasActual = 1;
  let accBloque = { piezas: 0, pt: 0, m3: 0 };
  let accDia = { piezas: 0, pt: 0, m3: 0 };
  /** El subtotal del día sólo existe si el bloque tiene más de una jornada. */
  const cerrarDia = () => {
    if (!bloqueActual || diasActual <= 1) return;
    subtotales.add(body.length);
    body.push(["", `${bloqueActual} · día ${diaActual}`, "", "", "", piezasTxt(accDia.piezas), "", "", "", accDia.pt.toFixed(2), m3(accDia.m3)]);
  };
  const cerrarBloque = () => {
    if (!bloqueActual) return;
    cerrarDia();
    subtotales.add(body.length);
    body.push(["", `Subtotal ${bloqueActual}`, "", "", "", piezasTxt(accBloque.piezas), "", "", "", accBloque.pt.toFixed(2), m3(accBloque.m3)]);
  };
  for (const f of filas) {
    if (f.bloque !== bloqueActual) {
      cerrarBloque();
      bloqueActual = f.bloque; diasActual = f.dias; diaActual = f.dia;
      accBloque = { piezas: 0, pt: 0, m3: 0 };
      accDia = { piezas: 0, pt: 0, m3: 0 };
    } else if (f.dia !== diaActual) {
      cerrarDia();
      diaActual = f.dia;
      accDia = { piezas: 0, pt: 0, m3: 0 };
    }
    accBloque.piezas += f.piezas; accBloque.pt += f.pieTablar; accBloque.m3 += f.m3;
    accDia.piezas += f.piezas; accDia.pt += f.pieTablar; accDia.m3 += f.m3;
    body.push([
      String(f.n), f.bloque, f.dias > 1 ? String(f.dia) : "—", f.especie, f.tipo, piezasTxt(f.piezas),
      String(f.espesor), String(f.ancho), String(f.largo), f.pieTablar.toFixed(2), m3(f.m3),
      f.registrado ? "Si" : "",
    ]);
  }
  cerrarBloque();
  if (body.length === 0) body.push(["", "Ningún bloque amparó aserrada todavía.", "", "", "", "", "", "", "", "", "", ""]);

  autoTable(doc, {
    head: [["N°", "Bloque", "Día", "Especie", dimCol, "Piezas", 'Espesor "', 'Ancho "', "Largo '", "Pie tablar", "m³", "Reg."]],
    body,
    foot: [["", "TOTAL AMPARADO", "", "", "", piezasTxt(filas.reduce((a, f) => a + f.piezas, 0)), "", "", "", t.amparadaPt.toFixed(2), m3(t.amparadaM3), ""]],
    startY: finalY() + 34,
    showFoot: "lastPage",
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: [0, 128, 96], textColor: 255 },
    footStyles: { fillColor: [0, 128, 96], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { halign: "right", cellWidth: 26 }, 2: { halign: "right", cellWidth: 24 }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "center", cellWidth: 26 } },
    didParseCell: (data) => {
      if (data.section === "body" && subtotales.has(data.row.index)) {
        data.cell.styles.fillColor = [230, 244, 240];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ── 4. Lo que quedó sin respaldo ─────────────────────────────────────────
  const faltante = filasDeFaltante(d);
  if (faltante.length > 0) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(150, 60, 20);
    doc.text(`Falta por distribuir · ${m3(t.faltanteM3)} m³ sin respaldo — pide ${m3(t.rollizaFaltanteM3)} m³ de troza`, 40, finalY() + 24);
    autoTable(doc, {
      head: [["N°", "Especie", dimCol, "Piezas", 'Espesor "', 'Ancho "', "Largo '", "Pie tablar", "m³ sin amparar", "Rolliza que pide"]],
      body: faltante.map((f) => [
        String(f.n), f.especie, f.tipo, piezasTxt(f.piezas),
        String(f.espesor), String(f.ancho), String(f.largo),
        f.pieTablar.toFixed(2), m3(f.m3), m3(f.rollizaNecesariaM3),
      ]),
      foot: [["", "TOTAL", "", piezasTxt(faltante.reduce((a, f) => a + f.piezas, 0)), "", "", "",
        faltante.reduce((a, f) => a + f.pieTablar, 0).toFixed(2), m3(t.faltanteM3), m3(t.rollizaFaltanteM3)]],
      startY: finalY() + 34,
      showFoot: "lastPage",
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: [201, 59, 44], textColor: 255 },
      footStyles: { fillColor: [201, 59, 44], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { halign: "right", cellWidth: 26 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" } },
    });
  }

  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Medidas en pulgadas y pies (espesor · ancho · largo), como las mide SERFOR. Las piezas se reparten enteras: ninguna se parte entre dos bloques.", 40, finalY() + 18);

  // ── Firma del responsable ─────────────────────────────────────────────
  // Si la última tabla dejó poco margen, la firma pasa a una página nueva en
  // vez de pisar el borde inferior — un papel que se firma no puede salir con
  // la línea cortada.
  const pageH = doc.internal.pageSize.getHeight();
  let yFirma = finalY() + 60;
  if (yFirma > pageH - 50) { doc.addPage(); yFirma = 70; }
  doc.setDrawColor(150);
  doc.line(40, yFirma, 280, yFirma);
  doc.line(340, yFirma, 500, yFirma);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(40);
  doc.text(firma?.nombre || "Nombre y firma", 40, yFirma + 13);
  doc.text(`Fecha: ${fecha()}`, 340, yFirma + 13);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(130);
  doc.text(firma?.cargo ? `Responsable de la distribución · ${firma.cargo}` : "Responsable de la distribución", 40, yFirma + 24);

  doc.save(`distribucion-rolliza-${fecha()}.pdf`);
}

export async function exportarDistribucionExcel(d: Distribucion, etiquetaDim: string, marcadas?: ReadonlySet<string>, firma?: FirmaResponsable, soloEspecies?: ReadonlySet<string>): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb: Workbook = new ExcelJS.Workbook();
  wb.creator = "Cubicador de Buleje";
  d = filtrarPorEspecies(d, soloEspecies);
  const t = d.totales;
  const dimCol = titulo(etiquetaDim);

  // ── Hoja 1: por bloque y tipo — comercial tanto, corta tanto… la primera
  // hoja que se ve al abrir, porque es la vista que falta entre el resumen
  // (un total por bloque) y el detalle por medida (demasiado fino). ──
  const wt = wb.addWorksheet("Por tipo");
  wt.columns = [
    { header: "N°", key: "n", width: 6 },
    { header: "Bloque (GTF / lote)", key: "bloque", width: 26 },
    { header: "N° de permiso", key: "permiso", width: 20 },
    { header: "Cargado como", key: "cargado", width: 17 },
    { header: "m³ (R)", key: "rolliza", width: 11 },
    { header: "Especie", key: "especie", width: 14 },
    { header: "Días", key: "dias", width: 7 },
    { header: "Fecha", key: "fecha", width: 13 },
    { header: dimCol, key: "tipo", width: 18 },
    { header: "Piezas", key: "piezas", width: 9 },
    { header: "Pie tablar", key: "pt", width: 12 },
    { header: "m³", key: "m3", width: 11 },
  ];
  estilarHeader(wt);
  const porTipo = filasPorBloqueYTipo(d);
  let bloqueTipoActual = "";
  let accBloqueTipo = { piezas: 0, pt: 0, m3: 0 };
  const cerrarBloqueTipoXls = () => {
    if (!bloqueTipoActual) return;
    const sub = wt.addRow({ bloque: `Subtotal ${bloqueTipoActual}`, piezas: accBloqueTipo.piezas, pt: r2(accBloqueTipo.pt), m3: accBloqueTipo.m3 });
    pintarFila(wt, sub, GRIS, false);
  };
  for (const f of porTipo) {
    if (f.bloque !== bloqueTipoActual) {
      cerrarBloqueTipoXls();
      bloqueTipoActual = f.bloque;
      accBloqueTipo = { piezas: 0, pt: 0, m3: 0 };
    }
    accBloqueTipo.piezas += f.piezas; accBloqueTipo.pt += f.pieTablar; accBloqueTipo.m3 += f.m3;
    wt.addRow({ n: f.n, bloque: f.bloque, permiso: f.permiso ?? "", cargado: f.cargadoComo, rolliza: f.rollizaM3 ?? "", especie: f.especie, dias: f.dias, fecha: f.fecha ?? "", tipo: f.tipo, piezas: f.piezas, pt: f.pieTablar, m3: f.m3 });
  }
  cerrarBloqueTipoXls();
  formatoNumerico(wt, ["rolliza", "m3"], "0.000");
  formatoNumerico(wt, ["pt"], "0.00");
  const totalTipo = wt.addRow({ bloque: "TOTAL AMPARADO", rolliza: t.rollizaM3, piezas: porTipo.reduce((a, f) => a + f.piezas, 0), pt: t.amparadaPt, m3: t.amparadaM3 });
  pintarFila(wt, totalTipo, TEAL, true);
  wt.autoFilter = { from: "A1", to: { row: 1, column: wt.columnCount } };

  // ── Hoja 2: las medidas distribuidas, ítem por ítem ──
  const ws = wb.addWorksheet("Medidas distribuidas");
  ws.columns = [
    { header: "N°", key: "n", width: 6 },
    { header: "Bloque (GTF / lote)", key: "bloque", width: 26 },
    { header: "Día", key: "dia", width: 6 },
    { header: "Especie", key: "especie", width: 14 },
    { header: dimCol, key: "tipo", width: 16 },
    { header: "Piezas", key: "piezas", width: 9 },
    { header: "Espesor (pulg)", key: "esp", width: 13 },
    { header: "Ancho (pulg)", key: "anc", width: 12 },
    { header: "Largo (pies)", key: "lar", width: 12 },
    { header: "Pie tablar", key: "pt", width: 12 },
    { header: "m³", key: "m3", width: 11 },
    { header: "Registrado", key: "reg", width: 11 },
  ];
  estilarHeader(ws);
  const filas = filasDeMedidas(d, marcadas);
  let bloqueActual = "";
  let diaActual = 0;
  let diasActual = 1;
  let accBloque = { piezas: 0, pt: 0, m3: 0 };
  let accDia = { piezas: 0, pt: 0, m3: 0 };
  /** El subtotal por jornada sólo aparece si el bloque tiene más de un día. */
  const cerrarDia = () => {
    if (!bloqueActual || diasActual <= 1) return;
    const sub = ws.addRow({ bloque: `${bloqueActual} · día ${diaActual}`, dia: diaActual, piezas: accDia.piezas, pt: r2(accDia.pt), m3: accDia.m3 });
    pintarFila(ws, sub, GRIS, false);
  };
  const cerrarBloque = () => {
    if (!bloqueActual) return;
    cerrarDia();
    const sub = ws.addRow({ bloque: `Subtotal ${bloqueActual}`, piezas: accBloque.piezas, pt: r2(accBloque.pt), m3: accBloque.m3 });
    pintarFila(ws, sub, GRIS, false);
  };
  for (const f of filas) {
    if (f.bloque !== bloqueActual) {
      cerrarBloque();
      bloqueActual = f.bloque; diasActual = f.dias; diaActual = f.dia;
      accBloque = { piezas: 0, pt: 0, m3: 0 };
      accDia = { piezas: 0, pt: 0, m3: 0 };
    } else if (f.dia !== diaActual) {
      cerrarDia();
      diaActual = f.dia;
      accDia = { piezas: 0, pt: 0, m3: 0 };
    }
    accBloque.piezas += f.piezas; accBloque.pt += f.pieTablar; accBloque.m3 += f.m3;
    accDia.piezas += f.piezas; accDia.pt += f.pieTablar; accDia.m3 += f.m3;
    ws.addRow({
      n: f.n, bloque: f.bloque, dia: f.dias > 1 ? f.dia : "—", especie: f.especie, tipo: f.tipo, piezas: f.piezas,
      esp: f.espesor, anc: f.ancho, lar: f.largo, pt: f.pieTablar, m3: f.m3,
      reg: f.registrado ? "Sí" : "",
    });
  }
  cerrarBloque();
  formatoNumerico(ws, ["m3"], "0.000");
  formatoNumerico(ws, ["pt"], "0.00");
  const total = ws.addRow({
    bloque: "TOTAL AMPARADO",
    piezas: filas.reduce((a, f) => a + f.piezas, 0),
    pt: t.amparadaPt,
    m3: t.amparadaM3,
  });
  pintarFila(ws, total, TEAL, true);
  ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columnCount } };

  // ── Hoja 3: el resumen por bloque ──
  const wr = wb.addWorksheet("Resumen");
  wr.columns = [
    { header: "Especie", key: "especie", width: 14 },
    { header: "Bloque (GTF / lote)", key: "bloque", width: 26 },
    { header: "Días", key: "dias", width: 7 },
    { header: "Fecha", key: "fecha", width: 13 },
    { header: "Cargado como", key: "cargado", width: 17 },
    { header: "Rolliza m³", key: "rolliza", width: 11 },
    { header: "% aprovechable", key: "ap", width: 15 },
    { header: "Ampara m³", key: "cap", width: 11 },
    { header: "Usa m³", key: "usado", width: 11 },
    { header: "Libre m³", key: "libre", width: 11 },
    { header: "Piezas amparadas", key: "piezas", width: 17 },
    { header: "Pie tablar", key: "pt", width: 12 },
    { header: "Costo rolliza S/", key: "costo", width: 15 },
    { header: "S/ por m³ aserrado", key: "unit", width: 17 },
  ];
  estilarHeader(wr);
  for (const b of resumenDeBloques(d)) {
    wr.addRow({
      especie: b.especie, bloque: b.bloque, dias: b.dias, fecha: b.fecha ?? "",
      cargado: b.cargadoComo, rolliza: b.rollizaM3 ?? "", ap: b.aprovechablePct ?? "", cap: b.capacidadM3,
      usado: b.usadoM3, libre: b.libreM3, piezas: b.piezas, pt: b.pieTablar,
      // `null` y no 0: sin costo cargado, la celda queda vacía en vez de decir
      // que la madera fue gratis.
      costo: b.costoRolliza ?? null, unit: b.costoPorM3Aserrada ?? null,
    });
  }
  formatoNumerico(wr, ["rolliza", "cap", "usado", "libre"], "0.000");
  formatoNumerico(wr, ["pt", "costo", "unit"], "0.00");
  const tr = wr.addRow({
    especie: "TOTAL", rolliza: t.rollizaM3, cap: t.capacidadM3, usado: t.amparadaM3, libre: t.libreM3,
    piezas: filas.reduce((a, f) => a + f.piezas, 0), pt: t.amparadaPt, costo: t.costoRolliza ?? null,
  });
  pintarFila(wr, tr, TEAL, true);
  wr.addRow({});
  wr.addRow({
    especie: "Rendimiento general",
    bloque: t.rendimientoPct == null
      ? "sin rolliza que comparar"
      : `${t.rendimientoPct.toFixed(2)} %${t.aserradaDirectaM3 > EPS_FILTRO ? " (sin contar la aserrada directa)" : ""}`,
  });
  if (t.aserradaDirectaM3 > EPS_FILTRO) {
    wr.addRow({ especie: "Aserrada directa cargada", bloque: `${m3(t.aserradaDirectaM3)} m³ (A) sin troza de origen — ampara ${m3(t.amparadaDirectaM3)} m³` });
  }
  wr.addRow({ especie: "Falta por distribuir", bloque: `${m3(t.faltanteM3)} m³ — pide ${m3(t.rollizaFaltanteM3)} m³ de troza` });
  // La misma firma que va al pie del PDF: el Excel y el PDF tienen que decir
  // lo mismo sobre quién responde por la distribución, no sólo uno de los dos.
  if (firma?.nombre) {
    wr.addRow({});
    const filaFirma = wr.addRow({ especie: "Responsable", bloque: firma.cargo ? `${firma.nombre} — ${firma.cargo}` : firma.nombre });
    filaFirma.font = { bold: true };
    wr.addRow({ especie: "Fecha", bloque: fecha() });
  }

  // ── Hoja 4: lo que falta por distribuir ──
  const faltante = filasDeFaltante(d);
  const wf = wb.addWorksheet("Falta por distribuir");
  wf.columns = [
    { header: "N°", key: "n", width: 6 },
    { header: "Especie", key: "especie", width: 14 },
    { header: dimCol, key: "tipo", width: 16 },
    { header: "Piezas", key: "piezas", width: 9 },
    { header: "Espesor (pulg)", key: "esp", width: 13 },
    { header: "Ancho (pulg)", key: "anc", width: 12 },
    { header: "Largo (pies)", key: "lar", width: 12 },
    { header: "Pie tablar", key: "pt", width: 12 },
    { header: "m³ sin amparar", key: "m3", width: 14 },
    { header: "Rolliza que pide m³", key: "pide", width: 18 },
  ];
  estilarHeader(wf);
  for (const f of faltante) {
    wf.addRow({
      n: f.n, especie: f.especie, tipo: f.tipo, piezas: f.piezas,
      esp: f.espesor, anc: f.ancho, lar: f.largo,
      pt: f.pieTablar, m3: f.m3, pide: f.rollizaNecesariaM3,
    });
  }
  formatoNumerico(wf, ["m3", "pide"], "0.000");
  formatoNumerico(wf, ["pt"], "0.00");
  if (faltante.length > 0) {
    const tf = wf.addRow({
      especie: "TOTAL",
      piezas: faltante.reduce((a, f) => a + f.piezas, 0),
      pt: r2(faltante.reduce((a, f) => a + f.pieTablar, 0)),
      m3: t.faltanteM3,
      pide: t.rollizaFaltanteM3,
    });
    pintarFila(wf, tf, ROJO, true);
  } else {
    wf.addRow({ especie: "Todo lo aserrado tiene respaldo de rolliza." });
  }
  wf.autoFilter = { from: "A1", to: { row: 1, column: wf.columnCount } };

  const buf = await wb.xlsx.writeBuffer();
  descargar(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `distribucion-rolliza-${fecha()}.xlsx`,
  );
}

function estilarHeader(ws: Worksheet): void {
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

/** Formato de celda por columna: el volumen del negocio va en 3 decimales. */
function formatoNumerico(ws: Worksheet, claves: string[], formato: string): void {
  for (const k of claves) {
    const col = ws.columns?.find((c) => c.key === k);
    if (col) col.numFmt = formato;
  }
}

function pintarFila(ws: Worksheet, row: ReturnType<Worksheet["addRow"]>, argb: string, blanco: boolean): void {
  row.font = { bold: true, ...(blanco ? { color: { argb: "FFFFFFFF" } } : {}) };
  for (let i = 1; i <= ws.columnCount; i++) {
    row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  }
}

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
