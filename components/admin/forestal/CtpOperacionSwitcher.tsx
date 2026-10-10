"use client";

/**
 * El switch de operaciones de la cabina del libro (ADR-395).
 *
 * «Operación: Aserrío ▾» — abre la lista de libros hermanos de la misma planta
 * y cambia al elegido en un clic: el servidor emite la sesión del otro libro y
 * la página se recarga ya adentro, en la misma vista. Desde acá también se
 * funda la primera hermana («Nueva operación…»).
 *
 * Un libro único no muestra nada salvo la puerta para crear la primera: una
 * cabina con un desplegable de una sola opción es ruido.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Layers, Loader2, Plus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import type { GrupoOperaciones } from "@/lib/forestal/ctp-operaciones";
import { nombreDeOperacionValido } from "@/lib/forestal/ctp-operaciones";
import { Btn, I, MODAL_BODY, ModalFooter } from "./ctp-shared";

interface Estado {
  grupo: GrupoOperaciones | null;
  actual: { slug: string; nombre: string };
  puedeCrear: boolean;
}

export default function CtpOperacionSwitcher({ vista }: { vista: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState(false);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/forestal/operaciones", { credentials: "include" });
      if (r.ok) setEstado((await r.json()) as Estado);
    } catch {
      /* sin red: la cabina sigue sin el switch */
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiar = async (slug: string) => {
    setCambiando(slug);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/operaciones/cambiar", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ slug }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      /* El servidor ya dejó las cookies del otro libro; los storages por
         pestaña se actualizan acá y la página se recarga en la misma vista. */
      try {
        sessionStorage.setItem("active-tenant-slug", slug);
        localStorage.setItem("active-tenant-slug", slug);
      } catch {
        /* sin storage, la cookie alcanza */
      }
      window.location.assign(`/admin?tab=ctp-libro-operaciones&vista=${encodeURIComponent(vista)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCambiando(null);
    }
  };

  if (!estado) return null;
  const ops = estado.grupo?.operaciones ?? [];
  const hayGrupo = ops.length > 1;
  if (!hayGrupo && !estado.puedeCrear) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={
          hayGrupo
            ? "Cambiar de operación de esta planta"
            : "Crear una segunda operación para esta planta"
        }
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-canvas)]"
      >
        <Layers className="h-4 w-4" />
        <span className="max-lg:sr-only">
          {hayGrupo ? (
            <>
              <span className="text-[var(--text-tertiary)]">Operación:</span> {estado.actual.nombre}
            </>
          ) : (
            "Operaciones"
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-lg)]"
        >
          {ops.map((o) => (
            <button
              key={o.slug}
              type="button"
              role="menuitem"
              disabled={o.actual || !o.accesible || cambiando != null}
              onClick={() => void cambiar(o.slug)}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--surface-sunken)] disabled:cursor-default disabled:opacity-70"
            >
              <span className="font-bold text-[var(--text-primary)]">{o.nombre}</span>
              <span className="text-xs text-[var(--text-tertiary)]">
                {o.actual ? (
                  "estás acá"
                ) : !o.accesible ? (
                  "sin acceso"
                ) : cambiando === o.slug ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  o.slug
                )}
              </span>
            </button>
          ))}
          {estado.puedeCrear && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                setNueva(true);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-xl border-t border-[var(--rule-soft)] px-3 py-2 text-left text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-primary"
            >
              <Plus className="h-4 w-4" /> Nueva operación…
            </button>
          )}
          {error && (
            <p className="px-3 py-2 text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {error}
            </p>
          )}
        </div>
      )}

      {nueva && (
        <NuevaOperacionModal
          esPrimera={!hayGrupo}
          nombreActual={estado.actual.nombre}
          onClose={() => setNueva(false)}
          onCreada={(slug) => {
            setNueva(false);
            void cargar();
            void cambiar(slug);
          }}
        />
      )}
    </div>
  );
}

/**
 * «Nueva operación»: el nombre de la hermana y, si es la primera, cómo se va a
 * llamar de ahora en más el libro actual (hasta hoy no necesitaba nombre).
 */
function NuevaOperacionModal({
  esPrimera,
  nombreActual,
  onClose,
  onCreada,
}: {
  esPrimera: boolean;
  nombreActual: string;
  onClose: () => void;
  onCreada: (slug: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [actual, setActual] = useState(nombreActual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalido = nombreDeOperacionValido(nombre);

  async function crear() {
    if (invalido) {
      setError(invalido);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/operaciones", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          nombre: nombre.trim(),
          nombreActual: esPrimera ? actual.trim() : undefined,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
      onCreada(body.operacion.slug as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      title="Nueva operación de esta planta"
      description="Un libro CTP completo y aparte: mismos usuarios y contraseñas, misma Ficha, sus propios asientos, saldos y cierres."
      icon={Layers}
      footer={
        <ModalFooter>
          <Btn variant="secondary" size="md" onClick={onClose} disabled={guardando}>
            Cancelar
          </Btn>
          <Btn
            variant="dark"
            size="md"
            onClick={() => void crear()}
            disabled={guardando || Boolean(invalido)}
          >
            {guardando ? "Creando…" : "Crear y entrar"}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        {esPrimera && (
          <label className="block text-sm">
            <span className="mb-1 block font-bold text-[var(--text-primary)]">
              Cómo se llama la operación actual
            </span>
            <input
              type="text"
              className={I}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder="Ej.: Aserrío"
            />
            <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
              Hasta hoy era el único libro; con dos, cada uno necesita nombre.
            </span>
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-bold text-[var(--text-primary)]">
            Nombre de la nueva operación
          </span>
          <input
            type="text"
            className={I}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Secado y cepillado"
          />
        </label>
        {error && (
          <p className="rounded-xl border-2 border-[var(--data-error-500)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
