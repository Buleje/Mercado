"use client";

/**
 * Dar de alta un permiso sin salir de «Importar el libro» (Brandon 19-10).
 *
 * Lo justo para que la madera quede bien clasificada —código, titular, RUC y
 * resolución— y el resto plegado en «Más datos». Va EN LÍNEA y no en otra
 * ventana: un modal sobre el modal del import obliga a cerrar dos para volver.
 *
 * Si el código ya existe, el servidor devuelve el que estaba (409) y se usa
 * ese: un mismo papel cargado dos veces partiría su balance en dos mitades.
 */

import { useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { TIPOS_CONTRATO, type Contrato, type ContratoInput, type TipoContrato } from "@/lib/forestal/contratos";
import { rucValido } from "@/lib/forestal/ctp-ficha-types";
import type { ResultadoAltaPermiso } from "@/hooks/use-permisos-forestal";
import Plegable from "@/components/admin/shared/Plegable";

/** Los controles del import van a 48 px, como el resto del panel. */
export const CAMPO =
  "w-full h-12 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 text-base text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:opacity-60 placeholder:text-[var(--text-tertiary)]";

/** RUC (11, con dígito verificador) o DNI (8). Vacío vale: se puede completar después. */
export function revisarDocumento(doc: string): { tipo: "RUC" | "DNI" | null; error: string | null } {
  const d = doc.replace(/\s+/g, "");
  if (!d) return { tipo: null, error: null };
  if (/^\d{8}$/.test(d)) return { tipo: "DNI", error: null };
  if (rucValido(d)) return { tipo: "RUC", error: null };
  return { tipo: null, error: "Ese RUC no es válido: revisa los 11 dígitos (o pon los 8 del DNI)." };
}

type Campos = Record<
  | "codigo" | "titular" | "doc" | "resolucion" | "tipo" | "resolucionFecha" | "arffs"
  | "region" | "provincia" | "distrito" | "area" | "desde" | "hasta" | "notas",
  string
>;

const VACIO: Campos = {
  codigo: "", titular: "", doc: "", resolucion: "", tipo: "", resolucionFecha: "", arffs: "",
  region: "", provincia: "", distrito: "", area: "", desde: "", hasta: "", notas: "",
};

const nulo = (v: string) => v.trim() || null;

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-sm font-semibold text-[var(--text-secondary)]">{etiqueta}</span>
      {children}
    </label>
  );
}

export default function NuevoPermisoRapido({
  crear,
  codigoInicial,
  onCreado,
  onCancelar,
}: {
  crear: (input: ContratoInput) => Promise<ResultadoAltaPermiso>;
  codigoInicial: string;
  onCreado: (c: Contrato, yaExistia: boolean) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState<Campos>({ ...VACIO, codigo: codigoInicial });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poner = (k: keyof Campos) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const doc = revisarDocumento(f.doc);

  const guardar = async () => {
    if (f.codigo.trim().length < 3) return setError("Pon el código del permiso (al menos 3 caracteres).");
    if (!f.titular.trim()) return setError("Pon el titular del permiso.");
    if (doc.error) return setError(doc.error);
    const area = f.area.trim() ? Number(f.area.replace(",", ".")) : null;
    if (area != null && (!Number.isFinite(area) || area < 0)) return setError("El área va en hectáreas, un número.");
    setGuardando(true);
    setError(null);
    const r = await crear({
      codigo: f.codigo.trim(),
      titularNombre: f.titular.trim(),
      titularDoc: nulo(f.doc.replace(/\s+/g, "")),
      titularDocTipo: doc.tipo,
      resolucionNumero: nulo(f.resolucion),
      tipo: (nulo(f.tipo) as TipoContrato | null) ?? null,
      resolucionFecha: nulo(f.resolucionFecha),
      arffs: nulo(f.arffs),
      region: nulo(f.region),
      provincia: nulo(f.provincia),
      distrito: nulo(f.distrito),
      areaHa: area,
      vigenciaDesde: nulo(f.desde),
      vigenciaHasta: nulo(f.hasta),
      notas: nulo(f.notas),
    });
    setGuardando(false);
    if (r.contrato) onCreado(r.contrato, r.yaExistia);
    else setError(r.error ?? "No se pudo crear el permiso.");
  };

  return (
    <form
      noValidate
      aria-label="Nuevo permiso"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
      className="mt-2 space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Código del permiso *">
          <input autoFocus value={f.codigo} onChange={poner("codigo")} className={CAMPO} placeholder="17-PUC/P-MAD-A-001-22" />
        </Campo>
        <Campo etiqueta="Titular *">
          <input value={f.titular} onChange={poner("titular")} className={CAMPO} placeholder="Nombre o razón social" />
        </Campo>
        <Campo etiqueta="RUC del titular">
          <input
            value={f.doc}
            onChange={poner("doc")}
            inputMode="numeric"
            maxLength={11}
            aria-invalid={!!doc.error}
            className={CAMPO}
            placeholder="11 dígitos (o DNI)"
          />
        </Campo>
        <Campo etiqueta="Resolución">
          <input value={f.resolucion} onChange={poner("resolucion")} className={CAMPO} placeholder="R.D. N° 123-2024" />
        </Campo>
      </div>

      <Plegable
        clave="serfor-import:permiso-rapido:mas-datos"
        variante="franja"
        montarAlAbrir={false}
        titulo={
          <>
            Más datos <span className="ml-1 text-sm font-normal text-[var(--text-tertiary)]">(tipo, fechas, ubicación, área)</span>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo">
            <select value={f.tipo} onChange={poner("tipo")} className={CAMPO}>
              <option value="">Sin indicar</option>
              {TIPOS_CONTRATO.map((t) => (
                <option key={t} value={t}>
                  {t === "otro" ? "Otro" : t}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Fecha de la resolución">
            <input type="date" value={f.resolucionFecha} onChange={poner("resolucionFecha")} className={CAMPO} />
          </Campo>
          <Campo etiqueta="ARFFS">
            <input value={f.arffs} onChange={poner("arffs")} className={CAMPO} placeholder="ARFFS Ucayali" />
          </Campo>
          <Campo etiqueta="Región">
            <input value={f.region} onChange={poner("region")} className={CAMPO} />
          </Campo>
          <Campo etiqueta="Provincia">
            <input value={f.provincia} onChange={poner("provincia")} className={CAMPO} />
          </Campo>
          <Campo etiqueta="Distrito">
            <input value={f.distrito} onChange={poner("distrito")} className={CAMPO} />
          </Campo>
          <Campo etiqueta="Área (ha)">
            <input value={f.area} onChange={poner("area")} inputMode="decimal" className={CAMPO} />
          </Campo>
          <Campo etiqueta="Vigente desde">
            <input type="date" value={f.desde} onChange={poner("desde")} className={CAMPO} />
          </Campo>
          <Campo etiqueta="Vigente hasta">
            <input type="date" value={f.hasta} onChange={poner("hasta")} className={CAMPO} />
          </Campo>
          <Campo etiqueta="Notas">
            <input value={f.notas} onChange={poner("notas")} className={CAMPO} />
          </Campo>
        </div>
      </Plegable>

      {(error || doc.error) && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error)]">
          {error ?? doc.error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancelar} className={button({ variant: "secondary" })}>
          Cancelar
        </button>
        <button type="submit" disabled={guardando} className={button({ variant: "accent" })}>
          {guardando && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
          {guardando ? "Guardando…" : "Guardar y usar"}
        </button>
      </div>
    </form>
  );
}
