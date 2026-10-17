"use client";

/**
 * useAgregarProducto — la lógica de carrito de una tarjeta de producto del
 * marketplace, en un solo lugar (home «Dosel», 2026-10-10).
 *
 * Salió TAL CUAL de UnifiedProductCard (líneas del carrito, cantidad, tope de
 * stock, «Avísame» por WhatsApp, vuelo al carrito del nav, modal «Arma tu
 * pedido» y su re-edición) para que la tarjeta de la home use exactamente la
 * misma regla. Lo nuevo es aditivo y solo lo usa HomeProductCard:
 *   · `quitarUno`  → el «−» del contador (resta de la última línea agregada).
 *   · `agregarRapido` → el «+»: suma directo; si el producto tiene adicionales
 *     abre el modal. El catálogo no trae los adicionales, así que se piden una
 *     vez por producto (caché del módulo) — 6 de 82 productos los tienen.
 *
 * El carrito es `useMarketplaceCart` (el mismo de siempre); acá solo se consume.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { BRAND_GEO } from "@/lib/geo";
import { celebrate } from "@/lib/celebrate";
import { useMarketplaceCart, modifierHashOf } from "@/hooks/use-marketplace-cart";
import { useToast } from "@/contexts/toast-context";
import type ProductModifierModal from "@/components/marketplace/ProductModifierModal";
import type { UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";
import type { DbStoreProductModifierGroup } from "@/lib/db/marketplace.db";

type ModalProps = ComponentProps<typeof ProductModifierModal>;
type Grupos = DbStoreProductModifierGroup[];

/** Adicionales por producto, pedidos una sola vez por carga de página. */
const gruposPorProducto = new Map<string, Promise<Grupos | null>>();

function cargarGrupos(id: number, slug: string): Promise<Grupos | null> {
  const clave = `${slug}:${id}`;
  let p = gruposPorProducto.get(clave);
  if (!p) {
    p = fetch(`/api/products/${id}/modifiers?storeSlug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ groups?: Grupos }>) : null))
      .then((j) => (j ? (j.groups ?? []) : null))
      // null = no se pudo saber → quien llama abre el modal (que reintenta solo).
      .catch(() => null);
    gruposPorProducto.set(clave, p);
  }
  return p;
}

function vibrar(ms: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* silent */
    }
  }
}

export interface OpcionesAgregar {
  /** Animación «vuela al carrito». Default true. */
  volar?: boolean;
  /** Confeti chico + toast «Agregado». Default true. */
  festejar?: boolean;
}

export function useAgregarProducto(product: UnifiedProductCardProduct) {
  // `addItem` directo (sin drawer): desde el modal de adicionales no se abre el
  // AddedToCartDrawer encima (sería un modal sobre otro modal).
  const { items: cartItems, addItem, updateQuantity } = useMarketplaceCart();
  // Toast "Agregado al carrito" — confirmación CLARA al agregar desde la card.
  const { showToast } = useToast();
  const [modifierModalOpen, setModifierModalOpen] = useState(false);
  const [gruposCargados, setGruposCargados] = useState<Grupos | null>(null);
  const [pendiente, setPendiente] = useState(false);

  // Re-edit: cuando el cliente clickea "Editar" en el AddedToCartDrawer,
  // capturamos el evento global y abrimos nuestro modal.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ storeId: string; productId: number }>).detail;
      if (detail && detail.storeId === (product.storeId ?? "") && detail.productId === product.id) {
        setModifierModalOpen(true);
      }
    };
    window.addEventListener("buleje:reedit-modifiers", handler);
    return () => window.removeEventListener("buleje:reedit-modifiers", handler);
  }, [product.storeId, product.id]);

  // Líneas del carrito de ESTE producto (puede haber varias con distintos
  // adicionales). Match por storeProductId con fallback a storeId/storeSlug.
  const cartLines = useMemo(() => {
    return cartItems.filter((i) => {
      if (product.storeProductId && i.storeProductId)
        return i.storeProductId === product.storeProductId;
      if (i.productId !== product.id) return false;
      if (product.storeId) return i.storeId === product.storeId;
      if (product.storeSlug) return i.storeSlug === product.storeSlug;
      return false;
    });
  }, [cartItems, product.id, product.storeId, product.storeSlug, product.storeProductId]);

  const inCartQty = useMemo(() => cartLines.reduce((acc, i) => acc + i.quantity, 0), [cartLines]);

  const isOutOfStock = product.stock === 0;
  // Tope de stock: si el producto controla stock, no dejar sumar más allá.
  const atStockCap = product.stock != null && product.stock > 0 && inCartQty >= product.stock;

  // "Avísame cuando llegue" para agotados: WhatsApp a Buleje con el producto.
  const notifyWaHref = useMemo(() => {
    const digits = BRAND_GEO.phone.replace(/[^0-9]/g, "");
    const text = encodeURIComponent(
      `Hola Buleje 👋 Avísenme cuando vuelva a haber ${product.name}` +
        (product.storeName ? ` de ${product.storeName}` : "") +
        ", por favor.",
    );
    return `https://wa.me/${digits}?text=${text}`;
  }, [product.name, product.storeName]);

  // Ref del pozo de la imagen — origen de la animación "vuela al carrito".
  const imgWrapRef = useRef<HTMLDivElement>(null);

  // Una mini-vista del producto sale de la card y "vuela" hasta el carrito del
  // nav, que late al recibirla. DOM directo, sin provider.
  const flyToNavCart = useCallback(() => {
    if (typeof document === "undefined") return;
    const src = imgWrapRef.current;
    const cart = document.querySelector('[aria-label^="Carrito"]') as HTMLElement | null;
    if (!src || !cart) return;
    const s = src.getBoundingClientRect();
    const c = cart.getBoundingClientRect();
    if (s.width === 0 || c.width === 0) return;
    const SIZE = 46;
    const node = document.createElement("div");
    node.setAttribute("aria-hidden", "true");
    node.style.cssText = [
      "position:fixed",
      `left:${s.left + s.width / 2 - SIZE / 2}px`,
      `top:${s.top + s.height / 2 - SIZE / 2}px`,
      `width:${SIZE}px`,
      `height:${SIZE}px`,
      "border-radius:9999px",
      "overflow:hidden",
      "z-index:9999",
      "pointer-events:none",
      "background:#fff",
      "box-shadow:0 10px 30px rgba(0,0,0,.28)",
      "transition:transform .7s cubic-bezier(.22,.7,.22,1),opacity .7s ease",
    ].join(";");
    if (product.image) {
      const img = document.createElement("img");
      img.src = product.image;
      img.style.cssText = "width:100%;height:100%;object-fit:cover";
      node.appendChild(img);
    }
    document.body.appendChild(node);
    const dx = c.left + c.width / 2 - (s.left + s.width / 2);
    const dy = c.top + c.height / 2 - (s.top + s.height / 2);
    requestAnimationFrame(() => {
      node.style.transform = `translate(${dx}px, ${dy}px) scale(0.18)`;
      node.style.opacity = "0.25";
    });
    const cleanup = () => node.remove();
    node.addEventListener("transitionend", cleanup, { once: true });
    setTimeout(cleanup, 950);
    setTimeout(() => {
      cart.animate?.(
        [{ transform: "scale(1)" }, { transform: "scale(1.28)" }, { transform: "scale(1)" }],
        { duration: 320, easing: "ease-out" },
      );
    }, 640);
  }, [product.image]);

  // Primer agregado de UnifiedProductCard: SIEMPRE abre el modal «Arma tu pedido».
  const handleAdd = useCallback(() => {
    if (isOutOfStock) return;
    vibrar(30);
    setModifierModalOpen(true);
  }, [isOutOfStock]);

  /** Suma UNA unidad sin adicionales, con la confirmación que se pida. */
  const sumarUnaLinea = useCallback(
    ({ volar = true, festejar = true }: OpcionesAgregar = {}) => {
      if (volar) flyToNavCart();
      addItem({
        storeId: product.storeId ?? "",
        storeName: product.storeName ?? "",
        storeSlug: product.storeSlug ?? "",
        storeProductId: product.storeProductId ?? String(product.id),
        productId: product.id,
        name: product.name,
        price: product.price,
        basePrice: product.price,
        image: product.image ?? null,
        unit: product.unit ?? null,
        modifiers: [],
        modifierHash: modifierHashOf([]),
        quantity: 1,
        stock: product.stock ?? undefined,
      });
      if (festejar) {
        celebrate({ intensity: "sm" });
        showToast(product.name, product.image ?? "");
      }
    },
    [product, addItem, flyToNavCart, showToast],
  );

  // Agregar UNA unidad. Con adicionales conocidos abre el modal; producto
  // simple suma directo + animación + festejo.
  const handleIncrement = useCallback(() => {
    if (isOutOfStock || atStockCap) return;
    vibrar(20);
    if ((product.modifierGroups?.length ?? 0) > 0) {
      setModifierModalOpen(true);
      return;
    }
    sumarUnaLinea();
  }, [isOutOfStock, atStockCap, product.modifierGroups, sumarUnaLinea]);

  /** Pide los adicionales antes del clic (pointerdown/foco del «+»). */
  const prepararGrupos = useCallback(() => {
    if (product.modifierGroups || !product.storeSlug) return;
    void cargarGrupos(product.id, product.storeSlug);
  }, [product.modifierGroups, product.storeSlug, product.id]);

  /**
   * El «+» de la home: suma directo; si el producto tiene adicionales (los
   * conocidos o los que trae el API) abre el modal con ellos ya cargados.
   */
  const agregarRapido = useCallback(
    async (opciones?: OpcionesAgregar) => {
      if (isOutOfStock || atStockCap || pendiente) return;
      vibrar(20);
      let grupos: Grupos | null = product.modifierGroups ?? gruposCargados;
      if (!grupos) {
        if (product.storeSlug) {
          setPendiente(true);
          grupos = await cargarGrupos(product.id, product.storeSlug);
          setPendiente(false);
          if (grupos) setGruposCargados(grupos);
        } else {
          grupos = []; // sin tienda no hay a quién preguntar: suma directo
        }
      }
      if (grupos === null || grupos.length > 0) {
        setModifierModalOpen(true);
        return;
      }
      sumarUnaLinea(opciones);
    },
    [isOutOfStock, atStockCap, pendiente, product, gruposCargados, sumarUnaLinea],
  );

  /** El «−» del contador: resta de la última línea agregada (la quita en 0). */
  const quitarUno = useCallback(() => {
    const linea = cartLines[cartLines.length - 1];
    if (!linea) return;
    vibrar(10);
    updateQuantity(linea.storeId, linea.productId, linea.quantity - 1, linea.modifierHash ?? "");
  }, [cartLines, updateQuantity]);

  // Props del modal «Arma tu pedido» — SIEMPRE disponible.
  const modalProps: ModalProps = {
    open: modifierModalOpen,
    onClose: () => setModifierModalOpen(false),
    product: {
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image ?? null,
      unit: product.unit ?? null,
      category: product.category,
      storeId: product.storeId ?? "",
      storeName: product.storeName ?? "",
      storeSlug: product.storeSlug ?? "",
      storeProductId: product.storeProductId ?? String(product.id),
      storeLogo: product.storeLogo ?? null,
      description: product.description ?? null,
      storeRating: product.storeRating ?? null,
      storeReviewCount: product.storeReviewCount ?? null,
      storeCategory: product.storeCategory ?? null,
      storeProductCount: product.storeProductCount ?? null,
      storeSince: product.storeSince ?? null,
    },
    groups: product.modifierGroups ?? gruposCargados ?? [],
    onConfirm: ({ quantity, modifiers, finalUnitPrice }) => {
      // `addItem` directo (NO addItemWithUndo): no abrir el drawer encima.
      addItem({
        storeId: product.storeId ?? "",
        storeName: product.storeName ?? "",
        storeSlug: product.storeSlug ?? "",
        storeProductId: product.storeProductId ?? String(product.id),
        productId: product.id,
        name: product.name,
        price: finalUnitPrice,
        basePrice: product.price,
        image: product.image ?? null,
        unit: product.unit ?? null,
        modifiers,
        modifierHash: modifierHashOf(modifiers),
        quantity,
      });
      setModifierModalOpen(false);
      flyToNavCart();
      celebrate({ intensity: "sm" });
      showToast(product.name, product.image ?? "");
    },
  };

  return {
    cartLines,
    inCartQty,
    isOutOfStock,
    atStockCap,
    notifyWaHref,
    imgWrapRef,
    flyToNavCart,
    handleAdd,
    handleIncrement,
    agregarRapido,
    prepararGrupos,
    quitarUno,
    pendiente,
    modifierModalOpen,
    setModifierModalOpen,
    modalProps,
  };
}
