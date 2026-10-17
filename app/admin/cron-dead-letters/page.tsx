"use client";

/**
 * /admin/cron-dead-letters — página suelta (la enlaza el Control Center del
 * superadmin). Su contenido vive en components/admin/sistema/CronFallidos.tsx
 * desde la ola 2 del plan «panel unificado»: el mismo se ve como bloque en
 * Configuración › Sistema › Colas. Esta página sigue abriendo igual.
 */
import React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, AlertOctagon } from "@buleje/design-system/icons";
import AdminTabShell from "@/app/admin/_components/_shared/AdminTabShell";
import { button } from "@/components/ui-system/button-variants";
import { CronFallidosAcciones, CronFallidosContenido } from "@/components/admin/sistema/CronFallidos";
import { useCronFallidos } from "@/components/admin/sistema/use-cron-fallidos";

export default function CronDeadLettersPage() {
  const router = useRouter();
  const c = useCronFallidos();

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] p-4 sm:p-8">
      <div className="mb-4">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className={button({ variant: "ghost", className: "rounded-xl px-3" })}
          aria-label="Volver al admin"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Volver al admin
        </button>
      </div>

      <AdminTabShell
        title="Crons que fallaron"
        description="Trabajos programados que agotaron sus reintentos: revisa la causa y limpia lo resuelto."
        icon={AlertOctagon}
        actions={<CronFallidosAcciones c={c} />}
      >
        <CronFallidosContenido c={c} />
      </AdminTabShell>
    </div>
  );
}
