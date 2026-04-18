/**
 * @buleje/design-system — Componentes shared del design system (ADR-069, ADR-075).
 *
 * Source-of-truth de UI primitives. Consumidores:
 *   - admin (components/admin/**)
 *   - store (components/store/**)
 *   - customer journey (components/customer/**)
 *   - tenant landings (app/t/**)
 *
 * Fase 3 (actual): package autocontenido — cn(), tokens, hooks viven aca.
 * Dependencias directas: clsx, tailwind-merge, @radix-ui/react-slot, react, lucide-react.
 */

// ── Legacy / existing primitives ────────────────────────────────────────────
export { PrimaryButton } from "./PrimaryButton";
export { IconBadge } from "./IconBadge";
export { Text } from "./Text";
export { Chip } from "./Chip";

// ── Canonical typography (ADR-075) ──────────────────────────────────────────
export {
  PageTitle,
  SectionTitle,
  CardTitle,
  BodyText,
  Caption,
  Label,
  Kicker,
  type TypographyProps,
} from "./typography";

// ── Canonical layout (ADR-075) ──────────────────────────────────────────────
export {
  AdminPage,
  AdminSection,
  AdminGrid,
  AdminCenter,
  type AdminPageProps,
  type AdminSectionProps,
  type AdminGridProps,
  type AdminGridCols,
  type AdminCenterProps,
} from "./layout";

// ── Canonical feedback (ADR-075) ────────────────────────────────────────────
export {
  InfoAlert,
  WarningAlert,
  ErrorAlert,
  SuccessAlert,
  EmptyState,
  LoadingState,
  type AlertProps,
  type AlertVariant,
  type EmptyStateProps,
  type LoadingStateProps,
} from "./feedback";

// ── Canonical data-display (ADR-075) ────────────────────────────────────────
export {
  StatCard,
  ChartWrapper,
  DataTable,
  BadgeStatus,
  useChartTokens,
  type StatCardProps,
  type StatCardEmphasis,
  type StatCardTrend,
  type StatCardDensity,
  type StatCardSparkline,
  type ChartWrapperProps,
  type DataTableProps,
  type BadgeStatusProps,
  type BadgeStatusVariant,
} from "./data-display";

// ── Canonical store primitives (ADR-075 Ola 2) ──────────────────────────────
export {
  ProductBadge,
  ProductPrice,
  type ProductBadgeIntent,
  type ProductBadgeProps,
  type ProductPriceProps,
} from "./store";

// ── Helpers ─────────────────────────────────────────────────────────────────
export { undoToast } from "./undoToast";
export { cn } from "./utils";

// ── Tokens (colors, typography, space, radius, elevation, shadow, motion) ───
export * from "./tokens";

// ── Hooks ───────────────────────────────────────────────────────────────────
export { useScrollLock } from "./hooks/use-scroll-lock";
export { useInView } from "./hooks/use-in-view";
export { useSwipe } from "./hooks/use-swipe";

// NOTE: icons.ts NO se re-exporta aquí para evitar bundlear todos los iconos
// vía el barrel. Consumidores deben importar: `@buleje/design-system/icons`.
