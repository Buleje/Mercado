"use client";

/**
 * AvisoSinMeta — «Hoy» sin meta diaria de ventas en la base: una línea y el
 * botón para ponerla. Si este navegador guardaba una meta propia (la pantalla
 * vieja la tenía en el localStorage, distinta en cada PC) y no es la de fábrica,
 * ofrece guardarla para todos con ese mismo monto.
 */
import { useEffect, useState } from "react";
import { Target } from "@buleje/design-system/icons";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/admin/metas/clases-meta";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { META_DIARIA_DE_FABRICA } from "./hoy-calculos";

/** Las claves con que la pantalla vieja guardaba la meta diaria (en /admin siempre «:main»). */
const CLAVES_VIEJAS = ["daily-goal:main", "daily-goal"] as const;

function metaDeEsteEquipo(): number | null {
  try {
    for (const clave of CLAVES_VIEJAS) {
      const n = Number(window.localStorage.getItem(clave));
      if (Number.isFinite(n) && n > 0 && n !== META_DIARIA_DE_FABRICA) return n;
    }
  } catch {
    // Sin localStorage (modo privado estricto): no hay meta vieja que ofrecer.
  }
  return null;
}

export function AvisoSinMeta({ onPoner }: { onPoner: (objetivo?: number) => void }) {
  const [local, setLocal] = useState<number | null>(null);
  useEffect(() => setLocal(metaDeEsteEquipo()), []);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-[var(--rule-strong)]/30 bg-[var(--surface-sunken)] px-4 py-3 sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-start gap-2 text-sm text-[var(--text-primary)] sm:items-center">
        <Target
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)] sm:mt-0 dark:text-[var(--accent)]"
        />
        <span className="min-w-0">
          {local !== null ? (
            <>
              En este equipo tenías{" "}
              <b className="tabular-nums">{formatCurrency(local, { decimals: 0 })}</b> al día
            </>
          ) : (
            "Todavía no tienes una meta de ventas para el día"
          )}
          <InfoTip
            className="ml-1 align-middle"
            title="Meta del día"
            what="La meta diaria de ventas vive ahora en tus metas: la ven todos los equipos y su avance sale de tus ventas reales."
            {...(local !== null
              ? {
                  body: "Antes cada PC guardaba su propia meta; con «Guardarla para todos» queda una sola.",
                }
              : { example: "Ventas cobradas del día: S/ 3,000." })}
          />
        </span>
      </span>
      <div className="flex flex-wrap gap-2">
        {local !== null && (
          <button
            type="button"
            className={cn(BOTON_PRIMARIO, "flex-1 sm:flex-none")}
            onClick={() => onPoner(local)}
          >
            Guardarla para todos
          </button>
        )}
        <button
          type="button"
          className={cn(local !== null ? BOTON_SECUNDARIO : BOTON_PRIMARIO, "flex-1 sm:flex-none")}
          onClick={() => onPoner()}
        >
          Ponle una meta al día
        </button>
      </div>
    </div>
  );
}
