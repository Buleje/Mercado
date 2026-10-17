"use client";

/**
 * Lo que el menú de cuenta necesita saber del cliente, SIN pedir nada a la red:
 * todo sale del contexto que la tienda ya cargó (o del navegador, en la
 * portada de una página propia, que no monta los proveedores de la tienda).
 *
 * Dos hooks porque los proveedores existen o no para toda la página: el menú
 * elige uno al montarse (`useSettingsSafe() !== null`) y nunca cambia de rama.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCustomer } from "@/contexts/customer-context";
import { useWishlist } from "@/contexts/wishlist-context";
import { contarFavoritosGuardados } from "@/contexts/favorites-context";
import { tenantKey, useTenantSlug } from "@/contexts/tenant-context";
import { numeroWhatsappDe } from "@/components/checkout/hooks/usePedidosTienda";
import { cerrarSesionCliente } from "@/lib/auth/salir-cliente";
import type { useSettingsSafe } from "@/contexts/settings-context";
import { baseDeTienda, negocioDeRuta } from "./cuenta-rutas";

export interface DatosCuenta {
  /** Nombre que el cliente dejó en esta tienda (verificado o recordado). */
  nombre: string | null;
  conSesion: boolean;
  /** Base del negocio para los enlaces (`/t/<negocio>` o ""). */
  base: string;
  /** WhatsApp del negocio (dígitos) o `null`. */
  whatsapp: string | null;
  /** Lo que `/favoritos` muestra (0 = el atajo no aparece). */
  favoritos: number;
  /** El negocio de esta tienda: el panel decide al abrirse si quien mira es su dueño. */
  negocio: string | null;
  salir: () => void;
}

type Settings = NonNullable<ReturnType<typeof useSettingsSafe>>;

/** Dentro de la tienda (catálogo, cuenta, marco de la página propia). */
export function useDatosCuentaConProveedor(settings: Settings, whatsapp?: string | null): DatosCuenta {
  const pathname = usePathname();
  const { customer, salir } = useCustomer();
  const { count } = useWishlist();
  const slugDelProveedor = useTenantSlug();
  const negocio = negocioDeRuta(pathname) ?? slugDelProveedor ?? null;
  return {
    nombre: customer?.name?.trim() || null,
    conSesion: !!customer,
    base: baseDeTienda(pathname),
    whatsapp: whatsapp ?? numeroWhatsappDe(settings.storeTheme),
    favoritos: count,
    negocio,
    salir: () => {
      void salir().then(() => window.location.reload());
    },
  };
}

/**
 * Portada de una página propia (`/t/<negocio>`): sin proveedores. El nombre se
 * lee de la misma clave que usa el contexto del cliente en esa tienda.
 */
export function useDatosCuentaSinProveedor(whatsapp?: string | null): DatosCuenta {
  const pathname = usePathname();
  const negocio = negocioDeRuta(pathname);
  const clave = tenantKey(negocio ?? "main", "customer");
  const [nombre, setNombre] = useState<string | null>(null);
  const [favoritos, setFavoritos] = useState(0);

  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(clave) ?? "null") as { name?: string } | null;
      setNombre(guardado?.name?.trim() || null);
    } catch {
      setNombre(null);
    }
    // Los mismos favoritos que guarda el corazón del catálogo de esta tienda.
    setFavoritos(contarFavoritosGuardados(negocio ?? "main"));
  }, [clave, negocio]);

  return {
    nombre,
    conSesion: !!nombre,
    base: baseDeTienda(pathname),
    whatsapp: whatsapp ?? null,
    favoritos,
    negocio,
    salir: () => {
      void cerrarSesionCliente().then(() => {
        try {
          localStorage.removeItem(clave);
        } catch {
          /* almacenamiento bloqueado: igual recargamos */
        }
        window.location.reload();
      });
    },
  };
}
