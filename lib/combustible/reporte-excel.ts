/**
 * reporte-excel.ts — el reporte MENSUAL del cuaderno de combustible en .xlsx,
 * una hoja por tabla (Resumen · Compras · Consumo por máquina · Vales · Conteos ·
 * Saldo diario, más «Stock inicial» si el mes tiene). Los números van como número
 * (formato `#,##0.00`), no como texto, para que SUNAT o el contador filtren y sumen.
 * Los totales son los del cuaderno (`ReporteMes`), no se recalculan acá.
 *
 * Client-only: exceljs entra por import dinámico.
 */
import type { Row, Workbook } from "exceljs";
import { rangoCilindros, type ReporteMes } from "./cuaderno";
import { marcaDelNegocio } from "@/lib/forestal/membrete-forestal";
import {
  SIN_MOVIMIENTOS, cilindrosDelVale, filasAcumulado, filasDeclarado, filasResumen, fmtDia, fmtFecha, lineasAnulados,
  nivelTexto, nombreArchivo, type FilaDato, type UnidadDato,
} from "./reporte-formato";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FONDO_CABECERA = "FFE5E7EB";
const GRIS = "FF6B7280";

/** Formatos de número de Excel. */
const F = { gal: "#,##0.00", ent: "0", dec1: "#,##0.0", signo: "+#,##0.00;-#,##0.00;0.00" } as const;

type Valor = string | number | null;

interface Columna {
  titulo: string;
  ancho: number;
  /** Formato de las celdas que traen un número. */
  formato?: string;
}

const relleno = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

/** Aplica el formato de cada columna a las celdas con número de una fila. */
function formatear(fila: Row, columnas: readonly Columna[]): Row {
  columnas.forEach((c, i) => {
    const celda = fila.getCell(i + 1);
    if (c.formato && typeof celda.value === "number") celda.numFmt = c.formato;
  });
  return fila;
}

/** Una hoja con su encabezado en negrita y la primera fila fija. Sin filas: «Sin movimientos en el mes». */
function hojaDeTabla(wb: Workbook, nombre: string, columnas: readonly Columna[], filas: Valor[][], total?: Valor[]): void {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho }));
  const cab = ws.getRow(1);
  cab.font = { bold: true };
  cab.alignment = { vertical: "middle", wrapText: true };
  cab.eachCell((c) => {
    c.fill = relleno(FONDO_CABECERA);
  });
  if (filas.length === 0) {
    ws.addRow([SIN_MOVIMIENTOS]).font = { italic: true, color: { argb: GRIS } };
    return;
  }
  for (const f of filas) formatear(ws.addRow(f), columnas);
  if (total) {
    const t = formatear(ws.addRow(total), columnas);
    t.font = { bold: true };
    t.eachCell({ includeEmpty: true }, (c) => {
      c.fill = relleno(FONDO_CABECERA);
    });
  }
}

const UNIDAD_TXT: Record<UnidadDato, string> = { gal: "galones", cil: "cilindros", "S/": "soles", "%": "%" };
const formatoDe = (f: FilaDato): string => (f.signo ? F.signo : f.unidad === "cil" ? F.ent : f.unidad === "%" ? F.dec1 : F.gal);

async function hojaResumen(wb: Workbook, rep: ReporteMes): Promise<void> {
  const negocio = (await marcaDelNegocio()).nombre;
  const ws = wb.addWorksheet("Resumen");
  ws.columns = [{ width: 46 }, { width: 24 }, { width: 12 }];
  ws.addRow([`Cuaderno de combustible - ${rep.titulo}`]).font = { bold: true, size: 14 };
  if (negocio) ws.addRow([negocio]).font = { bold: true };
  ws.addRow([rep.hastaDias < rep.hasta ? `Del ${fmtDia(rep.desde)} al ${fmtDia(rep.hastaDias)} (mes en curso)` : `Del ${fmtDia(rep.desde)} al ${fmtDia(rep.hasta)}`]).font = { color: { argb: GRIS } };
  ws.addRow([]);

  const seccion = (texto: string) => {
    const r = ws.addRow([texto, "", ""]);
    r.font = { bold: true };
    r.eachCell({ includeEmpty: true }, (c) => {
      c.fill = relleno(FONDO_CABECERA);
    });
  };
  const bloque = (titulo: string, filas: FilaDato[]) => {
    seccion(titulo);
    for (const f of filas) {
      const valor: Valor = f.valor ?? "—";
      const r = ws.addRow([f.concepto, valor, typeof valor === "number" && f.unidad ? UNIDAD_TXT[f.unidad] : ""]);
      const celda = r.getCell(2);
      celda.alignment = { horizontal: "right" };
      if (typeof valor === "number") celda.numFmt = formatoDe(f);
    }
    ws.addRow([]);
  };
  const lineas = (titulo: string, textos: string[], vacio?: string) => {
    seccion(titulo);
    if (textos.length === 0 && vacio) ws.addRow([vacio]).font = { italic: true, color: { argb: GRIS } };
    for (const t of textos) ws.addRow([t]);
    ws.addRow([]);
  };

  bloque("Lo declarado", filasDeclarado(rep));
  bloque(`Resumen de ${rep.titulo}`, filasResumen(rep));
  bloque(`Acumulado del año ${rep.anio}`, filasAcumulado(rep));
  lineas("Alertas", rep.alertas, "Sin alertas");
  const anulados = lineasAnulados(rep);
  if (anulados.length > 0) lineas("Anulados del mes", anulados);
}

export async function descargarReporteExcel(rep: ReporteMes): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Buleje";
  await hojaResumen(wb, rep);

  hojaDeTabla(
    wb,
    "Compras",
    [
      { titulo: "Fecha", ancho: 12 }, { titulo: "Factura", ancho: 16 }, { titulo: "Grifo", ancho: 26 }, { titulo: "RUC", ancho: 14 },
      { titulo: "Guía", ancho: 16 }, { titulo: "Cilindros", ancho: 16 }, { titulo: "Cant. cilindros", ancho: 10, formato: F.ent },
      { titulo: "Galones", ancho: 12, formato: F.gal }, { titulo: "Precio/gal (S/)", ancho: 14, formato: F.gal }, { titulo: "Monto (S/)", ancho: 14, formato: F.gal },
    ],
    rep.compras.map((i) => [
      fmtFecha(i.fecha), i.factura, i.grifo, i.grifoRuc, i.guia, rangoCilindros(i.primerCilindro, i.cilindros),
      i.cilindros, i.galones, i.precioGal, i.monto,
    ]),
    ["Total", null, null, null, null, null, rep.totalCompras.cil, rep.totalCompras.gal, null, rep.totalCompras.monto],
  );

  if (rep.iniciales.length > 0) {
    hojaDeTabla(
      wb,
      "Stock inicial",
      [
        { titulo: "Fecha", ancho: 12 }, { titulo: "Cilindros", ancho: 16 }, { titulo: "Cant. cilindros", ancho: 10, formato: F.ent },
        { titulo: "Galones", ancho: 12, formato: F.gal }, { titulo: "Notas", ancho: 40 },
      ],
      rep.iniciales.map((i) => [fmtFecha(i.fecha), rangoCilindros(i.primerCilindro, i.cilindros), i.cilindros, i.galones, i.notas?.trim() || null]),
    );
  }

  hojaDeTabla(
    wb,
    "Consumo por máquina",
    [
      { titulo: "Máquina", ancho: 28 }, { titulo: "Placa", ancho: 12 }, { titulo: "Vales", ancho: 8, formato: F.ent },
      { titulo: "Galones", ancho: 12, formato: F.gal }, { titulo: "Horas", ancho: 10, formato: F.gal }, { titulo: "Gal/h", ancho: 10, formato: F.gal },
      { titulo: "Meta (gal/h)", ancho: 12, formato: F.gal }, { titulo: "Observación", ancho: 16 },
    ],
    rep.consumo.map((c) => [c.maquina, c.placa, c.vales, c.galones, c.horas > 0 ? c.horas : null, c.galPorHora, c.meta, c.sobreMeta ? "Sobre meta" : null]),
    ["Total", null, rep.consumo.reduce((s, c) => s + c.vales, 0), rep.totalConsumo, null, null, null, null],
  );

  hojaDeTabla(
    wb,
    "Vales",
    [
      { titulo: "N.°", ancho: 8, formato: F.ent }, { titulo: "Fecha", ancho: 12 }, { titulo: "Máquina", ancho: 28 },
      { titulo: "Horómetro", ancho: 12, formato: F.dec1 }, { titulo: "Galones", ancho: 12, formato: F.gal }, { titulo: "Cilindro(s)", ancho: 32 },
      { titulo: "Operador", ancho: 22 }, { titulo: "Firmado", ancho: 10 }, { titulo: "Gal/h", ancho: 10, formato: F.gal },
    ],
    rep.vales.map((v) => [
      v.vale.numero, fmtFecha(v.vale.fecha), v.vale.maquina, v.vale.horometro, v.vale.galones, cilindrosDelVale(v),
      v.vale.operador?.trim() || null, v.vale.firmado ? "Sí" : "No", v.rend?.galPorHora ?? null,
    ]),
    ["Total", null, null, null, rep.totalConsumo, null, null, null, null],
  );

  hojaDeTabla(
    wb,
    "Conteos",
    [
      { titulo: "Fecha", ancho: 12 }, { titulo: "Cilindros contados", ancho: 12, formato: F.ent }, { titulo: "Galones contados", ancho: 12, formato: F.gal },
      { titulo: "Cilindros (cuaderno)", ancho: 12, formato: F.ent }, { titulo: "Galones (cuaderno)", ancho: 12, formato: F.gal },
      { titulo: "Diferencia (gal)", ancho: 12, formato: F.signo }, { titulo: "Diferencia (cil)", ancho: 12, formato: "+0;-0;0" },
      { titulo: "Contó", ancho: 22 }, { titulo: "Testigo", ancho: 22 }, { titulo: "Notas", ancho: 36 },
    ],
    rep.conteos.map(({ conteo, libroCil, libroGal, difGal, difCil }) => [
      fmtFecha(conteo.fecha), conteo.cilindrosContados, conteo.galonesContados, libroCil, libroGal, difGal, difCil,
      conteo.contadoPor, conteo.testigo?.trim() || null, conteo.notas?.trim() || null,
    ]),
    ["Total", null, null, null, null, rep.totalDiferencias, null, null, null, null],
  );

  hojaDeTabla(
    wb,
    "Saldo diario",
    [
      { titulo: "Día", ancho: 12 }, { titulo: "Entradas (gal)", ancho: 14, formato: F.gal }, { titulo: "Salidas (gal)", ancho: 14, formato: F.gal },
      { titulo: "Ajuste (gal)", ancho: 14, formato: F.signo }, { titulo: "Saldo (gal)", ancho: 14, formato: F.gal },
      { titulo: "Cilindros", ancho: 10, formato: F.ent }, { titulo: "Nivel", ancho: 28 },
    ],
    rep.dias.map((d) => [fmtDia(d.dia), d.entradasGal, d.salidasGal, d.ajusteGal, d.saldoGal, d.cilindros, nivelTexto(d.nivel)]),
  );

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: MIME_XLSX }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo(rep, "xlsx");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
