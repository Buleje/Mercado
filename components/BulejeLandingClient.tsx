"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Store, Menu, X } from "@buleje/design-system/icons";

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
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold text-white">
            <Store className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Buleje
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={open ? "Cerrar menu" : "Abrir menu"}
            aria-expanded={open}
          >
            {open ? (
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
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
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
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
// Mantiene el contenido visible por default (SSR-safe, a prueba de JS lento,
// screenshots y lectores de pantalla). Solo aplica la animacion de entrada
// cuando el observer realmente ve la sección entrar al viewport. Usa
// `will-animate` como flag opt-in, no `opacity:0` global.
function ScrollRevealStyles() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Respetar prefers-reduced-motion
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const style = document.createElement("style");
    style.textContent = `
      .will-animate {
        opacity: 0;
        transform: translateY(24px);
        transition: opacity 0.6s ease-out, transform 0.6s ease-out;
      }
      .will-animate.visible {
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
      { rootMargin: "0px 0px -60px 0px", threshold: 0.01 }
    );

    const main = document.getElementById("main-content");
    if (main) {
      const sections = main.querySelectorAll(":scope > section");
      sections.forEach((s) => {
        const rect = s.getBoundingClientRect();
        // Solo animar secciones que estan fuera del viewport inicial;
        // las que ya estan visibles se dejan renderizadas sin animacion.
        if (rect.top > window.innerHeight) {
          s.classList.add("will-animate");
          observer.observe(s);
        }
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
// ScrollRevealStyles eliminado: dejaba secciones con opacity:0 visibles solo
// tras IntersectionObserver, y rompía en screenshots/SSR/JS lento. Las
// secciones ya tienen diseño editorial propio y no necesitan reveal animation.
export default function BulejeLandingClient() {
  return (
    <>
      <MobileNav />
      {/* Spacer for fixed mobile header */}
      <div className="h-14 lg:hidden" aria-hidden="true" />
    </>
  );
}
