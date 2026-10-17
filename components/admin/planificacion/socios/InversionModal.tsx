"use client";

/**
 * Alta y edición de un gasto de la inversión inicial (ADR-497): qué se compró,
 * en qué rubro, cuánto costó y de dónde salió la plata (el aporte de un socio,
 * un préstamo, fondos propios u otro). Se monta con `key` = id.
 */
import { useId, useState } from "react";
import { PiggyBank } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { nuevoId } from "@/hooks/use-plan-empresa";
import { CATEGORIAS_INVERSION, type DatosSeccion } from "@/lib/planificacion/secciones";
import { CAMPO, CAMPO_AREA, Campo, leerSoles } from "../empresa/campos-plan";
import type { Socio } from "./SocioModal";

export type ItemInversion = DatosSeccion<"inversion">["items"][number];

interface Props {
  abierto: boolean;
  inicial: ItemInversion | null;
  socios: readonly Socio[];
  onCerrar: () => void;
  onGuardar: (i: ItemInversion) => void;
}

export function InversionModal({ abierto, inicial, socios, onCerrar, onGuardar }: Props) {
  const formId = useId();
  const [f, setF] = useState<ItemInversion>(
    () => inicial ?? { id: nuevoId(), concepto: "", categoria: "Otro", monto: 0, fuente: "propio", fecha: "", nota: "" },
  );
  const [monto, setMonto] = useState(inicial ? String(inicial.monto) : "");
  const [error, setError] = useState<string | null>(null);
  const poner = <K extends keyof ItemInversion>(k: K, v: ItemInversion[K]) => setF((p) => ({ ...p, [k]: v }));
  /* Una fuente que apunta a un socio ya quitado sigue elegible para no perderla al editar. */
  const socioPerdido = f.fuente.startsWith("socio:") && !socios.some((s) => `socio:${s.id}` === f.fuente);

  const guardar = () => {
    const concepto = f.concepto.trim();
    if (!concepto) return setError("Escribe qué se compró o en qué se gastó.");
    const m = leerSoles(monto);
    if (m === null || m <= 0) return setError("El monto tiene que ser mayor que cero, en soles (por ejemplo 1500.50).");
    onGuardar({ ...f, concepto, monto: m });
    onCerrar();
  };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={inicial ? "Editar gasto de inversión" : "Nuevo gasto de inversión"}
      icon={PiggyBank}
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
        <Campo rotulo="Concepto" className="sm:col-span-2">
          {(id) => (
            <input
              id={id}
              className={CAMPO}
              value={f.concepto}
              maxLength={160}
              placeholder="Refrigeradora exhibidora de dos puertas"
              onChange={(e) => poner("concepto", e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Categoría" ayuda="Capital de trabajo = la plata para operar los primeros meses (mercadería de reposición, sueldos, luz) hasta que el negocio se sostenga.">
          {(id) => (
            <select id={id} className={CAMPO} value={f.categoria} onChange={(e) => poner("categoria", e.target.value as ItemInversion["categoria"])}>
              {CATEGORIAS_INVERSION.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo rotulo="Monto (S/)">
          {(id) => <input id={id} className={CAMPO} value={monto} inputMode="decimal" placeholder="0.00" onChange={(e) => setMonto(e.target.value)} />}
        </Campo>
        <Campo rotulo="De dónde sale la plata" ayuda="Elige el socio que lo pagó con su aporte, o si salió de un préstamo, de fondos propios u otra fuente.">
          {(id) => (
            <select id={id} className={CAMPO} value={f.fuente} onChange={(e) => poner("fuente", e.target.value)}>
              {socios.length > 0 ? (
                <optgroup label="Aporte de un socio">
                  {socios.map((s) => (
                    <option key={s.id} value={`socio:${s.id}`}>
                      {s.nombre}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {socioPerdido ? <option value={f.fuente}>Un socio que ya no está</option> : null}
              <option value="prestamo">Préstamo</option>
              <option value="propio">Fondos propios</option>
              <option value="otro">Otro</option>
            </select>
          )}
        </Campo>
        <Campo rotulo="Fecha">
          {(id) => <input id={id} type="date" className={CAMPO} value={f.fecha} onChange={(e) => poner("fecha", e.target.value)} />}
        </Campo>
        <Campo rotulo="Nota" className="sm:col-span-2">
          {(id) => <textarea id={id} className={CAMPO_AREA} rows={2} value={f.nota} maxLength={600} onChange={(e) => poner("nota", e.target.value)} />}
        </Campo>
      </form>
    </AdminModal>
  );
}
