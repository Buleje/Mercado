/**
 * La tabla «A mano» del precio por especie × tipo (Brandon 28-10: «en precio a
 * pagar poner según tipo y especie una tabla a cuánto lo acordado de corta,
 * comercial… según la cubicación»).
 *
 * Una fila por especie del lote y una columna por cada tipo que aparece en la
 * cubicación (orden `ORDEN_TIPO`). Cada celda trae sus piezas, su PT y su
 * importe con el MISMO resolver del lote (`precioDePieza`): lo que la tabla
 * dice es lo que se guarda, se imprime y se manda por WhatsApp.
 *
 * PURO y client-safe.
 */
import type { PiezaCubicada } from "./cubicacion";
import { claveGrupo } from "./cubicacion-salidas";
import { ORDEN_TIPO, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";
import { precioDePieza, type ContextoPrecio, type PiezaConPrecio } from "./precio-de-pieza";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CeldaEspecieTipo {
  tipo: TipoComercial;
  /** `claveGrupo(especie, tipo)`: la clave del precio en `porEspecieTipo`. */
  clave: string;
  piezas: number;
  pt: number;
  /** Σ PT × precio de cada pieza. `null` = ninguna pieza con precio. */
  importe: number | null;
}

export interface FilaEspecieTipo {
  /** Como se escribió la primera vez en el lote. */
  especie: string;
  /** En minúsculas: la clave de `porEspecie`. */
  clave: string;
  piezas: number;
  pt: number;
  importe: number | null;
  celdas: Partial<Record<TipoComercial, CeldaEspecieTipo>>;
}

export interface TablaEspecieTipo {
  /** Sólo los tipos que aparecen en el lote, en el orden de siempre. */
  tipos: TipoComercial[];
  filas: FilaEspecieTipo[];
  /** Piezas sin especie: van al general (no tienen fila). */
  sinEspecie: { piezas: number; pt: number };
}

type Pieza = PiezaConPrecio & Pick<PiezaCubicada, "pieTablar" | "cantidad">;

const sumar = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : a + b);

export function tablaEspecieTipo(rows: readonly Pieza[], ctx: ContextoPrecio): TablaEspecieTipo {
  const filas = new Map<string, FilaEspecieTipo>();
  const tipos = new Set<TipoComercial>();
  const sinEspecie = { piezas: 0, pt: 0 };
  for (const r of rows) {
    const pt = Number.isFinite(r.pieTablar) ? r.pieTablar : 0;
    const nombre = r.especie?.trim() ?? "";
    if (!nombre) {
      sinEspecie.piezas += r.cantidad;
      sinEspecie.pt += pt;
      continue;
    }
    const k = nombre.toLowerCase();
    const tipo = tipoDePieza(r);
    tipos.add(tipo);
    const precio = precioDePieza(r, ctx).precioPt;
    const importe = precio > 0 ? pt * precio : null;
    const fila = filas.get(k) ?? { especie: nombre, clave: k, piezas: 0, pt: 0, importe: null, celdas: {} };
    filas.set(k, fila);
    fila.piezas += r.cantidad;
    fila.pt += pt;
    fila.importe = sumar(fila.importe, importe);
    const celda = fila.celdas[tipo] ?? { tipo, clave: claveGrupo(k, tipo), piezas: 0, pt: 0, importe: null };
    fila.celdas[tipo] = celda;
    celda.piezas += r.cantidad;
    celda.pt += pt;
    celda.importe = sumar(celda.importe, importe);
  }
  const redondear = (f: FilaEspecieTipo): FilaEspecieTipo => ({
    ...f,
    pt: r2(f.pt),
    importe: f.importe === null ? null : r2(f.importe),
    celdas: Object.fromEntries(
      Object.entries(f.celdas).map(([t, c]) => [t, { ...c, pt: r2(c.pt), importe: c.importe === null ? null : r2(c.importe) }]),
    ),
  });
  return {
    tipos: ORDEN_TIPO.filter((t) => tipos.has(t)),
    filas: [...filas.values()].map(redondear),
    sinEspecie: { piezas: sinEspecie.piezas, pt: r2(sinEspecie.pt) },
  };
}

/** ¿Hay algún precio a mano por especie o por especie y tipo (> 0)? */
export function hayPrecioPorEspecie(aMano: ContextoPrecio["aMano"]): boolean {
  const alguno = (m: Readonly<Record<string, string | number>> | undefined) => Object.values(m ?? {}).some((v) => Number(v) > 0);
  return alguno(aMano.porEspecie) || alguno(aMano.porEspecieTipo);
}
