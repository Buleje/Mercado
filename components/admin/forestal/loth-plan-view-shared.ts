/**
 * Lo que `LothPlanView` arma sin estado propio: las claves de la pestaña
 * recordada, el menú «Opciones» y las pestañas con su cifra y su alerta.
 *
 * Salió tal cual de `LothPlanView` (628 líneas) para dejar la vista en el orden
 * de los bloques; las funciones se llaman en cada render, como antes.
 */

import { Eraser, FileText, Pencil, Plus, Printer, Trash2, Upload } from "@buleje/design-system/icons";
import type { Dispatch, SetStateAction } from "react";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { printLothPoa } from "@/lib/forestal/loth-poa-print";
import { formatNumber } from "@/lib/format";
import type { PestanaDef, PestanaPlan } from "./LothPlanPestanas";
import { printInforme } from "./loth-plan-informe";
import type { useLothPlan } from "./hooks/use-loth-plan";
import type { loQueFalta } from "./plan-documentos/modelo";
import type { PapelesDelPlan } from "@/lib/forestal/loth-plan-papeles";

/* Las claves de la pestaña viven en `plan-papeles/abrir-papeles` (el Archivo
   las escribe para abrir «Papeles» sin cargar el libro). */
export { CLAVE_PESTANA_PLAN, CLAVE_PESTANA_PLANTACION } from "./plan-papeles/abrir-papeles";

type DatosPlan = ReturnType<typeof useLothPlan>;
type PlanElegido = DatosPlan["plan"];

export function opcionesDelPlan({
  d,
  plan,
  esPlantacion,
  borrandoPlan,
  setErrorPlan,
  setPestana,
  setImportarSignal,
  setEditandoPlan,
  setBorrandoOperaciones,
  eliminarPlan,
}: {
  d: DatosPlan;
  plan: PlanElegido;
  esPlantacion: boolean;
  borrandoPlan: boolean;
  setErrorPlan: Dispatch<SetStateAction<string | null>>;
  setPestana: Dispatch<SetStateAction<PestanaPlan>>;
  setImportarSignal: Dispatch<SetStateAction<number>>;
  setEditandoPlan: Dispatch<SetStateAction<boolean>>;
  /** Abre «Borrar operaciones del plan» (Brandon 07-10-2026). */
  setBorrandoOperaciones: Dispatch<SetStateAction<boolean>>;
  eliminarPlan: (p: NonNullable<PlanElegido>) => Promise<void>;
}): MenuAccion[] {
  /* Lo que se hace de vez en cuando —imprimir, importar, crear otro plan— va
     en «Opciones»; a la vista queda el selector del plan y el detalle. */
  const todasLasOpciones: MenuAccion[] = [
    {
      id: "informe",
      label: esPlantacion ? "Informe de la plantación" : "Informe de ejecución",
      hint: esPlantacion
        ? "Lo registrado por especie, lo talado, lo que queda en pie y lo despachado"
        : "Balance, censo y movimientos del libro, para ARFFS / SERFOR / OSINFOR",
      icon: Printer,
      disabled: !plan,
      onSelect: () => {
        if (plan) void printInforme(plan, d.species, d.censusStat).then((e) => { if (e) setErrorPlan(e); });
      },
    },
    {
      id: "anexo-poa",
      label: "Anexo POA",
      hint: "El cuadro del Plan Operativo por especie, para presentar",
      icon: FileText,
      tone: "dark",
      disabled: !plan,
      onSelect: () => {
        if (!plan) return;
        printLothPoa(d.poa, {
          titular: plan.titularName,
          tituloHabilitante: plan.tituloHabilitante,
          planNumber: plan.planNumber,
          planType: plan.planType,
          resolucion: plan.resolucionNumber,
          arffs: plan.arffs,
          parcelaCorta: plan.parcelaCorta,
          vigencia: plan.vigenciaHasta,
        });
      },
    },
    {
      id: "importar-censo",
      label: esPlantacion ? "Importar árboles marcados" : "Importar censo",
      hint: esPlantacion ? "Opcional: los árboles marcados desde un CSV o Excel" : "Traer los árboles de un CSV o Excel del inventario",
      icon: Upload,
      disabled: !plan,
      onSelect: () => { setPestana("censo"); setImportarSignal((n) => n + 1); },
    },
    {
      id: "editar-plan",
      label: esPlantacion ? "Editar el registro" : "Editar este plan",
      hint: esPlantacion ? "Corregir código, constancia, superficie, titular" : "Corregir sus datos: resolución, área, vigencia, propietario",
      icon: Pencil,
      disabled: !plan,
      onSelect: () => setEditandoPlan(true),
    },
    {
      id: "borrar-operaciones",
      label: "Borrar operaciones del plan",
      hint: "Tala, trozado y despachos de este plan; antes te dice cuántas hay",
      icon: Eraser,
      tone: "danger",
      disabled: !plan,
      onSelect: () => setBorrandoOperaciones(true),
    },
    {
      id: "eliminar-plan",
      label: "Eliminar este plan",
      hint: "Dice antes qué cuelga de él: especies, censo, asientos y guías",
      icon: Trash2,
      tone: "danger",
      disabled: !plan || borrandoPlan,
      onSelect: () => { if (plan) void eliminarPlan(plan); },
    },
    {
      id: "nuevo-plan",
      label: "Nuevo plan de manejo",
      hint: "Otro permiso: su resolución, titular y vigencia",
      icon: Plus,
      onSelect: () => d.setShowPlanForm(true),
    },
  ];
  /* El Anexo POA es el cuadro del Plan Operativo de bosque natural (DMC,
     semilleros): una plantación no lo presenta. */
  const opciones = esPlantacion ? todasLasOpciones.filter((o) => o.id !== "anexo-poa") : todasLasOpciones;
  return opciones;
}

export function pestanasDelPlan({
  d,
  docs,
  faltaDocs,
  papeles,
}: {
  d: DatosPlan;
  docs: { disponible: boolean };
  faltaDocs: ReturnType<typeof loQueFalta>;
  /** «Papeles del permiso»: lo que la norma pide contra lo que hay. Sin vista todavía, null. */
  papeles?: Pick<PapelesDelPlan, "requeridos" | "presentes" | "vencidos" | "vencenPronto" | "faltan"> | null;
}): { pestanas: PestanaDef[]; pestanasPlantacion: PestanaDef[] } {
  const { zafra } = d;
  /* «Papeles» (ADR-467 + papeles del permiso): la tienen el bosque natural y
     la plantación —la resolución o la constancia de registro también vencen y
     se piden—. La cifra es la de la norma («2/4 papeles»); mientras la vista
     no llega, la de los casilleros. Sin las rutas en el despliegue, no aparece. */
  const faltanPapeles = papeles?.faltan.length ?? 0;
  const pestanaDocumentos: PestanaDef[] = !docs.disponible
    ? []
    : papeles && papeles.requeridos > 0
      ? [{
          id: "documentos",
          label: "Papeles",
          cuenta: `${papeles.presentes}/${papeles.requeridos}`,
          alerta: papeles.vencidos > 0 ? "danger" : faltanPapeles > 0 || papeles.vencenPronto > 0 ? "warn" : undefined,
          alertaTexto:
            papeles.vencidos > 0 ? `${papeles.vencidos} ${papeles.vencidos === 1 ? "papel vencido" : "papeles vencidos"}`
              : faltanPapeles > 0 ? `${faltanPapeles} ${faltanPapeles === 1 ? "papel falta" : "papeles faltan"}`
                : papeles.vencenPronto > 0 ? `${papeles.vencenPronto} por vencer` : undefined,
        }]
      : [{
          id: "documentos",
          label: "Papeles",
          cuenta: faltaDocs.esperados > 0 ? `${faltaDocs.cargados}/${faltaDocs.esperados}` : undefined,
          alerta: faltaDocs.vencidos > 0 ? "danger" : faltaDocs.faltan > 0 || faltaDocs.vencenPronto > 0 ? "warn" : undefined,
          alertaTexto:
            faltaDocs.vencidos > 0 ? `${faltaDocs.vencidos} ${faltaDocs.vencidos === 1 ? "documento vencido" : "documentos vencidos"}`
              : faltaDocs.faltan > 0 ? `${faltaDocs.faltan} ${faltaDocs.faltan === 1 ? "documento falta" : "documentos faltan"}`
                : faltaDocs.vencenPronto > 0 ? `${faltaDocs.vencenPronto} por vencer` : undefined,
        }];
  const peligro = d.fichasEspecie.filter((f) => f.tone === "danger").length;
  const atencion = d.fichasEspecie.filter((f) => f.tone === "warn").length;
  const pestanas: PestanaDef[] = [
    {
      id: "avance",
      label: "Avance y tala",
      labelCorto: "Avance",
      alerta: zafra.estado === "vencida" ? "danger" : zafra.estado === "atrasado" ? "warn" : undefined,
      alertaTexto: zafra.estado === "vencida" ? "Vigencia vencida" : zafra.estado === "atrasado" ? "Zafra atrasada" : undefined,
    },
    {
      id: "especies",
      label: "Especies",
      cuenta: String(d.fichasEspecie.length),
      alerta: peligro > 0 ? "danger" : atencion > 0 ? "warn" : undefined,
      alertaTexto:
        peligro > 0 ? `${peligro} ${peligro === 1 ? "especie con problema" : "especies con problema"}`
          : atencion > 0 ? `${atencion} ${atencion === 1 ? "especie con aviso" : "especies con aviso"}` : undefined,
    },
    { id: "censo", label: "Censo", cuenta: formatNumber(d.censoTotal) },
    ...pestanaDocumentos,
  ];
  const excedidas = d.cascada.especies.filter((c) => c.excedido).length;
  const pestanasPlantacion: PestanaDef[] = [
    {
      id: "registro",
      label: "Registro y saldo",
      cuenta: d.species.length > 0 ? String(d.species.length) : undefined,
      alerta: excedidas > 0 ? "danger" : d.species.length === 0 ? "warn" : undefined,
      alertaTexto:
        excedidas > 0 ? `${excedidas} ${excedidas === 1 ? "especie pasada" : "especies pasadas"} de lo registrado`
          : d.species.length === 0 ? "Sin especies registradas" : undefined,
    },
    /* Opcional y sin alarma: el saldo de una plantación no sale de acá. */
    {
      id: "censo",
      label: d.censoTotal > 0 ? "Árboles marcados" : "Árboles marcados (opcional)",
      labelCorto: "Árboles marcados",
      cuenta: d.censoTotal > 0 ? formatNumber(d.censoTotal) : undefined,
    },
    ...pestanaDocumentos,
  ];
  return { pestanas, pestanasPlantacion };
}
