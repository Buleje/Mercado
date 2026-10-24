"use client";

/**
 * ZonaModal — alta y edición de una zona del negocio (ADR-497): nombre,
 * tipo, área con su unidad (m² o ha), para qué se usa y quién la tiene a
 * cargo. Cambiar el tipo sugiere la unidad mientras el área esté vacía.
 * Se monta con `key`: cada apertura parte de `inicial`.
 */
import { useId, useState } from "react";
import { MapPin } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { TIPOS_ESPACIO, UNIDADES_AREA } from "@/lib/planificacion/secciones";
import { cn } from "@/lib/utils";
import { AREA_TEXTO, CAMPO_ALTO, claseChip } from "../piezas/clases";
import { useNombresEquipo } from "../piezas/use-nombres-equipo";
import { NOMBRE_TIPO, unidadSugerida, type TipoEspacio, type Zona } from "./espacios-config";

const AREA_MAXIMA = 100_000_000;

interface Props {
  abierto: boolean;
  inicial: Zona;
  esNueva: boolean;
  onCerrar: () => void;
  onGuardar: (z: Zona) => void;
}

export function ZonaModal({ abierto, inicial, esNueva, onCerrar, onGuardar }: Props) {
  const formId = useId();
  const idNombres = useId();
  const nombres = useNombresEquipo();
  const [f, setF] = useState<Zona>(inicial);
  const [area, setArea] = useState(inicial.area == null ? "" : String(inicial.area));
  const [error, setError] = useState<string | null>(null);
  const poner = <K extends keyof Zona>(k: K, v: Zona[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setError(null);
  };

  const cambiarTipo = (tipo: TipoEspacio) => setF((p) => ({ ...p, tipo, unidad: area.trim() ? p.unidad : unidadSugerida(tipo) }));

  const guardar = () => {
    const nombre = f.nombre.trim();
    if (!nombre) return setError("Escribe el nombre de la zona.");
    // «1.250,5» y «1250.5» valen lo mismo: con coma, los puntos son de miles.
    const crudo = area.trim().replace(/\s/g, "");
    const texto = crudo.includes(",") ? crudo.replace(/\./g, "").replace(",", ".") : crudo;
    const n = texto ? Number(texto) : null;
    if (n != null && (!Number.isFinite(n) || n < 0 || n > AREA_MAXIMA)) return setError("El área tiene que ser un número de 0 en adelante.");
    onGuardar({ ...f, nombre, area: n, uso: f.uso.trim(), responsable: f.responsable.trim(), nota: f.nota.trim() });
    onCerrar();
  };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={esNueva ? "Nueva zona" : "Editar zona"}
      icon={MapPin}
      size="md"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })}>
            {esNueva ? "Agregar" : "Guardar cambios"}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        className={cn(MODAL_BODY, "space-y-5")}
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <datalist id={idNombres}>
          {nombres.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Zona" required>
            <input type="text" className={CAMPO_ALTO} value={f.nombre} maxLength={160} placeholder="Almacén de atrás" onChange={(e) => poner("nombre", e.target.value)} />
          </Field>
          <Field label="Tipo">
            <select className={CAMPO_ALTO} value={f.tipo} onChange={(e) => cambiarTipo(e.target.value as TipoEspacio)}>
              {TIPOS_ESPACIO.map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Área" hint="Déjala vacía si todavía no la mediste.">
          {(id) => (
            <div className="flex flex-wrap items-center gap-2">
              <input
                id={id}
                type="text"
                inputMode="decimal"
                className={cn(CAMPO_ALTO, "w-40 tabular-nums")}
                value={area}
                placeholder="120"
                onChange={(e) => {
                  setArea(e.target.value);
                  setError(null);
                }}
              />
              <div role="radiogroup" aria-label="Unidad" className="flex gap-2">
                {UNIDADES_AREA.map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={f.unidad === u} className={claseChip(f.unidad === u)} title={u === "ha" ? "Hectáreas" : "Metros cuadrados"} onClick={() => poner("unidad", u)}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>

        <Field label="Para qué se usa">
          <input type="text" className={CAMPO_ALTO} value={f.uso} maxLength={600} placeholder="Guardar la mercadería que llega" onChange={(e) => poner("uso", e.target.value)} />
        </Field>

        <Field label="Responsable" hint={nombres.length > 0 ? "Elige de tu equipo o escribe un nombre." : undefined}>
          <input type="text" className={CAMPO_ALTO} value={f.responsable} maxLength={160} list={idNombres} placeholder="Quién la tiene a cargo" onChange={(e) => poner("responsable", e.target.value)} />
        </Field>

        <Field label="Nota">
          <textarea className={AREA_TEXTO} rows={2} value={f.nota} maxLength={600} onChange={(e) => poner("nota", e.target.value)} />
        </Field>
      </form>
    </AdminModal>
  );
}
