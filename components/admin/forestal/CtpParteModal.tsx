"use client";

/**
 * CtpParteModal — alta y edición de una parte del directorio forestal (ADR-317).
 *
 * El formulario largo (todos los campos, todos los roles) vive acá; la guía usa
 * la barra rápida. Lo que hace útil a este modal es el botón de padrón: se tipea
 * el RUC y SUNAT devuelve razón social y domicilio fiscal — que es exactamente
 * lo que va en la guía y lo que nadie recuerda de memoria.
 */

import { useState } from "react";
import { Download, Loader2, Save } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  DOC_TIPOS,
  ROLES_PARTE,
  ROL_DESCRIPCION,
  ROL_LABEL,
  fuenteAutocompletado,
  motivoDocInvalido,
  type DocTipo,
  type Parte,
  type ParteInput,
  type RolParte,
} from "@/lib/forestal/directorio";
import { consultarDocumento } from "@/hooks/use-directorio-forestal";
import { Btn, CampoGrid, Field, I, Seccion } from "./ctp-shared";

type Borrador = ParteInput & { id?: string };

function aBorrador(p: Parte | null, rolInicial: RolParte): Borrador {
  if (!p) return { roles: [rolInicial], nombre: "", docTipo: "RUC" };
  return {
    id: p.id,
    roles: p.roles.length ? p.roles : [rolInicial],
    nombre: p.nombre,
    docTipo: p.docTipo ?? "RUC",
    docNumero: p.docNumero ?? "",
    direccion: p.direccion ?? "",
    region: p.region ?? "",
    provincia: p.provincia ?? "",
    distrito: p.distrito ?? "",
    ubigeo: p.ubigeo ?? "",
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    registroMtc: p.registroMtc ?? "",
    licencia: p.licencia ?? "",
    tituloHabilitante: p.tituloHabilitante ?? "",
    notas: p.notas ?? "",
    activo: p.activo,
  };
}

export default function CtpParteModal({
  parte,
  rolInicial,
  onGuardar,
  onClose,
}: {
  /** `null` = alta. */
  parte: Parte | null;
  rolInicial: RolParte;
  onGuardar: (input: Borrador) => Promise<void>;
  onClose: () => void;
}) {
  const [b, setB] = useState<Borrador>(() => aBorrador(parte, rolInicial));
  const [estado, setEstado] = useState<"idle" | "consultando" | "guardando">("idle");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const docTipo = (b.docTipo ?? "RUC") as DocTipo;
  const fuente = fuenteAutocompletado(docTipo);
  const docMal = motivoDocInvalido(docTipo, b.docNumero ?? "");
  const set = (v: Partial<Borrador>) => setB((p) => ({ ...p, ...v }));

  function alternarRol(rol: RolParte) {
    const tiene = b.roles.includes(rol);
    // Siempre queda al menos uno: una parte sin rol no aparece en ninguna lista
    // y se vuelve invisible desde la UI.
    if (tiene && b.roles.length === 1) return;
    set({ roles: tiene ? b.roles.filter((r) => r !== rol) : [...b.roles, rol] });
  }

  async function traerDelPadron() {
    setEstado("consultando");
    setError(null);
    setAviso(null);
    try {
      const datos = await consultarDocumento(docTipo, b.docNumero ?? "");
      if (!datos) {
        setError(`No se encontró el ${docTipo} en ${fuente}.`);
        return;
      }
      set({
        nombre: datos.nombre,
        direccion: datos.direccion ?? b.direccion,
        region: datos.region ?? b.region,
        provincia: datos.provincia ?? b.provincia,
        distrito: datos.distrito ?? b.distrito,
        ubigeo: datos.ubigeo ?? b.ubigeo,
      });
      setAviso(
        datos.estado && datos.estado.toUpperCase() !== "ACTIVO"
          ? `Traído de ${fuente}. Ojo: figura ${datos.estado}.`
          : `Traído de ${fuente}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEstado("idle");
    }
  }

  async function guardar() {
    if (b.nombre.trim().length < 2) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (docMal) {
      setError(docMal);
      return;
    }
    setEstado("guardando");
    setError(null);
    try {
      await onGuardar(b);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEstado("idle");
    }
  }

  const esTransportista = b.roles.includes("transportista");
  const esConductor = b.roles.includes("conductor");
  const esProveedor = b.roles.includes("proveedor");

  return (
    <AdminModal open onClose={onClose} title={parte ? `Editar ${parte.nombre}` : "Agregar al directorio"} variant="info">
      <div className="space-y-1">
        <Seccion numero={1} title="Qué papel cumple" hint="Se puede marcar más de uno">
          <div className="sm:col-span-12 flex flex-wrap gap-2">
            {ROLES_PARTE.map((rol) => {
              const on = b.roles.includes(rol);
              return (
                <button
                  key={rol}
                  type="button"
                  aria-pressed={on}
                  title={ROL_DESCRIPCION[rol]}
                  onClick={() => alternarRol(rol)}
                  className={`inline-flex h-11 items-center rounded-xl border-2 px-3.5 text-sm font-bold transition-colors ${
                    on
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                  }`}
                >
                  {ROL_LABEL[rol]}
                </button>
              );
            })}
          </div>
        </Seccion>

        <Seccion numero={2} title="Identidad">
          <Field label="Tipo de documento" span={3}>
            <select className={I} value={docTipo} onChange={(e) => set({ docTipo: e.target.value as DocTipo })}>
              {DOC_TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="N° de documento" span={4} hint={docMal ?? undefined}>
            <input
              type="text"
              className={`${I} font-mono`}
              value={b.docNumero ?? ""}
              onChange={(e) => set({ docNumero: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-5 flex items-end">
            {fuente && (
              <Btn variant="secondary" disabled={!!docMal || !b.docNumero || estado !== "idle"} onClick={() => void traerDelPadron()}>
                {estado === "consultando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Traer de {fuente}
              </Btn>
            )}
          </div>
          <Field label="Nombre o razón social" required span={12}>
            <input type="text" className={I} value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} />
          </Field>
        </Seccion>

        <Seccion numero={3} title="Dónde está" hint="La dirección del destinatario es el punto de llegada de la guía">
          <Field label="Dirección" span={12}>
            <input type="text" className={I} value={b.direccion ?? ""} onChange={(e) => set({ direccion: e.target.value })} />
          </Field>
          <Field label="Región" span={4}>
            <input type="text" className={I} value={b.region ?? ""} onChange={(e) => set({ region: e.target.value })} />
          </Field>
          <Field label="Provincia" span={4}>
            <input type="text" className={I} value={b.provincia ?? ""} onChange={(e) => set({ provincia: e.target.value })} />
          </Field>
          <Field label="Distrito" span={4}>
            <input type="text" className={I} value={b.distrito ?? ""} onChange={(e) => set({ distrito: e.target.value })} />
          </Field>
          <Field label="Teléfono" span={6}>
            <input type="text" className={I} value={b.telefono ?? ""} onChange={(e) => set({ telefono: e.target.value })} />
          </Field>
          <Field label="Email" span={6}>
            <input type="email" className={I} value={b.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </Field>
        </Seccion>

        {(esTransportista || esConductor || esProveedor) && (
          <Seccion numero={4} title="Según el papel">
            {esTransportista && (
              <Field label="Registro MTC" span={4} hint="Si es empresa de transporte">
                <input type="text" className={I} value={b.registroMtc ?? ""} onChange={(e) => set({ registroMtc: e.target.value })} />
              </Field>
            )}
            {esConductor && (
              <Field label="Licencia de conducir" span={4} hint="Es lo que pide el puesto de control">
                <input type="text" className={`${I} font-mono`} value={b.licencia ?? ""} onChange={(e) => set({ licencia: e.target.value })} />
              </Field>
            )}
            {esProveedor && (
              <Field label="Título habilitante" span={4} hint="Permiso, concesión o plantación con la que extrae">
                <input type="text" className={I} value={b.tituloHabilitante ?? ""} onChange={(e) => set({ tituloHabilitante: e.target.value })} />
              </Field>
            )}
          </Seccion>
        )}

        <Seccion numero={5} title="Notas">
          <CampoGrid className="sm:col-span-12">
            <Field label="Observaciones internas" span={12}>
              <input type="text" className={I} value={b.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} />
            </Field>
          </CampoGrid>
        </Seccion>

        {aviso && <p className="pt-3 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{aviso}</p>}
        {error && (
          <p role="alert" className="pt-3 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--rule-base)] pt-4">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" disabled={estado === "guardando"} onClick={() => void guardar()}>
            {estado === "guardando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Btn>
        </div>
      </div>
    </AdminModal>
  );
}
