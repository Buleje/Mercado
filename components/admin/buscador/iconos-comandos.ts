/**
 * El ícono de cada comando del buscador (M04). Aparte del catálogo
 * (`lib/admin/comandos-panel.ts`) para que el catálogo siga siendo puro y se
 * pueda probar sin cargar íconos.
 */

import type { ElementType } from "react";
import {
  Banknote, Calculator, ClipboardCheck, ClipboardList, FileSignature, HandCoins, Lock, Package, PackageCheck,
  PackageX, Receipt, RotateCcw, Shield, ShoppingBasket, ShoppingCart, Tag, Truck, Unlock, UserPlus, Wallet,
} from "@buleje/design-system/icons";
import type { IconoComando } from "@/lib/admin/comandos-panel";

export const ICONOS_COMANDO: Record<IconoComando, ElementType> = {
  venta: ShoppingCart,
  cobro: HandCoins,
  comprobante: Receipt,
  cotizacion: FileSignature,
  caja: Calculator,
  "abrir-caja": Unlock,
  turno: Lock,
  compra: ShoppingBasket,
  orden: ClipboardList,
  recepcion: PackageCheck,
  pago: Banknote,
  reponer: RotateCcw,
  gasto: Wallet,
  perdida: PackageX,
  producto: Package,
  conteo: ClipboardCheck,
  oferta: Tag,
  cliente: UserPlus,
  pedido: Truck,
  respaldo: Shield,
};
