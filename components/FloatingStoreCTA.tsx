"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ShoppingBag, ArrowRight } from "lucide-react";

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
      className={`fixed bottom-24 right-6 z-40 transition-all duration-500 ${
        visible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-8 scale-75 pointer-events-none"
      }`}
    >
      {/* Subtle glow behind button */}
      <span className="absolute inset-0 rounded-full bg-primary/25 blur-xl animate-pulse pointer-events-none" />

      <Link
        href="/tienda"
        className="relative flex items-center gap-2 bg-primary text-white font-bold text-sm pl-4 pr-5 py-3 rounded-full shadow-lg shadow-primary/30 hover:shadow-xl hover:bg-primary-dark active:scale-95 transition-all duration-200 group"
      >
        <ShoppingBag className="h-4.5 w-4.5" />
        <span>Ir a la Tienda</span>
        <ArrowRight className="h-3.5 w-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}
