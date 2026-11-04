/**
 * Estado de cuenta de UNA carga para el cliente (Brandon 03-11: «todo eso
 * cuádralo bonito y fácil de entender sin mucho texto en un pdf … tiene que
 * estar en una hoja entendible»). Es el papel que se armó a mano para Rivers:
 *
 *   carga por tipo (piezas, pies, precio, importe)
 *   − adelantos  + saldo anterior  + otros cargos (realización de guía…)
 *   = total que debe, con el monto en letras.
 *
 * PURO y client-safe. La carga sale de la cubicación GUARDADA (sus piezas y el
 * precio con que se guardó cada una), no se recubica. Cada fila redondea su
 * importe a céntimos UNA vez y el total de la carga es la suma de las filas:
 * así el papel cuadra a mano (Rivers: 53,396.96 + 3,732.00 + 580.13 + 562.73 =
 * 58,271.82).
 */
import { toFeet, type PiezaCubicada } from "./cubicacion";
import { ordenTipo, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";
import { montoEnLetras } from "@/lib/adelantos/comprobante";

export interface FilaCarga {
  clave: string;
  /** «Comercial», «Comercial de 6 pies», «Tornillo · Corta». */
  tipo: string;
  piezas: number;
  pies: number;
  /** Precio por pie tablar (S/). 0 = se guardó sin precio. */
  precio: number;
  importe: number;
}

export interface LineaCuenta {
  concepto: string;
  monto: number;
  /** Una aclaración chica debajo («ya descontados los depósitos de…»). */
  nota?: string;
}

export interface DatosCuenta {
  /** Lo que el cliente ya dio (se resta). */
  adelantos: LineaCuenta[];
  /** Lo que se suma: saldo de la carga anterior, realización de guía, flete… */
  cargos: LineaCuenta[];
}

export interface EstadoCuentaCarga {
  filas: FilaCarga[];
  piezas: number;
  pies: number;
  importeCarga: number;
  totalAdelantos: number;
  saldoCarga: number;
  adelantos: LineaCuenta[];
  cargos: LineaCuenta[];
  total: number;
  /** «CUARENTA Y TRES MIL OCHOCIENTOS CINCO CON 82/100 SOLES». */
  enLetras: string;
  /** Filas con precio 0: el papel saldría con importe 0 en esas. */
  sinPrecio: number;
}

/* Redondeo «a mano»: 137.25 × 4.10 = 562.725 → 562.73. El float lo guarda como
   562.72499…, así que se limpia a 12 cifras antes de redondear. */
const redondeo = (n: number, dec: number) => {
  const f = 10 ** dec;
  return Math.round(Number((n * f).toPrecision(12))) / f;
};
const c2 = (n: number) => redondeo(n, 2);
/** El PT de cada fila se suma exacto y se muestra a 3 decimales (ADR-531: pies exactos). */
const p3 = (n: number) => redondeo(n, 3);

const piesDeLargo = (p: PiezaCubicada) => Math.round(toFeet(p.largo, p.uLargo) * 10) / 10;

function rangoDeLargos(largos: readonly number[]): string {
  const min = Math.min(...largos);
  const max = Math.max(...largos);
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return min === max ? `de ${f(min)} pies` : `de ${f(min)} a ${f(max)} pies`;
}

/**
 * La carga agrupada por especie × tipo × precio. Si un mismo tipo se vendió a
 * dos precios (comercial de 6 pies a 4.80 y el resto a 5.90), cada fila dice
 * sus largos para que el cliente sepa cuál es cuál. La especie sólo aparece
 * cuando la carga trae más de una.
 */
export function filasDeLaCarga(
  piezas: readonly PiezaCubicada[],
  precioDe: (p: PiezaCubicada) => number,
): FilaCarga[] {
  type Acum = { especie: string; tipo: TipoComercial; precio: number; piezas: number; pies: number; largos: number[] };
  const grupos = new Map<string, Acum>();
  for (const p of piezas) {
    const especie = p.especie?.trim() || "Sin especie";
    const tipo = tipoDePieza(p);
    const precio = c2(precioDe(p) || 0);
    const clave = `${especie}|${tipo}|${precio}`;
    const g = grupos.get(clave) ?? { especie, tipo, precio, piezas: 0, pies: 0, largos: [] };
    g.piezas += p.cantidad;
    g.pies += p.pieTablar;
    g.largos.push(piesDeLargo(p));
    grupos.set(clave, g);
  }
  const lista = [...grupos.entries()];
  const especies = new Set(lista.map(([, g]) => g.especie));
  const preciosPorTipo = new Map<string, number>();
  for (const [, g] of lista) preciosPorTipo.set(`${g.especie}|${g.tipo}`, (preciosPorTipo.get(`${g.especie}|${g.tipo}`) ?? 0) + 1);

  return lista
    .sort(([, a], [, b]) =>
      a.especie.localeCompare(b.especie, "es") || ordenTipo(a.tipo) - ordenTipo(b.tipo) || b.precio - a.precio)
    .map(([clave, g]) => {
      const variosPrecios = (preciosPorTipo.get(`${g.especie}|${g.tipo}`) ?? 0) > 1;
      const base = especies.size > 1 ? `${g.especie} · ${g.tipo}` : g.tipo;
      const pies = p3(g.pies);
      return {
        clave,
        tipo: variosPrecios ? `${base} ${rangoDeLargos(g.largos)}` : base,
        piezas: g.piezas,
        pies,
        precio: g.precio,
        importe: c2(pies * g.precio),
      };
    });
}

const limpias = (ls: readonly LineaCuenta[]): LineaCuenta[] =>
  ls
    .map((l) => ({ ...l, concepto: l.concepto.trim(), monto: c2(Number(l.monto) || 0), nota: l.nota?.trim() || undefined }))
    .filter((l) => l.concepto !== "" && l.monto !== 0);

export function estadoDeCuentaDeLaCarga(filas: readonly FilaCarga[], cuenta: DatosCuenta): EstadoCuentaCarga {
  const importeCarga = c2(filas.reduce((a, f) => a + f.importe, 0));
  const adelantos = limpias(cuenta.adelantos);
  const cargos = limpias(cuenta.cargos);
  const totalAdelantos = c2(adelantos.reduce((a, l) => a + l.monto, 0));
  const saldoCarga = c2(importeCarga - totalAdelantos);
  const total = c2(saldoCarga + cargos.reduce((a, l) => a + l.monto, 0));
  return {
    filas: [...filas],
    piezas: filas.reduce((a, f) => a + f.piezas, 0),
    pies: p3(filas.reduce((a, f) => a + f.pies, 0)),
    importeCarga,
    totalAdelantos,
    saldoCarga,
    adelantos,
    cargos,
    total,
    enLetras: `${montoEnLetras(total)} soles`.toUpperCase(),
    sinPrecio: filas.filter((f) => f.precio === 0).length,
  };
}

/** «S/ 58,271.82» (miles con coma, como los papeles de Blas). */
export const soles = (n: number): string =>
  `S/ ${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «9,050.333» */
export const pies3 = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
