/**
 * Reportes diarios (ADR-439) — de los datos a BLOQUES neutros.
 *
 * Un bloque por sección: una línea de totales (lo que se lee sin abrir nada),
 * una tabla para el correo y renglones cortos para WhatsApp. El correo y el
 * WhatsApp salen de los MISMOS bloques: si cada canal armara su propia cuenta,
 * el correo diría 12,40 m³ y el WhatsApp 12,4 de otra suma.
 *
 * PURO: recibe los datos ya leídos (`DatosReporteForestal`), no consulta nada.
 */
import { formatCurrency, formatNumber } from "@/lib/format";
import { SECCION_META, type RangoReporte, type SeccionReporte } from "./reporte-diario";

// ── Lo que llega de la base ───────────────────────────────────────────────────

export interface FilaNombreM3 {
  nombre: string;
  cantidad: number;
  m3: number;
}

export interface DatosReporteForestal {
  negocio: string;
  nombreReporte: string;
  /** Día de Lima en que sale, «AAAA-MM-DD». */
  fecha: string;
  rango: RangoReporte;
  desde: string;
  hasta: string;
  /** Link al Libro CTP del panel, para el «ver más». */
  panelUrl: string;
  produccion?: {
    corridas: number;
    piezas: number;
    m3: number;
    pt: number;
    porEspecie: { especie: string; corridas: number; piezas: number; m3: number; pt: number; productos: { producto: string; piezas: number; m3: number; pt: number }[] }[];
    /** m³ de rolliza que entró a la sierra en esos días. */
    consumidoM3: number;
    /** producido ÷ consumido, en %; `null` si no hay consumo o no cierra (>100 %). */
    rendimientoPct: number | null;
  };
  tala?: { lineas: number; taladoM3: number; trozadoM3: number };
  /** Contados por GUÍA (serie + número), no por asiento: ver `resumirIngresosPorGuia`. */
  ingresos?: {
    guias: number;
    m3: number;
    porRecibir: number;
    /** Guías de madera de servicio (ajena, ADR-437); ya están dentro de `guias`. */
    deServicio?: number;
    porEspecie: FilaNombreM3[];
    porProveedor: FilaNombreM3[];
  };
  despachos?: {
    registros: number;
    m3: number;
    piezas: number;
    /** Asientos en otra unidad (pt, unidades): se cuentan, no se suman al m³. */
    otraUnidad: number;
    /** Suma del valor de venta declarado; `null` si ninguno lo tiene. */
    valorVenta: number | null;
    sinGuia: number;
    porEspecie: FilaNombreM3[];
  };
  patio?: {
    /** Saldo de rolliza VALIDADA en el libro (no es el conteo físico del patio). */
    saldoM3: number;
    /** m³ de ingresos todavía sin validar: no cuentan en el saldo. */
    sinValidarM3: number;
    especiesEnNegativo: number;
    varadas: { piezas: number; m3: number; dias: number };
    productos: { producto: string; stock: number }[];
  };
  plata?: {
    deudaProveedores: number;
    guiasSinPagar: number;
    proveedores: { nombre: string; guias: number; pendiente: number; atrasado: boolean }[];
    /** Soles del período: lo que pagaste (`pago_hecho`) y lo que te pagaron (`pago`). */
    pagos: { pagados: { cantidad: number; monto: number }; cobrados: { cantidad: number; monto: number } };
    /** Uno por moneda: sumar dólares a soles sin tipo de cambio inventaría la cifra. */
    adelantos: { moneda: string; saldo: number; abiertos: number }[];
  };
  pendientes?: { titulo: string; detalle: string; cantidad: number; urgencia: "bloquea" | "atrasado" | "pendiente" }[];
  plazos?: {
    guias: { gtf: string; titular: string | null; frase: string; urgente: boolean }[];
    lotes: { codigo: string; frase: string }[];
    documentosVencidos: string[];
  };
  /** Secciones cuya lectura falló: se dicen en el reporte, no se callan. */
  fallidas?: SeccionReporte[];
}

// ── El bloque neutro ──────────────────────────────────────────────────────────

export interface Tabla {
  cabecera: string[];
  /** Columnas numéricas (alineadas a la derecha). */
  numericas: number[];
  filas: string[][];
}

export interface Bloque {
  seccion: SeccionReporte;
  titulo: string;
  /** Totales en una línea. */
  resumen: string;
  tabla?: Tabla;
  /** Renglones cortos: detalle de WhatsApp y lista del correo cuando no hay tabla. */
  detalle: string[];
  /**
   * Lo que la tabla NO dice (trozas varadas, despachos sin guía, pagos): en el
   * correo va debajo de la tabla; en WhatsApp ya está al principio de `detalle`.
   */
  notas?: string[];
  /** Algo de acá pide acción (deuda atrasada, plazo vencido, lo que bloquea). */
  alerta?: boolean;
}

export const m3 = (n: number) => `${formatNumber(n, 2)} m³`;
const pt = (n: number) => `${formatNumber(Math.round(n), 0)} pt`;
const num = (n: number) => formatNumber(n, 0);
const plural = (n: number, uno: string, varios: string) => `${num(n)} ${n === 1 ? uno : varios}`;

const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «sábado 26/09» — el día de un «AAAA-MM-DD» (date-only, se lee en UTC). */
export function diaLegible(dia: string): string {
  const d = new Date(`${dia}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dia;
  return `${DIAS_LARGOS[d.getUTCDay()]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** «sábado 26/09» o «20/09 al 26/09». */
export function periodoLegible(desde: string, hasta: string): string {
  if (desde === hasta) return diaLegible(desde);
  return `${desde.slice(8, 10)}/${desde.slice(5, 7)} al ${hasta.slice(8, 10)}/${hasta.slice(5, 7)}`;
}

function bloqueProduccion(p: NonNullable<DatosReporteForestal["produccion"]>): Bloque {
  const base = { seccion: "produccion" as const, titulo: SECCION_META.produccion.nombre };
  if (p.corridas === 0) return { ...base, resumen: "Sin producción registrada.", detalle: [] };
  const rend = p.rendimientoPct != null ? ` · rendimiento ${formatNumber(p.rendimientoPct, 1)} %` : "";
  const filas: string[][] = [];
  const detalle: string[] = [];
  for (const e of p.porEspecie) {
    filas.push([e.especie, "", num(e.piezas), formatNumber(e.m3, 2), num(e.pt)]);
    for (const prod of e.productos) filas.push(["", prod.producto, num(prod.piezas), formatNumber(prod.m3, 2), num(prod.pt)]);
    detalle.push(`${e.especie}: ${pt(e.pt)} · ${m3(e.m3)} · ${plural(e.piezas, "pieza", "piezas")}`);
  }
  return {
    ...base,
    resumen: `${pt(p.pt)} · ${m3(p.m3)} · ${plural(p.piezas, "pieza", "piezas")} en ${plural(p.corridas, "corrida", "corridas")}${rend}`,
    tabla: { cabecera: ["Especie", "Producto", "Piezas", "m³", "pt"], numericas: [2, 3, 4], filas },
    detalle,
  };
}

function bloqueTala(t: NonNullable<DatosReporteForestal["tala"]>): Bloque {
  const base = { seccion: "tala" as const, titulo: SECCION_META.tala.nombre };
  if (t.lineas === 0) return { ...base, resumen: "No se cortó (sin registros de tala ni trozado).", detalle: [] };
  return {
    ...base,
    resumen: `Talado ${m3(t.taladoM3)} · trozado ${m3(t.trozadoM3)} · ${plural(t.lineas, "registro", "registros")}`,
    detalle: [],
  };
}

function filasNombre(filas: FilaNombreM3[], unidad: [string, string]): { tabla: string[][]; texto: string[] } {
  return {
    tabla: filas.map((f) => [f.nombre, num(f.cantidad), formatNumber(f.m3, 2)]),
    texto: filas.map((f) => `${f.nombre}: ${m3(f.m3)} (${plural(f.cantidad, unidad[0], unidad[1])})`),
  };
}

function bloqueIngresos(i: NonNullable<DatosReporteForestal["ingresos"]>): Bloque {
  const base = { seccion: "ingresos" as const, titulo: SECCION_META.ingresos.nombre };
  if (i.guias === 0) return { ...base, resumen: "No entró madera.", detalle: [] };
  const esp = filasNombre(i.porEspecie, ["guía", "guías"]);
  const prov = filasNombre(i.porProveedor, ["guía", "guías"]);
  const recib = i.porRecibir > 0 ? ` · ${plural(i.porRecibir, "por recibir en patio", "por recibir en patio")}` : " · todas recibidas";
  const servicio = i.deServicio ? ` (${i.deServicio} de servicio)` : "";
  return {
    ...base,
    resumen: `${plural(i.guias, "guía", "guías")}${servicio} · ${m3(i.m3)}${recib}`,
    tabla: {
      cabecera: ["Especie / proveedor", "Guías", "m³"],
      numericas: [1, 2],
      filas: [...esp.tabla, ...(prov.tabla.length ? [["Por proveedor", "", ""], ...prov.tabla] : [])],
    },
    detalle: [...esp.texto, ...prov.texto.map((t) => `Proveedor ${t}`)],
  };
}

function bloqueDespachos(d: NonNullable<DatosReporteForestal["despachos"]>): Bloque {
  const base = { seccion: "despachos" as const, titulo: SECCION_META.despachos.nombre };
  if (d.registros === 0) return { ...base, resumen: "No salió madera.", detalle: [] };
  const venta = d.valorVenta != null ? ` · vendido ${formatCurrency(d.valorVenta)}` : "";
  const otras = d.otraUnidad > 0 ? ` (+${plural(d.otraUnidad, "asiento en otra unidad", "asientos en otra unidad")})` : "";
  const esp = filasNombre(d.porEspecie, ["despacho", "despachos"]);
  const sinGuia = d.sinGuia > 0 ? [`${plural(d.sinGuia, "despacho sin GTF de salida", "despachos sin GTF de salida")}`] : [];
  return {
    ...base,
    resumen: `${plural(d.registros, "despacho", "despachos")} · ${m3(d.m3)}${otras} · ${plural(d.piezas, "pieza", "piezas")}${venta}`,
    tabla: { cabecera: ["Especie", "Despachos", "m³"], numericas: [1, 2], filas: esp.tabla },
    detalle: [...sinGuia, ...esp.texto],
    notas: sinGuia,
    alerta: d.sinGuia > 0,
  };
}

function bloquePatio(p: NonNullable<DatosReporteForestal["patio"]>): Bloque {
  const notas: string[] = [];
  if (p.varadas.piezas > 0) {
    notas.push(`${plural(p.varadas.piezas, "troza", "trozas")} (${m3(p.varadas.m3)}) paradas hace ${p.varadas.dias} días o más`);
  }
  if (p.especiesEnNegativo > 0) {
    notas.push(`${plural(p.especiesEnNegativo, "especie con saldo negativo", "especies con saldo negativo")}: salió más de lo que entró`);
  }
  const detalle = [...notas, ...p.productos.map((pr) => `${pr.producto}: ${m3(pr.stock)} en stock`)];
  const sinValidar = p.sinValidarM3 > 0 ? ` · ${m3(p.sinValidarM3)} más sin validar` : "";
  return {
    seccion: "patio",
    titulo: SECCION_META.patio.nombre,
    resumen: `Saldo de rolliza en el libro: ${m3(p.saldoM3)}${sinValidar}`,
    tabla: p.productos.length
      ? { cabecera: ["Producto en stock", "m³"], numericas: [1], filas: p.productos.map((x) => [x.producto, formatNumber(x.stock, 2)]) }
      : undefined,
    detalle,
    notas,
    alerta: p.especiesEnNegativo > 0 || p.varadas.piezas > 0,
  };
}

/** Soles con el formato de siempre; otra moneda con su símbolo, nunca como «S/». */
function enMoneda(moneda: string, monto: number): string {
  if (moneda === "PEN") return formatCurrency(monto);
  const simbolo = moneda === "USD" ? "US$" : moneda;
  return `${simbolo} ${formatCurrency(monto, { withSymbol: false })}`;
}

function bloquePlata(p: NonNullable<DatosReporteForestal["plata"]>): Bloque {
  const notas: string[] = [];
  const { pagados, cobrados } = p.pagos;
  if (pagados.cantidad > 0) notas.push(`Pagaste ${formatCurrency(pagados.monto)} (${plural(pagados.cantidad, "pago", "pagos")})`);
  if (cobrados.cantidad > 0) notas.push(`Te pagaron ${formatCurrency(cobrados.monto)} (${plural(cobrados.cantidad, "pago", "pagos")})`);
  for (const a of p.adelantos) {
    if (a.abiertos <= 0) continue;
    notas.push(`Adelantos por cobrar: ${enMoneda(a.moneda, a.saldo)} en ${plural(a.abiertos, "adelanto abierto", "adelantos abiertos")}`);
  }
  const detalle = [
    ...notas,
    ...p.proveedores.map(
      (x) => `${x.nombre}: ${formatCurrency(x.pendiente)} (${plural(x.guias, "guía", "guías")})${x.atrasado ? " — atrasado" : ""}`,
    ),
  ];
  const deuda =
    p.guiasSinPagar > 0
      ? `Debes ${formatCurrency(p.deudaProveedores)} a proveedores (${plural(p.guiasSinPagar, "guía sin pagar", "guías sin pagar")})`
      : "No debes guías a proveedores";
  return {
    seccion: "plata",
    titulo: SECCION_META.plata.nombre,
    resumen: deuda,
    tabla: p.proveedores.length
      ? {
          cabecera: ["Proveedor", "Guías", "Por pagar"],
          numericas: [1, 2],
          filas: p.proveedores.map((x) => [`${x.nombre}${x.atrasado ? " (atrasado)" : ""}`, num(x.guias), formatCurrency(x.pendiente)]),
        }
      : undefined,
    detalle,
    notas,
    alerta: p.proveedores.some((x) => x.atrasado),
  };
}

function bloquePendientes(lista: NonNullable<DatosReporteForestal["pendientes"]>): Bloque {
  const base = { seccion: "pendientes" as const, titulo: SECCION_META.pendientes.nombre };
  if (lista.length === 0) return { ...base, resumen: "El libro está al día.", detalle: [] };
  const traban = lista.filter((p) => p.urgencia === "bloquea").length;
  return {
    ...base,
    resumen: `${plural(lista.length, "pendiente", "pendientes")}${traban ? ` · ${plural(traban, "traba", "traban")} el cierre` : ""}`,
    detalle: lista.map((p) => {
      const marca = p.urgencia === "bloquea" ? "[traba] " : p.urgencia === "atrasado" ? "[atrasado] " : "";
      /* «Saldos en negativo (2)»; el título que ya trae su número («2 guías sin pagar…») queda igual. */
      const cuantos = p.cantidad > 1 && !/^\d/.test(p.titulo) ? ` (${num(p.cantidad)})` : "";
      return `${marca}${p.titulo}${cuantos}`;
    }),
    alerta: lista.some((p) => p.urgencia !== "pendiente"),
  };
}

function bloquePlazos(p: NonNullable<DatosReporteForestal["plazos"]>): Bloque {
  const base = { seccion: "plazos" as const, titulo: SECCION_META.plazos.nombre };
  const detalle = [
    ...p.guias.map((g) => `GTF ${g.gtf}${g.titular ? ` — ${g.titular}` : ""}: ${g.frase}`),
    ...p.lotes.map((l) => `Lote ${l.codigo}: ${l.frase}`),
    ...p.documentosVencidos.map((d) => `${d}: vencido`),
  ];
  if (detalle.length === 0) return { ...base, resumen: "Nada por vencer.", detalle: [] };
  const urgentes = p.guias.filter((g) => g.urgente).length;
  return {
    ...base,
    resumen: `${plural(detalle.length, "plazo que mirar", "plazos que mirar")}${urgentes ? ` · ${plural(urgentes, "vence hoy o ya venció", "vencen hoy o ya vencieron")}` : ""}`,
    detalle,
    alerta: urgentes > 0 || p.documentosVencidos.length > 0,
  };
}

/** Los bloques en el orden canónico de las secciones, sólo los pedidos. */
export function armarBloques(datos: DatosReporteForestal, secciones: readonly SeccionReporte[]): Bloque[] {
  const out: Bloque[] = [];
  const fallo = (s: SeccionReporte): Bloque => ({
    seccion: s,
    titulo: SECCION_META[s].nombre,
    resumen: "No se pudo leer esta parte ahora: mírala en el panel.",
    detalle: [],
    alerta: true,
  });
  for (const s of secciones) {
    if (datos.fallidas?.includes(s)) {
      out.push(fallo(s));
      continue;
    }
    const b =
      s === "produccion" && datos.produccion ? bloqueProduccion(datos.produccion)
      : s === "tala" && datos.tala ? bloqueTala(datos.tala)
      : s === "ingresos" && datos.ingresos ? bloqueIngresos(datos.ingresos)
      : s === "despachos" && datos.despachos ? bloqueDespachos(datos.despachos)
      : s === "patio" && datos.patio ? bloquePatio(datos.patio)
      : s === "plata" && datos.plata ? bloquePlata(datos.plata)
      : s === "pendientes" && datos.pendientes ? bloquePendientes(datos.pendientes)
      : s === "plazos" && datos.plazos ? bloquePlazos(datos.plazos)
      : null;
    out.push(b ?? fallo(s));
  }
  return out;
}
