/**
 * El cuadre de «Agregar cubicación» (ADR-445): una cubicación guardada contra
 * lo que las corridas de un día declararon, por especie y tipo.
 *
 * Vincular COMPLEMENTA (ADR-401: completar ≠ corregir): no cambia la cantidad
 * ni los paquetes del asiento. Por eso la cubicación tiene que explicar lo
 * declarado antes de atarse — si no, el Anexo 04 de esa corrida saldría con
 * otra madera.
 *
 *  · Lo que decide es la ESPECIE: cada una tiene que llegar a lo declarado con
 *    la tolerancia de negocio (10 litros o el 2 %, `toleranciaM3`). Una especie
 *    medida que ninguna corrida elegida declara, o una declarada sin piezas, no
 *    cuadra.
 *  · El TIPO se muestra fila por fila pero no traba: el cubicador lo deduce de
 *    la medida y el libro puede nombrarlo distinto con la misma madera.
 *  · Las piezas se muestran; no traban (un asiento por tipo suele redondearlas).
 *
 * PURO: lo prueban los tests sin montar el modal.
 */

import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { ORDEN_TIPO, tipoDePieza } from "@/lib/forestal/cubicacion-tipo";
import { tipoComercialDelProducto } from "@/lib/forestal/loctp-catalogos";
import { clasificacionCorta } from "@/lib/forestal/detalle-de-jornada";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { tipoDelPaquete, type CorridaDelDia } from "@/lib/forestal/piezas-del-dia";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { toleranciaM3 } from "./marcas-del-dia";

export type TonoDelVinculo = "ok" | "aviso" | "error";

export interface FilaDelVinculo {
  especie: string;
  tipo: string;
  m3Declarado: number;
  piezasDeclaradas: number;
  m3Cubicado: number;
  piezasCubicadas: number;
  deltaM3: number;
  tono: TonoDelVinculo;
  /** El libro no nombró tipo: los tipos que dio la medida y se sumaron acá. */
  tiposMedidos?: string[];
}

export interface EspecieDelVinculo {
  especie: string;
  m3Declarado: number;
  m3Cubicado: number;
  deltaM3: number;
  cuadra: boolean;
}

export interface CuadreDelVinculo {
  filas: FilaDelVinculo[];
  especies: EspecieDelVinculo[];
  total: {
    m3Declarado: number;
    m3Cubicado: number;
    deltaM3: number;
    piezasDeclaradas: number;
    piezasCubicadas: number;
  };
  cuadra: boolean;
  /** Por qué no se puede vincular, en una línea. `null` = cuadra. */
  motivo: string | null;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const SIN_ESPECIE = "Sin especie";
const SIN_TIPO = "Sin tipo";

type Acc = Omit<FilaDelVinculo, "deltaM3" | "tono">;

const esTipoComercial = (t: string) => (ORDEN_TIPO as readonly string[]).includes(t);

/** El tipo con que el libro nombra lo que el asiento declara sin paquete. */
function tipoDelAsiento(producto: string | null): string {
  if (!producto?.trim()) return SIN_TIPO;
  return tipoComercialDelProducto(producto) ?? clasificacionCorta(producto);
}

export function cuadrarVinculo(
  corridas: readonly CorridaDelDia[],
  piezas: readonly PiezaCubicada[],
): CuadreDelVinculo {
  const filas = new Map<string, Acc>();
  const nombreEspecie = new Map<string, string>();
  const tomar = (especie: string | null | undefined, tipo: string): Acc => {
    const ke = claveEspecie(especie) || SIN_ESPECIE.toLowerCase();
    if (especie?.trim() && !nombreEspecie.has(ke)) nombreEspecie.set(ke, especie.trim());
    const k = `${ke}|${tipo.toLowerCase()}`;
    let f = filas.get(k);
    if (!f) {
      f = {
        especie: ke,
        tipo,
        m3Declarado: 0,
        piezasDeclaradas: 0,
        m3Cubicado: 0,
        piezasCubicadas: 0,
      };
      filas.set(k, f);
    }
    return f;
  };

  for (const c of corridas) {
    let enPaquetes = 0;
    for (const p of c.paquetes) {
      const f = tomar(c.especie, tipoDelPaquete(p));
      f.m3Declarado = r4(f.m3Declarado + (Number(p.volumenM3) || 0));
      f.piezasDeclaradas += Number(p.cantidad) || 0;
      enPaquetes += Number(p.volumenM3) || 0;
    }
    /* Lo que el asiento declara y ningún paquete detalla: una corrida por tipo
       sin paquetes es TODA así. */
    const resto = r4((Number(c.m3) || 0) - enPaquetes);
    if (resto > 0.0001) {
      const f = tomar(c.especie, tipoDelAsiento(c.producto));
      f.m3Declarado = r4(f.m3Declarado + resto);
      if (c.paquetes.length === 0) f.piezasDeclaradas += Number(c.piezasAsiento) || 0;
    }
  }
  /* Un asiento que no nombra tipo («MADERA ASERRADA», sin clasificación) no
     contradice ningún tipo medido: si es lo ÚNICO declarado de esa especie,
     recibe lo cubicado de cualquier tipo y lo dice («medida: Comercial»). Sin
     esto, 0,600 m³ de Cumala contra 0,598 salía en dos filas ámbar de ±0,6. */
  const genericoDe = new Map<string, Acc>();
  const declaradasPorEspecie = new Map<string, Acc[]>();
  for (const f of filas.values()) {
    if (f.m3Declarado > 0)
      declaradasPorEspecie.set(f.especie, [...(declaradasPorEspecie.get(f.especie) ?? []), f]);
  }
  for (const [ke, filasDe] of declaradasPorEspecie) {
    if (filasDe.length === 1 && !esTipoComercial(filasDe[0]!.tipo)) genericoDe.set(ke, filasDe[0]!);
  }
  for (const p of piezas) {
    const tipo = tipoDePieza(p);
    const ke = claveEspecie(p.especie) || SIN_ESPECIE.toLowerCase();
    const propia = filas.get(`${ke}|${tipo.toLowerCase()}`);
    const generica = propia ? undefined : genericoDe.get(ke);
    const f = propia ?? generica ?? tomar(p.especie, tipo);
    if (generica) generica.tiposMedidos = [...new Set([...(generica.tiposMedidos ?? []), tipo])];
    f.m3Cubicado = r4(f.m3Cubicado + (Number(p.m3) || 0));
    f.piezasCubicadas += Number(p.cantidad) || 0;
  }

  const nombre = (ke: string) =>
    nombreEspecie.get(ke) ?? (ke === SIN_ESPECIE.toLowerCase() ? SIN_ESPECIE : ke);

  /* Por especie: es lo que decide. */
  const porEspecie = new Map<string, EspecieDelVinculo>();
  for (const f of filas.values()) {
    const e = porEspecie.get(f.especie) ?? {
      especie: f.especie,
      m3Declarado: 0,
      m3Cubicado: 0,
      deltaM3: 0,
      cuadra: false,
    };
    e.m3Declarado = r4(e.m3Declarado + f.m3Declarado);
    e.m3Cubicado = r4(e.m3Cubicado + f.m3Cubicado);
    porEspecie.set(f.especie, e);
  }
  const especies = [...porEspecie.values()]
    .map((e) => {
      const deltaM3 = r4(e.m3Cubicado - e.m3Declarado);
      const cuadra =
        e.m3Declarado > 0 && e.m3Cubicado > 0 && Math.abs(deltaM3) <= toleranciaM3(e.m3Declarado);
      return { ...e, especie: nombre(e.especie), deltaM3, cuadra };
    })
    .sort((a, b) => b.m3Declarado - a.m3Declarado || a.especie.localeCompare(b.especie));
  const cuadraLaEspecie = new Map(
    especies.map((e) => [claveEspecie(e.especie) || SIN_ESPECIE.toLowerCase(), e.cuadra]),
  );

  const lista: FilaDelVinculo[] = [...filas.values()]
    .map((f) => {
      const deltaM3 = r4(f.m3Cubicado - f.m3Declarado);
      const tono: TonoDelVinculo =
        Math.abs(deltaM3) <= toleranciaM3(f.m3Declarado) && f.m3Declarado > 0
          ? "ok"
          : cuadraLaEspecie.get(f.especie)
            ? "aviso"
            : "error";
      return { ...f, especie: nombre(f.especie), deltaM3, tono };
    })
    .sort(
      (a, b) =>
        a.especie.localeCompare(b.especie) ||
        b.m3Declarado - a.m3Declarado ||
        a.tipo.localeCompare(b.tipo),
    );

  const total = lista.reduce(
    (t, f) => ({
      m3Declarado: r4(t.m3Declarado + f.m3Declarado),
      m3Cubicado: r4(t.m3Cubicado + f.m3Cubicado),
      deltaM3: 0,
      piezasDeclaradas: t.piezasDeclaradas + f.piezasDeclaradas,
      piezasCubicadas: t.piezasCubicadas + f.piezasCubicadas,
    }),
    { m3Declarado: 0, m3Cubicado: 0, deltaM3: 0, piezasDeclaradas: 0, piezasCubicadas: 0 },
  );
  total.deltaM3 = r4(total.m3Cubicado - total.m3Declarado);

  let motivo: string | null = null;
  if (corridas.length === 0) motivo = "Elige al menos una corrida.";
  else if (piezas.length === 0) motivo = "Elige una cubicación.";
  else {
    const peor = [...especies]
      .filter((e) => !e.cuadra)
      .sort((a, b) => Math.abs(b.deltaM3) - Math.abs(a.deltaM3))[0];
    if (peor) {
      motivo =
        peor.m3Declarado === 0
          ? `${peor.especie}: la cubicación trae ${fmtM3(peor.m3Cubicado)} m³ y ninguna corrida elegida la declara.`
          : peor.m3Cubicado === 0
            ? `${peor.especie}: declarada ${fmtM3(peor.m3Declarado)} m³ y la cubicación no trae ninguna pieza.`
            : `${peor.especie}: la cubicación da ${fmtM3(peor.m3Cubicado)} m³ y se declaró ${fmtM3(peor.m3Declarado)} m³ (${peor.deltaM3 > 0 ? "+" : ""}${fmtM3(peor.deltaM3)}).`;
    }
  }
  return { filas: lista, especies, total, cuadra: motivo === null, motivo };
}
