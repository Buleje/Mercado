"use client";

/**
 * LiveSignupTicker — chip flotante con counter "X negocios se registraron"
 * que va subiendo cada pocos segundos para crear FOMO.
 */

import { useEffect, useState } from "react";
import { m } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { TrendingUp } from "@buleje/design-system/icons";

export default function LiveSignupTicker({ start = 247 }: { start?: number }) {
  const [count, setCount] = useState(start);

  useEffect(() => {
    const id = setInterval(
      () => setCount((c) => c + 1),
      4000 + Math.random() * 4000
    );
    return () => clearInterval(id);
  }, []);

  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className="inline-flex items-center gap-2.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] pl-2 pr-4 py-1.5 shadow-sm"
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]">
        <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500)] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--data-success-500)]" />
      </span>
      <span className="text-sm font-bold text-[var(--text-secondary)]">
        <span className="font-black tabular-nums text-[var(--text-primary)]">
          <NumberFlow value={count} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
        </span>{" "}
        negocios activos esta semana
      </span>
    </m.div>
  );
}
