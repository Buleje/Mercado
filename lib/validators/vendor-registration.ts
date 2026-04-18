/**
 * lib/validators/vendor-registration.ts — Zod schemas para el wizard /vender/registro.
 *
 * Separado por paso para validar en cada step (step nav bloquea "Siguiente" si hay error).
 * Total en `vendorRegistrationSchema` agrupa los 5 pasos para el submit final.
 *
 * Regla repo: SIEMPRE `safeParse()`, nunca `.parse()`. Ver CLAUDE.md regla #2.
 */

import { z } from "zod";

// ── Step 1: Datos del negocio ───────────────────────────────────────────────
export const CATEGORIAS_VENDOR = [
  "Bodega",
  "Minimarket",
  "Frutería",
  "Panadería",
  "Licorería",
  "Farmacia",
  "Carnicería",
  "Bazar",
  "Otro",
] as const;
export type CategoriaVendor = (typeof CATEGORIAS_VENDOR)[number];

export const DISTRITOS_PUCALLPA = [
  "Callería",
  "Yarinacocha",
  "Manantay",
  "Campo Verde",
  "Nueva Requena",
  "Iparia",
  "Masisea",
  "Otro",
] as const;
export type DistritoPucallpa = (typeof DISTRITOS_PUCALLPA)[number];

export const datosNegocioSchema = z.object({
  nombreNegocio: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(80, "Máximo 80 caracteres"),
  ruc: z
    .string()
    .regex(/^\d{11}$/, "RUC debe ser 11 dígitos numéricos"),
  direccion: z
    .string()
    .trim()
    .min(8, "Dirección muy corta")
    .max(200, "Máximo 200 caracteres"),
  distrito: z.enum(DISTRITOS_PUCALLPA, {
    message: "Seleccioná un distrito",
  }),
  categoria: z.enum(CATEGORIAS_VENDOR, {
    message: "Seleccioná una categoría",
  }),
});
export type DatosNegocioForm = z.infer<typeof datosNegocioSchema>;

// ── Step 2: Contacto ────────────────────────────────────────────────────────
export const contactoSchema = z.object({
  whatsapp: z
    .string()
    .regex(/^9\d{8}$/, "WhatsApp debe ser 9 dígitos empezando con 9"),
  email: z.string().email("Email inválido").max(200),
  responsableNombre: z
    .string()
    .trim()
    .min(3, "Nombre muy corto")
    .max(120, "Máximo 120 caracteres"),
  responsableDni: z
    .string()
    .regex(/^\d{8}$/, "DNI debe ser 8 dígitos numéricos"),
});
export type ContactoForm = z.infer<typeof contactoSchema>;

// ── Step 3: Verificación ────────────────────────────────────────────────────
export const verificacionSchema = z.object({
  // Mock: sólo flags que el usuario "subió" las fotos.
  fotoRucSubida: z.boolean().refine((v) => v === true, {
    message: "Subí la foto de tu RUC",
  }),
  fotoFachadaSubida: z.boolean().refine((v) => v === true, {
    message: "Subí la foto de tu fachada",
  }),
  aceptoTerminos: z.boolean().refine((v) => v === true, {
    message: "Aceptá los términos para continuar",
  }),
});
export type VerificacionForm = z.infer<typeof verificacionSchema>;

// ── Step 4: Horarios y delivery ─────────────────────────────────────────────
export const DIAS_SEMANA = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

const horarioDiaSchema = z.object({
  dia: z.enum(DIAS_SEMANA),
  abierto: z.boolean(),
  abre: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM"),
  cierra: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM"),
});

export const horariosDeliverySchema = z.object({
  horarios: z
    .array(horarioDiaSchema)
    .length(7, "Se requieren los 7 días de la semana"),
  zonasEntrega: z
    .array(z.enum(DISTRITOS_PUCALLPA))
    .min(1, "Seleccioná al menos una zona de delivery"),
  tarifaDelivery: z
    .number({ message: "Ingresá la tarifa en soles" })
    .min(0, "La tarifa no puede ser negativa")
    .max(30, "Tarifa máxima S/ 30"),
});
export type HorariosDeliveryForm = z.infer<typeof horariosDeliverySchema>;

// ── Step 5: Plan ────────────────────────────────────────────────────────────
export const PLANES_VENDOR = ["gratis", "pro"] as const;
export type PlanVendor = (typeof PLANES_VENDOR)[number];

export const planSchema = z.object({
  plan: z.enum(PLANES_VENDOR, {
    message: "Elegí un plan",
  }),
});
export type PlanForm = z.infer<typeof planSchema>;

// ── Total: schema agregado para submit final ────────────────────────────────
export const vendorRegistrationSchema = z.object({
  datosNegocio: datosNegocioSchema,
  contacto: contactoSchema,
  verificacion: verificacionSchema,
  horariosDelivery: horariosDeliverySchema,
  plan: planSchema,
});
export type VendorRegistrationPayload = z.infer<typeof vendorRegistrationSchema>;

/**
 * Default state fabric — útil para inicializar el wizard con horarios de 7 días
 * pre-cargados (abierto L-S 7am-9pm, domingo cerrado) y otros campos vacíos.
 */
export function defaultRegistrationState(): {
  datosNegocio: Partial<DatosNegocioForm>;
  contacto: Partial<ContactoForm>;
  verificacion: VerificacionForm;
  horariosDelivery: HorariosDeliveryForm;
  plan: PlanForm;
} {
  const horarios = DIAS_SEMANA.map<z.infer<typeof horarioDiaSchema>>((dia) => ({
    dia,
    abierto: dia !== "Domingo",
    abre: "07:00",
    cierra: "21:00",
  }));
  return {
    datosNegocio: {},
    contacto: {},
    verificacion: {
      fotoRucSubida: false,
      fotoFachadaSubida: false,
      aceptoTerminos: false,
    },
    horariosDelivery: {
      horarios,
      zonasEntrega: ["Callería"],
      tarifaDelivery: 5,
    },
    plan: { plan: "gratis" },
  };
}
