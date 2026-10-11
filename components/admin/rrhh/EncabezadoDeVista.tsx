"use client";

/**
 * EncabezadoDeVista — la cabecera de cada vista de RRHH dentro de Equipo, en
 * UNA fila (patrón del panel, noche 11-10): título + ⓘ · secciones (Día /
 * Semana / Mes) · a la derecha lo que la vista pide (Indicadores, la acción
 * principal) y «⋯ Más» con lo secundario.
 *
 * La pinta CADA vista (no el hub): la acción principal y el menú dependen de
 * sus datos («Todos presentes (6)», «Agregar persona»). Las vistas la dibujan
 * también mientras cargan o fallan, así el título no salta.
 *
 * Los enlaces llevan a donde vive lo operativo (regla R1 del plan): el turno
 * y las comisiones en Ventas y caja, los adelantos en Mi Plata, los usuarios
 * del panel en Configuración. Van en «⋯» y sólo si esa vista se le ofrece a
 * esta persona (el origen REGISTRADO de la vista destino, como `PermisoDe`).
 */

import { useMemo, type ReactNode } from "react";
import { ArrowUpRight, MoreHorizontal } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useContextoPermiso } from "@/hooks/use-vistas-permitidas";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { origenesDeVista, vistaPermitida } from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import type { AyudaDeVista } from "./TituloDeVista";

interface EnlaceDeVista {
  texto: string;
  tab: Tab;
  vista: string;
  /** `?sub=` de la vista destino (Adelantos › Personas). */
  sub?: string;
}

interface Encabezado {
  titulo: string;
  ayuda: AyudaDeVista;
  enlaces?: readonly EnlaceDeVista[];
}

export const ENCABEZADOS_RRHH: Readonly<Record<string, Encabezado>> = {
  asistencia: {
    titulo: "Quién vino y a qué hora",
    ayuda: {
      what: "Quién vino, quién llegó tarde y quién faltó, por día, semana o mes.",
      affects: "Cada marca cuenta en Lo ganado. El cajero y el almacenero corrigen hasta 2 días atrás; el dueño, cualquier día.",
      example: "Ana entra a las 8:00 y marca 8:20: queda como tardanza.",
    },
    enlaces: [{ texto: "Turno de caja", tab: "ventas-caja", vista: "turnos" }],
  },
  personal: {
    titulo: "Las personas del negocio",
    ayuda: {
      what: "Los datos de cada persona: puesto, estado, contacto, fotocheck y su cuenta del panel.",
      affects: "Su tarifa es la que usa Lo ganado para calcular lo que le toca.",
      example: "María entra como cajera a S/ 50 por día: con 6 días marcados, Lo ganado le da S/ 300.",
    },
    enlaces: [
      { texto: "Adelantos por persona", tab: "plata", vista: "adelantos", sub: "personas" },
      // Las CUENTAS del panel (usuario, rol, contraseña) viven en Configuración;
      // acá están las personas del negocio, su puesto y su pago.
      { texto: "Usuarios y acceso del panel", tab: "config", vista: "equipo" },
    ],
  },
  ganado: {
    titulo: "Cuánto ganó cada uno",
    ayuda: {
      what: "Lo ganado por cada persona en el período, según su asistencia y su tarifa. Es de referencia: no es una planilla.",
      affects: "«Queda por pagar» = lo ganado − lo ya descontado por planilla en el período − los adelantos abiertos. El saldo de adelantos es el de hoy: un adelanto dado antes del período igual se resta.",
      example: "Ganó S/ 600, ya se le descontó S/ 100 y debe S/ 150 de adelantos: queda por pagar S/ 350.",
    },
    enlaces: [{ texto: "Comisiones de venta", tab: "ventas-caja", vista: "comisiones" }],
  },
  contratos: {
    titulo: "Contratos de trabajo",
    ayuda: {
      what: "Los contratos de trabajo o locación, y cualquiera vinculado a una persona, con su vencimiento.",
      affects: "Se crean y se editan en Contratos; acá ves sólo los del personal.",
      example: "El contrato de Luis vence el 30/11: lo ves acá con su estado.",
    },
  },
  puestos: {
    titulo: "Puestos y tarifas",
    ayuda: {
      what: "Los puestos del negocio y la tarifa sugerida de cada uno.",
      affects: "La tarifa del puesto sólo prellena la de la persona: cambiarla no le toca el sueldo a nadie ya contratado.",
      example: "Creas «Ayudante de almacén» a S/ 45 por día: al darle ese puesto a alguien nuevo, su tarifa ya viene puesta.",
    },
  },
};

/** El origen con que el panel decide si ofrece esa vista (el registrado; si no hay, la pestaña). */
function origenDe(enlace: EnlaceDeVista): readonly string[] {
  const vista = vistasDelModulo(enlace.tab).find((v) => v.key === enlace.vista);
  return origenesDeVista(enlace.tab, vista ?? {});
}

function hrefDe(enlace: EnlaceDeVista): string {
  const params: Record<string, string> = { vista: enlace.vista };
  if (enlace.sub) params.sub = enlace.sub;
  return hrefDeDestino({ tab: enlace.tab, params });
}

interface Props {
  vista: string;
  /** Las secciones de la vista (Día / Semana / Mes), pegadas al título. */
  secciones?: ReactNode;
  /** A la derecha: Indicadores y la acción principal (h-12). */
  acciones?: ReactNode;
  /** Lo secundario de la vista; los enlaces a otras pestañas se suman al final. */
  menu?: readonly MenuAccion[];
}

export default function EncabezadoDeVista({ vista, secciones, acciones, menu = [] }: Props) {
  const encabezado = ENCABEZADOS_RRHH[vista];
  const ctx = useContextoPermiso();
  const enlaces = useMemo<MenuAccion[]>(
    () =>
      (encabezado?.enlaces ?? [])
        .filter((e) => ctx !== null && vistaPermitida(ctx, origenDe(e)))
        .map((e) => ({ id: `ir-${e.tab}-${e.vista}`, label: e.texto, hint: "Se abre en su pestaña", icon: ArrowUpRight, onSelect: () => void irAEnlace(hrefDe(e)) })),
    [encabezado, ctx],
  );
  if (!encabezado) return null;
  const todas = [...menu, ...enlaces];
  return (
    /* Como Turnos: en el celular las secciones bajan a su propia fila. */
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <SectionTitle className="truncate">{encabezado.titulo}</SectionTitle>
        <InfoTip title={encabezado.titulo} what={encabezado.ayuda.what} affects={encabezado.ayuda.affects} example={encabezado.ayuda.example} side="bottom" />
      </div>
      {secciones && <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">{secciones}</div>}
      {(acciones || todas.length > 0) && (
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {acciones}
          {todas.length > 0 && (
            <ActionMenu label="Más" icon={MoreHorizontal} actions={todas} soloIcono size="md" className="w-12 shrink-0" title={todas.map((a) => a.label).join(", ")} />
          )}
        </div>
      )}
    </div>
  );
}
