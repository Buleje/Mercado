import { type ContractTemplate, EMISOR_FIELD_MAP, fillTemplate, contraparteDelContrato, montoDelContrato, inicioDelContrato, vencimientoDelContrato } from "@/lib/contratos/plantillas";
import { useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ContratoAPI } from "./constantes-contratos";
import type { HastaContratosVista } from "./use-contratos-vista";
export function useContratosWizard(previo: HastaContratosVista) {
  const { setSelectedTemplate, setCreateError, setFieldErrors, setCustomSelectValues, setGeoResult,
    setVencimientoManual, storeSettings, paraPersona, setWizardData, setAutoFilledFields, setWizardStep,
    setActiveTab, selectedTemplate, wizardData, setCreating, vencimientoManual, fetchContratos, setSelected } = previo;
  // ── Wizard: Create ────────────────────────────────────────────────────

  const startWizard = (tpl: ContractTemplate) => {
    setSelectedTemplate(tpl);
    setCreateError(null);
    setFieldErrors({});
    setCustomSelectValues({});
    setGeoResult(null);
    setVencimientoManual("");

    // Auto-fill emisor fields from settings + date + city
    const autoData: Record<string, string> = {};
    const autoKeys = new Set<string>();

    tpl.fields.forEach(f => {
      const settingsKey = EMISOR_FIELD_MAP[f.key];
      if (settingsKey && storeSettings[settingsKey]) {
        autoData[f.key] = storeSettings[settingsKey];
        autoKeys.add(f.key);
      }
    });

    // Auto-fill FECHA with today
    const today = new Date().toISOString().slice(0, 10);
    const fechaField = tpl.fields.find(f => f.key === "FECHA");
    if (fechaField) {
      autoData["FECHA"] = today;
      autoKeys.add("FECHA");
    }

    // Auto-fill CIUDAD with Pucallpa
    const ciudadField = tpl.fields.find(f => f.key === "CIUDAD");
    if (ciudadField) {
      autoData["CIUDAD"] = "Pucallpa";
      autoKeys.add("CIUDAD");
    }

    // La persona que vino de Equipo › Personal: nombre, documento, domicilio y cargo.
    for (const [clave, valor] of Object.entries(paraPersona.camposDe(tpl))) {
      autoData[clave] = valor;
      autoKeys.add(clave);
    }

    setWizardData(autoData);
    setAutoFilledFields(autoKeys);
    setWizardStep(0);
    setActiveTab("crear");
  };

  const wizardGroups = selectedTemplate ? [
    { id: "emisor", label: "Datos del Emisor", fields: selectedTemplate.fields.filter(f => f.group === "emisor") },
    { id: "contraparte", label: "Datos de la Contraparte", fields: selectedTemplate.fields.filter(f => f.group === "contraparte") },
    { id: "contrato", label: "Datos del Contrato", fields: selectedTemplate.fields.filter(f => f.group === "contrato") },
  ] : [];

  const wizardGroupLabels = ["Datos del Emisor", "Datos de la Contraparte", "Datos del Contrato", "Vista Previa", "Confirmar y Generar"];

  const generateContent = useCallback(() => {
    if (!selectedTemplate) return "";
    return selectedTemplate.clausulas.map(c => fillTemplate(c, wizardData)).join("\n\n");
  }, [selectedTemplate, wizardData]);

  const generateSummary = useCallback(() => {
    if (!selectedTemplate) return "";
    return fillTemplate(selectedTemplate.summaryTemplate, wizardData);
  }, [selectedTemplate, wizardData]);

  const handleCreate = async () => {
    if (!selectedTemplate) return;
    setCreateError(null);

    // Validate required fields
    const missing = selectedTemplate.fields.filter(f => f.required && !wizardData[f.key]?.trim());
    if (missing.length > 0) {
      setCreateError(`Campos requeridos faltantes: ${missing.map(f => f.label).join(", ")}`);
      return;
    }

    setCreating(true);
    try {
      const { nombre: clienteNombre, documento: clienteDoc } = contraparteDelContrato(selectedTemplate, wizardData);
      const monto = montoDelContrato(selectedTemplate, wizardData);

      const content = generateContent();
      const summary = generateSummary();
      const descripcion = `${selectedTemplate.name} — ${summary}`.substring(0, 1999);

      const fecha = inicioDelContrato(wizardData);
      // El vencimiento sale de la fecha de fin o del plazo en meses/años de la
      // plantilla. Antes no se mandaba nunca: todos los contratos quedaban
      // vigentes para siempre y los avisos jamás se disparaban. Si la plantilla
      // no lo define, lo cargó a mano en el último paso.
      const fechaVencimiento =
        vencimientoDelContrato(selectedTemplate, wizardData) || vencimientoManual.trim() || null;

      const clausulasArr = content.split("\n\n").filter(c => c.trim());

      const res = await fetch("/api/contratos", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          // El tipo va tal cual lo declara la plantilla. El mapa viejo aplastaba
          // 12 tipos en 8, así que un NDA se guardaba y se listaba como "Servicios".
          tipo: selectedTemplate.tipo,
          clienteNombre,
          clienteDoc,
          descripcion,
          resumen: summary.substring(0, 1999),
          monto,
          fecha,
          fechaVencimiento,
          plantillaId: selectedTemplate.id,
          // Hecho desde Equipo › Personal: queda en la ficha de esa persona.
          ...(paraPersona.persona ? { colaboradorId: paraPersona.persona.id } : {}),
          lugarFirma: wizardData["CIUDAD"] || "Pucallpa",
          // El texto y los datos del asistente ahora viajan al servidor: antes
          // vivían sólo en el localStorage del navegador que creó el contrato.
          contenido: content,
          datos: wizardData,
          clausulas: clausulasArr.slice(0, 40),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(typeof err.error === "string" ? err.error : JSON.stringify(err.error));
      }
      const creado: ContratoAPI = await res.json();

      setSelectedTemplate(null);
      setWizardData({});
      setVencimientoManual("");
      setWizardStep(0);
      setActiveTab("contratos");
      await fetchContratos();
      // El asistente terminaba tirándote al listado, y definir quién firma o
      // revisar el contrato quedaba como algo que había que descubrir después.
      // Ahora se abre la ficha recién creada, que es donde están el revisor,
      // los firmantes y el envío por WhatsApp, todo seguido.
      setSelected(creado);
      paraPersona.quitar();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  return { startWizard, wizardGroups, wizardGroupLabels, generateContent, generateSummary, handleCreate };
}
export type HastaContratosWizard = HastaContratosVista & ReturnType<typeof useContratosWizard>;