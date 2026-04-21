// Buleje Editorial Design System v4 — Primitive exports
export { Button, type ButtonProps } from "./Button";
export { Card, CardHeader, CardBody, CardFooter } from "./Card";
export { Chip } from "./Chip";
export { Eyebrow } from "./Eyebrow";
export { Kicker } from "./Kicker";
export { SectionHeader } from "./SectionHeader";
export { RuledTitle } from "./RuledTitle";
export { NumberStat } from "./NumberStat";
export { Stat } from "./Stat";
export { EmptyState } from "./EmptyState";
export {
  SkeletonEditorial,
  SkeletonProductCard,
  SkeletonKPICard,
  SkeletonTableRow,
  SkeletonList,
} from "./SkeletonEditorial";
export { IconBadge } from "./IconBadge";
export { StatusDot } from "./StatusDot";
export { DataRow } from "./DataRow";
export { Divider } from "./Divider";

// ENRICH-1 — Cross-link + navegación
export { default as Breadcrumbs, type BreadcrumbItem, type BreadcrumbsProps } from "./Breadcrumbs";
export { default as RelatedFeatures } from "./RelatedFeatures";
export { SkipLink } from "./SkipLink";

// Brand icons — v4 (20 custom SVG)
export {
  Icon,
  BULEJE_ICONS,
  // v1
  BulejeMark,
  JungleLeaf,
  DeliveryMoto,
  RecipePot,
  CoinStack,
  TrendLine,
  DocumentContract,
  RiverCurve,
  // v4
  Canasta,
  Olla,
  Pesa,
  BolsaDelivery,
  RecetarioOpen,
  CuadernoFiado,
  HuellaCliente,
  MapaUcayali,
  BilleteSoles,
  TanqueGas,
  NodosRed,
  CursoGrafico,
} from "./BulejeIcons";

// Motion presets v4
export {
  EASE,
  DURATION,
  // Variants basicos
  fadeUp,
  fadeUpLarge,
  fadeIn,
  slideInRight,
  slideInLeft,
  scaleIn,
  // Containers
  staggerContainer,
  staggerContainerSlow,
  staggerChild,
  listStagger,
  // Overlays
  modalVariants,
  popoverVariants,
  drawerVariants,
  pageEnter,
  // Behaviors
  tapPress,
  hoverSoft,
  hoverLift,
  numberBeat,
  // Viewport helpers
  revealOnView,
  revealStaggered,
  scrollRevealPresets,
} from "./motion";
