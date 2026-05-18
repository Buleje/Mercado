/**
 * Categorías de gastos recurrentes con ícono Lucide y color visual.
 * - Defaults: lista predefinida (no se persisten).
 * - Custom: creadas por el usuario via modal, persisten en localStorage por tenant.
 *
 * Audit 2026-05-17 — Brandon: pidió poder crear categorías personalizadas.
 * NOTA: Usamos nombres de íconos Lucide (string slug), no emojis (regla UI del proyecto).
 */

export type ExpenseCategoryDef = {
  name: string;
  iconKey: string; // slug del ícono Lucide (se resuelve via getCategoryIcon)
  color: string;   // token visual mapeado a clase Tailwind (CATEGORY_COLOR_CLASSES)
  isCustom?: boolean;
};

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryDef[] = [
  { name: "Alquiler",      iconKey: "home",         color: "violet"  },
  { name: "Servicios",     iconKey: "zap",          color: "amber"   },
  { name: "Personal",      iconKey: "users",        color: "blue"    },
  { name: "Transporte",    iconKey: "truck",        color: "orange"  },
  { name: "Limpieza",      iconKey: "sparkles",     color: "emerald" },
  { name: "Marketing",     iconKey: "megaphone",    color: "pink"    },
  { name: "Mantenimiento", iconKey: "wrench",       color: "slate"   },
  { name: "Impuestos",     iconKey: "file-text",    color: "red"     },
  { name: "Otros",         iconKey: "package",      color: "gray"    },
];

const STORAGE_KEY = (tenantSlug: string) => `expense-categories-${tenantSlug}`;

export function getCustomCategories(tenantSlug: string): ExpenseCategoryDef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExpenseCategoryDef[];
    return Array.isArray(parsed) ? parsed.map((c) => ({ ...c, isCustom: true })) : [];
  } catch {
    return [];
  }
}

export function saveCustomCategory(tenantSlug: string, cat: ExpenseCategoryDef): ExpenseCategoryDef[] {
  if (typeof window === "undefined") return [];
  try {
    const existing = getCustomCategories(tenantSlug);
    const next = [...existing.filter((c) => c.name !== cat.name), { ...cat, isCustom: true }];
    localStorage.setItem(STORAGE_KEY(tenantSlug), JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function removeCustomCategory(tenantSlug: string, name: string): ExpenseCategoryDef[] {
  if (typeof window === "undefined") return [];
  try {
    const existing = getCustomCategories(tenantSlug);
    const next = existing.filter((c) => c.name !== name);
    localStorage.setItem(STORAGE_KEY(tenantSlug), JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function getAllCategories(tenantSlug: string): ExpenseCategoryDef[] {
  return [...DEFAULT_EXPENSE_CATEGORIES, ...getCustomCategories(tenantSlug)];
}

export function findCategory(name: string, tenantSlug: string): ExpenseCategoryDef {
  const all = getAllCategories(tenantSlug);
  return (
    all.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
    { name, iconKey: "package", color: "gray" }
  );
}

/**
 * Mapa color → clases Tailwind para tints visibles en cards/badges.
 */
export const CATEGORY_COLOR_CLASSES: Record<string, { bg: string; text: string; border: string; ring: string; iconBg: string }> = {
  violet:  { bg: "bg-violet-50 dark:bg-violet-500/10",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-200 dark:border-violet-500/30",   ring: "ring-violet-400/40",   iconBg: "bg-violet-100 dark:bg-violet-500/20"   },
  amber:   { bg: "bg-amber-50 dark:bg-amber-500/10",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-200 dark:border-amber-500/30",     ring: "ring-amber-400/40",    iconBg: "bg-amber-100 dark:bg-amber-500/20"     },
  blue:    { bg: "bg-blue-50 dark:bg-blue-500/10",       text: "text-blue-700 dark:text-blue-300",       border: "border-blue-200 dark:border-blue-500/30",       ring: "ring-blue-400/40",     iconBg: "bg-blue-100 dark:bg-blue-500/20"       },
  orange:  { bg: "bg-orange-50 dark:bg-orange-500/10",   text: "text-orange-700 dark:text-orange-300",   border: "border-orange-200 dark:border-orange-500/30",   ring: "ring-orange-400/40",   iconBg: "bg-orange-100 dark:bg-orange-500/20"   },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-500/30", ring: "ring-emerald-400/40",  iconBg: "bg-emerald-100 dark:bg-emerald-500/20" },
  pink:    { bg: "bg-pink-50 dark:bg-pink-500/10",       text: "text-pink-700 dark:text-pink-300",       border: "border-pink-200 dark:border-pink-500/30",       ring: "ring-pink-400/40",     iconBg: "bg-pink-100 dark:bg-pink-500/20"       },
  slate:   { bg: "bg-slate-100 dark:bg-slate-500/10",    text: "text-slate-700 dark:text-slate-300",     border: "border-slate-200 dark:border-slate-500/30",     ring: "ring-slate-400/40",    iconBg: "bg-slate-200 dark:bg-slate-500/20"     },
  red:     { bg: "bg-red-50 dark:bg-red-500/10",         text: "text-red-700 dark:text-red-300",         border: "border-red-200 dark:border-red-500/30",         ring: "ring-red-400/40",      iconBg: "bg-red-100 dark:bg-red-500/20"         },
  gray:    { bg: "bg-gray-100 dark:bg-gray-500/10",      text: "text-gray-700 dark:text-gray-300",       border: "border-gray-200 dark:border-gray-500/30",       ring: "ring-gray-400/40",     iconBg: "bg-gray-200 dark:bg-gray-500/20"       },
  teal:    { bg: "bg-teal-50 dark:bg-teal-500/10",       text: "text-teal-700 dark:text-teal-300",       border: "border-teal-200 dark:border-teal-500/30",       ring: "ring-teal-400/40",     iconBg: "bg-teal-100 dark:bg-teal-500/20"       },
};

export const AVAILABLE_COLORS = Object.keys(CATEGORY_COLOR_CLASSES);

// Lista de íconos Lucide disponibles para categorías custom.
export const AVAILABLE_ICON_KEYS = [
  "home", "zap", "users", "truck", "sparkles", "megaphone", "wrench",
  "file-text", "package", "wallet", "utensils", "smartphone",
  "shopping-cart", "bar-chart-3", "target", "scissors", "plug",
  "laptop", "fuel", "wifi", "phone", "mail", "calendar", "clock",
];
