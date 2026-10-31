import type { ElementType } from "react";
import { BarChart, Gift, Lightbulb, Package, Tag, Users } from "@buleje/design-system/icons";

/**
 * Lo que se puede ANOTAR hablando o escribiendo.
 *
 * Va separado de las preguntas porque es una capacidad distinta —escribe en
 * los libros del negocio, no los lee— y nadie la descubre leyendo una lista de
 * «¿qué hago hoy?». Son frases de verdad, tal como se dicen: el punto es que se
 * vea que no hay que hablarle raro.
 */
export const EJEMPLOS_ANOTAR: string[] = [
  "Anótame 25 galones de petróleo para el camión N12, a 27 el galón",
  "Le adelanté 300 soles en efectivo a Juan Pérez",
  "Doña Rosa me pagó 50 soles de lo que debía",
  "Pagué 180 soles de luz del local, por Yape",
];

export interface PreguntaSugerida {
  icon: ElementType;
  /** Lo que se lee en el chip. */
  label: string;
  /** Lo que se le manda al asistente: el pedido completo, con el formato. */
  prompt: string;
}

/**
 * Lo que se le PREGUNTA. Además de «¿Qué hago hoy?» y «Ventas de hoy», trae
 * las ideas que tenía la pestaña Sugerencias IA (combos, qué se acaba, qué
 * rebajar, clientes top), ahora como preguntas que responde el servidor.
 *
 * Cada pregunta TIENE que encender su herramienta en el ruteo
 * (`toolsParaMensaje` de lib/agents/tool-routing.ts): si no, el modelo contesta
 * de memoria y parece dato real. «¿Qué fecha comercial viene?» se quitó por eso
 * —el calendario no es herramienta del modelo; lo muestra Promociones—. El
 * candado es __tests__/chat-ia-preguntas-ruteo.test.ts.
 */
export const PREGUNTAS: PreguntaSugerida[] = [
  {
    icon: Lightbulb,
    label: "¿Qué hago hoy?",
    prompt:
      "Analiza mi situación actual y dime las 3 acciones más importantes que debo hacer HOY, en orden de impacto. Explícame con un ejemplo sencillo por qué cada una, y cuánto me puede rendir en soles.",
  },
  {
    icon: BarChart,
    label: "Ventas de hoy",
    prompt:
      "Resume las ventas de hoy vs ayer. Cuántos pedidos, ticket promedio, productos más vendidos. Formato tabla si ayuda.",
  },
  {
    icon: Gift,
    label: "¿Qué combo armo esta semana?",
    prompt:
      "Con mis ventas reales de las últimas semanas, ¿qué productos se compran juntos y qué combo me conviene armar esta semana? Dame 2 o 3 combos con el precio sugerido y cuánto gano con cada uno.",
  },
  {
    icon: Package,
    label: "¿Qué se acaba antes del sábado?",
    prompt:
      "Revisa mi stock y lo que vendo por día: ¿qué productos se me acaban antes del sábado? Dime cuánto pedir de cada uno, en orden de urgencia.",
  },
  {
    icon: Tag,
    label: "¿Qué rebajo porque no se mueve?",
    prompt:
      "¿Qué productos tienen stock y casi no se venden? Dime cuáles me conviene rebajar o poner en promoción, con el precio sugerido y el margen que me queda.",
  },

  {
    icon: Users,
    label: "¿Qué le ofrezco a mis clientes que más compran?",
    prompt:
      "Mira a mis clientes que más compran y lo que suelen llevar: ¿qué le ofrezco a cada uno? Dame un mensaje corto para mandarle por WhatsApp.",
  },
];
