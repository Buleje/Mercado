"use client";

/**
 * AsistenciaView — switch Día / Semana / Mes de la asistencia (ADR-414 §7, ADR-416).
 *
 * Vista por defecto del hub: es lo de todos los días. El día y el mes son dos
 * pantallas de una misma hoja (ADR §4) — comparten `use-rrhh-asistencia`, sólo
 * cambia el rango que se le pide al servidor. El switch se pinta en la misma
 * barra que el navegador de fechas de cada hoja.
 *
 * Acá vive también `MotivoCorreccionModal` (ADR-417): cambiar una marca ya
 * guardada pide el motivo, y la pregunta la hace el hook desde cualquiera de
 * las tres hojas. Montado UNA vez acá arriba, la respuesta sigue viva aunque
 * se cambie de vista mientras el modal está abierto.
 *
 * Día / Semana / Mes son `BarraDeSecciones` en la fila del título (noche
 * 11-10): el estado sigue siendo local, no va a la URL.
 *
 * Arriba, sólo para el dueño, la línea del pago del sábado (24-10): adelantos
 * de la semana y el neto por persona (`../pagos/BarraPagoSemana`). El mismo
 * pago alimenta «Dar adelanto» en el «⋯» de cada fila y su chip «Adelanto
 * S/ 50 esta semana» (25-10, `adelanto-de-la-fila`).
 */

import { useState, type ReactNode } from "react";
import { BarraDeSecciones } from "@/components/admin/shared/BarraDeSecciones";
import { limaDateKey } from "@/lib/utils";
import { diasDelMes, mesDe, semanaDe } from "@/lib/rrhh/fechas";
import HojaDelDia from "./HojaDelDia";
import HojaDelMes from "./HojaDelMes";
import HojaDeLaSemana from "./HojaDeLaSemana";
import MotivoCorreccionModal from "./MotivoCorreccionModal";
import BarraPagoSemana from "../pagos/BarraPagoSemana";
import { usePagoSemana } from "../pagos/use-pago-semana";
import { ProveedorAdelantoDeLaFila } from "./adelanto-de-la-fila";
import { ID_PANEL_ASISTENCIA, type ModoAsistencia } from "./panel-asistencia";
import type { NivelRrhh } from "@/lib/rrhh/tipos";

type Modo = ModoAsistencia;

const MODOS = [
  { clave: "dia", rotulo: "Día" },
  { clave: "semana", rotulo: "Semana" },
  { clave: "mes", rotulo: "Mes" },
] as const;

export default function AsistenciaView({ nivel, onCambioPersonal }: { nivel: NivelRrhh; onCambioPersonal?: () => void }) {
  const [modo, setModo] = useState<Modo>("dia");
  const [fecha, setFecha] = useState<string>(() => limaDateKey());
  const [mes, setMes] = useState<string>(() => mesDe(limaDateKey()));
  const [semana, setSemana] = useState<string>(() => semanaDe(limaDateKey()).desde);
  // El pago del sábado sólo lo ve el dueño (el servidor le dice 403 al encargado).
  const pago = usePagoSemana(nivel === "completo");

  const primerDiaDelMes = `${mes}-01`;
  const ultimoDiaDelMes = `${mes}-${String(diasDelMes(primerDiaDelMes)).padStart(2, "0")}`;

  const elegirModo = (m: Modo) => {
    // Cambiar de vista muestra el período de lo que se estaba mirando, no siempre el actual.
    if (m === "mes" && modo === "dia") setMes(mesDe(fecha));
    if (m === "mes" && modo === "semana") setMes(mesDe(semana));
    if (m === "semana" && modo === "dia") setSemana(semanaDe(fecha).desde);
    if (m === "semana" && modo === "mes") {
      const hoy = limaDateKey();
      setSemana(semanaDe(mesDe(hoy) === mes ? hoy : `${mes}-01`).desde);
    }
    setModo(m);
  };

  /* Las secciones van en la fila del título (patrón del panel, como Turnos):
     cada hoja la pinta en su `EncabezadoDeVista`. */
  const selectorModo = <BarraDeSecciones secciones={MODOS} activa={modo} onCambiar={elegirModo} etiqueta="Ver la asistencia por" idPanel={ID_PANEL_ASISTENCIA} />;

  let hoja: ReactNode;
  if (modo === "dia") {
    hoja = <HojaDelDia fecha={fecha} onCambiarFecha={setFecha} nivel={nivel} onCambioPersonal={onCambioPersonal} selectorModo={selectorModo} />;
  } else if (modo === "semana") {
    hoja = <HojaDeLaSemana desde={semana} onCambiarSemana={setSemana} nivel={nivel} selectorModo={selectorModo} />;
  } else {
    hoja = <HojaDelMes mes={mes} desde={primerDiaDelMes} hasta={ultimoDiaDelMes} onCambiarMes={setMes} selectorModo={selectorModo} />;
  }

  return (
    <ProveedorAdelantoDeLaFila nivel={nivel} pago={nivel === "completo" ? pago : null}>
      {nivel === "completo" && <BarraPagoSemana pago={pago} />}
      {hoja}
      <MotivoCorreccionModal />
    </ProveedorAdelantoDeLaFila>
  );
}
