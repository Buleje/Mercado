"use client";

/**
 * Pestaña «Combustible» de Activos (ADR-533): el cuaderno de combustible en
 * cilindros que el informe técnico le promete a SUNAT (bienes fiscalizados).
 * Arriba cómo está el almacén; abajo, una sección a la vez: ingresos, vales,
 * saldo diario, conteos y el reporte del mes.
 */

import { useMemo, useState } from "react";
import { ClipboardCheck, FileDown, Fuel, Loader2, Plus, Settings2, ShoppingCart } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { BarraDeSecciones, idPestanaDeSeccion, type SeccionDeBarra } from "@/components/admin/shared/BarraDeSecciones";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ValeCuaderno } from "@/lib/combustible/cuaderno";
import { CAMPO, PRIMARIO, SECUNDARIO, mesActualLima } from "./compartido";
import ModalAjustes from "./ModalAjustes";
import ModalConteo from "./ModalConteo";
import ModalIngreso from "./ModalIngreso";
import ModalVale from "./ModalVale";
import { ModalAnular, ModalVerFirma } from "./modales-chicos";
import ReporteDelMes from "./ReporteDelMes";
import ResumenCombustible from "./ResumenCombustible";
import { TablaConteos, TablaSaldoDiario } from "./tablas-control";
import { TablaIngresos, TablaVales } from "./tablas-movimientos";
import { useCuadernoCombustible, type TipoRenglon } from "./use-cuaderno-combustible";

type Seccion = "vales" | "ingresos" | "saldo" | "conteos" | "reporte";
type Modal = "ingreso" | "vale" | "conteo" | "ajustes" | null;
const ID_PANEL = "combustible-seccion";

export default function CombustibleView() {
  const c = useCuadernoCombustible();
  const [seccion, setSeccion] = useState<Seccion>("vales");
  const [mes, setMes] = useState(mesActualLima);
  const [modal, setModal] = useState<Modal>(null);
  const [anular, setAnular] = useState<{ tipo: TipoRenglon; id: string; que: string } | null>(null);
  const [firmaDe, setFirmaDe] = useState<ValeCuaderno | null>(null);

  const { reporte } = c;
  const repHoy = useMemo(() => {
    const [a, m] = mesActualLima().split("-").map(Number);
    return reporte(a, m);
  }, [reporte]);
  const repMes = useMemo(() => {
    const [a, m] = mes.split("-").map(Number);
    return a && m ? reporte(a, m) : null;
  }, [reporte, mes]);

  if (c.cargando) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-[var(--text-tertiary)]">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Cargando el cuaderno…
      </div>
    );
  }
  if (!c.datos) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-[var(--rule-base)] py-12 text-center">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">{c.error ?? "No se pudo cargar el cuaderno."}</p>
        <button type="button" className={SECUNDARIO} onClick={() => void c.recargar()}>Intentar de nuevo</button>
      </div>
    );
  }

  const conteoAtrasado = c.diasDesdeConteo == null || c.diasDesdeConteo > 7;
  const SECCIONES: SeccionDeBarra<Seccion>[] = [
    { clave: "vales", rotulo: "Vales" },
    { clave: "ingresos", rotulo: "Ingresos" },
    { clave: "saldo", rotulo: "Saldo diario" },
    { clave: "conteos", rotulo: "Conteos", cuenta: conteoAtrasado && c.datos.ingresos.length > 0 ? 1 : undefined },
    { clave: "reporte", rotulo: "Reporte del mes", cuenta: repMes?.alertas.length || undefined },
  ];
  const conMes = seccion === "saldo" || seccion === "reporte";

  return (
    <div className="space-y-4" data-combustible>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex min-w-0 items-center gap-1.5">
          <Fuel className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <SectionTitle className="truncate">Cuaderno de combustible</SectionTitle>
          <InfoTip
            title="Cuaderno de combustible"
            what="Lo que entra (cilindros comprados con factura) y lo que sale (vale por máquina con horómetro y firma), con el saldo de cada día."
            affects={`Es lo que se muestra a SUNAT: máx. ${c.datos.config.maxCilindros} cilindros guardados${c.datos.config.cupoAnualGal ? ` y ${c.datos.config.cupoAnualGal.toLocaleString("es-PE")} gal al año` : ""}. Lo contado en el conteo semanal manda.`}
            example="Compras 4 cilindros (220 gal) → C-01 a C-04. El cargador saca 30 gal → sale de C-01 y quedan 190 gal."
          />
        </div>
        <button type="button" className={SECUNDARIO} onClick={() => setModal("ingreso")} title="Anotar una compra de cilindros" data-nuevo-ingreso>
          <ShoppingCart className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Ingreso</span>
        </button>
        <button type="button" className={SECUNDARIO} onClick={() => setModal("conteo")} title="Anotar el conteo físico" data-nuevo-conteo>
          <ClipboardCheck className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Conteo</span>
        </button>
        <ActionMenu
          label="Más del cuaderno"
          soloIcono
          size="md"
          className="w-12 shrink-0"
          actions={[
            { id: "ajustes", label: "Lo declarado a SUNAT", hint: "Producto, cilindros máx., cupo anual, proyección y responsable", icon: Settings2, onSelect: () => setModal("ajustes") },
            { id: "reporte", label: "Reporte del mes", hint: "Balance, consumo por máquina y PDF/Excel", icon: FileDown, onSelect: () => setSeccion("reporte") },
          ]}
        />
        <button type="button" className={PRIMARIO} onClick={() => setModal("vale")} data-nuevo-vale>
          <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden /> Vale
        </button>
      </div>

      <ResumenCombustible c={c} repHoy={repHoy} />

      <div className="flex flex-wrap items-center gap-3">
        <BarraDeSecciones secciones={SECCIONES} activa={seccion} onCambiar={setSeccion} etiqueta="Secciones del cuaderno" idPanel={ID_PANEL} />
        {conMes && (
          <label className="ml-auto flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            Mes
            <input type="month" value={mes} max={mesActualLima()} onChange={(e) => e.target.value && setMes(e.target.value)} className={`${CAMPO} w-44`} />
          </label>
        )}
      </div>

      <div id={ID_PANEL} role="tabpanel" aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)}>
        {seccion === "vales" ? (
          <TablaVales c={c} onAnular={(tipo, id, que) => setAnular({ tipo, id, que })} onVerFirma={setFirmaDe} />
        ) : seccion === "ingresos" ? (
          <TablaIngresos c={c} onAnular={(tipo, id, que) => setAnular({ tipo, id, que })} />
        ) : seccion === "saldo" ? (
          <TablaSaldoDiario c={c} mes={mes} />
        ) : seccion === "conteos" ? (
          <TablaConteos c={c} onAnular={(tipo, id, que) => setAnular({ tipo, id, que })} />
        ) : (
          <ReporteDelMes rep={repMes} />
        )}
      </div>

      {modal === "ingreso" && <ModalIngreso c={c} onClose={() => setModal(null)} />}
      {modal === "vale" && <ModalVale c={c} onClose={() => setModal(null)} />}
      {modal === "conteo" && <ModalConteo c={c} onClose={() => setModal(null)} />}
      {modal === "ajustes" && <ModalAjustes c={c} onClose={() => setModal(null)} />}
      {anular && <ModalAnular c={c} {...anular} onClose={() => setAnular(null)} />}
      {firmaDe && <ModalVerFirma c={c} vale={firmaDe} onClose={() => setFirmaDe(null)} />}
    </div>
  );
}
