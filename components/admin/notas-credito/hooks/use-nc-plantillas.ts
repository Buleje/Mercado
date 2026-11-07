import { logger } from "@/lib/logger";
import type { NCTemplate } from "@/components/admin/notas-credito/nc-compartido";
import { CLAVE_PLANTILLAS, guardarPlantilla, revisarPlantilla } from "@/components/admin/notas-credito/nc-plantillas";
import { useNcEstado } from "@/components/admin/notas-credito/hooks/use-nc-estado";
import { useNcSelector } from "@/components/admin/notas-credito/hooks/use-nc-selector";

/**
 * Plantillas del motivo con nombre, alcance y versión (F14, 17-10). Guardan el motivo y el texto,
 * nunca un monto; una plantilla que no sirve para esta nota no se carga. Parte de `useNotasCredito`.
 */
export function useNcPlantillas(previo: ReturnType<typeof useNcEstado> & ReturnType<typeof useNcSelector>) {
  const { templates, setTemplates, setShowTemplates, form, setForm, prompt, notice, selectedVenta } = previo;

  const persistir = (lista: NCTemplate[]) => {
    setTemplates(lista);
    try {
      window.localStorage.setItem(CLAVE_PLANTILLAS, JSON.stringify(lista));
    } catch (err) {
      logger.warn("[notas-credito] guardar plantillas", { error: String(err) });
    }
  };

  const saveTemplate = async () => {
    if (!form.codigoMotivo || !form.descripcionMotivo.trim()) return;
    const name = await prompt({
      title: "Guardar como plantilla",
      description: "Guarda el motivo y el texto, nunca el monto. Si ya hay una con ese nombre, sube de versión.",
      label: "Nombre",
      placeholder: "Ej.: Devolución de producto vencido",
      inputType: "text",
      required: true,
      confirmLabel: "Guardar plantilla",
    });
    if (!name?.trim()) return;
    persistir(guardarPlantilla(templates, { name, ...form }, new Date().toISOString(), crypto.randomUUID()));
  };

  const deleteTemplate = (id: string) => persistir(templates.filter((t) => t.id !== id));

  const loadTemplate = async (t: NCTemplate) => {
    const { bloquea } = revisarPlantilla(t, !!selectedVenta);
    if (bloquea) {
      await notice({ title: `No se puede usar «${t.name}» aquí`, description: bloquea, intent: "warning" });
      return;
    }
    setForm((prev) => ({ ...prev, codigoMotivo: t.codigoMotivo, descripcionMotivo: t.descripcionMotivo, notasText: t.notasText ?? prev.notasText }));
    setShowTemplates(false);
  };

  return { saveTemplate, deleteTemplate, loadTemplate };
}
