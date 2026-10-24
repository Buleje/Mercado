"use client";

/**
 * «Más usadas» DENTRO del menú de accesos directos (Brandon 24-10: «ahí estarán
 * todas las páginas más usadas nomás y recientes»). Las páginas que esta
 * persona más abre, del contador de «Menú en tu orden»; clic = ir ahí sin
 * recargar, igual que «Recientes».
 */

import { TrendingUp } from "@buleje/design-system/icons";
import { MODULE_INDEX } from "@/components/admin/buscador/indice-modulos";
import { ResultadoEnlazable } from "@/components/admin/shared/ResultadoEnlazable";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { MasUsada } from "@/lib/admin/mas-usadas";

interface Props {
  lista: readonly MasUsada[];
  alVolver: (href: string) => void;
}

export default function MasUsadasDelMenu({ lista, alVolver }: Props) {
  return (
    <div role="group" aria-label="Más usadas">
      <div className="flex items-center gap-1.5 px-2 pb-1">
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <TrendingUp className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
          Más usadas
        </p>
        <InfoTip
          what="Las páginas que más abres, de la que más a la que menos."
          example="Si entras diez veces a Clientes y tres a Compras, Clientes sale primero."
        />
      </div>
      {lista.length === 0 ? (
        <p className="px-2 pb-2 text-sm text-[var(--text-secondary)]">Aún no hay páginas usadas: aparecen según las abras.</p>
      ) : (
        <ul role="none">
          {lista.map((m) => {
            const Icono = MODULE_INDEX.find((x) => x.tab === m.tab)?.icon;
            return (
              <li key={m.href} role="none">
                <ResultadoEnlazable
                  href={m.href}
                  onElegir={() => alVolver(m.href)}
                  atributos={{ role: "menuitem" }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  {Icono && <Icono className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{m.titulo}</span>
                    {m.camino && <span className="block truncate text-xs text-[var(--text-secondary)]">{m.camino}</span>}
                  </span>
                </ResultadoEnlazable>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
