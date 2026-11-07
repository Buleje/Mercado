"use client";

/**
 * Las cuatro cifras de arriba del Resumen (25-10): Te deben · Le debes · Sin
 * moverse o vencido · Te devolvieron este mes. Las calcula el servidor
 * (`hoyToca.cifras`); acá sólo se dibujan, por moneda (ADR-118).
 *
 * «Te deben» y «Le debes» son la cuenta por persona (adelantos + madera): la
 * misma de la lista «Cuenta por persona» de abajo. Si el servidor no la pudo
 * armar se ve «—», nunca una cifra de otra fuente que no cuadre con la lista.
 *
 * Lo de las tarjetas de antes no se perdió: «Recuperaste %» va en el detalle de
 * lo devuelto y «Liquidados» en el de «Te deben».
 */

import { AlarmClock, Coins, Undo2, Wallet } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import TarjetaIndicador from "@/components/admin/por-cobrar/TarjetaIndicador";
import { DIAS_QUIETO, textoMonto, type PorMoneda } from "@/lib/adelantos/hoy-toca";
import type { Resumen } from "./tipos";

const hay = (m: PorMoneda | undefined) => !!m && Object.values(m).some((v) => v > 0);
const de = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function useCifrasResumen(resumen: Resumen) {
  const c = resumen.hoyToca?.cifras ?? null;
  const pct = resumen.totalAdelantado > 0 ? Math.min(100, Math.round((resumen.totalLiquidado / resumen.totalAdelantado) * 100)) : 0;
  const teDeben = c ? textoMonto(c.teDeben) : "—";
  const sinDato = "—";
  const madera = c?.conMadera ? " y madera" : "";

  return useKpisPlegables({
    /* Clave nueva: las cuatro cifras arrancan a la vista (antes, plegadas por defecto). */
    claveMemoria: "adelantos-resumen-hoy",
    abiertoPorDefecto: true,
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    resumen: c
      ? [
          hay(c.teDeben) ? `Te deben ${teDeben}` : "Nadie te debe",
          hay(c.leDebes) ? `le debes ${textoMonto(c.leDebes)}` : "",
          hay(c.porCobrar) ? `sin moverse ${textoMonto(c.porCobrar)}` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : "Saldo de adelantos",
    tarjetas: [
      <TarjetaIndicador
        key="te-deben"
        rotulo="Te deben"
        valor={teDeben}
        detalle={
          c && hay(c.teDeben)
            ? `${de(c.personasQueDeben, "persona", "personas")} · ${de(c.abiertos, "adelanto abierto", "adelantos abiertos")} · ${resumen.adelantosLiquidados} liquidados`
            : `Nadie te debe · ${resumen.adelantosLiquidados} liquidados`
        }
        icono={Wallet}
        tono="destacado"
        ayuda={`Lo que te deben, persona por persona, sumando adelantos${madera}: la misma cuenta de «Cuenta por persona», abajo. Diste S/ 1,000 y te entregaron S/ 400 en madera: te deben S/ 600.`}
      />,
      <TarjetaIndicador
        key="le-debes"
        rotulo="Le debes"
        valor={c ? textoMonto(c.leDebes) : sinDato}
        detalle={c && hay(c.leDebes) ? `A ${de(c.personasLeDebes, "persona", "personas")}: lo liquidas en «Cuenta por persona»` : "No le debes a nadie"}
        icono={Coins}
        ayuda={`Lo que tú debes, persona por persona: ${c?.conMadera ? "la madera que te entregaron y todavía no pagas, " : ""}lo que te entregaron de más de un adelanto y lo que te dieron a ti (un pago adelantado o un préstamo) y no devuelves. La misma cuenta de «Cuenta por persona», abajo.`}
      />,
      <TarjetaIndicador
        key="quieto"
        rotulo="Sin moverse o vencido"
        valor={c ? textoMonto(c.porCobrar) : sinDato}
        detalle={c && c.personasPorCobrar > 0 ? `De ${de(c.personasPorCobrar, "persona", "personas")}: cóbrales en «Hoy toca»` : "Nada quieto ni vencido"}
        icono={AlarmClock}
        tono={c && hay(c.porCobrar) ? "alerta" : "normal"}
        ayuda={`De lo que te deben, lo que lleva ${DIAS_QUIETO} días o más sin una entrega ni una gestión de cobranza, o lo que ya venció y nadie gestionó; nunca más de lo que esa persona te debe en su cuenta entera. Quispe recibió S/ 17,000 el 03/08 y no entregó nada: cuenta acá.`}
      />,
      <TarjetaIndicador
        key="devolvieron"
        rotulo="Te devolvieron este mes"
        valor={c ? textoMonto(c.volvioEsteMes) : sinDato}
        detalle={`${c ? `${de(c.entregasEsteMes, "entrega", "entregas")} · ` : ""}recuperaste ${pct} % de todo lo que diste`}
        icono={Undo2}
        ayuda="Lo que te entregaron este mes (en plata, madera o servicio) de los adelantos que diste. Las entregas anuladas no cuentan."
      />,
    ],
  });
}
