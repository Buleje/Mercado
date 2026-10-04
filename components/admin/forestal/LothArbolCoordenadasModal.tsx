"use client";

/**
 * «Cargar coordenadas» — Este, Norte y zona UTM de UN árbol del censo que
 * todavía no tiene (o las tiene mal), para que salga en el mapa.
 *
 * Es el editor mínimo del árbol: el censo sólo se editaba por el import y el
 * alta, y el PATCH de `/api/admin/forestal/plan/census` no tenía pantalla.
 * Manda ÚNICAMENTE las coordenadas (el PATCH es parcial): no toca DAP, especie
 * ni estado. Las reglas de rango son las del alta del censo
 * (`revisarCoordenadasArbol`); el servidor es el gate final.
 *
 * La zona se propone con la que más usa el censo, y el Este y el Norte se leen
 * como en el alta («521 922», «8.918.151»).
 */

import { useEffect, useState, type InputHTMLAttributes } from "react";
import { Loader2, MapPin } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import {
  revisarCoordenadasArbol,
  type ArbolSinCoordenadas,
  type BorradorCoordenadas,
} from "./loth-mapa-sin-coordenadas";
import type { CensusTreeDTO } from "./loth-mapa-shared";

const FORM_ID = "loth-arbol-coordenadas-form";
const INPUT =
  "h-11 w-full rounded-lg border bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:ring-1 sm:h-10 sm:text-sm";
const inputCls = (mal: boolean) =>
  `${INPUT} ${mal ? "border-[var(--data-error-500)] focus:border-[var(--data-error-500)] focus:ring-[var(--data-error-500)]/20" : "border-[var(--rule-base)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/20"}`;

interface Props {
  /** El árbol a corregir; `null` = cerrado. */
  arbol: ArbolSinCoordenadas | null;
  /** La zona que más usa el censo, para no tipearla. */
  zonaInicial: string;
  onClose: () => void;
  /** El servidor guardó: el árbol como quedó. */
  onGuardado: (arbol: CensusTreeDTO) => void;
}

export default function LothArbolCoordenadasModal({ arbol, zonaInicial, onClose, onGuardado }: Props) {
  const [b, setB] = useState<BorradorCoordenadas>({ utmX: "", utmY: "", utmZona: zonaInicial });
  const [busy, setBusy] = useState(false);
  /* Un rechazo del servidor se dice dentro del modal, que sigue abierto. */
  const [falla, setFalla] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);
  const id = arbol?.id ?? null;

  // Cada árbol abre en blanco (la zona propuesta aparte): no hereda lo tipeado en el anterior.
  useEffect(() => {
    setB({ utmX: "", utmY: "", utmZona: zonaInicial });
    setFalla(null);
    setTocado(false);
    setBusy(false);
  }, [id, zonaInicial]);

  const r = revisarCoordenadasArbol(b);
  const listo = r.errores.length === 0 && r.este != null && r.norte != null && r.zona != null;
  /* Los errores de un campo vacío no se gritan antes de que se toque. */
  const verErrores = tocado && r.errores.length > 0;
  const set = (k: keyof BorradorCoordenadas, v: string) => {
    setB((p) => ({ ...p, [k]: v }));
    setTocado(true);
    setFalla(null);
  };

  async function guardar() {
    if (!arbol || busy) return;
    setTocado(true);
    if (!listo) return;
    setBusy(true);
    setFalla(null);
    try {
      const res = await fetch("/api/admin/forestal/plan/census", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ id: arbol.id, utmX: r.este, utmY: r.norte, utmZona: r.zona }),
      });
      if (!res.ok) {
        const j = await leerJson<{ message?: string; error?: string }>(res);
        setFalla(j?.message ?? (res.status === 403 ? "Tu rol no puede corregir el censo: pídeselo al dueño o al administrador." : `No se pudo guardar (error ${res.status}).`));
        return;
      }
      const j = await leerJson<{ tree?: CensusTreeDTO }>(res);
      toast.success(`Árbol ${arbol.code}: coordenadas guardadas`);
      onGuardado(j?.tree ?? { id: arbol.id, treeCode: arbol.code, speciesCommon: arbol.species, estado: arbol.estado, utmX: r.este, utmY: r.norte, utmZona: r.zona });
      onClose();
    } catch (err) {
      console.warn("[LothArbolCoordenadasModal] guardar falló", err);
      setFalla("No se pudo guardar: revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  }

  const decimal: InputHTMLAttributes<HTMLInputElement> = { inputMode: "decimal", autoComplete: "off" };
  const campo = (k: keyof BorradorCoordenadas, rotulo: string, extra: InputHTMLAttributes<HTMLInputElement>, autoFocus = false) => {
    const mal = tocado && r.invalidos.has(k);
    return (
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-[var(--text-primary)]">{rotulo}</span>
        <input
          value={b[k]}
          onChange={(e) => set(k, e.target.value)}
          aria-invalid={mal || undefined}
          autoFocus={autoFocus} // eslint-disable-line jsx-a11y/no-autofocus -- el modal se abre para escribir el Este de inmediato
          className={inputCls(mal)}
          {...extra}
        />
      </label>
    );
  };

  return (
    <AdminModal
      open={arbol != null}
      onClose={onClose}
      title="Cargar coordenadas"
      description={arbol ? `Árbol ${arbol.code} · ${arbol.species}` : undefined}
      icon={MapPin}
      variant="wide"
      className="sm:max-w-[30rem]"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] sm:h-10">
            Cancelar
          </button>
          <button
            type="submit"
            form={FORM_ID}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
          >
            {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />} Guardar coordenadas
          </button>
        </div>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
        className={`space-y-4 ${MODAL_BODY}`}
        noValidate
      >
        {arbol && (
          <p className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)]">
            <span className="min-w-0">{arbol.detalle}</span>
            <InfoTip
              icono="ayuda"
              title="Cargar coordenadas"
              what="Este y Norte en metros UTM, como en la hoja del censo. Con ellos el árbol aparece en el mapa."
              affects="Sólo cambia las coordenadas: no toca el DAP, la especie ni el estado del árbol."
              example="Este 521922 · Norte 8918151 · zona 18L."
            />
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {campo("utmX", "Este (m)", { ...decimal, placeholder: "521922" }, true)}
          {campo("utmY", "Norte (m)", { ...decimal, placeholder: "8918151" })}
          <div className="col-span-2 sm:col-span-1">{campo("utmZona", "Zona UTM", { placeholder: "18L", autoComplete: "off" })}</div>
        </div>
        {verErrores && (
          <ul aria-live="polite" className="space-y-0.5 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {r.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {falla && (
          <p role="alert" className="rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {falla}
          </p>
        )}
      </form>
    </AdminModal>
  );
}
