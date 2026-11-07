"use client";
/**
 * Un bloque del editor de Apariencia: plegable y recordado (el `Plegable` del
 * panel), con su ⓘ fuera del botón que pliega. Antes cada bloque era una
 * cabecera con un ícono de 40 px y todo abierto: Contacto medía 26 pantallas
 * y Colores 5 (11-10). Ahora el primero de cada sección arranca abierto y el
 * resto en una línea con su resumen; lo que elijas abrir se recuerda.
 *
 * `fijo`: sin plegar (la vista previa en vivo, que tiene que verse siempre).
 */
import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import Plegable from "@/components/admin/shared/Plegable";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

const claveDe = (titulo: string) =>
  `tienda-apariencia:${titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

export function Bloque({
  icon,
  title,
  description,
  resumen,
  abierto = false,
  fijo = false,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  resumen?: ReactNode;
  abierto?: boolean;
  fijo?: boolean;
  children: ReactNode;
}) {
  const ayuda = <InfoTip title={title} what={<span>{description}</span>} />;
  if (fijo) {
    return (
      <section className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <header className="flex items-center gap-2 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0">
          {icon}
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">{title}</CardTitle>
          {ayuda}
        </header>
        <div>{children}</div>
      </section>
    );
  }
  return (
    <Plegable
      clave={claveDe(title)}
      abiertoAlInicio={abierto}
      titulo={
        <span className="flex items-center gap-2 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0">
          {icon}
          {title}
        </span>
      }
      resumen={resumen}
      resumenAbierto={false}
      acciones={ayuda}
    >
      {children}
    </Plegable>
  );
}
