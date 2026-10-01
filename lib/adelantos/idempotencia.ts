/**
 * La huella de un intento de escritura en Adelantos (ADR-448, revisión).
 *
 * Una `idempotencyKey` repetida con el MISMO cuerpo es un reintento (doble clic,
 * corte de red): se devuelve lo ya guardado. Con OTRO cuerpo es otro acto con la
 * clave repetida — devolver el primero con 200 hacía creer que se guardó lo que
 * se mandó (422 `idempotencia_distinta`).
 *
 * La huella lleva sólo lo que cambia la PLATA: quién, cuánto, en qué moneda, de
 * qué lado, por qué concepto y si movió la caja (y por qué vía). Un texto
 * distinto en las notas o la descripción no la cambia: el reintento del mismo
 * formulario puede traer un espacio de más y sigue siendo el mismo acto.
 *
 * Texto canónico, no hash: se lee en la base cuando alguien pregunta por qué un
 * reintento dio 422. PURO: sin Prisma.
 */

const monto = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "" : (Math.round(n * 100) / 100).toFixed(2));
const texto = (v: string | number | boolean | null | undefined) => (v == null ? "" : String(v));

/** La huella del alta de un adelanto. */
export function huellaDeAlta(a: {
  beneficiarioId: string;
  montoAdelantado: number;
  moneda?: string | null;
  direccion: string;
  conceptoRecibido?: string | null;
  metodoCaja?: string | null;
}): string {
  return [
    "alta",
    a.beneficiarioId,
    monto(a.montoAdelantado),
    a.moneda || "PEN",
    a.direccion,
    texto(a.conceptoRecibido),
    texto(a.metodoCaja),
  ].join("|");
}

/** La huella de una entrega a un adelanto. */
export function huellaDeEntrega(e: {
  tipo: string;
  valorManual?: number | null;
  productId?: number | null;
  cantidad?: number | null;
  sumarAStock?: boolean | null;
  pactadaId?: string | null;
  metodoCaja?: string | null;
}): string {
  return [
    "entrega",
    e.tipo,
    monto(e.valorManual),
    texto(e.productId),
    e.cantidad == null ? "" : String(e.cantidad),
    e.sumarAStock ? "stock" : "",
    texto(e.pactadaId),
    texto(e.metodoCaja),
  ].join("|");
}
