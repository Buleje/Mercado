import type { Metadata } from "next";
import Link from "next/link";
import SocialProofToast from "@/components/marketing/SocialProofToast";
import MotionProvider from "@/components/MotionProvider";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.pe";

export const metadata: Metadata = {
  title: {
    default: "Buleje — Sistema ERP para bodegas y minimarkets en Perú",
    template: "%s | Buleje",
  },
  description:
    "Gestiona tu bodega o minimarket con el sistema ERP más completo del Perú. POS, inventario, delivery, WhatsApp y más. Empieza gratis hoy.",
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: "/plataforma" },
  openGraph: {
    type: "website",
    locale: "es_PE",
    siteName: "Buleje",
    title: "Buleje — Sistema ERP para bodegas y minimarkets en Perú",
    description:
      "POS, inventario FEFO, delivery, WhatsApp, reportes y 100+ módulos. Desde S/0/mes. Regístrate en 2 minutos.",
    url: BASE_URL,
    images: [
      {
        url: `${BASE_URL}/api/og`,
        width: 1200,
        height: 630,
        alt: "Buleje ERP — Tu bodega, en línea",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Buleje — ERP para bodegas en Perú",
    description:
      "Gestiona tu bodega completa desde S/0/mes. POS, inventario, delivery y más.",
  },
  robots: { index: true, follow: true },
  keywords: [
    "ERP bodega Perú",
    "sistema de gestión minimarket",
    "punto de venta bodega",
    "software bodega Pucallpa",
    "inventario FEFO",
    "delivery bodega",
    "POS minimarket",
  ],
};

const NAV_LINKS = [
  { href: "/plataforma", label: "Inicio" },
  { href: "/plataforma#planes", label: "Planes" },
  { href: "/plataforma/registro", label: "Registro" },
  { href: "/admin", label: "Iniciar sesión" },
];

const CURRENT_YEAR = 2026;

const FOOTER_LINKS = [
  { href: "/terminos", label: "Términos" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/plataforma/registro", label: "Crear cuenta" },
  { href: "/admin", label: "Iniciar sesión" },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-[var(--text-primary)]">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
            <span className="text-xl font-bold tracking-tight text-primary">Buleje</span>
            <span className="hidden text-xs font-medium text-muted sm:inline-block">
              ERP para bodegas
            </span>
          </Link>

          {/* Links de navegación */}
          <ul className="flex items-center gap-1 sm:gap-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                {link.label === "Registro" ? (
                  <Link
                    href={link.href}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] inline-flex items-center"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <Link
                    href={link.href}
                    className="rounded-md px-3 py-2 text-sm font-medium text-[var(--text-primary)]/70 transition-colors hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] inline-flex items-center dark:text-[var(--text-primary)]/60 dark:hover:text-[var(--text-primary)]"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* ── Contenido principal ─────────────────────────────────────────── */}
      <MotionProvider>
        <main id="main-content" className="flex-1">
          {children}
        </main>
      </MotionProvider>

      {/* Social proof toast — shows recent activity to boost conversion */}
      <SocialProofToast />

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60 bg-surface dark:bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted">
              &copy; {CURRENT_YEAR} Buleje — Pucallpa, Perú
            </p>
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition-colors hover:text-primary dark:hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
