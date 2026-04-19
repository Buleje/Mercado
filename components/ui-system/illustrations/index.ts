// Buleje Illustration System v3 — Notion-style monochrome line-art (ADR-065 Ola F + ENRICH-4)
// Total: 33 ilustraciones (10 empty + 6 success + 4 contextual + 5 categorias + 8 feature-identity)

export * from "./empty-states";
export * from "./success-moments";
export * from "./contextual";
export * from "./categories";
export * from "./pucallpa-locals";
export * from "./feature-identity";
export { IllustrationCard } from "./IllustrationCard";
export { BulejeLogo, BulejeMark, BulejeWordmark } from "./BulejeLogo";
// Mascota amazónica — paiche line-art extraído de pucallpa-locals
export { PaicheMascot } from "./PaicheMascot";

// Re-export agrupados por contexto para autocomplete
export { EMPTY_ILLUSTRATIONS } from "./empty-states";
export { SUCCESS_ILLUSTRATIONS } from "./success-moments";
export { CONTEXTUAL_ILLUSTRATIONS } from "./contextual";
export { CATEGORY_ILLUSTRATIONS } from "./categories";
export { FEATURE_IDENTITY_ILLUSTRATIONS } from "./feature-identity";

import { EMPTY_ILLUSTRATIONS, type EmptyIllustrationKey } from "./empty-states";
import { SUCCESS_ILLUSTRATIONS, type SuccessIllustrationKey } from "./success-moments";
import { CONTEXTUAL_ILLUSTRATIONS, type ContextualIllustrationKey } from "./contextual";
import { CATEGORY_ILLUSTRATIONS, type CategoryIllustrationKey } from "./categories";
import { FEATURE_IDENTITY_ILLUSTRATIONS, type FeatureIdentityIllustrationKey } from "./feature-identity";

/** Registro completo unificado — 33 ilustraciones accesibles por key */
export const BULEJE_ILLUSTRATIONS = {
  ...EMPTY_ILLUSTRATIONS,
  ...SUCCESS_ILLUSTRATIONS,
  ...CONTEXTUAL_ILLUSTRATIONS,
  ...CATEGORY_ILLUSTRATIONS,
  ...FEATURE_IDENTITY_ILLUSTRATIONS,
} as const;

export type BulejeIllustrationKey =
  | EmptyIllustrationKey
  | SuccessIllustrationKey
  | ContextualIllustrationKey
  | CategoryIllustrationKey
  | FeatureIdentityIllustrationKey;
