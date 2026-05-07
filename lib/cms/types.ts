// ═══════════════════════════════════════════════════════
// CMS CORE TYPES
// ═══════════════════════════════════════════════════════

import { z } from "zod";

// ─── Page Types ─────────────────────────────────────────
export type PageStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

// SECURITY 2026-05-06 (audit CMS #7): slugs reservados que NO pueden ser
// usados como páginas CMS porque colisionan con rutas reales del sistema.
// Sin esta protección, un admin malicioso podía crear /cms/login, /cms/admin
// o /cms/checkout y secuestrar el routing.
const CMS_RESERVED_SLUGS = new Set<string>([
  "login",
  "logout",
  "signup",
  "setup",
  "admin",
  "superadmin",
  "api",
  "checkout",
  "cuenta",
  "carrito",
  "tracking",
  "delivery",
  "delivery-app",
  "supplier",
  "marketplace",
  "tienda",
  "panel",
  "cms",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "manifest.json",
]);

export const PageSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones")
    .refine(
      (s) => !CMS_RESERVED_SLUGS.has(s),
      { message: "Slug reservado — colisiona con una ruta del sistema" },
    ),
  title: z.string().min(1, "Título requerido"),
  description: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  ogImage: z.string().url().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  layout: z.string().default("default"),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export type PageInput = z.infer<typeof PageSchema>;

// ─── Block Types ────────────────────────────────────────
// SECURITY 2026-05-06 (audit CMS #12): whitelist de tipos de bloque.
// Antes `z.string().min(1)` permitía cualquier nombre — un admin malicioso
// podía guardar `type="RemoteScript"` o tipo arbitrario que el frontend
// fallback intentara renderear con código no validado.
// SECURITY 2026-05-06 (audit CMS #10): tipo "html" REMOVIDO. Antes permitía
// que un admin malicioso guardara HTML crudo (script tags, event handlers)
// que se renderizara via `dangerouslySetInnerHTML` en algún caller futuro
// → XSS stored para todos los visitantes de la página.
export const VALID_BLOCK_TYPES = [
  "hero",
  "products",
  "benefits",
  "about",
  "contact",
  "faq",
  "cta",
  "image",
  "spacer",
  "divider",
  "video",
  "testimonials",
  "gallery",
  "stats",
  "form",
] as const;
export type BlockType = (typeof VALID_BLOCK_TYPES)[number];

export const BlockSchema = z.object({
  type: z
    .string()
    .min(1)
    .refine(
      (t) => (VALID_BLOCK_TYPES as readonly string[]).includes(t.toLowerCase()),
      { message: "Tipo de bloque no permitido" },
    )
    .transform((t) => t.toLowerCase()),
  order: z.number().int().min(0),
  visible: z.boolean().default(true),
  props: z.record(z.string(), z.unknown()),
  styles: z.record(z.string(), z.unknown()).optional(),
  mobileProps: z.record(z.string(), z.unknown()).optional(),
});

export type BlockInput = z.infer<typeof BlockSchema>;

// ─── Block Registry Types ───────────────────────────────
export interface BlockDefinition {
  type: string;
  name: string;
  description: string;
  category: BlockCategory;
  icon: string;
  previewImage?: string;
  defaultProps: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod schema generic requires any
  propsSchema: z.ZodObject<any>;
}

export type BlockCategory = 
  | "landing"      // Hero, CTA, Features
  | "informativo"  // About, Contact, FAQ
  | "marketing"    // Promos, Counters, Flash deals
  | "producto"     // Products, Catalog, Reviews
  | "layout";      // Header, Footer, Divider

// ─── Media Types ────────────────────────────────────────
export const MediaSchema = z.object({
  filename: z.string().min(1),
  url: z.string().url(),
  mimeType: z.string(),
  size: z.number().int().positive(),
  alt: z.string().optional(),
  title: z.string().optional(),
  caption: z.string().optional(),
  folder: z.string().default("general"),
  tags: z.array(z.string()).default([]),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  blurhash: z.string().optional(),
});

export type MediaInput = z.infer<typeof MediaSchema>;

// ─── Theme Types ────────────────────────────────────────
export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  muted: string;
}

export interface ThemeFonts {
  heading: string;
  body: string;
}

export interface ThemeSpacing {
  section: string;
  container: string;
}

export const ThemeSchema = z.object({
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string(),
    text: z.string(),
    muted: z.string(),
  }),
  fonts: z.object({
    heading: z.string(),
    body: z.string(),
  }),
  spacing: z.object({
    section: z.string(),
    container: z.string(),
  }).optional(),
  header: z.record(z.string(), z.unknown()).optional(),
  footer: z.record(z.string(), z.unknown()).optional(),
  animations: z.record(z.string(), z.unknown()).optional(),
});

export type ThemeInput = z.infer<typeof ThemeSchema>;

// ─── Navigation Types ───────────────────────────────────
export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  children?: NavItem[];
}

export const NavigationSchema = z.object({
  items: z.array(z.object({
    label: z.string(),
    href: z.string(),
    icon: z.string().optional(),
    children: z.array(z.lazy(() => z.any())).optional(),
  })),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export type NavigationInput = z.infer<typeof NavigationSchema>;
