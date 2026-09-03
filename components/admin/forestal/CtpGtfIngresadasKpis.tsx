"use client";

/**
 * Los KPI del ARCHIVO, que no son los de la bandeja (ADR-357).
 *
 * «GTF ingresadas» mostraba las mismas cinco tarjetas que Ingresos: «Ingresos
 * del período», «Pendientes validar», «Fuera de plazo», «Especies CITES». En el
 * archivo dos de ellas **no pueden decir nada**: ahí todo está recepcionado y
 * validado por definición, así que «Pendientes validar» es siempre 0 y el
 * operador aprende a no mirar la fila entera.
 *
 * Lo que sí se pregunta parado en esta pestaña es otra cosa: *¿cuántas guías
 * entraron?, ¿cuánta madera bajó del camión?, ¿cuántas piezas quedaron para la
 * sierra?, ¿alguna no cuadra?*
 *
 * Se calcula de las guías que la tabla ya tiene en memoria: sin un pedido más y
 * sin poder contradecir a la tabla de abajo, que es de donde salen.
 */

import { Boxes, CalendarClock, FileStack, Layers, PackageCheck, Scale, TreePine } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";

import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { CtpKpisPlegables, estaFueraDePlazo, PLAZO_REGISTRO_DIAS, type WoodEntry } from "./ctp-shared";

const nf = (n: number) => n.toLocaleString("es-PE");

export default function CtpGtfIngresadasKpis({
  guias,
  lateOn,
  onLate,
}: {
  guias: GuiaIngreso<WoodEntry>[];
  /** El filtro «fuera de plazo» del panel, para que la tarjeta lo refleje. */
  lateOn?: boolean;
  onLate?: () => void;
}) {
  const volumen = guias.reduce((a, g) => a + g.volumenM3, 0);
  const piezas = guias.reduce((a, g) => a + g.trozasCount, 0);
  const recibidas = guias.reduce((a, g) => a + g.trozasDecididas, 0);
  const especies = new Set(guias.flatMap((g) => g.especies.map((e) => e.comun))).size;
  const sinCuadrar = guias.filter((g) =>
    descuadra(cuadreDeIngreso(g.volumenM3, g.trozasM3, g.trozasCount)),
  ).length;
  /**
   * Guías con al menos un asiento registrado tarde.
   *
   * En el ARCHIVO esto no es una tarea pendiente —ya pasó— pero sí es el dato
   * que cruza un fiscalizador: el plazo de registro es de 2 días hábiles
   * (RDE D000025-2023). El helper es el mismo que pinta el badge de la fila,
   * así que la cifra y la tabla no pueden decir cosas distintas.
   */
  const tarde = guias.filter((g) => g.lineas.some((l) => estaFueraDePlazo(l))).length;
  /** De cuántos títulos habilitantes / predios vino esta madera. */
  const titulos = new Set(
    guias.map((g) => (g.originCode ?? "").trim()).filter(Boolean),
  ).size;

  const activa = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]";

  return (
    /* Todas detrás del botón «Indicadores» (Brandon, 2026-09-03); el titular va
       en la línea de resumen. */
    <CtpKpisPlegables
      claveMemoria="gtf-ingresadas"
      resumen={
        guias.length === 0
          ? "Sin guías en el archivo del período"
          : `${nf(guias.length)} guía${guias.length === 1 ? "" : "s"} · ${volumen.toFixed(2)} m³ · ${nf(piezas)} piezas` +
            (sinCuadrar > 0 ? ` · ${nf(sinCuadrar)} sin cuadrar` : "") +
            (tarde > 0 ? ` · ${nf(tarde)} fuera de plazo` : "")
      }
      tarjetas={[
        <StatCard
          key="guias"
          density="compact"
          label="Guías ingresadas"
          value={nf(guias.length)}
          subValue={`${nf(guias.reduce((a, g) => a + g.lineas.length, 0))} asientos del libro`}
          icon={PackageCheck}
          emphasis="neutral"
        />,
        <StatCard
          key="volumen"
          density="compact"
          label="Volumen recibido"
          value={`${volumen.toFixed(2)} m³`}
          subValue={`${nf(pieTablarDe(volumen))} pt`}
          icon={Boxes}
          emphasis="neutral"
        />,
        <StatCard
          key="piezas"
          density="compact"
          label="Piezas del archivo"
          value={nf(piezas)}
          /* Recibidas vs declaradas: una guía puede traer diez y haber bajado
             ocho (ADR-325). El hueco se ve acá, no en la fila. */
          subValue={piezas > 0 ? `${nf(recibidas)} con recepción cerrada` : "sin lista de piezas"}
          icon={Layers}
          emphasis={piezas > 0 && recibidas < piezas ? "warning" : "neutral"}
        />,
        <StatCard
          key="especies"
          density="compact"
          label="Especies en el archivo"
          value={nf(especies)}
          subValue="distintas en estas guías"
          icon={TreePine}
          emphasis="neutral"
        />,
        <StatCard
          key="titulos"
          density="compact"
          label="Títulos habilitantes"
          value={nf(titulos)}
          subValue={
            titulos === 0
              ? "ninguna guía declara código de origen"
              : `predios o concesiones de origen${titulos < guias.length ? ` · ${nf(guias.length - titulos)} guía(s) sin código` : ""}`
          }
          icon={FileStack}
          emphasis={titulos === 0 && guias.length > 0 ? "warning" : "neutral"}
        />,
        <StatCard
          key="plazo"
          density="compact"
          label="Fuera de plazo"
          value={nf(tarde)}
          subValue={
            tarde > 0
              ? lateOn
                ? "Filtrando por estas"
                : `registradas después de los ${PLAZO_REGISTRO_DIAS} días hábiles · ver`
              : "todas se registraron a tiempo"
          }
          icon={CalendarClock}
          emphasis={tarde > 0 ? "warning" : "success"}
          onClick={tarde > 0 ? onLate : undefined}
          className={lateOn ? activa : undefined}
        />,
        <StatCard
          key="cuadre"
          density="compact"
          label="Guías sin cuadrar"
          value={nf(sinCuadrar)}
          subValue={sinCuadrar > 0 ? "no se pueden consumir" : "todas cuadran"}
          icon={Scale}
          emphasis={sinCuadrar > 0 ? "warning" : "success"}
        />,
      ]}
    />
  );
}
