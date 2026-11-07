/**
 * reporte-formato.ts — lo que el PDF y el Excel del reporte mensual del cuaderno
 * de combustible dicen igual: números es-PE, fechas dd/mm/aaaa y los bloques de
 * «dato → valor» (declarado, resumen, acumulado del año). Una sola fuente, para
 * que el papel y la planilla nunca difieran en una cifra o en una palabra.
 *
 * Todo texto sale en ASCII + Latin-1: la Helvetica de jsPDF no dibuja «≥», «≤» ni «−».
 */
import { diaLima, rangoCilindros, type NivelAlmacen, type ReporteMes } from "./cuaderno";

export const SIN_MOVIMIENTOS = "Sin movimientos en el mes";

/** 1234.5 → «1,234.50» (es-PE, siempre 2 decimales; el signo menos va con guion normal). */
export const fmt2 = (n: number): string =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace("−", "-");

/** Con signo explícito: «+2.50» · «-3.00» · «0.00». */
export const fmtSigno = (n: number): string => (n > 0 ? `+${fmt2(n)}` : fmt2(n));

/** «aaaa-mm-dd» (un día ya en hora de Lima) → «dd/mm/aaaa». */
export function fmtDia(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

/** Una fecha ISO con hora → su día en Lima, «dd/mm/aaaa». */
export const fmtFecha = (iso: string): string => fmtDia(diaLima(iso));

export const cilindrosTxt = (n: number): string => `${n} cilindro${n === 1 ? "" : "s"}`;

export const nombreArchivo = (rep: ReporteMes, ext: "pdf" | "xlsx"): string => `Cuaderno de combustible - ${rep.titulo}.${ext}`;

const NIVELES: Record<NivelAlmacen, string> = {
  ok: "OK",
  tope: "En el tope",
  excede: "Excede lo declarado",
  osinergmin: "264 gal o más (OSINERGMIN)",
  negativo: "Negativo",
};
export const nivelTexto = (n: NivelAlmacen): string => NIVELES[n];

/** De qué cilindro(s) salió un vale, o cuánto salió sin respaldo. */
export function cilindrosDelVale(v: ReporteMes["vales"][number]): string {
  const partes = [
    v.deCilindros.length > 0 ? v.deCilindros.join(", ") : "",
    v.sinRespaldoGal > 0 ? `sin respaldo ${fmt2(v.sinRespaldoGal)} gal` : "",
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : "—";
}

/** Cada anulado del mes en una línea, con su motivo. */
export function lineasAnulados(rep: ReporteMes): string[] {
  const sinMotivo = "sin motivo anotado";
  const ingresos = rep.anulados.ingresos.map(
    (i) =>
      `${i.tipo === "inicial" ? "Stock inicial" : "Compra"} del ${fmtFecha(i.fecha)}${i.factura ? ` · factura ${i.factura}` : ""} · ${rangoCilindros(i.primerCilindro, i.cilindros)} · ${fmt2(i.galones)} gal — ${i.motivoAnulacion?.trim() || sinMotivo}`,
  );
  const vales = rep.anulados.vales.map(
    (v) =>
      `Vale ${v.numero != null ? `N.° ${v.numero}` : "sin número"} del ${fmtFecha(v.fecha)} · ${v.maquina} · ${fmt2(v.galones)} gal — ${v.motivoAnulacion?.trim() || sinMotivo}`,
  );
  return [...ingresos, ...vales];
}

// ── Bloques «dato → valor» ──────────────────────────────────────────────

export type UnidadDato = "gal" | "cil" | "S/" | "%";

export interface FilaDato {
  concepto: string;
  /** Número (con su unidad) o texto ya dicho; `null` = no hay dato. */
  valor: number | string | null;
  unidad?: UnidadDato;
  /** Muestra «+» en los positivos (diferencias). */
  signo?: boolean;
}

/** El valor como lo lee una persona en el papel: «220.00 gal», «S/ 1,234.50», «4 cilindros». */
export function textoDato(f: FilaDato): string {
  if (f.valor == null) return "—";
  if (typeof f.valor === "string") return f.valor;
  const n = f.valor;
  switch (f.unidad) {
    case "gal":
      return `${f.signo ? fmtSigno(n) : fmt2(n)} gal`;
    case "cil":
      return cilindrosTxt(n);
    case "S/":
      return `S/ ${fmt2(n)}`;
    case "%":
      return `${n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
    default:
      return String(n);
  }
}

/** Lo declarado a SUNAT: producto, cilindro, máximo guardado, cupo, proyección y responsable. */
export function filasDeclarado(rep: ReporteMes): FilaDato[] {
  const c = rep.config;
  return [
    { concepto: "Producto", valor: c.producto },
    { concepto: "Galones por cilindro", valor: c.galPorCilindro, unidad: "gal" },
    { concepto: "Máx. cilindros guardados", valor: c.maxCilindros, unidad: "cil" },
    { concepto: "Máx. galones guardados", valor: c.maxCilindros * c.galPorCilindro, unidad: "gal" },
    { concepto: "Cupo anual inscrito", valor: c.cupoAnualGal ?? "Sin declarar", unidad: "gal" },
    { concepto: "Proyección del mes", valor: rep.proyeccionGal ?? "Sin proyección", unidad: "gal" },
    { concepto: "Responsable", valor: c.responsable?.trim() || "—" },
  ];
}

/** Resumen del mes: saldo inicial + compras − consumo ± conteos = saldo final. */
export function filasResumen(rep: ReporteMes): FilaDato[] {
  return [
    { concepto: "Saldo inicial", valor: rep.saldoInicial.gal, unidad: "gal" },
    { concepto: "Saldo inicial", valor: rep.saldoInicial.cil, unidad: "cil" },
    { concepto: "Compras del mes", valor: rep.totalCompras.cil, unidad: "cil" },
    { concepto: "Compras del mes", valor: rep.totalCompras.gal, unidad: "gal" },
    { concepto: "Compras del mes", valor: rep.totalCompras.monto, unidad: "S/" },
    ...(rep.totalInicial > 0 ? [{ concepto: "Stock inicial anotado", valor: rep.totalInicial, unidad: "gal" } as FilaDato] : []),
    { concepto: "Consumo del mes (vales)", valor: rep.totalConsumo, unidad: "gal" },
    { concepto: "Diferencias de conteo", valor: rep.totalDiferencias, unidad: "gal", signo: true },
    { concepto: "Saldo final", valor: rep.saldoFinal.gal, unidad: "gal" },
    { concepto: "Saldo final", valor: rep.saldoFinal.cil, unidad: "cil" },
    { concepto: "Balance", valor: rep.cuadra ? "Cuadra" : "NO cuadra" },
  ];
}

/** Acumulado del año contra el cupo inscrito. */
export function filasAcumulado(rep: ReporteMes): FilaDato[] {
  const a = rep.acumuladoAnio;
  return [
    { concepto: "Compras del año", valor: a.comprasGal, unidad: "gal" },
    { concepto: "Consumo del año", valor: a.consumoGal, unidad: "gal" },
    { concepto: "Cupo anual inscrito", valor: a.cupo ?? "Sin declarar", unidad: "gal" },
    { concepto: "Restante del cupo", valor: a.restante, unidad: "gal" },
    { concepto: "Cupo usado", valor: a.pct, unidad: "%" },
  ];
}
