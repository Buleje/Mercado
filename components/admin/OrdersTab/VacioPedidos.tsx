"use client";

/**
 * El vacío del Tablero y de la Lista (17-10, O02/P01): antes era una frase
 * sin salida («No hay pedidos en marcha») aunque el vacío fuera culpa de un
 * filtro. Ahora dice por qué está vacío y da el paso que sigue: quitar los
 * filtros, o ver los que ya se cerraron y preparar el reparto.
 */
import { ShoppingBasket } from "@buleje/design-system/icons";
import { EmptyState, type EmptyStateAction } from "@/components/admin/EmptyState";

export interface VacioPedidosProps {
  conFiltros: boolean;
  onQuitarFiltros: () => void;
  onVerArchivados: () => void;
  /** Sin él (plan o rol sin Reparto) no se ofrece. */
  onIrAReparto?: () => void;
}

export function VacioPedidos({
  conFiltros,
  onQuitarFiltros,
  onVerArchivados,
  onIrAReparto,
}: VacioPedidosProps) {
  const icono = <ShoppingBasket className="h-10 w-10 text-[var(--text-tertiary)]" />;
  if (conFiltros) {
    return (
      <EmptyState
        icon={icono}
        title="Ningún pedido en marcha pasa estos filtros"
        actions={[
          { label: "Quitar filtros", onClick: onQuitarFiltros },
          { label: "Ver archivados", onClick: onVerArchivados, variant: "secondary" },
        ]}
      />
    );
  }
  const acciones: EmptyStateAction[] = [
    { label: "Ver archivados", onClick: onVerArchivados, variant: "secondary" },
  ];
  if (onIrAReparto) {
    acciones.unshift({ label: "Preparar el reparto", onClick: onIrAReparto });
  }
  return (
    <EmptyState
      icon={icono}
      title="No hay pedidos en marcha"
      description="Los de tu tienda en línea y del marketplace aparecen aquí al momento."
      actions={acciones}
    />
  );
}
