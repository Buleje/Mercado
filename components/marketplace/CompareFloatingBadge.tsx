"use client";

import { GitCompareArrows } from "@buleje/design-system/icons";
import { AnimatePresence, m as motion } from "framer-motion";
import { useCompare } from "@/contexts/compare-context";

/**
 * Badge flotante que aparece cuando hay productos en la lista de comparacion.
 * Posicionado sobre la BottomNav (bottom-20) para no solaparse.
 */
export default function CompareFloatingBadge() {
  const { items, open, setOpen } = useCompare();

  return (
    <AnimatePresence>
      {items.length > 0 && !open && (
        <motion.button
          key="compare-badge"
          initial={{ opacity: 0, scale: 0.8, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 16 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          onClick={() => setOpen(true)}
          aria-label={`${items.length} producto${items.length !== 1 ? "s" : ""} para comparar — abrir comparador`}
          className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-gray-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
        >
          <GitCompareArrows className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{items.length}</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
