/**
 * EncabezadoDeVista — título, ⓘ y enlaces de cada vista de RRHH dentro de
 * Equipo (plan «panel unificado», ola 2). Lo pinta el hub, arriba de la vista,
 * para que el título esté también mientras carga, vacía o con error.
 *
 * Tareas y Notas no pasan por acá: su acción principal («Nueva tarea»,
 * «Nueva nota») vive en su propio estado, así que cada una pinta su
 * `TituloDeVista` con el botón en la misma fila.
 *
 * Los enlaces llevan a donde vive lo operativo (regla R1 del plan): el turno
 * y las comisiones en Ventas y caja, los adelantos en Mi Plata. Cada uno se
 * dibuja sólo si esa vista se le ofrece a esta persona (`PermisoDe` con el
 * origen REGISTRADO de la vista destino).
 */

import { ArrowUpRight } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { origenesDeVista } from "@/lib/admin/permiso-vista";
import { vistasDelModulo } from "@/lib/admin/subvistas-modulos";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import TituloDeVista, { type AyudaDeVista } from "./TituloDeVista";

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
    enlaces: [{ texto: "Adelantos por persona", tab: "plata", vista: "adelantos", sub: "personas" }],
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

export default function EncabezadoDeVista({ vista }: { vista: string }) {
  const encabezado = ENCABEZADOS_RRHH[vista];
  if (!encabezado) return null;
  return (
    <TituloDeVista titulo={encabezado.titulo} ayuda={encabezado.ayuda}>
      {encabezado.enlaces?.map((e) => (
        <PermisoDe key={e.texto} origen={origenDe(e) as readonly Tab[]}>
          {/* 48 px de alto en el celular (dedo); en escritorio, la altura del texto. */}
          <EnlacePanel href={hrefDe(e)} className="inline-flex h-12 items-center gap-1 text-sm sm:h-auto">
            {e.texto} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </EnlacePanel>
        </PermisoDe>
      ))}
    </TituloDeVista>
  );
}
