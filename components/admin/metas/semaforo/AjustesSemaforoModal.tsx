"use client";

/**
 * Ajustes del Semáforo (ADR-508): dos secciones, una a la vez.
 *  · Negocio: día del lanzamiento, caja del lunes, la decisión sobre la
 *    ganancia acumulada, productos A y categorías de gasto que son anuncios.
 *  · Indicadores: los umbrales de cada uno, la frase del rojo y apagarlo.
 *
 * Guarda SÓLO lo que cambió (`cambioDeForm`): un umbral que no tocaste sigue
 * al catálogo y el PUT no pisa lo que otro anotó en el medio. Se monta sólo
 * abierto: cada vez que se abre arranca de lo guardado.
 */
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { toast } from "sonner";
import { Settings2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CAMPO, claseChip } from "@/components/admin/metas/clases-meta";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ConfigSemaforoGuardada } from "@/lib/semaforo/config";
import { cambioDeForm, formDeConfig, type FormSemaforo } from "@/lib/semaforo/formulario";
import { cn } from "@/lib/utils";
import { FilasIndicadores } from "./FilasIndicadores";

interface Props {
  abierto: boolean;
  guardada: ConfigSemaforoGuardada;
  hoy: string;
  onCerrar: () => void;
  onGuardar: (cambio: ConfigSemaforoGuardada) => Promise<string | null>;
}

type Seccion = "negocio" | "indicadores";

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="text-sm font-semibold text-[var(--text-primary)]">
          {label}
        </label>
        {ayuda && <InfoTip what={ayuda} />}
      </div>
      {children(id)}
    </div>
  );
}

export function AjustesSemaforoModal({ abierto, guardada, hoy, onCerrar, onGuardar }: Props) {
  const formId = useId();
  const [inicial] = useState(() => formDeConfig(guardada));
  const [form, setForm] = useState<FormSemaforo>(inicial);
  const [seccion, setSeccion] = useState<Seccion>("negocio");
  const [guardando, setGuardando] = useState(false);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const poner = (cambio: Partial<FormSemaforo>) => setForm((f) => ({ ...f, ...cambio }));

  const enviar = async () => {
    const r = cambioDeForm(form, inicial, guardada, hoy);
    if (!r.ok) {
      setErrorApi(r.error);
      return;
    }
    if (Object.keys(r.cambio).length === 0) {
      onCerrar();
      return;
    }
    setGuardando(true);
    const fallo = await onGuardar(r.cambio);
    setGuardando(false);
    if (fallo) {
      setErrorApi(fallo);
      return;
    }
    toast.success("Ajustes del semáforo guardados");
    onCerrar();
  };

  const input = (id: string, valor: string, cambiar: (v: string) => void, extra?: InputHTMLAttributes<HTMLInputElement>) => (
    <input id={id} value={valor} onChange={(e) => cambiar(e.target.value)} className={cn(CAMPO, "h-12")} {...extra} />
  );
  const num = { inputMode: "decimal" as const, autoComplete: "off" };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title="Ajustes del semáforo"
      icon={Settings2}
      variant="info"
      claveVentana="semaforo-ajustes"
      footer={
        <ModalFooter error={errorApi}>
          <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" form={formId} disabled={guardando} className={BOTON_PRIMARIO}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        noValidate
        className={cn(MODAL_BODY, "space-y-4")}
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <div role="group" aria-label="Sección" className="flex gap-1.5">
          {(["negocio", "indicadores"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={seccion === s} className={claseChip(seccion === s)} onClick={() => setSeccion(s)}>
              {s === "negocio" ? "Negocio" : "Metas por indicador"}
            </button>
          ))}
        </div>

        {seccion === "negocio" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Día del lanzamiento" ayuda="Lo vendido antes de ese día cuenta como prueba. Vacío = sin lanzamiento.">
              {(id) => input(id, form.lanzamiento, (v) => poner({ lanzamiento: v }), { type: "date" })}
            </Campo>
            <Campo label="Caja del lunes (S/)" ayuda="Cuenta + Yape + efectivo. Se guarda con la fecha de hoy.">
              {(id) => input(id, form.caja, (v) => poner({ caja: v }), { ...num, placeholder: "Ej. 450" })}
            </Campo>
            <Campo label="Día de la decisión" ayuda="Ese día se decide seguir, ajustar o parar según la ganancia desde el lanzamiento.">
              {(id) => input(id, form.decisionFecha, (v) => poner({ decisionFecha: v }), { type: "date" })}
            </Campo>
            <Campo label="Ganancia para verde (S/)" ayuda="Antes del día de la decisión se compara con el ritmo: la meta repartida por día.">
              {(id) => input(id, form.decisionVerde, (v) => poner({ decisionVerde: v }), { ...num, placeholder: "Ej. 1700" })}
            </Campo>
            <Campo label="Ganancia para amarillo (S/)">
              {(id) => input(id, form.decisionAmarillo, (v) => poner({ decisionAmarillo: v }), { ...num, placeholder: "Ej. 800" })}
            </Campo>
            <Campo label="Rojo sólo si vuelven menos de (%)" ayuda="Debajo del amarillo es rojo sólo si además los clientes que vuelven están debajo de este %. Vacío = rojo con la ganancia sola.">
              {(id) => input(id, form.decisionRecompra, (v) => poner({ decisionRecompra: v }), { ...num, placeholder: "Ej. 10" })}
            </Campo>
            <Campo label="Productos A (códigos)" ayuda="Los que nunca pueden faltar, separados por coma. Vacío = los que tienen stock mínimo.">
              {(id) => input(id, form.productosA, (v) => poner({ productosA: v }), { placeholder: "MU001, MU002" })}
            </Campo>
            <Campo label="Gastos que son anuncios" ayuda="Categorías de gasto separadas por coma. Vacío = marketing, publicidad, anuncios.">
              {(id) => input(id, form.categoriasAnuncios, (v) => poner({ categoriasAnuncios: v }), { placeholder: "marketing, publicidad" })}
            </Campo>
          </div>
        ) : (
          <FilasIndicadores filas={form.indicadores} onCambiar={(indicadores) => poner({ indicadores })} />
        )}
      </form>
    </AdminModal>
  );
}
