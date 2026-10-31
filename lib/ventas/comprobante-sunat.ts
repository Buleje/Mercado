/**
 * El número que SUNAT le dio a un comprobante, anotado DESPUÉS de emitirlo en
 * SOL (factura/boleta de una venta del POS, guía de remisión de un despacho
 * del CTP). Puro: lo usan la ruta, la DB class y los tests.
 *
 * Por qué validar la serie contra el tipo: una boleta «F001-12» o una factura
 * «EB01-12» es un número que SUNAT nunca dio, y una vez anotado parece un dato
 * — peor que ninguno. Las series reales: facturas F### (sistema propio) o
 * E### (portal SOL), boletas B### o EB## (SOL), GRE remitente EG## (EG07 desde
 * el portal) y T### / V### de sistemas propios.
 *
 * Sólo factura y boleta van en la venta: la nota de crédito/débito es otro
 * documento (`NotaCredito`, con su `saleId`), y escribirla en la venta pisaría
 * el número de la factura que modifica.
 */
import { z } from "zod";
import { rucChecksumOk } from "@/lib/forestal/directorio";

export const TIPOS_COMPROBANTE_VENTA = ["factura", "boleta"] as const;
export type TipoComprobanteVenta = (typeof TIPOS_COMPROBANTE_VENTA)[number];

const SERIE_DE: Record<TipoComprobanteVenta | "gre", RegExp> = {
  factura: /^(F[A-Z0-9]{3}|E\d{3})$/,
  boleta: /^(B[A-Z0-9]{3}|EB\d{2})$/,
  gre: /^(EG\d{2}|T[A-Z0-9]{3}|V[A-Z0-9]{3})$/,
};

export type NumeroSunat = { serie: string; correlativo: number; canonico: string };

/**
 * «e001 - 00000318» → `{ serie: "E001", correlativo: 318, canonico: "E001-318" }`.
 * `null` si no tiene la forma SERIE-CORRELATIVO (4 caracteres, guion, 1-8 cifras).
 * Se guarda el canónico sin ceros a la izquierda: es como SOL nombra el PDF.
 */
export function leerNumeroSunat(texto: string): NumeroSunat | null {
  const limpio = String(texto ?? "").toUpperCase().replace(/\s+/g, "");
  const m = /^([A-Z0-9]{4})-(\d{1,8})$/.exec(limpio);
  if (!m) return null;
  const correlativo = Number(m[2]);
  if (!Number.isInteger(correlativo) || correlativo <= 0) return null;
  return { serie: m[1], correlativo, canonico: `${m[1]}-${correlativo}` };
}

/** ¿Son el mismo comprobante? «B001-00000005» y «B001-5» sí. */
export function mismoNumeroSunat(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a ? leerNumeroSunat(a) : null;
  const y = b ? leerNumeroSunat(b) : null;
  if (x && y) return x.canonico === y.canonico;
  return String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
}

/**
 * Cómo puede estar escrito el mismo comprobante en la base: el canónico
 * («EB01-12», el que se anota acá) y el de 8 cifras de SUNAT («EB01-00000012»,
 * el que guarda la emisión del POS). Para buscar duplicados con un `IN`.
 */
export function formasDelNumero(numero: string): string[] {
  const n = leerNumeroSunat(numero);
  if (!n) return [String(numero ?? "").trim().toUpperCase()];
  return [n.canonico, `${n.serie}-${String(n.correlativo).padStart(8, "0")}`];
}

/** La serie corresponde al tipo; devuelve el motivo o `null` si está bien. */
export function motivoSerieInvalida(tipo: TipoComprobanteVenta | "gre", numero: string): string | null {
  const n = leerNumeroSunat(numero);
  if (!n) return "El número va como SERIE-CORRELATIVO, por ejemplo E001-318 o EB01-12.";
  if (!SERIE_DE[tipo].test(n.serie)) {
    return tipo === "factura"
      ? `La serie ${n.serie} no es de factura (F001, E001…).`
      : tipo === "boleta"
        ? `La serie ${n.serie} no es de boleta (B001, EB01…).`
        : `La serie ${n.serie} no es de guía de remisión (EG07, T001…).`;
  }
  return null;
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/**
 * Lo que manda quien anota. `quitar` deshace la anotación (la venta vuelve a
 * ticket sin número): es para corregir una anotación equivocada, y deja rastro
 * en el registro de actividad con lo que había.
 */
export const anotarComprobanteSchema = z
  .object({
    tipo: z.enum(TIPOS_COMPROBANTE_VENTA).optional(),
    numero: z.string().trim().max(24).optional(),
    /** RUC (factura, obligatorio) o DNI de 8 (boleta, opcional). */
    ruc: z.string().trim().max(15).nullish(),
    reemplazar: z.boolean().optional(),
    quitar: z.boolean().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.quitar) return;
    if (!d.tipo) {
      ctx.addIssue({ code: "custom", path: ["tipo"], message: "Falta el tipo: factura o boleta." });
      return;
    }
    const motivo = motivoSerieInvalida(d.tipo, d.numero ?? "");
    if (motivo) ctx.addIssue({ code: "custom", path: ["numero"], message: motivo });
    const doc = soloDigitos(d.ruc ?? "");
    if (d.tipo === "factura") {
      if (!/^(10|15|17|20)\d{9}$/.test(doc) || !rucChecksumOk(doc)) {
        ctx.addIssue({ code: "custom", path: ["ruc"], message: "La factura lleva un RUC de 11 dígitos válido (dígito verificador)." });
      }
    } else if (doc && doc.length !== 8 && !(doc.length === 11 && rucChecksumOk(doc))) {
      ctx.addIssue({ code: "custom", path: ["ruc"], message: "En la boleta, el documento es un DNI de 8 dígitos (o un RUC válido)." });
    }
  });

export type AnotarComprobanteInput = z.infer<typeof anotarComprobanteSchema>;

/** Lo que queda guardado en la venta, ya normalizado (o vacío si se quita). */
export type ComprobanteAnotado = { tipo: string; numero: string | null; ruc: string | null };

export function comprobanteAGuardar(d: AnotarComprobanteInput): ComprobanteAnotado {
  if (d.quitar) return { tipo: "ticket", numero: null, ruc: null };
  const doc = soloDigitos(d.ruc ?? "");
  return {
    tipo: d.tipo ?? "ticket",
    numero: leerNumeroSunat(d.numero ?? "")?.canonico ?? null,
    ruc: doc || null,
  };
}
