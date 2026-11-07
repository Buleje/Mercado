"use client";

/**
 * Los indicadores de Personas (Por recuperar, Adelantado, Devuelto, Le debes y
 * «N de M te deben») y las cuentas de los chips de situación. Salió de
 * `PersonasView` (30-10) cuando llegó el filtro por tipo: con un tipo elegido
 * todo se calcula sólo con ese tipo —«los choferes me deben S/ X»—, así que
 * quien llama pasa ya la lista recortada.
 *
 * Los totales usan la MISMA definición que la pestaña Adelantos: los
 * cancelados no se cobran. Cada total ya viene por persona segmentado por
 * moneda: se mergean los mapas, no se suman números crudos.
 */

import { Coins, TrendingUp, Users, Wallet } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import TarjetaIndicador from "@/components/admin/por-cobrar/TarjetaIndicador";
import { estadoDeCredito, requiereAtencion, saldoParaLimite } from "@/lib/adelantos/limite-credito";
import { cuentaDePersona } from "@/lib/adelantos/modos-alta";
import { faltaTelefono, faltanDatos } from "@/lib/adelantos/datos-persona";
import { ETIQUETA_RELACION_PLURAL } from "@/lib/adelantos/persona-campos";
import type { FiltroTipo } from "@/lib/adelantos/ordenar-personas";
import { fmtMonedas } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

const mergear = (map: Record<string, number>, otro: Record<string, number>) => {
  for (const [moneda, monto] of Object.entries(otro)) map[moneda] = (map[moneda] ?? 0) + monto;
};

export function useIndicadoresPersonas(
  personas: readonly BeneficiarioConSaldo[],
  { cargando, tipo }: { cargando: boolean; tipo: FiltroTipo | null },
) {
  const tot = personas.reduce(
    (acc, b) => {
      mergear(acc.adelantado, b.totalAdelantado);
      mergear(acc.entregado, b.totalEntregado);
      mergear(acc.porRecuperar, b.saldoPendiente);
      /* «Le debes» = entregó de más + lo que te dio y devuelves (ADR-448 §2.6). */
      mergear(acc.aFavor, cuentaDePersona(b).leDebes);
      return acc;
    },
    { adelantado: {} as Record<string, number>, entregado: {} as Record<string, number>, porRecuperar: {} as Record<string, number>, aFavor: {} as Record<string, number> },
  );
  const conSaldo = personas.filter((b) => Object.values(b.saldoPendiente).some((v) => v > 0)).length;
  const enRiesgo = personas.filter((b) => requiereAtencion(estadoDeCredito(b.limiteCredito, saldoParaLimite(b.saldoPendiente)))).length;
  const sinTelefono = personas.filter(faltaTelefono).length;
  const conDatosFaltantes = personas.filter(faltanDatos).length;
  const hayTopes = personas.some((b) => (b.limiteCredito ?? 0) > 0);
  const hayLeDebes = Object.values(tot.aFavor).some((v) => v > 0);
  const deQuien = tipo == null ? "" : ` · ${tipo === "sin-tipo" ? "Sin tipo" : ETIQUETA_RELACION_PLURAL[tipo]}`;

  const kpis = useKpisPlegables({
    claveMemoria: "adelantos-personas",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: cargando,
    resumen: `${conSaldo} de ${personas.length} te deben${deQuien}`,
    tarjetas: [
      <TarjetaIndicador key="recuperar" rotulo="Por recuperar" valor={fmtMonedas(tot.porRecuperar)} detalle={`${conSaldo} persona${conSaldo === 1 ? "" : "s"} con saldo`} icono={Wallet} tono="destacado" />,
      <TarjetaIndicador key="adelantado" rotulo="Adelantado" valor={fmtMonedas(tot.adelantado)} detalle="Sin los cancelados" icono={Coins} />,
      <TarjetaIndicador key="devuelto" rotulo="Devuelto" valor={fmtMonedas(tot.entregado)} detalle="En entregas y pagos" icono={TrendingUp} />,
      ...(hayLeDebes ? [<TarjetaIndicador key="le-debes" rotulo="Le debes" valor={fmtMonedas(tot.aFavor)} detalle="Te pagaron antes o te entregaron de más" icono={Users} />] : []),
    ],
  });

  return { kpis, cuentas: { todas: personas.length, deben: conSaldo, riesgo: enRiesgo, sinTelefono, faltanDatos: conDatosFaltantes, hayTopes } };
}
