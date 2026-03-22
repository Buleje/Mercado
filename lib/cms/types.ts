// ═══════════════════════════════════════════════════════
// CMS CORE TYPES
// ═══════════════════════════════════════════════════════

import { z } from "zod";

// ─── Page Types ─────────────────────────────────────────
export type PageStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export const PageSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
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
export const BlockSchema = z.object({
  type: z.string().min(1),
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
