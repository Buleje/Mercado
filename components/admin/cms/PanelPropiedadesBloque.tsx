"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { Save } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared/admin-tokens";
import { CAMPOS_POR_BLOQUE, nombreDeBloque } from "./campos-bloques";
import type { BloqueEditable } from "@/hooks/use-cms-page-editor";

const CAMPO =
  "w-full px-3 h-11 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

interface Props {
  bloque: BloqueEditable;
  guardando: boolean;
  onGuardar: (props: Record<string, unknown>) => void;
}

/** Los campos de un bloque. El borrador vive aquí; sólo «Guardar» lo manda al servidor. */
export default function PanelPropiedadesBloque({ bloque, guardando, onGuardar }: Props) {
  const idBase = useId();
  const guardado = JSON.stringify(bloque.props);
  const [borrador, setBorrador] = useState<Record<string, unknown>>(bloque.props);
  const campos = CAMPOS_POR_BLOQUE[bloque.type] ?? [];

  // Otro bloque elegido, o el servidor devolvió el suyo: se parte de lo guardado.
  useEffect(() => {
    setBorrador(JSON.parse(guardado) as Record<string, unknown>);
  }, [bloque.id, guardado]);

  const poner = (key: string, valor: unknown) => setBorrador((b) => ({ ...b, [key]: valor }));

  return (
    <aside className="w-full lg:w-80 shrink-0 bg-[var(--surface-raised)] border-t lg:border-t-0 lg:border-l border-[var(--rule-base)] overflow-y-auto flex flex-col" aria-label="Editar bloque">
      <div className="px-4 py-3 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] sticky top-0 z-10">
        <CardTitle className="text-base font-bold">Editar «{nombreDeBloque(bloque.type)}»</CardTitle>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {campos.length === 0 && <p className={ADMIN_TOKENS.bodyText}>Este bloque no tiene campos para editar.</p>}
        {campos.map((c) => {
          const id = `${idBase}-${c.key}`;
          const val = borrador[c.key];
          const texto = typeof val === "string" ? val : "";
          return (
            <div key={c.key}>
              <label htmlFor={id} className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">
                {c.label}
              </label>
              {c.type === "boolean" ? (
                <button
                  id={id}
                  type="button"
                  role="switch"
                  aria-checked={Boolean(val)}
                  onClick={() => poner(c.key, !val)}
                  className={`flex items-center gap-2 w-full px-3 min-h-11 rounded-lg border-2 text-sm font-semibold transition-colors ${
                    val
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                  }`}
                >
                  {val ? "Activado" : "Desactivado"}
                </button>
              ) : c.type === "color" ? (
                <div className="flex items-center gap-2">
                  <input
                    id={id}
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(texto) ? texto : "#000000"}
                    onChange={(e) => poner(c.key, e.target.value)}
                    className="h-11 w-16 rounded-lg border border-[var(--rule-base)] cursor-pointer bg-transparent"
                    aria-label={`${c.label} (selector)`}
                  />
                  <input
                    type="text"
                    value={texto}
                    onChange={(e) => poner(c.key, e.target.value)}
                    placeholder="Sin color"
                    className={CAMPO}
                    aria-label={`${c.label} (código)`}
                  />
                </div>
              ) : c.type === "textarea" ? (
                <textarea
                  id={id}
                  value={texto}
                  onChange={(e) => poner(c.key, e.target.value)}
                  placeholder={c.placeholder}
                  rows={4}
                  className={`${CAMPO} h-auto py-2 resize-y`}
                />
              ) : (
                <input
                  id={id}
                  type="text"
                  value={texto}
                  onChange={(e) => poner(c.key, e.target.value)}
                  placeholder={c.placeholder}
                  className={CAMPO}
                />
              )}
              {c.type === "url" && /^https?:\/\//.test(texto) && (
                <div className="relative mt-2 w-full h-24 rounded-lg overflow-hidden border border-[var(--rule-base)]">
                  <Image
                    src={texto}
                    alt={`Vista previa: ${c.label}`}
                    fill
                    unoptimized
                    className="object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] sticky bottom-0">
        <button type="button" onClick={() => onGuardar(borrador)} disabled={guardando} className={`${ADMIN_TOKENS.btnPrimary} w-full min-h-11`}>
          <Save className="w-4 h-4" aria-hidden />
          {guardando ? "Guardando…" : "Guardar bloque"}
        </button>
      </div>
    </aside>
  );
}
