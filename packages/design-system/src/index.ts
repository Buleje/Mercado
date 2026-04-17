/**
 * @buleje/design-system — Componentes shared del design system (ADR-069).
 *
 * Source-of-truth de UI primitives. Consumidores:
 *   - admin (components/admin/**)
 *   - store (components/store/**)
 *   - customer journey (components/customer/**)
 *   - tenant landings (app/t/**)
 *
 * Fase 3 (actual): package autocontenido — cn(), tokens, hooks viven aca.
 * Dependencias directas: clsx, tailwind-merge, @radix-ui/react-slot, react.
 */

// Componentes
export { PrimaryButton } from "./PrimaryButton";
export { IconBadge } from "./IconBadge";
export { Text } from "./Text";
export { Chip } from "./Chip";

// Helpers
export { undoToast } from "./undoToast";
export { cn } from "./utils";

// Tokens (colors, typography, space, radius, elevation, shadow, motion)
export * from "./tokens";

// Hooks
export { useScrollLock } from "./hooks/use-scroll-lock";
export { useInView } from "./hooks/use-in-view";
