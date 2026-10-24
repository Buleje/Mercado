"use client";

/**
 * Las opciones de UNA pieza en UN negocio. El formulario sale del JSON Schema
 * de la pieza; si trae algo que no sabe dibujar, se edita como JSON. El
 * servidor valida siempre: sus mensajes se muestran tal cual.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Ruler } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { EnchufeId } from "@/extensiones/_contrato";
import type { FilaDeLaMatriz, PiezaDelCatalogo } from "@/lib/extensiones/resolver";
import { PIEZAS_CLIENTE } from "@/extensiones/registro.cliente";
import { camposDeSchema, comoObjeto, opcionesDeValores } from "./campos-de-schema";
import { explicarIssues } from "./errores-de-opciones";
import { FormularioOpciones } from "./FormularioOpciones";
import { avisosDeFila, ROTULO_ENCHUFE } from "./etiquetas";
import type { ResultadoGuardado } from "./use-piezas-superadmin";

export interface PiezaAbierta {
  tenantId: string;
  tenantNombre: string;
  pieza: PiezaDelCatalogo;
  enchufe: EnchufeId;
  fila?: FilaDeLaMatriz;
  /** Lo que el superadmin quería hacer al llegar acá (prender/apagar); sin eso, la fila queda como está. */
  prender?: boolean;
}

interface Props {
  abierta: PiezaAbierta | null;
  onClose: () => void;
  onGuardar: (a: PiezaAbierta, opciones: Record<string, unknown>, rotulos: Record<string, string>) => Promise<ResultadoGuardado>;
}

function Contenido({ abierta, onClose, onGuardar }: Props & { abierta: PiezaAbierta }) {
  const { pieza, fila } = abierta;
  const campos = useMemo(() => camposDeSchema(pieza.opcionesSchema), [pieza.opcionesSchema]);
  const inicial = useMemo<Record<string, unknown>>(
    () => ({ ...(pieza.opcionesPorDefecto ?? {}), ...(fila?.opcionesValidas ? comoObjeto(fila.opciones) : {}) }),
    [pieza.opcionesPorDefecto, fila],
  );
  const [valores, setValores] = useState<Record<string, unknown>>(inicial);
  const [json, setJson] = useState(() => JSON.stringify(inicial, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const rotulos = useMemo(() => Object.fromEntries((campos ?? []).map((c) => [c.clave, c.rotulo])), [campos]);

  /** Lo que se enviaría, o por qué no se puede: se valida ANTES de enviar, con el Zod de la pieza. */
  const { opciones: aEnviar, errores } = useMemo<{ opciones: Record<string, unknown> | null; errores: string[] }>(() => {
    let opciones: Record<string, unknown>;
    if (campos) {
      opciones = opcionesDeValores(campos, valores);
    } else {
      try {
        const leido: unknown = JSON.parse(json);
        if (typeof leido !== "object" || leido === null || Array.isArray(leido)) throw new Error("no es un objeto");
        opciones = leido as Record<string, unknown>;
      } catch {
        return { opciones: null, errores: ["El JSON no es válido. Debe ser un objeto entre llaves."] };
      }
    }
    const zod = PIEZAS_CLIENTE[pieza.id]?.manifiesto.opciones.safeParse(opciones);
    return { opciones, errores: zod && !zod.success ? explicarIssues(zod.error.issues, rotulos) : [] };
  }, [campos, valores, json, pieza.id, rotulos]);

  async function guardar() {
    setError(null);
    if (!aEnviar || errores.length > 0) return;
    setGuardando(true);
    const r = await onGuardar(abierta, aEnviar, rotulos);
    setGuardando(false);
    if (r.ok) onClose();
    else setError(r.mensaje);
  }

  const avisos = fila ? avisosDeFila(fila) : [];

  return (
    <AdminModal
      open
      onClose={onClose}
      title={pieza.nombre}
      description={`${abierta.tenantNombre} · ${ROTULO_ENCHUFE[abierta.enchufe]} · versión ${pieza.version}`}
      icon={Ruler}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 text-base font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || errores.length > 0}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-dark)] px-5 text-base font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
          >
            {guardando && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            Guardar opciones
          </button>
        </div>
      }
    >
      <div className={`space-y-5 ${MODAL_BODY}`}>
        <p className="text-sm text-[var(--text-secondary)]">{pieza.descripcion}</p>

        {avisos.map((a) => (
          <p
            key={a.texto}
            role={a.tono === "error" ? "alert" : "status"}
            className={`flex items-start gap-2 rounded-xl border-2 p-3 text-sm font-medium ${
              a.tono === "error"
                ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]"
                : "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)]"
            }`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {a.texto}
          </p>
        ))}

        {campos ? (
          campos.length === 0 ? (
            <p className="text-base text-[var(--text-secondary)]">Esta pieza no tiene opciones: se prende o se apaga y ya.</p>
          ) : (
            <FormularioOpciones campos={campos} valores={valores} onCambio={(k, v) => setValores((p) => ({ ...p, [k]: v }))} />
          )
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="opciones-json" className="text-sm font-bold text-[var(--text-primary)]">
              Opciones (JSON)
            </label>
            <textarea
              id="opciones-json"
              rows={10}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
              className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
        )}

        {errores.length > 0 && (
          <ul role="alert" className="list-disc space-y-1 pl-5 text-sm font-medium text-[var(--data-error-700)]">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm font-medium text-[var(--data-error-700)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>
    </AdminModal>
  );
}

export function OpcionesPiezaModal(props: Props) {
  const { abierta } = props;
  if (!abierta) return null;
  return <Contenido key={`${abierta.tenantId}:${abierta.pieza.id}:${abierta.enchufe}`} {...props} abierta={abierta} />;
}
