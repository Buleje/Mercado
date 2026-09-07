/**
 * Qué parte del depósito NO se puede certificar, y por qué.
 *
 * El libro admite huecos; el certificado no (`trazabilidadCompleta()` bloquea
 * EMITIR, nunca guardar). Eso está bien como regla, pero deja al dueño con un
 * depósito lleno y sin saber cuánto de eso puede salir con papeles: la respuesta
 * estaba repartida entre Consumos («corridas sin origen»), el chip de cada
 * corrida y el checklist del cierre. Acá se junta, en m³ y con el remedio al
 * lado.
 *
 * Dos motivos distintos, dos remedios distintos:
 *
 *  · SIN MATERIA PRIMA ATADA — la corrida no tiene ningún consumo (`gtfOrigen`
 *    vacío). Nadie dijo de qué guía salió esa madera. Se arregla desde la ficha
 *    de la corrida, atando ingresos (I1/I2 lo validan). Medido en una planta:
 *    5 de 6 corridas con saldo, el 87 % del depósito.
 *  · INGRESO SIN TÍTULO — la corrida sí consumió de una guía, pero esa guía no
 *    declara título habilitante (casillero 6). Se arregla en la ficha de la
 *    guía; si el ingreso ya está validado, corregirlo exige anular y volver a
 *    registrar (regla de `WoodEntriesDB.update`).
 *
 * PURO: entra lo que Saldos ya pidió, sale la lista y los totales. Lo leen la
 * pantalla, el CSV y el PDF de existencias.
 */

import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import type { CorridaDisponible, LoteDeCapacidad } from "./capacidad-de-planta";

export type MotivoOrigen = "sin_materia_prima" | "ingreso_sin_titulo";

export interface CorridaSinOrigen {
  id: string;
  fecha: string;
  lote: string | null;
  producto: string | null;
  especie: string | null;
  unidad: string;
  disponible: number;
  /** Sólo con unidad m³; en otra unidad el pie tablar sería inventado. */
  pt: number | null;
  motivo: MotivoOrigen;
  /** Las guías que sí consumió (para el motivo «ingreso sin título»). */
  guias: string[];
  /**
   * Piezas libres del lote que la corrida dice haber consumido
   * (`materiaPrimaRef`): si hay, el remedio es atarlas; si no, la madera de
   * ese lote ya está atada a otra corrida o el lote es de inventario.
   */
  piezasLibresDelLote: number;
  m3LibresDelLote: number;
}

export interface ResumenOrigen {
  corridas: CorridaSinOrigen[];
  /** m³ (sólo unidad m³) que hoy no se pueden certificar. */
  m3SinCertificar: number;
  /** Del total disponible en m³, qué fracción es (0..1). */
  fraccion: number;
  porMotivo: Record<MotivoOrigen, { corridas: number; m3: number }>;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const limpio = (xs: readonly string[]) => [
  ...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean)),
];

export const MOTIVO_LABEL: Record<MotivoOrigen, string> = {
  sin_materia_prima: "Sin materia prima atada",
  ingreso_sin_titulo: "La guía no declara título habilitante",
};

export const MOTIVO_REMEDIO: Record<MotivoOrigen, string> = {
  sin_materia_prima: "Abrí la corrida y atá los ingresos (o las piezas) de los que salió",
  ingreso_sin_titulo: "Completá el casillero (6) en la ficha de la guía",
};

/** El diagnóstico de UNA corrida, o `null` si su origen está completo. */
export function diagnosticar(
  c: CorridaDisponible,
  lotes: readonly LoteDeCapacidad[],
): CorridaSinOrigen | null {
  if (c.disponible <= 0) return null;
  const titulos = limpio(c.titularOrigen);
  if (titulos.length > 0) return null;
  const guias = limpio(c.gtfOrigen);
  const lote = c.lote ? lotes.find((l) => l.code === c.lote) : undefined;
  const libres = lote?.trozas.filter((t) => !t.consumida) ?? [];
  return {
    id: c.id,
    fecha: c.fecha,
    lote: c.lote,
    producto: c.producto,
    especie: c.especie,
    unidad: c.unidad,
    disponible: r4(c.disponible),
    pt: c.unidad === "m3" ? pieTablarDe(c.disponible) : null,
    motivo: guias.length === 0 ? "sin_materia_prima" : "ingreso_sin_titulo",
    guias,
    piezasLibresDelLote: libres.length,
    m3LibresDelLote: r4(libres.reduce((a, t) => a + t.m3, 0)),
  };
}

export function resumenDeOrigen(
  corridas: readonly CorridaDisponible[],
  lotes: readonly LoteDeCapacidad[] = [],
): ResumenOrigen {
  const filas = corridas
    .map((c) => diagnosticar(c, lotes))
    .filter((x): x is CorridaSinOrigen => x != null)
    /* Primero lo que está en m³ —lo que se suma y se certifica— y de mayor a
       menor; una corrida en pt no se compara con una en m³ por su número. */
    .sort(
      (a, b) =>
        (a.unidad === "m3" ? 0 : 1) - (b.unidad === "m3" ? 0 : 1) || b.disponible - a.disponible,
    );

  const enM3 = (xs: readonly CorridaSinOrigen[]) =>
    r4(xs.filter((x) => x.unidad === "m3").reduce((a, x) => a + x.disponible, 0));
  const totalM3 = r4(
    corridas
      .filter((c) => c.unidad === "m3" && c.disponible > 0)
      .reduce((a, c) => a + c.disponible, 0),
  );
  const m3SinCertificar = enM3(filas);

  const porMotivo = {
    sin_materia_prima: { corridas: 0, m3: 0 },
    ingreso_sin_titulo: { corridas: 0, m3: 0 },
  };
  for (const f of filas) {
    porMotivo[f.motivo].corridas += 1;
    if (f.unidad === "m3") porMotivo[f.motivo].m3 = r4(porMotivo[f.motivo].m3 + f.disponible);
  }

  return {
    corridas: filas,
    m3SinCertificar,
    fraccion: totalM3 > 0 ? Math.round((m3SinCertificar / totalM3) * 1000) / 1000 : 0,
    porMotivo,
  };
}
