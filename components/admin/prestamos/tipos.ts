/**
 * Los tipos de Préstamos (lo que manda `/api/prestamos` y `/api/prestamos/resumen`),
 * compartidos por el módulo y su tablero (`PrestamosDashboard`).
 */

export type PrestamoStatus = "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";
export type PrestamoTipo = "PERSONAL" | "BANCARIO" | "TERCERO" | "PROVEEDOR";
export type PrestamoDireccion = "DADO" | "RECIBIDO";
export type PrestamoEntidadTipo = "BANCO" | "PERSONA_NATURAL" | "EMPRESA" | "PROVEEDOR";
export type SistemaAmortizacion = "FRANCES" | "ALEMAN" | "AMERICANO";

export type PrestamoCuota = {
  id: string;
  prestamoId: string;
  numeroCuota: number;
  monto: number;
  capital: number;
  interes: number;
  moraCalculada: number;
  fechaVence: string;
  pagadoEn?: string;
  montoPagado?: number;
};

export type PrestamoDocumento = {
  id: string;
  prestamoId: string;
  nombre: string;
  tipo: string;
  url: string;
  createdAt: string;
};

export type Prestamo = {
  id: string;
  tenantId: string;
  customerId?: string;
  tipo: PrestamoTipo;
  direccion: PrestamoDireccion;
  entidadNombre?: string;
  entidadTipo?: PrestamoEntidadTipo;
  nroOperacion?: string;
  monto: number;
  moneda: string;
  tasaInteres: number;
  tea?: number;
  moraInteres: number;
  numeroCuotas: number;
  sistemaAmortizacion: SistemaAmortizacion;
  periodoGracia: number;
  status: PrestamoStatus;
  fechaDesembolso?: string;
  fechaVencimiento?: string;
  garantia?: string;
  notas?: string;
  cuotas: PrestamoCuota[];
  documentos?: PrestamoDocumento[];
  createdAt: string;
  updatedAt: string;
};

export type Resumen = {
  totalDados: number;
  totalRecibidos: number;
  saldoDados: number;
  saldoRecibidos: number;
  cuotasVencidas: number;
  moraAcumulada: number;
  porTipo: Record<string, number>;
  activosDados: number;
  activosRecibidos: number;
};
