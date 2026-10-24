"use client";

/**
 * El checkout de siempre EN LA PORTADA de la tienda (`/t/<negocio>`, ADR-511),
 * sin cambiar de página: el mismo camino que Buleje Beauty
 * (`pagina-bodega-buleje-test/ProveedorTienda.tsx`).
 *
 * La portada vive fuera del layout de la tienda: no tiene el checkout que monta
 * el layout (`StoreClientShell`). Al tocar «Finalizar compra» en la bolsa
 * (`finalizarAqui()`), esto baja `BolsaCheckoutEnPortada` (los proveedores de
 * la tienda sobre el carrito que ya trae la bolsa + el checkout y los modales
 * del pedido, SIN tocarlos) y lo abre ahí mismo. El trozo se pide antes, al
 * abrir la bolsa: al tocar «Finalizar» ya está.
 *
 * Respaldo: si el trozo no baja o el checkout se cae al dibujarse, el catálogo
 * con la bolsa abierta (`pagar`), donde el layout sí trae el checkout. El
 * carrito se guarda en el navegador: llega igual.
 *
 * `/api/*` resuelve el negocio por el Referer `/t/<negocio>` (`tenantDesdeReferer`
 * en `lib/middleware/tenant.ts`): el pedido cae en el negocio de la portada.
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

// Almacén de módulo (como `estado-bolsa.ts`): el botón vive en el cajón y el checkout acá, ramas distintas.
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

/** ¿Hay una portada montada que abre el checkout acá? */
export function useCheckoutAqui(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => listos > 0,
    () => false,
  );
}

/** «Finalizar compra» de la bolsa. `true` = el checkout se abre en esta página (no sigas el enlace). */
export function finalizarAqui(): boolean {
  if (listos === 0) return false;
  fijarPedido(true);
  return true;
}

let modulo: Promise<ComponentType<PropsCheckoutEnPortada>> | null = null;
function cargar(): Promise<ComponentType<PropsCheckoutEnPortada>> {
  modulo ??= import("./BolsaCheckoutEnPortada").then(
    (m) => m.CheckoutEnPortada,
    (err: unknown) => {
      modulo = null; // el próximo intento vuelve a pedirlo
      throw err;
    },
  );
  return modulo;
}

export function ProveedorCheckout({ slug, pagar }: { slug: string; pagar: string }) {
  const hayPedido = useSyncExternalStore(
    suscribir,
    () => pedido,
    () => false,
  );
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
      // Se fue de la portada antes de que abriera: al volver no debe abrirse solo. Un tic
      // después: el modo estricto desmonta y vuelve a montar este efecto; al toque, no abría nunca.
      setTimeout(() => {
        if (listos === 0) atendido();
      }, 0);
    };
  }, [slug]);

  const irAlCatalogo = useCallback(() => {
    atendido();
    window.location.assign(pagar);
  }, [pagar]);

  // Al abrir la bolsa: bajar el trozo por adelantado (sin montarlo: los proveedores piden datos al montar).
  useEffect(() => {
    if (!activo || !bolsaAbierta || Checkout) return;
    cargar().catch((err: unknown) => logger.warn("[tienda] el checkout de la portada no bajó por adelantado", { err }));
  }, [activo, bolsaAbierta, Checkout]);

  // Al tocar «Finalizar»: montarlo (o, si no baja, el catálogo con la bolsa abierta).
  useEffect(() => {
    if (!activo || !hayPedido || Checkout) return;
    let vivo = true;
    cargar().then(
      (C) => {
        if (vivo) setCheckout(() => C);
      },
      (err: unknown) => {
        logger.warn("[tienda] el checkout de la portada no bajó: sigo el enlace", { err });
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
    <div className="fixed inset-0 z-system grid place-items-center bg-[color-mix(in_srgb,var(--ti-texto)_45%,transparent)] backdrop-blur-[2px]">
      <p
        role="status"
        aria-live="polite"
        className="ti-sombra-flotante inline-flex items-center gap-3 rounded-full bg-[var(--ti-fondo)] px-6 py-4 text-base font-semibold text-[var(--ti-texto)]"
      >
        <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--ti-linea)] border-t-[var(--ti-texto)]" />
        Preparando tu pedido…
      </p>
    </div>
  );
}

/** Si el checkout se cae al dibujarse, el catálogo con la bolsa abierta. */
class Respaldo extends Component<{ alFallar: () => void; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error: Error) {
    logger.error("[tienda] el checkout de la portada se cayó: sigo el enlace", { error: error.message });
    this.props.alFallar();
  }

  render() {
    return this.state.fallo ? null : this.props.children;
  }
}
