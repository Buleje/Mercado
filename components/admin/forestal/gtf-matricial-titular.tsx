"use client";

/**
 * De quién es el talonario que se acomoda: hay UNA disposición por titular
 * (Brandon 15-10), la misma identidad con que se numeran sus guías. Mientras
 * el titular no guarda la suya, se ve la de la empresa (o la de fábrica).
 *
 * «Copiar de otro titular» trae las dos hojas (guía y lista) de otro talonario
 * guardado: queda sin guardar, y Ctrl+Z la deshace hoja por hoja.
 */

import { useState, type ReactNode } from "react";
import { Building2, Copy } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { DisposicionTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { limaDateKey } from "@/lib/utils";
import { RUTA_TALONARIO, type EstadoGtfMatricial, type InfoTalonario } from "./hooks/use-gtf-matricial";
import { CAJA, SUBTITULO } from "./gtf-matricial-panel";

const EMPRESA = "empresa";

function estado(info: InfoTalonario): { chip: string; ayuda: string } {
  if (!info.titular) {
    return info.origen === "fabrica"
      ? { chip: "De fábrica", ayuda: "La guía no tiene titular y la empresa no guardó su talonario: ves el de fábrica. Al guardar, queda como el de la empresa." }
      : { chip: "De la empresa", ayuda: "La guía no tiene titular: lo que guardes es el talonario de la empresa, el que copian los titulares sin uno propio." };
  }
  if (info.origen === "titular") return { chip: "Propio", ayuda: "Este titular ya tiene su talonario: lo que guardes vale sólo para sus guías." };
  return info.origen === "empresa"
    ? { chip: "Copia de la empresa", ayuda: "Este titular todavía no tiene el suyo: ves el de la empresa. Al guardar queda como suyo, y el de la empresa no cambia." }
    : { chip: "De fábrica", ayuda: "Nadie guardó un talonario todavía: ves el de fábrica. Al guardar queda como el de este titular." };
}

const cuando = (iso: string | null): string => {
  const k = iso ? limaDateKey(iso) : "";
  return k ? `Guardado el ${etiquetaLarga(k)}` : "Guardado";
};

export default function TitularTalonario({ t, accion }: { t: EstadoGtfMatricial; accion?: ReactNode }) {
  const [copiando, setCopiando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const info = t.info;
  if (!info) return null;
  const { chip, ayuda } = estado(info);
  const nombre = info.titular?.nombre ?? "La empresa";

  const copiar = async (de: string) => {
    setCopiando(de);
    setError(null);
    try {
      const r = await fetch(`${RUTA_TALONARIO}?de=${encodeURIComponent(de)}`, { credentials: "include" });
      let j: { disposicion?: DisposicionTalonario; message?: string } | null = null;
      try {
        j = await r.json();
      } catch {
        j = null;
      }
      if (!r.ok || !j?.disposicion) throw new Error(j?.message ?? `No se pudo traer ese talonario (${r.status})`);
      t.reemplazarTodo(j.disposicion);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopiando(null);
    }
  };

  const acciones: MenuAccion[] = [
    ...(info.titular && info.hayEmpresa
      ? [{ id: EMPRESA, label: "El de la empresa", hint: "El que copian los titulares sin uno propio", icon: Building2, onSelect: () => void copiar(EMPRESA), busy: copiando === EMPRESA }]
      : []),
    ...info.titulares
      .filter((x) => x.clave !== info.titular?.clave)
      .map((x) => ({ id: x.clave, label: x.nombre, hint: cuando(x.actualizado), icon: Copy, onSelect: () => void copiar(x.clave), busy: copiando === x.clave })),
  ];

  return (
    <section className={CAJA} aria-label="De quién es el talonario">
      <div className="flex min-w-0 items-start gap-1">
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Talonario de</span>
          <span className={`${SUBTITULO} block`} title={nombre}>
            {nombre}
          </span>
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
            {chip}
            <InfoTip title={chip} what={ayuda} affects="Imprimir usa siempre el talonario del titular de la guía." />
          </span>
        </div>
        {accion}
      </div>
      <ActionMenu
        label="Copiar de otro titular"
        icon={Copy}
        actions={acciones}
        disabled={acciones.length === 0}
        title={acciones.length ? "Trae la guía y la lista de otro talonario guardado" : "Todavía no hay otro talonario guardado"}
        className="w-full"
      />
      {error && (
        <span role="alert" className="text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </span>
      )}
    </section>
  );
}
