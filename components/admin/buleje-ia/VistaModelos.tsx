"use client";

/**
 * Modelos: con qué IA contesta Buleje IA. El negocio pega la clave de la que
 * más le guste (ChatGPT, Claude, Gemini, DeepSeek, Qwen…); sin ninguna, usa
 * la de la plataforma, que no lee fotos.
 */
import { useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import { CardTitle, ErrorAlert, InfoAlert, SectionTitle } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { button } from "@/components/ui-system/button-variants";
import { useConfirm } from "@/components/ui-system/ConfirmModal";
import type { ProveedorCatalogo, ProveedorConfigurado } from "@/lib/ia-proveedores/tipos";
import type { BulejeIaModelos } from "@/hooks/use-buleje-ia-modelos";
import { FormProveedor } from "./FormProveedor";
import { PILDORA, TarjetaModelo } from "./TarjetaModelo";

const GRATIS = `${PILDORA} bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]`;
const FOTOS = `${PILDORA} bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]`;

export function VistaModelos({ modelos }: { modelos: BulejeIaModelos }) {
  const [abierto, setAbierto] = useState<ProveedorCatalogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const borrar = async (p: ProveedorConfigurado) => {
    const ok = await confirm({
      title: `¿Borrar ${p.nombre}?`,
      description: p.principal ? "Es el que contesta ahora. Si lo borras, contesta otro o la IA de la plataforma." : "Se borra su clave de tu negocio.",
      intent: "danger",
      confirmLabel: "Borrar",
    });
    if (!ok) return;
    const r = await modelos.borrar(p.id);
    if (!r.ok) setError(r.error);
    else modelos.recargar();
  };

  if (modelos.cargando && modelos.catalogo.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Cargando los modelos…
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        {modelos.error && (
          <ErrorAlert
            title="No pude cargar los modelos"
            description={modelos.error}
            action={
              <Button variant="secondary" onClick={modelos.recargar}>
                Reintentar
              </Button>
            }
          />
        )}
        {error && <ErrorAlert description={error} />}

        <section className="space-y-3">
          <SectionTitle>Tus modelos</SectionTitle>
          {modelos.configurados.length === 0 ? (
            <InfoAlert
              title="Estás usando la IA de la plataforma (no lee fotos)"
              description="Para que lea tus recibos y guías, conecta abajo la IA que más te guste con tu propia clave."
            />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {modelos.configurados.map((p) => (
                <TarjetaModelo key={p.id} p={p} modelos={modelos} onBorrar={(x) => void borrar(x)} />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <SectionTitle>Agregar un modelo</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modelos.catalogo.map((c) => {
              const ve = c.modelosSugeridos.some((m) => m.vision);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setAbierto(c)}
                    className={button({
                      variant: "secondary",
                      fullWidth: true,
                      className: "h-full min-h-24 flex-col items-start justify-start gap-1 whitespace-normal rounded-2xl p-4 text-left font-normal",
                    })}
                  >
                    <CardTitle as="span">{c.nombre}</CardTitle>
                    <span className="text-xs text-[var(--text-tertiary)]">{c.empresa}</span>
                    <span className="text-sm text-[var(--text-secondary)]">{c.ayuda}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {c.gratis && <span className={GRATIS}>Gratis para empezar</span>}
                      {ve && <span className={FOTOS}>Lee fotos</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {abierto && (
        <FormProveedor proveedor={abierto} modelos={modelos} esElPrimero={modelos.configurados.length === 0} onCerrar={() => setAbierto(null)} />
      )}
      <ConfirmDialog />
    </div>
  );
}
