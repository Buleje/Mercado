"use client";

/**
 * LibretaModal — la libreta (el Directorio) en una ventana encima de la guía.
 *
 * Brandon 15-10-2026: «al usar la libreta, quiero que aparezca un modal para
 * poder elegir la información de esa libreta y agregar también nueva
 * información». Dos pasos en la misma ventana:
 *
 *   · Elegir — buscador + las partes con ESTE papel, por uso; abajo, las que
 *     están en la libreta con otro papel (elegir una le suma este).
 *   · Agregar — el alta, arrancando con lo ya tipeado en la guía. Se guarda en
 *     el Directorio y se usa en la guía en el mismo gesto.
 *
 * Va con `aboveModals`: la guía ya es un modal, y esta capa se monta encima con
 * su propio Escape (cierra sólo la libreta, no la guía). Por eso mismo antes era
 * una barra desplegable: sin esa capa, Escape cerraba la de abajo.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Plus, Search, Users } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import {
  ROL_LABEL,
  ROL_PLURAL,
  direccionCompleta,
  faltantesParaGuia,
  filtrarPartes,
  type Parte,
  type ParteInput,
  type RolParte,
} from "@/lib/forestal/directorio";
import type { ValorParte } from "./CtpParteBarra";
import AltaDeParte from "./libreta-alta-parte";
import { Btn, I } from "./ctp-shared";

export default function LibretaModal({
  rol,
  titulo,
  opciones,
  otras,
  borrador,
  conExtras,
  puedeAgregar,
  onUsar,
  onUsarConOtroRol,
  onAgregar,
  onCerrar,
}: {
  rol: RolParte;
  /** Cómo se llama el bloque en la guía («Punto de partida»); por defecto, el papel. */
  titulo?: string;
  opciones: Parte[];
  otras: Parte[];
  borrador: ValorParte;
  conExtras: boolean;
  puedeAgregar: boolean;
  onUsar: (p: Parte) => void;
  onUsarConOtroRol: (p: Parte) => void;
  /** Guarda en el Directorio y aplica a la guía. Tira con el motivo si no se pudo. */
  onAgregar: (input: ParteInput, valor: ValorParte) => Promise<void>;
  onCerrar: () => void;
}) {
  const vacia = opciones.length === 0 && otras.length === 0;
  const [paso, setPaso] = useState<"elegir" | "agregar">(vacia && puedeAgregar ? "agregar" : "elegir");
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const idForm = useId();
  const papel = ROL_LABEL[rol].toLowerCase();

  // Abrir la libreta es para buscar: el foco va al buscador.
  useEffect(() => {
    if (paso === "elegir") buscador.current?.focus();
  }, [paso]);

  const filtradas = useMemo(() => filtrarPartes(opciones, q).slice(0, 60), [opciones, q]);
  const filtradasOtras = useMemo(() => filtrarPartes(otras, q).slice(0, 30), [otras, q]);

  async function agregar(input: ParteInput, valor: ValorParte) {
    setGuardando(true);
    setError(null);
    try {
      await onAgregar(input, valor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const pie =
    paso === "elegir" ? (
      <ModalFooter nota={`${opciones.length} ${opciones.length === 1 ? papel : ROL_PLURAL[rol].toLowerCase()} en tu libreta`}>
        <Btn onClick={onCerrar}>Cerrar</Btn>
        {puedeAgregar && (
          <Btn variant="primary" onClick={() => setPaso("agregar")}>
            <Plus className="h-4 w-4" aria-hidden />
            Agregar nuevo
          </Btn>
        )}
      </ModalFooter>
    ) : (
      <ModalFooter error={error} nota="Queda en tu Directorio y se usa en esta guía.">
        {vacia ? (
          <Btn onClick={onCerrar}>Cancelar</Btn>
        ) : (
          <Btn onClick={() => setPaso("elegir")}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver a la lista
          </Btn>
        )}
        <Btn variant="primary" type="submit" form={idForm} disabled={guardando}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Guardar y usar
        </Btn>
      </ModalFooter>
    );

  return (
    <AdminModal
      open
      onClose={onCerrar}
      aboveModals
      size="lg"
      icon={Users}
      title={paso === "elegir" ? `Libreta · ${titulo ?? ROL_LABEL[rol]}` : `Agregar a la libreta · ${titulo ?? ROL_LABEL[rol]}`}
      claveVentana={`libreta-${rol}`}
      footer={pie}
    >
      <div className="px-5 py-4 sm:px-6">
        {paso === "agregar" ? (
          <AltaDeParte
            id={idForm}
            rol={rol}
            borrador={borrador}
            conExtras={conExtras}
            onGuardar={(input, valor) => void agregar(input, valor)}
            onError={setError}
          />
        ) : (
          <div className="grid gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
              <input
                ref={buscador}
                type="search"
                aria-label={`Buscar ${papel} por nombre o documento`}
                className={`${I} pl-9`}
                placeholder="Busca por nombre o documento…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {filtradas.length === 0 && filtradasOtras.length === 0 ? (
              <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                {q ? `Nadie coincide con «${q}».` : "La libreta está vacía."}
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {filtradas.map((p) => (
                  <li key={p.id}>
                    <FilaDeParte parte={p} rol={rol} onUsar={() => onUsar(p)} />
                  </li>
                ))}
                {filtradasOtras.length > 0 && (
                  <li className="px-1 pt-2">
                    <p className="text-xs font-bold text-[var(--text-secondary)]">También en tu libreta, con otro papel</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Elegir a uno le suma el papel de {papel}: la próxima vez sale arriba.</p>
                  </li>
                )}
                {filtradasOtras.map((p) => (
                  <li key={p.id}>
                    <FilaDeParte parte={p} rol={rol} otroPapel onUsar={() => onUsarConOtroRol(p)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </AdminModal>
  );
}

/** Una fila de la libreta, con lo que le falta para poder ir en la guía. */
function FilaDeParte({
  parte,
  rol,
  otroPapel,
  onUsar,
}: {
  parte: Parte;
  rol: RolParte;
  /** Está guardada con OTRO papel: elegirla se lo suma. */
  otroPapel?: boolean;
  onUsar: () => void;
}) {
  const faltan = faltantesParaGuia(parte, rol);
  return (
    <button
      type="button"
      onClick={onUsar}
      className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)] hover:bg-primary/5"
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{parte.nombre}</span>
        <span className="block truncate text-xs text-[var(--text-tertiary)]">
          {[
            otroPapel ? parte.roles.map((r) => ROL_LABEL[r]).join(", ") : null,
            parte.docNumero ? `${parte.docTipo} ${parte.docNumero}` : null,
            parte.codigoCtp ? `Aut. ${parte.codigoCtp}` : null,
            direccionCompleta(parte) || null,
          ]
            .filter(Boolean)
            .join(" · ") || "Sin documento cargado"}
        </span>
        {/* Lo que le falta para la guía se ve ANTES de elegirlo: si no, se
            descubre recién al imprimir, con el camión cargado. */}
        {faltan.length > 0 && (
          <span className="mt-0.5 block truncate text-xs font-medium text-[var(--data-warning-ink)]">
            Para la guía le falta {faltan.join(" y ")}
          </span>
        )}
      </div>
      {parte.usos > 0 && (
        <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
          {parte.usos}×
        </span>
      )}
    </button>
  );
}
