// Buleje Illustration System v2 — Notion-style monochrome line-art (ADR-065 Ola F)
// Total: 20 ilustraciones (10 empty + 6 success + 4 contextual)

export * from "./empty-states";
export * from "./success-moments";
export * from "./contextual";
export * from "./pucallpa-locals";
export { IllustrationCard } from "./IllustrationCard";

// Re-export agrupados por contexto para autocomplete
export { EMPTY_ILLUSTRATIONS } from "./empty-states";
export { SUCCESS_ILLUSTRATIONS } from "./success-moments";
export { CONTEXTUAL_ILLUSTRATIONS } from "./contextual";

import { EMPTY_ILLUSTRATIONS, type EmptyIllustrationKey } from "./empty-states";
import { SUCCESS_ILLUSTRATIONS, type SuccessIllustrationKey } from "./success-moments";
import { CONTEXTUAL_ILLUSTRATIONS, type ContextualIllustrationKey } from "./contextual";

/** Registro completo unificado — 20 ilustraciones accesibles por key */
export const BULEJE_ILLUSTRATIONS = {
  ...EMPTY_ILLUSTRATIONS,
  ...SUCCESS_ILLUSTRATIONS,
  ...CONTEXTUAL_ILLUSTRATIONS,
} as const;

export type BulejeIllustrationKey =
  | EmptyIllustrationKey
  | SuccessIllustrationKey
  | ContextualIllustrationKey;
