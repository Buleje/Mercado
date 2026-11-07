"use client";

/**
 * El checkout de la tienda EN LA PORTADA (`/t/<negocio>`), sin cambiar de página.
 *
 * La portada vive fuera del layout de la tienda: no tiene el checkout de
 * siempre (`StoreClientShell`, que además tarda 2,5 s en montar). Al tocar
 * «Finalizar compra» en la bolsa (`Cajon` → `finalizarAqui()`), esto baja
 * `CheckoutEnPortada` (los proveedores de la tienda sobre el carrito que ya
 * trae la bolsa + el checkout y los modales del pedido) y lo abre ahí mismo.
 * El trozo se pide antes, al abrir la bolsa: al tocar «Finalizar» ya está.
 *
 * Mejora progresiva: «Finalizar compra» sigue siendo el enlace al catálogo con
 * la bolsa abierta (`rutas().pagar`). Sin JS, si el trozo no baja o si el
 * checkout se cae al dibujarse, se sigue ese enlace.
 *
 * Se abre acá en todos los negocios: `/api/*` resuelve el negocio por el
 * Referer `/t/<negocio>` con o sin barra final y sin mirar la query
 * (`tenantDesdeReferer` en `lib/middleware/tenant.ts`, security 08-10). Antes
 * el patrón exigía `/t/<negocio>/` y leía la query: sólo `main` sin «/» en la
 * query era seguro y el resto seguía el enlace.
 */
import { Component, useCallback, useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { logger } from "@/lib/logger";
import { useBolsaAbierta } from "./estado-bolsa";

export type PropsCheckoutEnPortada = {
  slug: string;
  /** Tocaron «Finalizar» y el checkout todavía no abrió. */
  pedido: boolean;
  /** El checkout ya abrió: baja el aviso de «Preparando». */
  alAbrir: () => void;
};

// ── Almacén de módulo (como `estado-bolsa.ts`): el botón vive en el cajón y el checkout acá, ramas distintas.
let listos = 0; // portadas montadas donde el checkout puede abrirse sin cambiar de página
let pedido = false;
const oyentes = new Set<() => void>();

const avisar = () => oyentes.forEach((o) => o());

function fijarPedido(valor: boolean) {
  if (pedido === valor) return;
  pedido = valor;
  avisar();
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

const atendido = () => fijarPedido(false);

/**
 * ¿Hay una portada montada que abre el checkout acá? El cajón dibuja entonces un
 * BOTÓN y no el enlace: `NavProgress` escucha los clics en enlaces en captura
 * (antes del `preventDefault` de React) y dejaba su «Cargando…» pegado encima.
 */
export function useCheckoutAqui(): boolean {
  return useSyncExternalStore(suscribir, () => listos > 0, () => false);
}

/** «Finalizar compra» de la bolsa. `true` = el checkout se abre en esta página (no sigas el enlace). */
export function finalizarAqui(): boolean {
  if (listos === 0) return false;
  fijarPedido(true);
  return true;
}

let modulo: Promise<ComponentType<PropsCheckoutEnPortada>> | null = null;
function cargar(): Promise<ComponentType<PropsCheckoutEnPortada>> {
  modulo ??= import("./CheckoutEnPortada").then(
    (m) => m.CheckoutEnPortada,
    (err: unknown) => {
      modulo = null; // el próximo intento vuelve a pedirlo
      throw err;
    },
  );
  return modulo;
}

export function ProveedorTienda({ slug, pagar }: { slug: string; pagar: string }) {
  const hayPedido = useSyncExternalStore(suscribir, () => pedido, () => false);
  const bolsaAbierta = useBolsaAbierta();
  const [Checkout, setCheckout] = useState<ComponentType<PropsCheckoutEnPortada> | null>(null);
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    listos += 1;
    setActivo(true);
    avisar();
    return () => {
      listos -= 1;
      avisar();
      // Se fue de la portada antes de que abriera: al volver no debe abrirse solo.
      // Un tic después: React (modo estricto en dev) desmonta y vuelve a montar
      // este efecto al montar el checkout; si se borraba al toque, no abría nunca.
      setTimeout(() => {
        if (listos === 0) atendido();
      }, 0);
    };
  }, [slug]);

  /** Respaldo: el enlace de siempre (catálogo con la bolsa abierta; el carrito se guarda en el navegador). */
  const irAlCatalogo = useCallback(() => {
    atendido();
    window.location.assign(pagar);
  }, [pagar]);

  // Al abrir la bolsa: bajar el trozo por adelantado (sin montarlo: los proveedores piden datos al montar).
  useEffect(() => {
    if (!activo || !bolsaAbierta || Checkout) return;
    cargar().catch((err: unknown) => logger.warn("[salon] el checkout de la portada no bajó por adelantado", { err }));
  }, [activo, bolsaAbierta, Checkout]);

  // Al tocar «Finalizar»: montarlo (o, si no baja, el enlace de siempre).
  useEffect(() => {
    if (!activo || !hayPedido || Checkout) return;
    let vivo = true;
    cargar().then(
      (C) => {
        if (vivo) setCheckout(() => C);
      },
      (err: unknown) => {
        logger.warn("[salon] el checkout de la portada no bajó: sigo el enlace", { err });
        if (vivo) irAlCatalogo();
      },
    );
    return () => {
      vivo = false;
    };
  }, [activo, hayPedido, Checkout, irAlCatalogo]);

  return (
    <>
      {hayPedido && <Preparando />}
      {Checkout && (
        <Respaldo alFallar={irAlCatalogo}>
          <Checkout slug={slug} pedido={hayPedido} alAbrir={atendido} />
        </Respaldo>
      )}
    </>
  );
}

/** Mientras baja el checkout y se lee al cliente (suele ser un instante). */
function Preparando() {
  return (
    <div className="fixed inset-0 z-system grid place-items-center bg-[var(--bb-tinta)]/50 backdrop-blur-[2px]">
      <p
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-3 rounded-full bg-[var(--surface-canvas)] px-6 py-4 text-base font-semibold text-[var(--text-primary)] shadow-[var(--shadow-xl)]"
      >
        <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--rule-base)] border-t-[var(--text-primary)]" />
        Preparando tu pedido…
      </p>
    </div>
  );
}

/** Si el checkout se cae al dibujarse, el enlace de siempre. */
class Respaldo extends Component<{ alFallar: () => void; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error: Error) {
    logger.error("[salon] el checkout de la portada se cayó: sigo el enlace", { error: error.message });
    this.props.alFallar();
  }

  render() {
    return this.state.fallo ? null : this.props.children;
  }
}
