"use client";

/**
 * ReorderOneClickButton — Botón "Comprar de nuevo" en lista de pedidos.
 *
 * Cada order card en `/cuenta/pedidos` muestra este botón.
 * Click → abre ReorderModal con los items originales editables.
 *
 * ADR-068: tokens CSS only, 0 emojis.
 */

import { useState } from "react";
import { RefreshCcw } from "@buleje/design-system/icons";
import { PrimaryButton } from "@buleje/design-system";
import { useLocale } from "@/contexts/locale-context";
import ReorderModal, { type ReorderItem } from "./ReorderModal";

interface ReorderOneClickButtonProps {
  originalOrderId: string;
  items: ReorderItem[];
  /** Variante compacta (solo icon) o con texto completo */
  variant?: "compact" | "full";
}

export default function ReorderOneClickButton({
  originalOrderId,
  items,
  variant = "full",
}: ReorderOneClickButtonProps) {
  const { t } = useLocale();
  const [modalOpen, setModalOpen] = useState(false);
  const disabled = items.length === 0;

  return (
    <>
      <PrimaryButton
        size="sm"
        variant={variant === "compact" ? "ghost" : "secondary"}
        leftIcon={<RefreshCcw className="h-3.5 w-3.5" aria-hidden />}
        onClick={() => setModalOpen(true)}
        disabled={disabled}
        aria-label={t("reorder.cta")}
      >
        {t("reorder.cta")}
      </PrimaryButton>

      <ReorderModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        originalOrderId={originalOrderId}
        originalItems={items}
      />
    </>
  );
}
