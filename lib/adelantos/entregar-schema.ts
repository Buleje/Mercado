/** ADR-491 (Zod 4): los esquemas que comparten la ruta `entregar`, la ficha y la página pública de firma; `safeParse` en los dos lados. */
import { z } from "zod";
import { validarFirmante } from "@/lib/adelantos/recibo-firmado";
import { HORAS_ENLACE_MAX, HORAS_ENLACE_POR_DEFECTO, MAX_PUNTOS_TRAZOS, METODOS_ENTREGA, VERSION_CONSENTIMIENTO_HUELLA } from "./entregar-tipos";

export const FirmanteSchema = z
  .object({ nombre: z.string().trim().min(3).max(120), documento: z.string().trim().max(20) })
  .strict()
  .superRefine((f, ctx) => {
    const p = validarFirmante(f);
    if (p) ctx.addIssue({ code: "custom", message: p, path: ["documento"] });
  });
const Punto = z.object({ x: z.number().min(-0.05).max(1.05), y: z.number().min(-0.05).max(0.55) });
export const TrazosSchema = z
  .array(z.array(Punto).max(2000))
  .max(200)
  .refine((t) => t.reduce((n, s) => n + s.length, 0) <= MAX_PUNTOS_TRAZOS, "La firma es demasiado larga.");
const Consentimiento = z.literal(VERSION_CONSENTIMIENTO_HUELLA);
const Clave = z.string().trim().min(8).max(100);

export const EntregarDatosSchema = z
  .object({
    beneficiarioId: z.string().min(1).max(40),
    /* Un céntimo como mínimo: `positive()` dejaba pasar 0,001, que se redondea a S/ 0,00. */
    monto: z.number().min(0.01).max(9_999_999_999),
    moneda: z.enum(["PEN", "USD"]).optional(),
    /** null = no mover la caja (solo quien gestiona adelantos; el cajero manda uno). */
    metodoCaja: z.enum(METODOS_ENTREGA).nullable(),
    notas: z.string().trim().max(300).optional(),
    firmante: FirmanteSchema.optional(),
    consentimientoHuella: Consentimiento.optional(),
    trazos: TrazosSchema.optional(),
    idempotencyKey: Clave,
  })
  .strict();
export type EntregarDatos = z.infer<typeof EntregarDatosSchema>;

export const FirmarDatosSchema = z
  .object({ firmante: FirmanteSchema, consentimientoHuella: Consentimiento.optional(), trazos: TrazosSchema.optional(), idempotencyKey: Clave, entregaKey: Clave.optional() })
  .strict();
export const FirmarPublicoDatosSchema = z
  .object({ firmante: FirmanteSchema, consentimientoHuella: Consentimiento.optional(), trazos: TrazosSchema.optional() })
  .strict();
export const EnlaceFirmaSchema = z
  .object({ pideHuella: z.boolean().optional(), horas: z.number().int().min(1).max(HORAS_ENLACE_MAX).optional() })
  .strict()
  .transform((d) => ({ pideHuella: d.pideHuella ?? false, horas: d.horas ?? HORAS_ENLACE_POR_DEFECTO }));
export const PersonasEntregarQuery = z.object({ q: z.string().trim().max(60).optional(), codigo: z.string().trim().max(500).optional() });
