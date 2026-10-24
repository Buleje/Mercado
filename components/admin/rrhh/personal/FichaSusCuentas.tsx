"use client";

/**
 * FichaSusCuentas — «que se vinculen los sistemas para evitar confusiones»
 * (Brandon 24-10). La misma persona puede estar también como persona suelta en
 * Mi Plata, proveedor, cliente o comunidad. Acá se ven juntas, cada una con su
 * cifra y el motivo (mismo documento o celular; nunca por el nombre).
 *
 * «Vincular» sólo une una persona de Mi Plata sin dueño (la misma acción que
 * «Cuenta en Adelantos»). «No es él» la esconde en ESTE navegador: recordar el
 * descarte para todos pide una tabla nueva (propuesta en el informe, sin
 * migrar).
 */

import { useEffect, useState } from "react";
import { EyeOff, Link2, Loader2, Users } from "@buleje/design-system/icons";
import { BlockTitle } from "@buleje/design-system";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { sinDato } from "@/lib/errores/sin-dato";
import {
  ETIQUETA_TIPO,
  textoDeMotivos,
  type OtrasCuentasDTO,
  type TonoCuenta,
} from "@/lib/rrhh/otras-cuentas";
import type { RrhhApiError } from "@/hooks/use-rrhh-puestos";
import { AvisoRrhh, BOTON } from "../rrhh-form";

interface Props {
  colaboradorId: string;
  /** Cambia cuando cambia su vínculo: vuelve a buscar. */
  version: string;
  guardando: boolean;
  onVincular: (
    beneficiarioId: string,
  ) => Promise<{ ok: true } | { ok: false; error: RrhhApiError }>;
  onCambio: () => void;
}

const TONO_CIFRA: Record<TonoCuenta, string> = {
  atencion: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  bien: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  neutro: "text-[var(--text-secondary)]",
};

export default function FichaSusCuentas({
  colaboradorId,
  version,
  guardando,
  onVincular,
  onCambio,
}: Props) {
  const [datos, setDatos] = useState<OtrasCuentasDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [noEs, setNoEs] = useLocalStorage<string[]>(`rrhh:no-es-el:${colaboradorId}`, []);
  const [verOcultas, setVerOcultas] = useState(false);

  useEffect(() => {
    let vigente = true;
    setError(null);
    fetch(`/api/rrhh/colaboradores/${colaboradorId}/cuentas`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok)
          throw new Error(
            res.status === 403
              ? "Sólo el dueño ve sus otras cuentas."
              : "No se pudieron buscar sus otras cuentas.",
          );
        const d = (await res.json()) as OtrasCuentasDTO;
        if (vigente) setDatos(d);
      })
      .catch((err: unknown) => {
        sinDato("RRHH sus cuentas")(err);
        if (vigente)
          setError(err instanceof Error ? err.message : "No se pudieron buscar sus otras cuentas.");
      });
    return () => {
      vigente = false;
    };
  }, [colaboradorId, version]);

  const vincular = async (id: string) => {
    setVinculando(id);
    setError(null);
    const r = await onVincular(id);
    setVinculando(null);
    if (!r.ok) return setError(r.error.message ?? "No se pudo vincular.");
    onCambio();
  };

  const todas = datos?.cuentas ?? [];
  const ocultas = todas.filter((c) => noEs.includes(c.clave));
  const visibles = verOcultas ? todas : todas.filter((c) => !noEs.includes(c.clave));
  const sinComoBuscar = datos && !datos.buscaPor.documento && !datos.buscaPor.celular;

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2">
        <BlockTitle as="h3">Sus otras cuentas</BlockTitle>
        <InfoTip
          title="Sus otras cuentas"
          what="La misma persona registrada en otro lado del sistema: Mi Plata, proveedores, clientes o comunidades. Se reconoce por su documento o su celular, nunca por el nombre."
          affects="«Vincular» une su cuenta de Mi Plata: sus adelantos se descuentan en su pago del sábado. «No es él» la esconde en este navegador."
          example="Juan Pérez trabaja contigo y también te vende madera: sale aquí como proveedor con lo que le debes."
        />
      </div>

      {!datos && !error && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando por su documento y celular…
        </p>
      )}
      {error && <AvisoRrhh tono="error">{error}</AvisoRrhh>}
      {sinComoBuscar && (
        <p className="text-sm text-[var(--text-tertiary)]">
          Sin documento ni celular no hay cómo encontrarlo: complétalos en «Editar».
        </p>
      )}
      {datos && !sinComoBuscar && todas.length === 0 && (
        <p className="text-sm text-[var(--text-tertiary)]">
          No hay otras cuentas con su documento o celular.
        </p>
      )}

      {visibles.length > 0 && (
        <ul className="divide-y divide-[var(--rule-base)]">
          {visibles.map((c) => {
            const oculta = noEs.includes(c.clave);
            return (
              <li
                key={c.clave}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5",
                  oculta && "opacity-60",
                )}
              >
                <Users className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm text-[var(--text-primary)]">
                    <EnlacePanel href={c.href}>{c.nombre}</EnlacePanel>
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {ETIQUETA_TIPO[c.tipo]} · {textoDeMotivos(c.por)}
                  </p>
                </div>
                {c.cifra && (
                  <span className={cn("text-sm font-semibold tabular-nums", TONO_CIFRA[c.tono])}>
                    {c.cifra}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {c.vinculable && !oculta && (
                    <button
                      type="button"
                      disabled={guardando || vinculando != null}
                      onClick={() => void vincular(c.id)}
                      className={BOTON.chico}
                    >
                      {vinculando === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}{" "}
                      Vincular
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setNoEs(oculta ? noEs.filter((k) => k !== c.clave) : [...noEs, c.clave])
                    }
                    className={BOTON.chicoFantasma}
                  >
                    <EyeOff className="h-4 w-4" /> {oculta ? "Sí es él" : "No es él"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {ocultas.length > 0 && (
        <button
          type="button"
          onClick={() => setVerOcultas((v) => !v)}
          className={BOTON.chicoFantasma}
        >
          {verOcultas
            ? "Esconder las que no son él"
            : `Mostrar ${ocultas.length === 1 ? "1 escondida" : `${ocultas.length} escondidas`}`}
        </button>
      )}
    </section>
  );
}
