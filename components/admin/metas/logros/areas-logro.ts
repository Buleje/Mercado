/**
 * components/admin/metas/logros/areas-logro.ts — el área de cada logro (con su
 * icono y su color, los mismos que las metas de esa área) y el icono de cada
 * logro. Sin emojis: Lucide. Sólo tokens de color.
 */
import {
  Award,
  CheckCheck,
  Coins,
  Flame,
  HandCoins,
  Landmark,
  Medal,
  Rocket,
  Ruler,
  Smile,
  Star,
  Store,
  Sunrise,
  Target,
  TrendingUp,
  Trophy,
  Truck,
  Users,
  Warehouse,
  Zap,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { AREAS_META, type AreaMeta } from "@/lib/admin/metas-catalogo";
import type { CategoriaMeta } from "@/lib/admin/metas-tareas";
import type { AreaLogro } from "@/lib/metas/logros-reglas";

export interface AreaLogroDef {
  id: AreaLogro;
  nombre: string;
  icono: LucideIcon;
  color: string;
  /** La categoría de meta cuyo módulo abre «Ver en … ›» (`hrefDeMeta`); sin ella, el grupo no enlaza. */
  categoria?: CategoriaMeta;
}

const deMetas = (id: AreaMeta & AreaLogro, categoria: CategoriaMeta): AreaLogroDef => {
  const a = AREAS_META.find((x) => x.id === id);
  return {
    id,
    nombre: a?.nombre ?? id,
    icono: a?.icono ?? Award,
    color: a?.color ?? "var(--accent)",
    categoria,
  };
};

/** En este orden se muestran los grupos. La constancia sale de las ventas, pero no tiene módulo propio. */
export const AREAS_LOGRO: readonly AreaLogroDef[] = [
  deMetas("ventas", "ventas"),
  { id: "constancia", nombre: "Constancia", icono: Flame, color: "var(--data-7)" },
  deMetas("caja", "caja"),
  deMetas("clientes", "clientes"),
  deMetas("marketplace", "marketplace_ventas"),
  deMetas("forestal", "madera_ingresada"),
];

export const ICONO_LOGRO: Readonly<Record<string, LucideIcon>> = {
  "primera-venta": Target,
  "100-ventas": Award,
  "1000-ventas": Rocket,
  "mejor-dia": TrendingUp,
  "ticket-grande": Coins,
  "racha-3": Flame,
  "racha-7": Flame,
  "racha-30": Zap,
  "racha-100": Trophy,
  "vendedor-estrella": Star,
  "meta-cumplida": Medal,
  "todo-cobrado": CheckCheck,
  cobrador: HandCoins,
  "caja-perfecta": Landmark,
  madrugador: Sunrise,
  "50-clientes": Users,
  "100-clientes": Users,
  "500-clientes": Users,
  "cliente-feliz": Smile,
  "5-resenas-buenas": Star,
  "primer-pedido-marketplace": Store,
  "primer-lote-cubicado": Ruler,
  "100-m3-ingresados": Warehouse,
  "primer-despacho": Truck,
};
