"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ShoppingBag } from "@buleje/design-system/icons";

/**
 * FlyToCart
 *
 * Proveedor global de animación "el producto vuela al carrito".
 * El mini-cart flotante ya mide su posición y se expone como ancla.
 * Las product cards llaman a `fly(fromRect, imageUrl)` al agregar al carrito.
 */

interface FlyEvent {
  id: number;
  from: { x: number; y: number; w: number; h: number };
  to: { x: number; y: number };
  image: string | null;
}

interface FlyToCartContextValue {
  fly: (fromEl: HTMLElement | DOMRect, image: string | null) => void;
  registerCartAnchor: (el: HTMLElement | null) => void;
}

const FlyToCartContext = createContext<FlyToCartContextValue | null>(null);

export function useFlyToCart() {
  const ctx = useContext(FlyToCartContext);
  return (
    ctx ?? {
      fly: () => {},
      registerCartAnchor: () => {},
    }
  );
}

function getRect(source: HTMLElement | DOMRect): DOMRect {
  if (source instanceof DOMRect) return source;
  return source.getBoundingClientRect();
}

export default function FlyToCartProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [events, setEvents] = useState<FlyEvent[]>([]);
  const [mounted, setMounted] = useState(false);
  const cartAnchor = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  const registerCartAnchor = useCallback((el: HTMLElement | null) => {
    cartAnchor.current = el;
  }, []);

  const fly = useCallback(
    (fromEl: HTMLElement | DOMRect, image: string | null) => {
      if (typeof window === "undefined") return;
      const anchor = cartAnchor.current;
      if (!anchor) return;
      const fromRect = getRect(fromEl);
      const toRect = anchor.getBoundingClientRect();
      const id = Date.now() + Math.random();
      const event: FlyEvent = {
        id,
        from: {
          x: fromRect.left,
          y: fromRect.top,
          w: fromRect.width,
          h: fromRect.height,
        },
        to: {
          x: toRect.left + toRect.width / 2 - 24,
          y: toRect.top + toRect.height / 2 - 24,
        },
        image,
      };
      setEvents((prev) => [...prev, event]);
      setTimeout(() => {
        setEvents((prev) => prev.filter((e) => e.id !== id));
      }, 900);
    },
    [],
  );

  const value = useMemo(() => ({ fly, registerCartAnchor }), [fly, registerCartAnchor]);

  return (
    <FlyToCartContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-[9998]"
          >
            {events.map((e) => (
              <FlyingChip key={e.id} event={e} />
            ))}
          </div>,
          document.body,
        )}
    </FlyToCartContext.Provider>
  );
}

function FlyingChip({ event }: { event: FlyEvent }) {
  const [phase, setPhase] = useState<"start" | "end">("start");

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setPhase("end")),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const style: React.CSSProperties =
    phase === "start"
      ? {
          left: event.from.x + event.from.w / 2 - 28,
          top: event.from.y + event.from.h / 2 - 28,
          width: 56,
          height: 56,
          opacity: 1,
          transform: "scale(1) rotate(0deg)",
          transition:
            "left 800ms cubic-bezier(0.5, -0.2, 0.8, 0.2), top 800ms cubic-bezier(0.5, 0, 0.8, 1.3), transform 800ms ease-out, opacity 800ms ease-in",
        }
      : {
          left: event.to.x,
          top: event.to.y,
          width: 40,
          height: 40,
          opacity: 0,
          transform: "scale(0.4) rotate(360deg)",
          transition:
            "left 800ms cubic-bezier(0.5, -0.2, 0.8, 0.2), top 800ms cubic-bezier(0.5, 0, 0.8, 1.3), width 800ms ease-out, height 800ms ease-out, transform 800ms ease-out, opacity 800ms ease-in",
        };

  return (
    <div
      style={style}
      className="absolute rounded-full overflow-hidden bg-white border-2 border-orange-500 shadow-2xl shadow-orange-500/40 flex items-center justify-center"
    >
      {event.image ? (
        <Image src={event.image} alt="" fill sizes="56px" className="object-cover" />
      ) : (
        <ShoppingBag className="h-6 w-6 text-orange-500" />
      )}
    </div>
  );
}
