import { z } from "zod";

// Slugs reservados que no pueden usarse como subdomain de tenant
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "superadmin",
  "app",
  "www",
  "mail",
  "support",
  "help",
  "billing",
  "dashboard",
  "platform",
  "static",
  "assets",
  "cdn",
]);

export const SignupSchema = z.object({
  /** Nombre de la tienda: "Buleje" */
  name: z
    .string()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(60, "El nombre no puede superar 60 caracteres")
    .trim(),

  /** Email del dueño */
  email: z.string().email("Email inválido").toLowerCase().trim(),

  /** Contraseña: mínimo 10 chars, al menos 1 mayúscula, 1 número, 1 caracter especial */
  password: z
    .string()
    .min(10, "La contraseña debe tener al menos 10 caracteres")
    .regex(/[A-Z]/, "La contraseña debe contener al menos una mayúscula")
    .regex(/[0-9]/, "La contraseña debe contener al menos un número")
    .regex(
      /[^A-Za-z0-9]/,
      "La contraseña debe contener al menos un carácter especial",
    ),

  /** Slug del subdominio: solo letras minúsculas, números y guiones */
  slug: z
    .string()
    .regex(
      /^[a-z0-9-]{3,32}$/,
      "El slug solo puede contener letras minúsculas, números y guiones (3-32 caracteres)",
    )
    .refine(
      (s) => !RESERVED_SLUGS.has(s),
      "Este slug está reservado. Elige otro nombre.",
    )
    .refine(
      (s) => !s.startsWith("-") && !s.endsWith("-"),
      "El slug no puede empezar ni terminar con guión",
    ),

  /** Nombre del dueño para el AdminUser */
  ownerName: z
    .string()
    .min(2, "El nombre del dueño debe tener al menos 2 caracteres")
    .max(80, "El nombre no puede superar 80 caracteres")
    .trim(),

  /** Teléfono opcional */
  phone: z
    .string()
    .regex(/^\+?[0-9\s\-()]{7,20}$/, "Teléfono inválido")
    .optional()
    .or(z.literal("")),
});

export type SignupInput = z.infer<typeof SignupSchema>;

/** Schema reducido para el check de slug disponible */
export const CheckSlugSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,32}$/),
});
