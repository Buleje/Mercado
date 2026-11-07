/**
 * precio-troza-tipos — el contrato de `GET /api/admin/forestal/precio-troza`
 * (noche 04-11, carril B1). Sólo tipos: la pantalla los importa sin arrastrar
 * Prisma ni la lectura.
 *
 * Dos preguntas del aserradero que compra ROLLO (m³) y vende ASERRADA (PT):
 *   1. `porEspecie`: ¿cuánto puedo pagar como MÁXIMO por 1 m³ de rollo?
 *      = PT que salen de 1 m³ × precio de venta por PT − aserrío − flete − margen.
 *   2. `porOrigen`: ¿qué proveedor / permiso / guía me rinde más en la sierra?
 */

/** De dónde salió el rendimiento con que se calculó el precio máximo. */
export type FuenteRendimiento = "medido" | "regla_56";

/** Cómo se agrupa el origen de la madera consumida. */
export type AgruparOrigenPor = "proveedor" | "permiso" | "guia";

/** Costo que la pantalla no mandó: el precio máximo se calculó SIN él (cuenta como 0). */
export type CostoNoIngresado = "aserrio" | "flete" | "margen";

export interface PrecioMaximoEspecie {
  especie: string;
  /** El % con que se calculó (el medido si alcanzó, si no el 56 % de la regla). */
  rendimientoPct: number;
  fuenteRendimiento: FuenteRendimiento;
  /** Corridas terminadas con que se midió (las de la ventana de fechas). */
  corridasMedidas: number;
  /** Lo medido aunque no se haya usado (pocas corridas o fuera de 40-75 %); null sin corridas. */
  rendimientoMedidoPct: number | null;
  /** En palabras: «medido en 7 corridas» / «2 corridas: se usa la regla del 56 %». */
  motivoRendimiento: string;
  /** PT aserrados que salen de 1 m³ de rollo = rendimiento × 424 (56 % → 237,44). */
  ptPorM3: number;
  /** S/ por PT de aserrada; null = no hay precio: que el usuario lo escriba. */
  precioVentaPt: number | null;
  /** `parametro` = lo escribió el usuario; `ventas` = mediana de sus paquetes vendidos. */
  fuentePrecio: "parametro" | "ventas" | null;
  /** S/ que vale lo aserrado de 1 m³ de rollo (null sin precio). */
  ventaBrutaM3: number | null;
  aserrioM3: number;
  fleteM3: number;
  margenPct: number;
  /** Margen en S/ por m³ = venta bruta × margen % (null sin precio). */
  margenM3: number | null;
  /** Lo MÁXIMO a pagar por 1 m³ de rollo; negativo = a ese precio de venta no alcanza. */
  precioMaximoM3: number | null;
  costosNoIngresados: CostoNoIngresado[];
  /** Lo que ya paga hoy por m³ de esa especie (mediana de sus guías con factura en soles). */
  pagadoHoyM3: { mediana: number; casos: number } | null;
  /** Máximo − pagado hoy: positivo = hay espacio; negativo = hoy paga de más. */
  holguraM3: number | null;
}

export interface FilaRendimientoOrigen {
  /** `s:<supplierId>`, `d:<RUC/DNI>`, `n:<nombre>`, `p:<permiso>`, `g:<GTF>`; `sin-origen` para el resto. */
  clave: string;
  nombre: string;
  /** El dato de al lado (RUC del proveedor, titular del permiso…). */
  detalle: string | null;
  sinOrigen: boolean;
  /** m³ de rollo consumidos en corridas terminadas. */
  m3Rollo: number;
  /** PT aserrados que le tocan (m³ de salida × 424, prorrateado si la corrida era mixta). */
  ptProducidos: number;
  /** PT ÷ (m³ × 424) × 100; null sin m³. */
  rendimientoPct: number | null;
  corridas: number;
  /** Lotes de aserrío distintos (las corridas sin lote no suman acá). */
  lotes: number;
  /** Alguna de sus corridas mezclaba orígenes: su parte se repartió por m³. */
  prorrateado: boolean;
  especies: string[];
  /** PT de más (o de menos) contra el promedio de SU especie en el mismo período. */
  difPtVsPromedio: number;
  /** Esos PT al precio de venta de la especie; null si alguna especie no tiene precio. */
  difSolesVsPromedio: number | null;
  /** Por qué `difSolesVsPromedio` es null («sin precio de venta de Capirona»). */
  difSolesFalta: string | null;
}

export interface TotalRendimientoOrigen {
  m3Rollo: number;
  ptProducidos: number;
  rendimientoPct: number | null;
  corridas: number;
  lotes: number;
  /** m³ que ninguna guía respalda (o cuya guía no trae el dato con que se agrupa). */
  m3SinOrigen: number;
}

export interface PrecioTrozaDTO {
  parametros: {
    especie: string | null;
    desde: string | null;
    hasta: string | null;
    aserrioM3: number | null;
    fleteM3: number | null;
    margenPct: number | null;
    precioPt: number | null;
    agruparPor: AgruparOrigenPor;
  };
  /** La regla del libro: 56 % de rendimiento y 424 PT por m³ aserrado. */
  regla: { rendimientoPct: number; ptPorM3Aserrada: number; minCorridasMedido: number; franjaMin: number; franjaMax: number };
  porEspecie: PrecioMaximoEspecie[];
  porOrigen: FilaRendimientoOrigen[];
  totalOrigen: TotalRendimientoOrigen;
  /** Corridas que no entran a la cuenta (y por qué): en proceso, declaradas en PT, sin m³ de entrada. */
  corridasFuera: { enProceso: number; enPt: number; sinEntrada: number };
}
