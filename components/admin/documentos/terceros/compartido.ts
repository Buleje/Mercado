import { User, Truck, ShoppingBag, UserCog, Trees, Users, type LucideIcon } from "@buleje/design-system/icons";
import type { TipoTercero } from "@/lib/documentos/terceros-vinculo";

/** El ícono de cada tipo de tercero: el mismo en la lista, el detalle y la ventana de vincular. */
export const ICONO_TERCERO: Record<TipoTercero, LucideIcon> = {
  persona: User,
  proveedor: Truck,
  cliente: ShoppingBag,
  colaborador: UserCog,
  comunidad: Trees,
  otro: Users,
};

/** Campo de búsqueda de la pestaña (48 px como el buscador de la cabecera; borde neutro de 1 px, ADR-489). */
export const CAMPO_BUSCAR =
  "w-full h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";
