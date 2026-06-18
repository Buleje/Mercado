"use client";

/**
 * LoginRoleMenu — botón "Ingresar" con dropdown de accesos por tipo de usuario.
 *
 * Reemplaza el botón que abría directo el modal de cliente: ahora despliega un
 * menú para elegir cómo entrar (cliente, negocio, repartidor, proveedor) y
 * loguearse más rápido sin buscar la ruta. "Soy cliente" mantiene el modal
 * rápido; el resto navega a su login.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogIn, ChevronDown, User, Store, Truck, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface RoleLink {
  key: string;
  label: string;
  hint: string;
  icon: typeof User;
  href?: string;
}

const ROLES: RoleLink[] = [
  { key: "negocio", label: "Mi negocio", hint: "Dueño, cajero o almacenero", icon: Store, href: "/admin/login" },
  { key: "repartidor", label: "Repartidor", hint: "App de entregas", icon: Truck, href: "/delivery-app/login" },
  { key: "proveedor", label: "Proveedor", hint: "Portal de abastecimiento", icon: Package, href: "/supplier" },
];

export function LoginRoleMenu({
  onClienteLogin,
  loginLabel,
}: {
  onClienteLogin: () => void;
  loginLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cliente = useCallback(() => {
    setOpen(false);
    onClienteLogin();
  }, [onClienteLogin]);

  return (
    <div className="relative" ref={ref} data-tour="user-menu">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-[var(--text-primary)] px-5 h-10 text-sm font-extrabold text-[var(--surface-raised)]",
          "hover:opacity-90 active:scale-[0.98] transition-all duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        )}
      >
        {loginLabel}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden strokeWidth={2.5} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Elegí cómo ingresar"
          className="absolute right-0 top-full mt-2 w-72 overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)] z-50"
        >
          {/* Cliente — acción rápida (mantiene el modal) */}
          <button
            onClick={cliente}
            role="menuitem"
            className="flex w-full items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--accent-soft)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-alt)]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white">
              <User className="h-4.5 w-4.5" aria-hidden strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[var(--text-primary)]">Soy cliente</span>
              <span className="block text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">Comprar en el marketplace</span>
            </span>
          </button>

          <div className="py-1.5">
            <p className="px-4 pb-1 pt-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              Acceso de trabajo
            </p>
            {ROLES.map((r) => {
              const Icon = r.icon;
              return (
                <Link
                  key={r.key}
                  href={r.href ?? "#"}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-alt)]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                    <Icon className="h-4.5 w-4.5" aria-hidden strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{r.label}</span>
                    <span className="block text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{r.hint}</span>
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="border-t border-[var(--rule-soft)] px-4 py-2.5">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--accent)] hover:underline"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden /> Ver todas las formas de ingresar
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
