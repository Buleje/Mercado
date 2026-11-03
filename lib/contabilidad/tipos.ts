/**
 * lib/contabilidad/tipos.ts — contrato de la Contabilidad (ADR-529).
 *
 * Brandon 02-11-2026: «arma la contabilidad completa» (lo que le faltaba al
 * sistema para estar al nivel de un SAP). Doble partida con el PCGE 2019:
 * libro diario, libro mayor, balance de comprobación, estado de situación
 * financiera, estado de resultados, cierre del mes, asientos manuales y plan
 * de cuentas con cuentas propias.
 *
 * Regla de oro: los asientos AUTOMÁTICOS del mes abierto se arman en vivo con
 * las MISMAS filas que «Resultado» y «Caja del mes» (`ResultadoNegocioDB`):
 * la contabilidad no inventa otra versión de la plata. Al cerrar el mes se
 * congelan en la base. Los manuales (apertura, ajustes, depreciación) siempre
 * viven en la base.
 *
 * PURO y client-safe: solo tipos y constantes. Montos en soles con 2 decimales.
 */

import type { Certeza, EnlaceOrigen } from "@/lib/finance/resultado-del-negocio";

// ── Plan de cuentas ─────────────────────────────────────────────────────────

export const NATURALEZAS = ["activo", "pasivo", "patrimonio", "ingreso", "gasto"] as const;
export type Naturaleza = (typeof NATURALEZAS)[number];

export interface CuentaPlan {
  /** `10`, `101`, `1011`, `70111`… El nivel es la cantidad de dígitos. */
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  /** true = acepta asientos (cuenta de detalle); false = solo agrupa. */
  imputable: boolean;
  /** true = la creó el negocio (CuentaContablePropia); false = PCGE base. */
  propia: boolean;
  /** false = el negocio la dio de baja (solo propias). */
  activa: boolean;
}

/** `GET /api/admin/contabilidad/plan` */
export interface RespuestaPlan {
  cuentas: CuentaPlan[];
  /** Cuentas con movimiento en algún mes (para resaltar las que se usan). */
  usadas: string[];
}

// ── Asientos ────────────────────────────────────────────────────────────────

export const TIPOS_ASIENTO = ["auto", "manual", "apertura", "cierre"] as const;
export type TipoAsiento = (typeof TIPOS_ASIENTO)[number];

/** Los que una persona puede escribir a mano. */
export const TIPOS_ASIENTO_MANUAL = ["manual", "apertura"] as const;
export type TipoAsientoManual = (typeof TIPOS_ASIENTO_MANUAL)[number];

export interface LineaAsiento {
  cuenta: string;
  nombreCuenta: string;
  /** Exactamente uno de los dos es > 0. */
  debe: number;
  haber: number;
  glosa: string | null;
  /** Cliente, proveedor o persona (mayor auxiliar). */
  tercero: string | null;
}

export interface Asiento {
  /** id de la base (manuales y congelados) o `auto:<fuente>:<id>` (mes abierto). */
  id: string;
  /** Correlativo del mes, por fecha y luego por orden de llegada. */
  numero: number;
  periodo: string;
  /** `YYYY-MM-DD` (Lima). */
  fecha: string;
  glosa: string;
  tipo: TipoAsiento;
  /** `<fuente>:<id original>` en los automáticos; null en los manuales. */
  origen: string | null;
  /** Regla que lo armó (`venta_mostrador`, `cobro_pedido`…); null en los manuales. */
  regla: string | null;
  enlace: EnlaceOrigen | null;
  /** Σ debe = Σ haber. */
  total: number;
  lineas: LineaAsiento[];
  /** Hereda la certeza de la fila de origen (un costo estimado da un asiento estimado). */
  certeza: Certeza;
  anulado: boolean;
  /** Se puede anular/editar: manual o apertura en un mes abierto. */
  editable: boolean;
}

export interface AvisoContable {
  codigo:
    | "mes_cerrado_se_movio"
    | "cuenta_por_aclarar"
    | "compensacion_sin_cuenta"
    | "otras_monedas"
    | "costo_estimado"
    | "sin_apertura"
    | "antes_del_inicio"
    | "no_cuadra";
  texto: string;
  cuantos: number;
}

export type EstadoPeriodo = "abierto" | "cerrado";

/** `GET /api/admin/contabilidad/diario?mes=YYYY-MM` */
export interface RespuestaDiario {
  mes: string;
  estado: EstadoPeriodo;
  asientos: Asiento[];
  totalDebe: number;
  totalHaber: number;
  /** |totalDebe − totalHaber| < 0,005. */
  cuadra: boolean;
  avisos: AvisoContable[];
  generadoEn: string;
}

/** `POST /api/admin/contabilidad/asientos` (manual o apertura). */
export interface AsientoManualEntrada {
  fecha: string;
  glosa: string;
  tipo: TipoAsientoManual;
  lineas: { cuenta: string; debe: number; haber: number; glosa?: string | null; tercero?: string | null }[];
}

// ── Libro mayor ─────────────────────────────────────────────────────────────

export interface MovimientoMayor {
  asientoId: string;
  numero: number;
  fecha: string;
  glosa: string;
  tercero: string | null;
  debe: number;
  haber: number;
  /** Saldo acumulado después de este movimiento, con el signo de su naturaleza (deudora + / acreedora +). */
  saldo: number;
}

export interface CuentaMayor {
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  /** Saldo al empezar el mes (meses anteriores desde `inicio`). */
  saldoInicial: number;
  debe: number;
  haber: number;
  saldoFinal: number;
  /** Vacío cuando se pide el resumen (sin `cuenta`). */
  movimientos: MovimientoMayor[];
}

/** `GET /api/admin/contabilidad/mayor?mes=YYYY-MM[&cuenta=101]` */
export interface RespuestaMayor {
  mes: string;
  cuentas: CuentaMayor[];
}

// ── Balance de comprobación (8 columnas, formato peruano) ──────────────────

export interface ColumnasComprobacion {
  sumasDebe: number;
  sumasHaber: number;
  saldoDeudor: number;
  saldoAcreedor: number;
  /** Inventario (cuentas de balance: clases 1-5). */
  activo: number;
  pasivo: number;
  /** Resultados por naturaleza (clases 6-7). */
  perdidas: number;
  ganancias: number;
}

export interface FilaComprobacion extends ColumnasComprobacion {
  /** Cuenta de 2 dígitos (cuenta mayor del PCGE). */
  codigo: string;
  nombre: string;
}

/** `GET /api/admin/contabilidad/comprobacion?mes=YYYY-MM` — acumulado del ejercicio hasta el mes. */
export interface RespuestaComprobacion {
  mes: string;
  /** `YYYY-01` o el `inicio` del negocio si es posterior. */
  desde: string;
  filas: FilaComprobacion[];
  totales: ColumnasComprobacion;
  /** ganancias − perdidas (= activo − pasivo). */
  resultadoDelEjercicio: number;
  /** Sumas iguales, saldos iguales y activo − pasivo = ganancias − pérdidas. */
  cuadra: boolean;
}

// ── Estados financieros ─────────────────────────────────────────────────────

export interface RenglonEstado {
  clave: string;
  etiqueta: string;
  monto: number;
  /** Cuentas que suman acá (para el ⓘ y para abrir el mayor). */
  cuentas: string[];
  /** 0 = total/subtotal en negrita · 1 = renglón. */
  nivel: 0 | 1;
}

export interface EstadoSituacion {
  activoCorriente: RenglonEstado[];
  activoNoCorriente: RenglonEstado[];
  totalActivo: number;
  pasivoCorriente: RenglonEstado[];
  pasivoNoCorriente: RenglonEstado[];
  totalPasivo: number;
  /** Capital, resultados acumulados y el resultado del ejercicio. */
  patrimonio: RenglonEstado[];
  totalPatrimonio: number;
  /** totalActivo = totalPasivo + totalPatrimonio. */
  cuadra: boolean;
  diferencia: number;
}

export interface EstadoResultados {
  /** Ventas netas, costo de ventas, utilidad bruta, gastos, utilidad operativa, financieros, utilidad antes de impuestos. */
  renglones: RenglonEstado[];
  utilidad: number;
}

/**
 * Cruce con la pantalla «Resultado» (la misma fuente): la utilidad contable
 * del mes = resultado del panel − IGV de ventas + IGV de compras ± ajustes
 * manuales. `diferencia` ≠ 0 = algo no cuadra y se muestra en rojo.
 */
export interface CruceConResultado {
  resultadoDelPanel: number;
  igvVentas: number;
  igvCompras: number;
  ajustesManuales: number;
  /** Lo que es plata y no está en «Resultado» (pagos de alquiler). Opcional: agregado por el backend. */
  otrasFuentes?: number;
  utilidadContable: number;
  diferencia: number;
}

/** `GET /api/admin/contabilidad/estados?mes=YYYY-MM` */
export interface RespuestaEstados {
  mes: string;
  desde: string;
  /** Al último día del mes, acumulado desde el inicio. */
  situacion: EstadoSituacion;
  /** Solo el mes. */
  resultadosDelMes: EstadoResultados;
  /** Del `desde` al mes. */
  resultadosDelEjercicio: EstadoResultados;
  cruce: CruceConResultado;
}

// ── Meses (cierre) ──────────────────────────────────────────────────────────

export interface PeriodoResumen {
  periodo: string;
  estado: EstadoPeriodo;
  asientos: number;
  totalDebe: number;
  totalHaber: number;
  cuadra: boolean;
  utilidad: number;
  cerradoAt: string | null;
  cerradoPor: string | null;
  /** Cerrado, y las fuentes de hoy dan otro total: alguien editó algo del mes después del cierre. */
  seMovioDespues: boolean;
}

/** `GET /api/admin/contabilidad/periodos` — del `inicio` al mes actual, el más nuevo primero. */
export interface RespuestaPeriodos {
  inicio: string;
  periodos: PeriodoResumen[];
}

// ── Ajustes ─────────────────────────────────────────────────────────────────

/** `GET|PUT /api/admin/contabilidad/ajustes` */
export interface AjustesContables {
  /** Lo efectivo (ya resuelto con el régimen). */
  ventasConIgv: boolean;
  /** Lo que eligió el negocio; null = según el régimen. */
  ventasConIgvElegido: boolean | null;
  regimen: string | null;
  tasaIgv: number;
  /** `YYYY-MM`. */
  inicio: string;
  /** Regla → cuenta (solo las que el negocio cambió). */
  mapeo: Record<string, string>;
}

/** Una regla de asiento automático, para la pantalla de ajustes. */
export interface ReglaVista {
  regla: string;
  /** «Venta del mostrador», «Cobro de un pedido»… */
  etiqueta: string;
  /** Las cuentas por defecto (`{ debe: ["1212"], haber: ["70111", "40111"] }`). */
  debe: string[];
  haber: string[];
  /** La cuenta que el negocio puede cambiar (la de ingreso o gasto de la regla). */
  cambiable: "debe" | "haber" | null;
}

// ── Rutas (las dos puntas usan ESTA lista) ──────────────────────────────────
//
// Respuesta: el objeto pelado (`NextResponse.json(data)`), errores como
// `{ error: "texto para la persona" }` con 400/403/404/409/503 — igual que
// `app/api/admin/finanzas/cuentas/route.ts`.
//
// GET    diario?mes=YYYY-MM                    → RespuestaDiario
// GET    mayor?mes=YYYY-MM[&cuenta=1011]       → RespuestaMayor (sin cuenta: resumen sin movimientos)
// GET    comprobacion?mes=YYYY-MM              → RespuestaComprobacion
// GET    estados?mes=YYYY-MM                   → RespuestaEstados
// GET    periodos                              → RespuestaPeriodos
// POST   periodos/<YYYY-MM>/cerrar             → PeriodoResumen   (ROLES_CIERRE)
// POST   periodos/<YYYY-MM>/reabrir            → PeriodoResumen   (ROLES_CIERRE)
// POST   asientos            body AsientoManualEntrada → Asiento (409 si el mes está cerrado o no cuadra)
// DELETE asientos/<id>                         → { ok: true }     (anula; solo editable)
// GET    plan                                  → RespuestaPlan
// POST   plan                body CuentaPropiaEntrada → CuentaPlan
// PATCH  plan/<codigo>       body { nombre?, activa? } → CuentaPlan (solo propias)
// GET    ajustes                               → RespuestaAjustes
// PUT    ajustes             body AjustesEntrada → RespuestaAjustes (ROLES_CIERRE)
// GET    apertura-sugerida                     → AsientoManualEntrada (tipo «apertura», cuadrado con 5011)
// GET    exportar?mes=YYYY-MM&libro=<LibroExportable> → .xlsx (Content-Disposition attachment)

export const BASE_CONTABILIDAD = "/api/admin/contabilidad";

export const LIBROS_EXPORTABLES = ["diario", "mayor", "comprobacion", "estados"] as const;
export type LibroExportable = (typeof LIBROS_EXPORTABLES)[number];

export interface CuentaPropiaEntrada {
  /** Debe colgar de una cuenta imputable o agrupadora del PCGE (p. ej. `10411` cuelga de `1041`). */
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
}

export interface AjustesEntrada {
  ventasConIgv?: boolean | null;
  inicio?: string;
  mapeo?: Record<string, string>;
}

export interface RespuestaAjustes {
  ajustes: AjustesContables;
  reglas: ReglaVista[];
}

/** IGV general del Perú (16 % IGV + 2 % IPM). */
export const TASA_IGV = 0.18;

/** Roles que ven la contabilidad (los mismos de «Cuentas»). Escribir (asientos, plan, cierre, ajustes): solo owner/admin. */
export const ROLES_CONTABILIDAD = ["owner", "admin", "manager"] as const;
export const ROLES_CIERRE = ["owner", "admin"] as const;
