"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, Loader2, Pencil, Check, Mail, ExternalLink, Store, LayoutGrid, MessageSquare } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import type { TenantRow } from "@/lib/superadmin-types";
import { CodigoTienda } from "@/components/superadmin/_shared/CodigoTienda";
import { PlanBadge, StatusBadge } from "@/components/superadmin/_shared";
import { suplantarTienda } from "@/components/superadmin/tenants/abrir-panel-tienda";
import type { TenantDetalle } from "@/components/superadmin/tenants/useTenantDetalle";

const CAMPO =
  "w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";

/** Botón secundario de la barra: cuadrado de 48 px a 400, con texto desde sm. */
const SECUNDARIA = "w-12 px-0 sm:w-auto sm:px-4";

/** Logo de la tienda o sus 2 primeras letras (como la tarjeta de la lista). */
function LogoTienda({ t }: { t: TenantRow }) {
  const [roto, setRoto] = useState(false);
  const caja = "h-12 w-12 shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]";
  if (t.logoUrl && !roto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logo externo sin remotePatterns
      <img src={t.logoUrl} alt="" className={`${caja} object-cover`} onError={() => setRoto(true)} />
    );
  }
  return (
    <div aria-hidden="true" className={`${caja} flex items-center justify-center text-base font-bold text-[var(--text-primary)]`}>
      {t.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

interface CabeceraProps {
  t: TenantRow;
  d: TenantDetalle;
  tituloId: string;
  onClose: () => void;
  cancelarEdicion: () => void;
  /** «Panel admin»: la suplantación de la página (toasts + candado). Sin esto, la ficha suplanta sola. */
  onImpersonate?: (slug: string) => void | Promise<void>;
}

/** Cabecera de la ficha rápida: identidad (con edición en el lugar) + acciones rápidas. */
export function TenantDetalleCabecera({ t, d, tituloId, onClose, cancelarEdicion, onImpersonate }: CabeceraProps) {
  const { editing, setEditing, nameInput, setNameInput, emailInput, setEmailInput, savingEdit, handleSaveEdit, enfocarCorreo, setTab } = d;
  const [abriendo, setAbriendo] = useState(false);
  const [errorPanel, setErrorPanel] = useState(false);
  // Al abrir la edición, el foco al campo que se pidió (el correo si vino de «Agregar correo»).
  const nombreRef = useRef<HTMLInputElement>(null);
  const correoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) (enfocarCorreo ? correoRef : nombreRef).current?.focus();
  }, [editing, enfocarCorreo]);

  const abrirPanel = async () => {
    setErrorPanel(false);
    setAbriendo(true);
    try {
      if (onImpersonate) await onImpersonate(t.slug);
      else if ((await suplantarTienda(t.slug, () => setTab("credenciales"))) === "error") setErrorPanel(true);
    } finally {
      setAbriendo(false);
    }
  };

  const badges = (
    <>
      <PlanBadge plan={t.plan} />
      <StatusBadge active={t.active} />
    </>
  );

  return (
    <>
      <header className="flex items-start gap-3 border-b border-[var(--rule-base)] px-4 py-4 sm:px-6">
        <LogoTienda t={t} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSaveEdit();
              }}
            >
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                aria-label="Nombre de la tienda"
                ref={nombreRef}
                className={`${CAMPO} h-10 text-base font-bold`}
              />
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                aria-label="Correo de la dueña o dueño"
                placeholder="correo de la dueña o dueño"
                ref={correoRef}
                className={`${CAMPO} h-10 text-sm`}
              />
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={savingEdit} className={button({ variant: "primary", size: "md" })}>
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
                </button>
                <button type="button" onClick={cancelarEdicion} className={button({ variant: "ghost", size: "md" })}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* El lápiz va AL LADO del título, nunca dentro (ley de la vista). */}
              <div className="flex min-w-0 items-center gap-1">
                <SectionTitle id={tituloId} className="truncate">
                  {t.name}
                </SectionTitle>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  title="Editar nombre y correo"
                  aria-label="Editar nombre y correo"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                <CodigoTienda codigo={t.codigo} tamano="md" />
                <span className="min-w-0 truncate font-mono text-[var(--text-secondary)]">{t.slug}</span>
                {t.ownerEmail && (
                  <span className="inline-flex min-w-0 items-center gap-1 text-[var(--text-secondary)]">
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t.ownerEmail}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5 sm:hidden">{badges}</span>
              </div>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-2 sm:flex">{badges}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar (Esc)"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Acciones rápidas: la principal primero (entrar al panel de la tienda). A 400 px las
          otras tres quedan en ícono (con nombre para el lector) y todo entra en una fila. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-base)] px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => void abrirPanel()}
          disabled={abriendo}
          aria-label={`Abrir el panel admin de ${t.name}`}
          className={button({ variant: "primary", className: "flex-1 px-4 sm:flex-none" })}
        >
          {abriendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Panel admin
        </button>
        <a
          href={`/t/${encodeURIComponent(t.slug)}/tienda`}
          target="_blank"
          rel="noopener noreferrer"
          title="La tienda pública, en otra pestaña"
          aria-label="Ir a tienda"
          className={button({ variant: "secondary", className: SECUNDARIA })}
        >
          <Store className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Ir a tienda</span>
        </a>
        <Link href={`/superadmin/tenants/${t.slug}`} title="Ficha 360 del negocio" aria-label="Ficha 360" className={button({ variant: "secondary", className: SECUNDARIA })}>
          <LayoutGrid className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Ficha 360</span>
        </Link>
        <Link
          href={`/superadmin/chat?tenant=${t.id}&name=${encodeURIComponent(t.name)}`}
          title="Chatear con este negocio"
          aria-label="Chat"
          className={button({ variant: "secondary", className: SECUNDARIA })}
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Chat</span>
        </Link>
        {errorPanel && (
          <p role="alert" className="w-full text-xs font-semibold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">
            No se pudo abrir el panel. Vuelve a intentarlo.
          </p>
        )}
      </div>
    </>
  );
}
