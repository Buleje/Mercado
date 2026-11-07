import type { PropsEnviarWhatsApp } from "./compartido";
import { useEnviarWhatsAppAcciones } from "./use-enviar-whatsapp-acciones";
import { useEnviarWhatsAppEstado } from "./use-enviar-whatsapp-estado";
/** El estado entero del componente, por hooks encadenados en el MISMO orden del original. */
export function useEnviarWhatsApp(props: PropsEnviarWhatsApp) {
  const h0 = useEnviarWhatsAppEstado(props);
  const h1 = { ...h0, ...useEnviarWhatsAppAcciones(h0) };
  return h1;
}
export type EstadoEnviar = ReturnType<typeof useEnviarWhatsApp>;
