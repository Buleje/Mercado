"use client";

import React, { useState, useRef, useEffect } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import { Settings, CreditCard, UserCircle, LogOut, ChevronDown, Store, ExternalLink } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BotonSoporte } from "@/components/admin/BotonSoporte";
import { useIdentidadNegocio } from "@/hooks/use-identidad-negocio";
import { LogoNegocio, TarjetaNegocio } from "@/components/admin/header/IdentidadNegocio";
import { ModalTipoDeNegocio } from "@/components/admin/header/ModalTipoDeNegocio";

interface AdminUserDropdownProps {
  userName: string;
  userRole: string;
  /** Respaldo mientras llega el membrete (o si el rol no lo puede leer). */
  tenantName?: string | null;
  tenantLogo?: string | null;
  /** «Ver mi tienda» (salió de la barra del encabezado el 24-10 y vive acá). */
  tenantSlug?: string | null;
  /** Encabezado con tema oscuro (Buleje/Ejecutivo): el nombre va en blanco. */
  onDarkHeader?: boolean;
  onNavigate: (tab: string) => void;
  onLogout: () => void;
}

/**
 * Botón de identidad del encabezado (Brandon 23-10): el logo, el nombre y el
 * rubro del negocio —antes arriba de la barra lateral— y, al abrirlo, la
 * tarjeta del negocio arriba y la cuenta del usuario abajo. Un solo botón.
 */
export default function AdminUserDropdown({ userName, userRole, tenantName, tenantLogo, tenantSlug, onDarkHeader = false, onNavigate, onLogout }: AdminUserDropdownProps) {
  const [open, setOpen] = useState(false);
  const [verRubro, setVerRubro] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Logo y nombre de Ajustes › Datos del negocio (ADR-514), rubro e ID de soporte (ADR-500).
  const identidad = useIdentidadNegocio({ nombre: tenantName, logoUrl: tenantLogo });
  const puedeCambiarRubro = userRole === "owner" || userRole === "admin";

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open]);

  const initials = userName
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  // Entradas fijas de la cuenta. «Mi perfil» ya no está en la barra lateral:
  // ésta es su puerta (plan «panel unificado», ola 2), junto al enlace de
  // Configuración › Usuarios y acceso. «plan» abre Configuración › Plan (alias).
  const MENU_ITEMS = [
    { id: "mi-perfil", label: "Mi perfil", icon: UserCircle, color: "text-[var(--text-secondary)]" },
    { id: "config", label: "Configuración", icon: Settings, color: "text-[var(--text-secondary)]" },
    { id: "plan", label: "Mi plan", icon: CreditCard, color: "text-[var(--text-secondary)]" },
  ];

  return (
    <div ref={ref} className="relative">
      {/* Trigger: logo siempre; nombre y rubro sólo si la cabecera tiene ancho (contenido ≥ 56 rem:
          a 1280 con la barra abierta mide 956 px). Bajo `sm` la cabecera es clara siempre. */}
      <button
        type="button"
        data-qa="menu-identidad"
        onClick={() => setOpen(v => !v)}
        className={cn(
          "flex h-11 items-center gap-1.5 rounded-xl pl-1 pr-1.5 transition-colors duration-[var(--dur-base)]",
          onDarkHeader ? "max-sm:hover:bg-[var(--surface-sunken)] sm:hover:bg-white/10" : "hover:bg-[var(--surface-sunken)]",
          open && (onDarkHeader ? "max-sm:bg-[var(--surface-sunken)] sm:bg-white/10" : "bg-[var(--surface-sunken)]")
        )}
        aria-label={`${identidad.nombre}: tu negocio y tu cuenta`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <LogoNegocio nombre={identidad.nombre} logoUrl={identidad.logoUrl} />
        {/* Brandon 24-10 «más corto»: sólo el nombre, en una línea; el rubro está en la tarjeta de adentro. */}
        <span
          title={identidad.nombre}
          className={cn(
            "hidden max-w-[8rem] truncate text-sm font-semibold @min-[56rem]:block",
            onDarkHeader ? "text-[var(--text-primary)] sm:text-white" : "text-[var(--text-primary)]",
          )}
        >
          {identidad.nombre}
        </span>
        <ChevronDown className={cn(
          "h-3.5 w-3.5 transition-transform duration-[var(--dur-base)] hidden sm:block",
          onDarkHeader ? "text-[var(--text-tertiary)] sm:text-white/70" : "text-[var(--text-tertiary)]",
          open && "rotate-180"
        )} />
      </button>

      {/* Dropdown menu */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden z-100"
          >
            {/* El negocio arriba: logo, nombre, rubro, RUC e ID de soporte. */}
            <TarjetaNegocio
              identidad={identidad}
              onCambiarRubro={puedeCambiarRubro ? () => { setOpen(false); setVerRubro(true); } : undefined}
            />

            {/* Debajo, quién está usando el panel. */}
            <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] px-4 py-3">
              <div className="h-8 w-8 rounded-full bg-[var(--accent-dark)] flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate capitalize">{userName}</p>
                <p className="text-xs text-[var(--text-secondary)] capitalize">{userRole}</p>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1.5 px-1.5">
              {MENU_ITEMS.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 min-h-12 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", item.color)} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              {tenantSlug && (
                <a
                  href={`/t/${tenantSlug}/tienda`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-3 px-3 min-h-12 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <Store className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                  <span className="flex-1">Ver mi tienda</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-label="Se abre en una pestaña nueva" />
                </a>
              )}
              <BotonSoporte variante="menu" alNavegar={() => setOpen(false)} />
            </div>

            {/* Logout divider */}
            <div className="border-t border-[var(--rule-soft)] py-1.5 px-1.5">
              <button
                onClick={() => { onLogout(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-medium text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {puedeCambiarRubro && (
        <ModalTipoDeNegocio
          open={verRubro}
          onClose={() => setVerRubro(false)}
          rubro={identidad.rubro}
          detalle={identidad.rubroDetalle}
        />
      )}
    </div>
  );
}
