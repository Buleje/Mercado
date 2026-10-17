"use client";

/**
 * FichaUsuarioPanel — vincular a la persona con su usuario del panel (el
 * cajero o almacenero que además es parte del personal). Vivía dentro de la
 * ficha; si vincular fallaba, no se mostraba nada.
 */

import { useState } from "react";
import { Link2, Link2Off, Loader2 } from "@buleje/design-system/icons";
import { BlockTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { BOTON, CLASE_CAMPO } from "../rrhh-form";
import type { UseRrhhFichaResult } from "@/hooks/use-rrhh-ficha";
import type { FichaColaboradorDTO } from "@/lib/rrhh/tipos";

interface UsuarioDelPanel {
  id: string;
  username: string;
  role: string;
}

interface Props {
  adminUser: FichaColaboradorDTO["vinculo"]["adminUser"];
  guardando: boolean;
  accion: UseRrhhFichaResult["accion"];
  onCambio: () => void;
}

export default function FichaUsuarioPanel({ adminUser, guardando, accion, onCambio }: Props) {
  const [eligiendo, setEligiendo] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioDelPanel[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    setEligiendo(true);
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-users", { credentials: "include" });
      // `/api/admin-users` exige rol admin (no owner) — un owner de nivel
      // completo puede llegar hasta acá y recibir 403: se explica en vez de
      // mostrar un error crudo.
      if (res.status === 403) {
        setError("Sólo un administrador puede vincular un usuario del panel.");
        return;
      }
      if (!res.ok) {
        setError("No se pudo cargar la lista de usuarios.");
        return;
      }
      setUsuarios((await res.json()) as UsuarioDelPanel[]);
    } catch {
      setError("No se pudo cargar la lista de usuarios.");
    } finally {
      setCargando(false);
    }
  };

  const vincular = async (adminUserId: string | null) => {
    setError(null);
    const res = await accion({ action: "vincular_usuario", adminUserId });
    if (!res.ok) {
      setError(res.error.message ?? "No se pudo guardar el vínculo.");
      return;
    }
    setEligiendo(false);
    onCambio();
  };

  const cerrar = () => {
    setEligiendo(false);
    setError(null);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div>
        <BlockTitle as="h3">Usuario del panel</BlockTitle>
        <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">Para quien además entra al panel, como el cajero o el almacenero.</p>
      </div>

      {adminUser ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5">
          <p className="text-sm text-[var(--text-primary)]">
            <span className="font-semibold">{adminUser.username}</span> <span className="text-[var(--text-tertiary)]">· {adminUser.role}</span>
          </p>
          <button type="button" disabled={guardando} onClick={() => vincular(null)} className={BOTON.chicoFantasma}>
            <Link2Off className="h-4 w-4" /> Desvincular
          </button>
        </div>
      ) : !eligiendo ? (
        <button type="button" onClick={abrir} className={BOTON.chico}>
          <Link2 className="h-4 w-4" /> Vincular a un usuario
        </button>
      ) : cargando ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando usuarios…
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {usuarios && usuarios.length > 0 && (
            <select
              aria-label="Elegir usuario del panel"
              disabled={guardando}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void vincular(e.target.value);
              }}
              className={cn(CLASE_CAMPO, "w-full sm:w-72")}
            >
              <option value="" disabled>
                Elegir usuario…
              </option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} · {u.role}
                </option>
              ))}
            </select>
          )}
          {usuarios && usuarios.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">No hay usuarios del panel para vincular.</p>}
          <button type="button" onClick={cerrar} className={BOTON.chicoFantasma}>
            Cancelar
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
    </section>
  );
}
