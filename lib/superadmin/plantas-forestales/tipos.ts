/**
 * Contrato de «Plantas forestales» del superadmin (17-10): control e inspección de
 * los negocios con `spec:forestal:ctp-libro` (aserraderos / CTP).
 *
 * Regla de oro: ningún número nuevo. Cada cifra sale de la MISMA función que usa
 * el libro de la planta (si el superadmin dice 62 m³ y la planta 20, es bug).
 * Sin `server-only`: lo leen las rutas y las pantallas.
 */
import type { SpecializationKey } from "@/lib/specializations";
import type { TendenciaMes } from "@/lib/db/forest-ctp.db";
import type { TrozaDelConteo } from "@/lib/forestal/conteo-patio";

export type Semaforo = "verde" | "amarillo" | "rojo" | "gris";
export type EstadoLectura = "ok" | "error";
export type FuenteLectura =
  | "saldos"
  | "conciliacion"
  | "disponibles"
  | "patio"
  | "lotes"
  | "pendientes"
  | "rendimiento"
  | "cumplimiento";

/** AAAA-MM-DD en hora de Lima. */
export interface PeriodoPlanta {
  desde: string;
  hasta: string;
}

export interface PlantaIdentidad {
  tenantId: string;
  slug: string;
  nombre: string;
  activo: boolean;
  plan: string;
  esPrueba: boolean;
  especializaciones: SpecializationKey[];
  /** ADR-395: dos negocios pueden ser operaciones de la misma planta. */
  grupoOperaciones: { grupoId: string; hermanas: { tenantId: string; slug: string; nombre: string }[] } | null;
}

export interface PiezasM3 {
  piezas: number;
  m3: number;
}

export interface TrozasPlanta {
  /** `ptAserrable` es derivado (≈ rolliza al 56 % × 424): se muestra con «≈». */
  enPatio: PiezasM3 & { ptAserrable: number };
  porRecepcionar: PiezasM3;
  pendienteSinPiezasM3: number;
  varadas: PiezasM3 & { dias: number };
}

export interface ProductoDisponible {
  producto: string;
  especie: string | null;
  m3: number;
  pt: number;
  corridas: number;
  paquetes: number;
}

export interface AserradaPlanta {
  disponibleM3: number;
  disponiblePt: number;
  corridas: number;
  paquetes: number;
  /** Corridas que no están en m³ (no se suman: mezclar unidades fue el «62 vs 20»). */
  enOtraUnidad: { unidad: string; cantidad: number; corridas: number }[];
  porProducto: ProductoDisponible[];
  /** Σ saldos().productos.stock: SOLO para conciliar, no es lo que «hay». */
  libroFirmaM3: number;
}

export interface MovimientoPeriodo {
  periodo: PeriodoPlanta;
  ingresoM3: number;
  ingresosCount: number;
  consumidoM3: number;
  despachadoDirectoM3: number;
  saldoM3: number;
  pendienteM3: number;
  producidoM3: number;
  despachadoM3: number;
  rendimientoPct: number | null;
  consumoSinOrigen: { m3: number; corridas: number };
  consumoSinDeclarar: { m3: number; corridas: number };
}

export interface EspecieExistencia {
  especie: string;
  existenciaFinalM3: number;
  movimientoM3: number;
}

export type OrigenIncoherencia = "saldo" | "cuadre_ingreso" | "rendimiento" | "pendiente" | "inspeccion";
export type GravedadIncoherencia = "error" | "warning" | "info";

export interface IncoherenciaPlanta {
  id: string;
  tenantId: string;
  plantaNombre: string;
  origen: OrigenIncoherencia;
  clave: string;
  gravedad: GravedadIncoherencia;
  titulo: string;
  detalle: string;
  /** null = no se mide en m³ (nunca 0). */
  m3EnJuego: number | null;
  referencia: { tipo: "guia" | "especie" | "corrida" | "lote" | "troza"; valor: string } | null;
  /** Query del panel de la planta, p. ej. "tab=ctp-libro-operaciones&vista=saldos&especie=…". */
  enlaceLibro: string;
}

export interface CumplimientoFoto {
  score: number;
  tono: "success" | "warning" | "error";
  fecha: string;
  periodo: string;
}

export interface PlantaResumen {
  identidad: PlantaIdentidad;
  /** null = esa lectura falló (el semáforo queda gris); nunca se reemplaza por 0. */
  trozas: TrozasPlanta | null;
  aserrada: AserradaPlanta | null;
  movimiento: MovimientoPeriodo | null;
  especiesNegativas: EspecieExistencia[];
  incoherencias: Record<GravedadIncoherencia, number> & { m3EnJuego: number };
  cumplimiento: CumplimientoFoto | null;
  ultimaActividad: string | null;
  diasSinActividad: number | null;
  ultimaInspeccion: { id: string; fecha: string; estado: EstadoInspeccion } | null;
  semaforo: Semaforo;
  motivoSemaforo: string;
  lecturas: Record<FuenteLectura, EstadoLectura>;
  calculadoEn: string;
  desdeCache: boolean;
}

export interface PlantasListaResponse {
  plantas: PlantaResumen[];
  periodo: PeriodoPlanta;
  totales: { plantas: number; trozasM3: number; aserradaM3: number; aserradaPt: number; rojas: number };
}

export interface PendientePlanta {
  titulo: string;
  urgencia: "bloquea" | "atrasado" | "pendiente";
  cantidad: number;
}

export interface PlantaFichaResponse {
  resumen: PlantaResumen;
  porEspecie: EspecieExistencia[];
  incoherencias: IncoherenciaPlanta[];
  tendencia: TendenciaMes[];
  pendientes: PendientePlanta[];
  inspecciones: InspeccionResumen[];
}

export interface IncoherenciasResponse {
  items: IncoherenciaPlanta[];
  porPlanta: { tenantId: string; error: number; warning: number; m3EnJuego: number }[];
}

// ── Inspección (fase 3) ─────────────────────────────────────────────────────

export type EstadoInspeccion = "abierta" | "cerrada" | "anulada";

export interface HallazgoInspeccion {
  id: string;
  gravedad: GravedadIncoherencia;
  categoria: "volumen" | "documentos" | "trazabilidad" | "seguridad" | "otro";
  texto: string;
  m3: number | null;
  fotos: string[];
  referencia: IncoherenciaPlanta["referencia"];
}

export interface ConteoAserrada {
  producto: string;
  especie: string | null;
  libroM3: number;
  contadoM3: number | null;
  libroPiezas: number | null;
  contadoPiezas: number | null;
}

/** El libro congelado al abrir la inspección: el acta compara contra ESTO, no contra el libro de hoy. */
export type FotoDelLibro = Pick<PlantaResumen, "trozas" | "aserrada" | "movimiento" | "incoherencias"> & {
  tomadaEn: string;
  /** Las trozas que el libro dice que están en el patio (`aTrozaDelConteo` sobre `trozasDelPatio`):
   *  el inspector las cuenta con `nuevoConteo`/`anotarTroza` como el conteo de la propia planta. */
  trozasDelPatio: TrozaDelConteo[];
  /** El patio era más grande que lo que se congeló (tope del libro): un «sobrante» puede ser una troza que sí estaba. */
  trozasDelPatioTruncado?: boolean;
  /** Las incoherencias del momento, para convertirlas en hallazgos. */
  incoherenciasDetalle: IncoherenciaPlanta[];
};

export interface InspeccionResumen {
  id: string;
  fecha: string;
  inspector: string;
  estado: EstadoInspeccion;
  hallazgos: number;
  faltantesTrozas: number | null;
}

export interface InspeccionPlanta extends InspeccionResumen {
  tenantId: string;
  libro: FotoDelLibro;
  conteoPatioId: string | null;
  trozas: {
    esperadas: number;
    contadas: number;
    m3Esperado: number | null;
    m3Contado: number | null;
    faltantes: number;
    sobrantes: number;
  } | null;
  aserrada: ConteoAserrada[];
  hallazgosDetalle: HallazgoInspeccion[];
  conclusion: string | null;
  responsablePlanta: string | null;
  cerradaAt: string | null;
}
