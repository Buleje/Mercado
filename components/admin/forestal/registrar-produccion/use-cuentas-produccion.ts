/**
 * Las cuentas de «Registrar producción»: volumen del paquete, totales, tope,
 * margen, rendimiento, motivos para no guardar, reparto y bloques a cotizar.
 *
 * Movidas tal cual desde `CtpRegistrarProduccionModal.tsx` (28-10). Son las
 * MISMAS fórmulas: los tres pasos las leen, ninguno las recalcula.
 */
import { useMemo } from "react";
import { juzgarRendimientoLote } from "@/lib/forestal/lotes-aserrio";
import {
  margenDeclarableM3,
  motivosParaGuardar,
  repartirEntreOrigenes,
  topeDeclarableM3,
  totalesProduccion,
  volumenDimensionado,
  type PaqueteBorrador,
} from "@/lib/forestal/produccion-paquetes";
import { avisosDeCifra } from "@/lib/forestal/produccion-cifras-imposibles";
import { bloquesDeCorrida } from "@/lib/forestal/tarifa-aserrio";
import type { PaquetePrevio } from "../CtpMaterialPanel";
import type { MaterialAConsumir } from "./tipos";

export function useCuentasProduccion({
  material,
  yaDeclaradoM3,
  paquetesPrevios,
  productoInicial,
  guardando,
  codigosUsados,
  paquetes,
  aserrioValido,
  cantidad,
  espesor,
  ancho,
  largo,
  dimensionar,
  volumen,
  editandoId,
  repetir,
}: {
  material: MaterialAConsumir;
  yaDeclaradoM3: number;
  paquetesPrevios?: readonly PaquetePrevio[];
  productoInicial?: string | null;
  guardando: boolean;
  codigosUsados: string[];
  paquetes: PaqueteBorrador[];
  aserrioValido: boolean;
  cantidad: string;
  espesor: string;
  ancho: string;
  largo: string;
  dimensionar: boolean;
  volumen: string;
  editandoId: string | null;
  repetir: string;
}) {
  const piezas = Number(cantidad) || 0;
  /** Dimensionado, el volumen se CALCULA: tipearlo aparte da dos verdades. */
  const volumenCalculado = useMemo(
    () =>
      volumenDimensionado(
        Number(espesor) || null,
        Number(ancho) || null,
        Number(largo) || null,
        piezas,
      ),
    [espesor, ancho, largo, piezas],
  );
  const volumenAUsar = dimensionar ? volumenCalculado : Number(volumen) || null;

  const totales = useMemo(
    () => totalesProduccion(paquetes, material.volumenM3),
    [paquetes, material.volumenM3],
  );
  /**
   * Lo que la corrida va a declarar EN TOTAL: lo de tandas anteriores más lo de
   * ahora. El tope, el rendimiento y la barra se miden contra esto — mirar sólo
   * la tanda dejaría pasar dos del 40 % sobre la misma materia prima.
   */
  const previo = Math.max(0, Number(yaDeclaradoM3) || 0);
  const acumulado = Math.round((previo + totales.volumen) * 10_000) / 10_000;
  const rendimientoPct =
    material.volumenM3 > 0 && acumulado > 0
      ? Math.round((acumulado / material.volumenM3) * 1000) / 10
      : null;
  const veredicto = juzgarRendimientoLote(rendimientoPct);
  /* El techo del 56 %: no se guarda un asiento que declare más producto del que
     sale físicamente de lo que entró (ADR-358). */
  const tope = topeDeclarableM3(material.volumenM3);
  const margen = margenDeclarableM3(material.volumenM3, acumulado);
  /**
   * El paquete que se está editando y el margen que le corresponde A ÉL.
   *
   * `margen` ya descuenta el volumen del paquete editado (está en `paquetes`).
   * Si no se lo devolviera, corregir «3.0 → 3.0» diría que no entra: el propio
   * paquete estaría compitiendo consigo mismo por el tope.
   */
  const editando = useMemo(
    () => paquetes.find((p) => p.id === editandoId) ?? null,
    [paquetes, editandoId],
  );
  const margenParaEste = Math.round((margen + (editando?.volumenM3 ?? 0)) * 10_000) / 10_000;
  /** Cuántos iguales se van a crear. Editando siempre es 1: se corrige uno. */
  const veces = editandoId ? 1 : Math.max(1, Math.min(200, Math.floor(Number(repetir) || 1)));
  const motivos = useMemo(
    () =>
      motivosParaGuardar(paquetes, {
        consumidoM3: material.volumenM3,
        yaDeclaradoM3: previo,
        codigosUsados,
      }),
    [paquetes, material.volumenM3, previo, codigosUsados],
  );
  /**
   * Cómo se reparte entre los títulos que lo ampararon. Se reparte el ACUMULADO:
   * el reparto es del producto de la corrida, no del de esta tanda, y mostrar
   * sólo la tanda haría creer que al título le tocaron 2 m³ cuando le tocan 5.
   */
  const reparto = useMemo(
    () => repartirEntreOrigenes(acumulado, material.origenes ?? []),
    [acumulado, material.origenes],
  );
  const listo = motivos.length === 0 && !guardando && aserrioValido;
  /**
   * Las cifras que la madera no puede dar (piezas contra volumen).
   *
   * Va aparte de `motivos` A PROPÓSITO: esto AVISA, no impide. El libro tiene
   * que poder registrar lo que realmente pasó —un turno raro existe—, pero no
   * dejarlo pasar en silencio: las corridas #24 y #26 de Blas declararon 141
   * piezas en 0.0090 y 0.0010 m³ y hoy están firmadas en el libro que ve SERFOR.
   *
   * Sólo los paquetes de ESTA tanda: los que la corrida ya tiene declarados se
   * revisan desde la barra «Pendiente» de Producción, que es donde se corrigen.
   */
  const avisosDeCifras = useMemo(
    () => avisosDeCifra({ volumenM3: totales.volumen, piezas: totales.piezas, paquetes }),
    [paquetes, totales.volumen, totales.piezas],
  );

  /**
   * Los bloques a cotizar (ADR-412): los paquetes YA declarados en tandas
   * anteriores más los de esta tanda — ampliar recotiza sobre TODO, no sólo lo
   * nuevo (ADR-412 §4). Comparten la especie de la corrida: el Libro admite una
   * sola por asiento.
   */
  const bloquesAserrio = useMemo(
    () =>
      bloquesDeCorrida(
        {
          lineNo: null,
          speciesCommon: material.especie,
          productType: paquetes[0]?.productType ?? productoInicial ?? null,
          quantity: acumulado,
        },
        [
          ...(paquetesPrevios ?? []).map((p) => ({
            codigo: p.codigo,
            productType: p.productType ?? undefined,
            volumenM3: Number(p.volumenM3) || 0,
            espesorCm: p.espesorCm != null ? Number(p.espesorCm) : null,
            anchoCm: p.anchoCm != null ? Number(p.anchoCm) : null,
            largoM: p.largoM != null ? Number(p.largoM) : null,
          })),
          ...paquetes.map((p) => ({
            codigo: p.codigo,
            productType: p.productType,
            volumenM3: p.volumenM3,
            espesorCm: p.espesorCm,
            anchoCm: p.anchoCm,
            largoM: p.largoM,
          })),
        ],
      ),
    [material.especie, paquetes, paquetesPrevios, productoInicial, acumulado],
  );

  return {
    piezas,
    volumenCalculado,
    volumenAUsar,
    totales,
    previo,
    acumulado,
    rendimientoPct,
    veredicto,
    tope,
    margen,
    editando,
    margenParaEste,
    veces,
    motivos,
    reparto,
    listo,
    avisosDeCifras,
    bloquesAserrio,
  };
}

export type CuentasProduccion = ReturnType<typeof useCuentasProduccion>;
