"use client";

/**
 * Alta y edición de un socio (ADR-497). La participación vacía = se reparte
 * según el aporte; el campo muestra de fondo cuánto le tocaría así.
 * Se monta con `key` = id: cada apertura parte del socio.
 */
import { useId, useState } from "react";
import { Users } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { nuevoId } from "@/hooks/use-plan-empresa";
import { TIPOS_APORTE, type DatosSeccion } from "@/lib/planificacion/secciones";
import { CAMPO, CAMPO_AREA, Campo, leerSoles } from "../empresa/campos-plan";

export type Socio = DatosSeccion<"socios">["items"][number];

export const ROTULO_APORTE: Record<(typeof TIPOS_APORTE)[number], string> = {
  efectivo: "En efectivo",
  bienes: "En bienes",
  trabajo: "Con su trabajo",
  mixto: "Mixto",
};

interface Props {
  abierto: boolean;
  inicial: Socio | null;
  /** Lo que le tocaría por su aporte si deja vacío el porcentaje (para el fondo del campo). */
  porAporte: number | null;
  onCerrar: () => void;
  onGuardar: (s: Socio) => void;
}

export function SocioModal({ abierto, inicial, porAporte, onCerrar, onGuardar }: Props) {
  const formId = useId();
  const [f, setF] = useState<Socio>(
    () =>
      inicial ?? {
        id: nuevoId(),
        nombre: "",
        documento: "",
        cargo: "",
        aporte: 0,
        tipoAporte: "efectivo",
        porcentaje: null,
        fechaIngreso: "",
        telefono: "",
        nota: "",
      },
  );
  const [aporte, setAporte] = useState(inicial && inicial.aporte > 0 ? String(inicial.aporte) : "");
  const [pct, setPct] = useState(inicial?.porcentaje != null ? String(inicial.porcentaje) : "");
  const [error, setError] = useState<string | null>(null);
  const poner = <K extends keyof Socio>(k: K, v: Socio[K]) => setF((p) => ({ ...p, [k]: v }));

  const guardar = () => {
    const nombre = f.nombre.trim();
    if (!nombre) return setError("Escribe el nombre del socio.");
    const monto = aporte.trim() === "" ? 0 : leerSoles(aporte);
    if (monto === null) return setError("El aporte tiene que ser un monto en soles (por ejemplo 2500.50).");
    const porcentaje = pct.trim() === "" ? null : Number(pct.replace(",", "."));
    if (porcentaje !== null && (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100)) {
      return setError("La participación va de 0 a 100 %.");
    }
    onGuardar({ ...f, nombre, aporte: monto, porcentaje: porcentaje === null ? null : Math.round(porcentaje * 100) / 100 });
    onCerrar();
  };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={inicial ? "Editar socio" : "Nuevo socio"}
      icon={Users}
      size="lg"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })}>
            {inicial ? "Guardar cambios" : "Agregar"}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        noValidate
        className={`${MODAL_BODY} grid grid-cols-1 gap-4 sm:grid-cols-2`}
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <Campo rotulo="Nombre" className="sm:col-span-2">
          {(id) => <input id={id} className={CAMPO} value={f.nombre} maxLength={160} onChange={(e) => poner("nombre", e.target.value)} />}
        </Campo>
        <Campo rotulo="Documento" ayuda="DNI, carné de extranjería o RUC.">
          {(id) => (
            <input id={id} className={CAMPO} value={f.documento} maxLength={20} inputMode="numeric" onChange={(e) => poner("documento", e.target.value)} />
          )}
        </Campo>
        <Campo rotulo="Cargo" ayuda="Qué hace en el negocio.">
          {(id) => (
            <input id={id} className={CAMPO} value={f.cargo} maxLength={160} placeholder="Gerente general" onChange={(e) => poner("cargo", e.target.value)} />
          )}
        </Campo>
        <Campo rotulo="Aporte (S/)" ayuda="Lo que puso al empezar, en soles. Si aportó bienes o trabajo, anota cuánto valen.">
          {(id) => (
            <input id={id} className={CAMPO} value={aporte} inputMode="decimal" placeholder="0.00" onChange={(e) => setAporte(e.target.value)} />
          )}
        </Campo>
        <Campo rotulo="Tipo de aporte">
          {(id) => (
            <select id={id} className={CAMPO} value={f.tipoAporte} onChange={(e) => poner("tipoAporte", e.target.value as Socio["tipoAporte"])}>
              {TIPOS_APORTE.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_APORTE[t]}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo
          rotulo="Participación (%)"
          ayuda="Déjalo vacío y se reparte según lo que aportó cada uno. Escríbelo si acordaron otra cosa (por ejemplo 50 y 50 aunque uno puso más)."
        >
          {(id) => (
            <input
              id={id}
              className={CAMPO}
              value={pct}
              inputMode="decimal"
              placeholder={porAporte !== null ? `${porAporte} (por aporte)` : "Según el aporte"}
              onChange={(e) => setPct(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Desde">
          {(id) => <input id={id} type="date" className={CAMPO} value={f.fechaIngreso} onChange={(e) => poner("fechaIngreso", e.target.value)} />}
        </Campo>
        <Campo rotulo="Teléfono">
          {(id) => (
            <input id={id} type="tel" className={CAMPO} value={f.telefono} maxLength={30} onChange={(e) => poner("telefono", e.target.value)} />
          )}
        </Campo>
        <Campo rotulo="Nota" className="sm:col-span-2">
          {(id) => <textarea id={id} className={CAMPO_AREA} rows={2} value={f.nota} maxLength={600} onChange={(e) => poner("nota", e.target.value)} />}
        </Campo>
      </form>
    </AdminModal>
  );
}
