"use client";

/**
 * components/superadmin/control-center/SystemInfoCard.tsx
 *
 * Bloque final del Centro de Control: versión del proyecto, framework, runtime
 * y timestamp del último deploy. Todos los valores llegan del server component
 * padre (`page.tsx`) — este sub-componente no lee process.env.
 */

import {
  BodyText,
  Caption,
  CardTitle,
  Kicker,
  cn,
} from "@buleje/design-system";

export interface SystemInfoItem {
  label: string;
  value: string;
}

export interface SystemInfoCardProps {
  items: SystemInfoItem[];
  /** Timestamp ISO o texto libre. */
  deployedAt?: string;
}

export function SystemInfoCard({ items, deployedAt }: SystemInfoCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--rule-base)]",
        "bg-[var(--surface-raised)] p-5",
      )}
    >
      <header className="mb-4 space-y-1">
        <Kicker>SISTEMA</Kicker>
        <CardTitle>Información del sistema</CardTitle>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-0.5">
            <Caption className="uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              {item.label}
            </Caption>
            <BodyText className="font-mono text-[var(--text-primary)]">
              {item.value}
            </BodyText>
          </div>
        ))}
      </dl>

      {deployedAt && (
        <footer className="mt-4 border-t border-[var(--rule-base)] pt-3">
          <Caption className="text-[var(--text-tertiary)]">
            Último deploy: {deployedAt}
          </Caption>
        </footer>
      )}
    </section>
  );
}
