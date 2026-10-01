"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ShoppingCart, Star, Package, Truck } from "@buleje/design-system/icons";

const ACTIVITIES = [
  { Icon: ShoppingCart, color: "var(--accent)", msg: "Ana M. de Yarinacocha acaba de pedir Arroz Costeño 5 kg" },
  { Icon: Star, color: "#ff6b5b", msg: 'Rosa A. reseñó con ⭐⭐⭐⭐⭐: "¡Llegó rapidísimo!"' },
  { Icon: ShoppingCart, color: "var(--accent)", msg: "Luis T. agregó Aceite Primor 1L al carrito" },
  { Icon: Truck, color: "#10b981", msg: "Pedido #1852 está en camino" },
  { Icon: ShoppingCart, color: "var(--accent)", msg: "Carmen V. realizó su pedido por WhatsApp" },
  { Icon: Package, color: "#10b981", msg: "14 pedidos entregados hoy" },
  { Icon: ShoppingCart, color: "var(--accent)", msg: "Pedro G. pidió 3 Gaseosas Inca Kola 1.5 L" },
  { Icon: Star, color: "#ff6b5b", msg: "Marco R. reseñó con ⭐⭐⭐⭐⭐ su último pedido" },
  { Icon: ShoppingCart, color: "var(--accent)", msg: "María P. acaba de comprar Pan de molde + Mantequilla" },
  { Icon: Truck, color: "#10b981", msg: "Entrega completada en Jr. Ucayali 340 ✓" },
];

export default function LiveActivityTicker() {
  const pathname = usePathname();
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Delay first appearance so it doesn't distract on initial load
    const init = setTimeout(() => {
      setMounted(true);
      setTimeout(() => setVisible(true), 100);
    }, 7000);
    return () => clearTimeout(init);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % ACTIVITIES.length);
        setVisible(true);
      }, 500);
    }, 5500);
    return () => clearInterval(interval);
  }, [mounted]);

  if (!mounted) return null;
  // Don't show in admin panel
  if (pathname?.startsWith("/admin")) return null;

  const act = ACTIVITIES[idx];
  const { Icon } = act;

  // Wrap in a hidden-on-mobile container: too many floating elements on small screens
  return (
    <div className="hidden sm:block">
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "fixed",
          bottom: "5.5rem",
          left: "1rem",
          zIndex: 50,
          maxWidth: 300,
          transition: "opacity 0.4s ease, transform 0.4s ease",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
            background: "var(--color-card, #fff)",
            border: "1px solid var(--color-card-border, #dee2e6)",
            borderRadius: "1rem",
            padding: "0.65rem 0.9rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              padding: "0.35rem",
              borderRadius: "8px",
              marginTop: 2,
              background: act.color + "15",
            }}
          >
            <Icon style={{ width: 14, height: 14, color: act.color }} />
          </div>
          <div>
            <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--color-foreground)", lineHeight: 1.4, margin: 0 }}>
              {act.msg}
            </p>
            <p style={{ fontSize: "0.6rem", color: "var(--color-muted)", marginTop: 2 }}>Hace unos momentos</p>
          </div>
        </div>
      </div>
    </div>
  );
}
