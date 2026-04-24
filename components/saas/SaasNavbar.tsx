"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { m as motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "@buleje/design-system/icons";

const NAV_LINKS = [
  { label: "Características", href: "#caracteristicas" },
  { label: "Planes", href: "#planes" },
  { label: "Testimonios", href: "#testimonios" },
  { label: "FAQ", href: "#faq" },
];

const SECTION_IDS = ["caracteristicas", "planes", "testimonios", "faq"];

// Icono de logo con gradiente teal — SVG inline para evitar bundle de lucide
function BrandIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="teal-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#00B4A6" />
        </linearGradient>
      </defs>
      {/* Tienda / bodega estilizada */}
      <path
        d="M3 9.5L12 3l9 6.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
        fill="url(#teal-grad)"
        opacity="0.15"
      />
      <path
        d="M3 9.5L12 3l9 6.5"
        stroke="url(#teal-grad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect
        x="9"
        y="13"
        width="6"
        height="9"
        rx="1"
        fill="url(#teal-grad)"
        opacity="0.7"
      />
      <path
        d="M3 10v11a1 1 0 001 1h4v-8h8v8h4a1 1 0 001-1V10"
        stroke="url(#teal-grad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// Nav link con underline animada que se desliza izq → der
function NavLink({
  label,
  href,
  isActive,
  onClick,
}: {
  label: string;
  href: string;
  isActive: boolean;
  onClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const showUnderline = isActive || hovered;

  return (
    <a
      href={href}
      onClick={(e) => onClick(e, href)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={[
        "relative px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
        isActive
          ? "text-[#00B4A6] dark:text-[#2dd4bf]"
          : "text-gray-600 dark:text-gray-400 hover:text-[#00B4A6] dark:hover:text-[#2dd4bf]",
      ].join(" ")}
      aria-current={isActive ? "true" : undefined}
    >
      {label}
      {/* Underline animada — se desliza de izquierda a derecha */}
      <motion.span
        className="absolute bottom-0.5 left-4 right-4 h-0.5 rounded-full origin-left"
        style={{ backgroundColor: "#00B4A6" }}
        initial={false}
        animate={{
          scaleX: showUnderline ? 1 : 0,
          opacity: showUnderline ? 1 : 0,
        }}
        transition={{ duration: 0.22, ease: [0.175, 0.885, 0.32, 1.275] }}
        aria-hidden="true"
      />
    </a>
  );
}

export default function SaasNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  // Progreso de lectura: 0-100 conforme el usuario scrollea la página completa
  const [scrollProgress, setScrollProgress] = useState(0);
  // Ref para el botón CTA — usamos ref transient para el efecto de pulso
  const ctaRef = useRef<HTMLAnchorElement>(null);

  // Cambio de fondo al hacer scroll + progreso de lectura — passive listener combinado
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setIsScrolled(scrollY > 20);

      // Cálculo del progreso: scrollY / (altura total del doc - altura del viewport) * 100
      const docHeight = document.documentElement.scrollHeight;
      const viewHeight = window.innerHeight;
      const scrollable = docHeight - viewHeight;
      setScrollProgress(scrollable > 0 ? Math.min(100, (scrollY / scrollable) * 100) : 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Scroll-spy con IntersectionObserver
  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((obs) => obs.disconnect());
  }, []);

  const handleSmoothScroll = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (!href.startsWith("#")) return;
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setIsMenuOpen(false);
    },
    []
  );

  const isActive = (href: string) =>
    activeSection === href.replace("#", "");

  return (
    <header
      className={[
        "fixed top-0 left-0 right-0 z-50",
        "transition-all duration-300",
        isScrolled
          ? "bg-white/95 dark:bg-gray-950/95 backdrop-blur-md border-b border-gray-200/80 dark:border-gray-800/80 shadow-sm"
          : "bg-transparent border-b border-transparent",
      ].join(" ")}
    >
      {/* Barra de progreso de lectura — 2px, gradiente teal, parte superior del navbar */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 h-[2px] pointer-events-none"
        style={{
          width: `${scrollProgress}%`,
          background: "linear-gradient(90deg, #00B4A6 0%, #2dd4bf 100%)",
          transition: "width 0.1s linear",
          // Ocultar cuando el progreso es 0 (inicio de página) para no mostrar línea vacía
          opacity: scrollProgress > 0 ? 1 : 0,
        }}
      />

      <nav
        className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 h-16 flex items-center justify-between"
        aria-label="Navegación principal"
      >
        {/* Logo con icono gradiente teal — se comprime al scrollear (CSS transition, sin FM) */}
        <Link
          href="/saas"
          className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] rounded-lg group"
          aria-label="Buleje — Inicio"
        >
          <BrandIcon
            className={[
              "shrink-0 transition-all duration-300",
              "group-hover:scale-110",
              isScrolled ? "h-5 w-5" : "h-7 w-7",
            ].join(" ")}
          />
          <span
            className={[
              "font-extrabold tracking-tight transition-all duration-300",
              isScrolled ? "text-lg" : "text-xl",
            ].join(" ")}
            style={{
              background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Buleje
          </span>
        </Link>

        {/* Links desktop */}
        <ul className="hidden md:flex items-center gap-1" role="list">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <NavLink
                label={link.label}
                href={link.href}
                isActive={isActive(link.href)}
                onClick={handleSmoothScroll}
              />
            </li>
          ))}
        </ul>

        {/* CTA desktop con micro-animación de pulso suave */}
        <div className="hidden md:flex items-center gap-3">
          <motion.div
            animate={{
              boxShadow: [
                "0 4px 16px -2px rgba(15,118,110,0.35)",
                "0 4px 24px -2px rgba(15,118,110,0.55)",
                "0 4px 16px -2px rgba(15,118,110,0.35)",
              ],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="rounded-2xl"
          >
            <Link
              ref={ctaRef}
              href="/registro"
              className={[
                "block px-5 py-2.5 rounded-2xl text-sm font-bold text-white",
                "transition-transform duration-200",
                "hover:-translate-y-0.5 active:translate-y-0",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
                "min-h-[44px] flex items-center",
              ].join(" ")}
              style={{
                background: "linear-gradient(135deg, #00B4A6 0%, #009690 100%)",
              }}
            >
              Empezar gratis
            </Link>
          </motion.div>
        </div>

        {/* Hamburger mobile */}
        <button
          type="button"
          className={[
            "md:hidden h-11 w-11 flex items-center justify-center rounded-xl",
            "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
            "transition-colors duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
          ].join(" ")}
          onClick={() => setIsMenuOpen((v) => !v)}
          aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu"
        >
          <AnimatePresence mode="wait" initial={false}>
            {isMenuOpen ? (
              <motion.span
                key="close"
                initial={{ rotate: -45, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 45, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </motion.span>
            ) : (
              <motion.span
                key="menu"
                initial={{ rotate: 45, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -45, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence initial={false}>
        {isMenuOpen && (
          <motion.div
            key="mobile-menu"
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.175, 0.885, 0.32, 1.275] }}
            className="md:hidden overflow-hidden bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800"
          >
            <ul
              className="max-w-7xl mx-auto px-5 py-4 flex flex-col gap-1"
              role="list"
            >
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={(e) => handleSmoothScroll(e, link.href)}
                    className={[
                      "block px-4 py-3 rounded-xl text-base font-medium transition-colors duration-200",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
                      isActive(link.href)
                        ? "text-[#00B4A6] bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 dark:text-[#2dd4bf]"
                        : "text-gray-700 dark:text-gray-300 hover:text-[#00B4A6] hover:bg-[#00B4A6]/5 dark:hover:text-[#2dd4bf]",
                    ].join(" ")}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li className="pt-2">
                <Link
                  href="/registro"
                  className={[
                    "block w-full text-center px-5 py-3 rounded-2xl text-base font-bold text-white",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
                    "min-h-[44px] flex items-center justify-center",
                  ].join(" ")}
                  style={{
                    background: "linear-gradient(135deg, #00B4A6 0%, #009690 100%)",
                    boxShadow: "0 4px 16px -2px rgba(15,118,110,0.4)",
                  }}
                  onClick={() => setIsMenuOpen(false)}
                >
                  Empezar gratis
                </Link>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
