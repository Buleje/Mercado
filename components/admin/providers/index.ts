/**
 * components/admin/providers/index.ts
 *
 * Barrel del sistema de providers del panel de administración.
 *
 * Exporta:
 *   - AdminMotionProvider — LazyMotion boundary para el admin layout
 *   - m, AnimatePresence — re-exports de framer-motion para usar dentro del boundary
 *
 * Uso en componentes admin:
 *   import { m, AnimatePresence } from "@/components/admin/providers";
 *   // En lugar de: import { motion } from "framer-motion"
 *
 *   // Reemplazar motion.div por m.div:
 *   <m.div animate={{ opacity: 1 }} />
 */

export { default as AdminMotionProvider } from "./AdminMotionProvider";

// Re-exports de framer-motion para componentes que corren dentro del LazyMotion boundary.
// `m` es el equivalente tree-shakeable de `motion` — requiere un <LazyMotion> boundary activo.
export { m, AnimatePresence } from "framer-motion";
