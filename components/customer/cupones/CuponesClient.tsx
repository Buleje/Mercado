"use client";

import { useMemo } from "react";
import type { MockCupon } from "@/lib/mocks/cupones.mock";
import CuponesHero from "./CuponesHero";
import CuponCard from "./CuponCard";
import AplicarCuponForm from "./AplicarCuponForm";
import CuponesHistorial from "./CuponesHistorial";
import CuponesEmpty from "./CuponesEmpty";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";

type Props = {
  available: MockCupon[];
  history: MockCupon[];
};

export default function CuponesClient({ available, history }: Props) {
  const summary = useMemo(() => {
    const totalSavings = available.reduce((acc, c) => {
      if (c.discountType === "fixed") return acc + c.discountValue;
      // for percent/shipping la estimacion depende del carrito — sumamos
      // valores fijos a modo de "ahorro potencial aprox".
      return acc;
    }, 0);
    return { totalSavings, activeCount: available.length };
  }, [available]);

  return (
    <main className="min-h-screen bg-[var(--surface-alt)]/60 dark:bg-gray-950">
      <div className="border-b border-[var(--rule-muted)] bg-white dark:bg-gray-900">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-3">
          <Breadcrumbs
            items={[
              { label: "Mi cuenta", href: "/cuenta" },
              { label: "Cupones" },
            ]}
          />
        </div>
      </div>

      <CuponesHero
        activeCount={summary.activeCount}
        totalSavings={summary.totalSavings}
      />

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
            Disponibles ({available.length})
          </h2>
          {available.length === 0 ? (
            <CuponesEmpty />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {available.map((cupon) => (
                <CuponCard key={cupon.id} cupon={cupon} />
              ))}
            </div>
          )}
        </section>

        <AplicarCuponForm />

        {history.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
              Historial ({history.length})
            </h2>
            <CuponesHistorial cupones={history} />
          </section>
        )}
      </div>

      <RelatedFeatures features={relatedFor("cupones")} />
    </main>
  );
}
