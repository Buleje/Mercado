"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ShoppingBag, ArrowRight } from "@buleje/design-system/icons";

/**
 * Floating CTA button that appears only when the user scrolls
 * to the zone between FAQ/Contact sections and the Footer.
 */
export default function FloatingStoreCTA() {
  const [visible, setVisible] = useState(false);
  const rafRef = useRef(0);

  useEffect(() => {
    const check = () => {
      const contact = document.getElementById("contacto");
      const footer = document.querySelector("footer");
      if (!contact || !footer) return;

      const scrollY = window.scrollY + window.innerHeight;
      const contactTop = contact.offsetTop;
      const footerBottom = footer.offsetTop + footer.offsetHeight;

      const inZone = scrollY > contactTop && scrollY < footerBottom + 200;
      setVisible(inZone);
    };

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(check);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    check();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-4 z-40 transition-all duration-500 sm:bottom-6 sm:left-6 ${
        visible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-8 scale-75 pointer-events-none"
      }`}
    >
      {/* Subtle glow behind button */}
      <span className="absolute inset-0 rounded-full bg-primary/25 blur-xl animate-[glowPulse_2.8s_ease-in-out_infinite] pointer-events-none" />

      <Link
        href="/tienda"
        aria-label="Ir a la tienda"
        className="relative flex items-center gap-2 rounded-full bg-primary pl-4 pr-5 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-xl hover:bg-primary-dark active:scale-95 motion-safe:animate-[float_3.2s_ease-in-out_infinite]"
      >
        <ShoppingBag className="h-4.5 w-4.5 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
        <span>Ir a la Tienda</span>
        <ArrowRight className="h-3.5 w-3.5 opacity-60 transition-transform duration-300 group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
