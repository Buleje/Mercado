/** ADR-491: lo que comparten la ruta, la pantalla Entregar y la página pública de firma. */
export const TIPOS_FIRMA = ["FIRMA", "HUELLA"] as const;
export type TipoFirma = (typeof TIPOS_FIRMA)[number];
export const CANALES_FIRMA = ["PANTALLA", "ENLACE", "BACKFILL"] as const;
export type CanalFirma = (typeof CANALES_FIRMA)[number];
/** = METODOS_CAJA de app/api/adelantos/route.ts:14. */
export const METODOS_ENTREGA = ["efectivo", "yape", "plin", "tarjeta", "transferencia"] as const;
export type MetodoEntrega = (typeof METODOS_ENTREGA)[number];

export const TOPE_CAJERO_POR_DEFECTO = 500;
export const HORAS_ENLACE_POR_DEFECTO = 48;
export const HORAS_ENLACE_MAX = 168;
export const MAX_INTENTOS_DNI_ENLACE = 5;
export const MAX_PUNTOS_TRAZOS = 6000;
export const MAX_BYTES_FIRMA = 1024 * 1024;
/** El cliente comprime la huella a ≤1600 px JPEG: firma + huella < 4,5 MB de Vercel. */
export const MAX_BYTES_HUELLA = 3 * 1024 * 1024;
export const VERSION_CONSENTIMIENTO_HUELLA = "huella-v1-2026-10";
export const TEXTO_CONSENTIMIENTO_HUELLA = "Acepto que se guarde la foto de mi huella solo como prueba de este recibo.";
export const ACCION_ENTREGAR = "nuevo"; // ?tab=plata&vista=adelantos&accion=nuevo[&persona=<id>]
export const RUTA_FIRMA_PUBLICA = "/firmar-adelanto";

/** «45678901» → «•••••901»; null si no hay. */
export function enmascararDocumento(doc: string | null | undefined): string | null {
  const d = (doc ?? "").replace(/[\s.-]/g, "");
  return d.length >= 3 ? `${"•".repeat(Math.max(0, d.length - 3))}${d.slice(-3)}` : null;
}

export interface PersonaEntregar {
  id: string;
  nombre: string;
  documentoFinal: string | null;
  tieneTelefono: boolean;
  ultimoMonto: number | null;
  /** Solo si quien pregunta puede ver adelantos (no al cajero). */
  saldo?: number;
}
export interface PersonasEntregarRespuesta {
  frecuentes: PersonaEntregar[];
  resultados: PersonaEntregar[];
  porCodigo: PersonaEntregar | null;
  /** Se leyó un código pero no hay persona de Adelantos vinculada. */
  codigoSinPersona: boolean;
  restringido: boolean;
  topeCajero: number | null;
  firmaObligatoria: boolean;
  cajaAbierta: boolean;
}

export type ImagenGuardada = { guardada: true; id: string; sha256: string } | { guardada: false; motivo: string };
export interface EntregarRespuesta {
  adelanto: { id: string; codigoOperacion: string | null; monto: number; moneda: string; persona: string; fechaAdelanto: string };
  caja: { movimientoId: string } | { sinCaja: true } | null;
  firma: ImagenGuardada | null;
  huella: ImagenGuardada | null;
  repetido?: true;
}
/** 422 `idempotencia_distinta`: el adelanto que YA quedó con esa clave (misma clave, otros datos). */
export interface ExistenteConClave {
  codigoOperacion: string | null;
  monto: number;
  moneda: string;
  persona: string;
}
export type CodigoErrorEntregar =
  | "sin_permiso_adelantos" | "supera_tope_cajero" | "sin_caja" | "firma_obligatoria" | "falta_consentimiento"
  | "no_es_imagen" | "muy_grande" | "persona_inexistente" | "limite_credito" | "idempotencia_distinta";

export interface FirmaRegistrada {
  id: string;
  tipo: TipoFirma;
  canal: CanalFirma;
  firmanteNombre: string;
  firmanteDocumento: string;
  montoFirmado: number;
  monedaFirmada: string;
  codigoOperacion: string | null;
  pedidoPor: string | null;
  /** ISO. */
  creadoEn: string;
  sha256: string;
  vigente: boolean;
  /** `/api/adelantos/<id>/firmas/<firmaId>/imagen` */
  src: string;
}
export interface RegistroFirmasRespuesta { firmas: FirmaRegistrada[] }

export type EstadoEnlace = "pendiente" | "usado" | "vencido" | "revocado" | "anulado";
export interface EnlaceFirmaAdmin { id: string; estado: EstadoEnlace; pideHuella: boolean; venceEn: string; usadoEn: string | null; creadoPor: string; creadoEn: string }
export interface EnlaceFirmaCreado extends EnlaceFirmaAdmin { url: string; whatsapp: string | null }

export interface VistaPublicaFirma {
  estado: EstadoEnlace;
  negocio: string;
  codigoOperacion: string | null;
  monto: number;
  moneda: string;
  /** «Son: ciento veinte con 00/100 soles». */
  montoEnLetras: string;
  /** Ya escrita en hora de Lima (`fechaHoraLima`). */
  fechaAdelanto: string;
  persona: string;
  documentoFinal: string | null;
  /** La ficha no tiene DNI: la página lo pide y no lo compara. */
  pideDocumento: boolean;
  direccion: "DADO" | "RECIBIDO";
  pideHuella: boolean;
  venceEn: string;
}
export interface FirmarPublicoRespuesta { ok: true; codigoOperacion: string | null; firmadoEn: string }
export type CodigoErrorPublico =
  | "no_encontrado" | "vencido" | "usado" | "revocado" | "anulado"
  | "dni_no_coincide" | "falta_huella" | "falta_consentimiento" | "no_es_imagen" | "muy_grande";
