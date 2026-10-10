/**
 * Accesos rápidos de la cabecera del panel (Brandon 2026-10-10: «accesos
 * directos al lado de Buscar módulos: cámaras, buscar archivos o abrir
 * carpetas, y otros de uso rápido»).
 *
 * Cuáles van anclados por defecto salió de medir 30 días de uso real
 * (SQL de sólo lectura sobre Document, ActivityLog «camara», Asistencia,
 * CashRegister, Sale y Order, 10-10):
 *   Blas (el negocio que más usa el panel): Archivos 164 subidos en 7 días,
 *   Cámaras 191 eventos en 6 días, Asistencia 49 marcas en 4 días, Caja 0.
 *   main (bodega): Archivos 37 en 8 días, Caja 10 aperturas en 5 días,
 *   Cámaras 51 en 4 días, Asistencia 26 en 3 días; Vender 1 venta, Pedidos 1.
 * Vender, Pedidos, Ingresos de madera y el Asistente quedan en el menú
 * «Accesos»; cada uno se ancla o se quita desde ahí (se recuerda por navegador).
 *
 * Cada acceso abre su módulo EN UN MODAL sobre la pantalla donde estás
 * (`AccesoEnModal`), no navega: Brandon 10-10, «que salga su versión modal
 * ahí mismo… no que se vaya a la página».
 *
 * Permiso: un acceso sólo aparece si el rol, el plan, la plantilla y la
 * especialización dejan ver su pestaña Y su vista — las mismas capas que la
 * barra lateral (`lib/admin/permiso-vista.ts`).
 */
import {
  Bot,
  Camera,
  FolderOpen,
  ScanBarcode,
  ShoppingBag,
  Trees,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  origenesDeVista,
  pestanaPermitida,
  vistaPermitida,
  type ContextoPermiso,
} from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";

export type AccesoId =
  | "camaras"
  | "archivos"
  | "asistencia"
  | "caja"
  | "vender"
  | "pedidos"
  | "ingresos-madera"
  | "asistente";

export interface AccesoRapido {
  id: AccesoId;
  label: string;
  /** Una línea para el tooltip. */
  hint: string;
  icon: LucideIcon;
  tab: string;
  vista?: string;
  /** Al abrir, enfocar esto (el buscador del Archivo). */
  enfocar?: string;
}

export const ACCESOS: readonly AccesoRapido[] = [
  {
    id: "camaras",
    label: "Cámaras",
    hint: "Las cámaras en vivo",
    icon: Camera,
    tab: "camaras",
    vista: "camaras",
  },
  {
    id: "archivos",
    label: "Archivos",
    hint: "Buscar un archivo o abrir una carpeta",
    icon: FolderOpen,
    tab: "documentos",
    vista: "drive",
    enfocar: "[data-buscar-archivos]",
  },
  {
    id: "asistencia",
    label: "Asistencia",
    hint: "Quién vino hoy y a qué hora marcó",
    icon: UserCheck,
    tab: "rrhh",
    vista: "asistencia",
  },
  {
    id: "caja",
    label: "Caja",
    hint: "El efectivo del día: abrir, retiros y cuadrar",
    icon: Wallet,
    tab: "ventas-caja",
    vista: "caja-registradora",
  },
  {
    id: "vender",
    label: "Vender",
    hint: "Punto de venta: buscar producto y cobrar",
    icon: ScanBarcode,
    tab: "ventas-caja",
    vista: "pos",
  },
  {
    id: "pedidos",
    label: "Pedidos",
    hint: "Los pedidos por atender",
    icon: ShoppingBag,
    tab: "pedidos",
  },
  {
    id: "ingresos-madera",
    label: "Ingresos de madera",
    hint: "Las guías que llegaron al aserradero",
    icon: Trees,
    tab: "ctp-libro-operaciones",
    vista: "ingresos",
  },
  {
    id: "asistente",
    label: "Asistente IA",
    hint: "Pregunta por tu negocio o anota hablando",
    icon: Bot,
    tab: "asistente-ia",
    vista: "chat",
  },
];

export const ANCLADOS_POR_DEFECTO: readonly AccesoId[] = [
  "camaras",
  "archivos",
  "asistencia",
  "caja",
];

const IDS: ReadonlySet<string> = new Set(ACCESOS.map((a) => a.id));
export const esAccesoId = (x: unknown): x is AccesoId => typeof x === "string" && IDS.has(x);

/** ¿Este negocio y este rol ven la pestaña y la vista del acceso? `null` = rol sin confirmar: nada. */
export function accesoPermitido(ctx: ContextoPermiso | null, a: AccesoRapido): boolean {
  if (!ctx || !pestanaPermitida(ctx, a.tab)) return false;
  if (!a.vista) return true;
  const vista = vistasDelModulo(a.tab).find((v) => v.key === a.vista);
  return vista ? vistaPermitida(ctx, origenesDeVista(a.tab, vista)) : true;
}

/** La pantalla del acceso (botón «Abrir en su pantalla» del modal). */
export const hrefDelAcceso = (a: AccesoRapido): string =>
  `/admin?${new URLSearchParams(a.vista ? { tab: a.tab, vista: a.vista } : { tab: a.tab }).toString()}`;
