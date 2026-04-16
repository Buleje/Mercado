/**
 * lib/recipe-gradients.ts
 *
 * Shared gradient palette for recipe category headers.
 * Used by RecipeOfTheWeek, RecetaDetalleClient, and RecetarioClient.
 */

export const CATEGORIA_GRADIENTS: Record<string, { from: string; to: string }> = {
  "Entradas": { from: "#60a5fa", to: "#06b6d4" },
  "Platos de fondo": { from: "#f97316", to: "#ef4444" },
  "Postres": { from: "#f472b6", to: "#a855f7" },
  "Bebidas": { from: "#facc15", to: "#f59e0b" },
  "Sopas": { from: "#4ade80", to: "#2dd4bf" },
};

export const DEFAULT_GRADIENT = { from: "var(--color-primary)", to: "var(--color-primary-dark)" };
