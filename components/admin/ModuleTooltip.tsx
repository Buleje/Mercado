"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { m, AnimatePresence } from "@/components/admin/providers";
import type { LucideIcon } from "lucide-react";
import type { ModuleDescription } from "@/lib/module-descriptions";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModuleTooltipProps {
  icon: LucideIcon;
  label: string;
  description: ModuleDescription | undefined;
  anchorRect: DOMRect | null;
  visible: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ModuleTooltip({
  icon: Icon,
  label,
  description,
  anchorRect,
  visible,
}: ModuleTooltipProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !anchorRect || !visible || !description) return null;

  // Position the tooltip to the right of the sidebar item
  const top = anchorRect.top + anchorRect.height / 2;
  const left = anchorRect.right + 12;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <m.div
          key="module-tooltip"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed z-[9999] pointer-events-none"
          style={{
            top,
            left,
            transform: "translateY(-50%)",
          }}
        >
          {/* Arrow pointing left */}
          <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2">
            <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-white dark:border-r-[#1e293b]" />
          </div>

          {/* Tooltip card */}
          <div className="bg-white dark:bg-[#1e293b] rounded-xl shadow-black/10 dark:shadow-black/30 border border-gray-200 dark:border-white/10 px-4 py-3 min-w-[220px] max-w-[280px]">
            {/* Module name with icon */}
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className="h-4 w-4 text-[#00B4A6] dark:text-emerald-400 shrink-0" />
              <span className="text-sm font-bold text-[#00B4A6] dark:text-emerald-400 leading-tight">
                {label}
              </span>
            </div>

            {/* Summary */}
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed mb-1">
              {description.summary}
            </p>

            {/* Example */}
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed italic">
              {description.example}
            </p>
          </div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ─── Wrapper hook for tooltip hover logic ────────────────────────────────────

interface UseModuleTooltipOptions {
  isActive: boolean;
  collapsed: boolean;
  delay?: number;
}

interface UseModuleTooltipReturn {
  tooltipVisible: boolean;
  anchorRect: DOMRect | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  setAnchorRef: (el: HTMLDivElement | null) => void;
}

export function useModuleTooltip({
  isActive,
  collapsed,
  delay = 500,
}: UseModuleTooltipOptions): UseModuleTooltipReturn {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const [timerId, setTimerId] = useState<ReturnType<typeof setTimeout> | null>(
    null
  );

  function show() {
    if (anchorEl) {
      setAnchorRect(anchorEl.getBoundingClientRect());
    }
    setTooltipVisible(true);
  }

  function onMouseEnter() {
    // Don't show tooltip for the active module
    if (isActive) return;

    if (collapsed) {
      // When collapsed, show immediately (no delay) — icon-only mode needs quick context
      if (anchorEl) {
        setAnchorRect(anchorEl.getBoundingClientRect());
      }
      setTooltipVisible(true);
    } else {
      // When expanded, show after delay
      const id = setTimeout(show, delay);
      setTimerId(id);
    }
  }

  function onMouseLeave() {
    if (timerId) {
      clearTimeout(timerId);
      setTimerId(null);
    }
    setTooltipVisible(false);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [timerId]);

  return {
    tooltipVisible,
    anchorRect,
    onMouseEnter,
    onMouseLeave,
    setAnchorRef: setAnchorEl,
  };
}
