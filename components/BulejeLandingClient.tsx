"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

// ── Mobile hamburger nav for landing ──
function MobileNav() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  const links = [
    { href: "/marketplace", label: "Marketplace" },
    { href: "#preguntas", label: "FAQ" },
    { href: "#contacto", label: "Contacto" },
    { href: "/marketplace/registrar", label: "Abre tu tienda" },
  ];

  return (
    <>
      {/* Fixed header on mobile */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#060e08]/90 backdrop-blur-lg border-b border-white/10 lg:hidden">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="text-lg font-extrabold text-white">
            🏪 Buleje
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={open ? "Cerrar menu" : "Abrir menu"}
            aria-expanded={open}
          >
            {open ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Slide-in menu */}
      <div
        ref={menuRef}
        className={`fixed inset-y-0 right-0 z-50 w-72 bg-[#060e08] border-l border-white/10 transform transition-transform duration-300 lg:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal={open}
        aria-label="Menu de navegacion"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <span className="font-bold text-white">Menu</span>
          <button
            onClick={close}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
            aria-label="Cerrar menu"
          >
            ✕
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={close}
              className="block px-4 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/10 font-medium transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 mt-auto">
          <Link
            href="/admin"
            onClick={close}
            className="block text-center bg-[#00B4A6] text-white font-bold py-3 rounded-xl hover:bg-[#009b8f] transition-colors"
          >
            Iniciar sesion
          </Link>
        </div>
      </div>
    </>
  );
}

// ── Scroll reveal animations ──
function ScrollRevealStyles() {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .scroll-reveal {
        opacity: 0;
        transform: translateY(24px);
        transition: opacity 0.6s ease-out, transform 0.6s ease-out;
      }
      .scroll-reveal.visible {
        opacity: 1;
        transform: translateY(0);
      }
    `;
    document.head.appendChild(style);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -60px 0px", threshold: 0.1 }
    );

    // Observe all sections in main
    const main = document.getElementById("main-content");
    if (main) {
      const sections = main.querySelectorAll(":scope > section");
      sections.forEach((s) => {
        s.classList.add("scroll-reveal");
        observer.observe(s);
      });
    }

    return () => {
      observer.disconnect();
      style.remove();
    };
  }, []);

  return null;
}

// ── Combined client component ──
export default function BulejeLandingClient() {
  return (
    <>
      <MobileNav />
      <ScrollRevealStyles />
      {/* Spacer for fixed mobile header */}
      <div className="h-14 lg:hidden" aria-hidden="true" />
    </>
  );
}
