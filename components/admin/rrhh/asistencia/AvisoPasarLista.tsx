"use client";

/**
 * AvisoPasarLista — el mismo aviso que llega por Telegram a las 9:00, pero dentro del
 * panel: si hoy es día de trabajo, ya pasaron las 9 y nadie marcó, invita a pasar lista.
 * La regla es una sola (`lib/rrhh/aviso-pasar-lista`).
 */
import { BellRing } from "@buleje/design-system/icons";
import { decidirAvisoLista, esperadosEseDia, minutosDeLima } from "@/lib/rrhh/aviso-pasar-lista";
import type { HojaAsistenciaDTO } from "@/lib/rrhh/tipos";
import { AvisoRrhh, BOTON } from "../rrhh-form";

export default function AvisoPasarLista({ hoja, fecha, onPasar }: { hoja: HojaAsistenciaDTO; fecha: string; onPasar: () => void }) {
  if (fecha !== hoja.hoy) return null;
  const esperados = esperadosEseDia(hoja.colaboradores, fecha);
  const marcasHoy = hoja.marcas.filter((m) => m.fecha === fecha).length;
  const { avisar } = decidirAvisoLista({ fecha, minutosLima: minutosDeLima(new Date()), esperados: esperados.length, marcasHoy });
  if (!avisar) return null;
  return (
    <AvisoRrhh
      tono="aviso"
      icono={BellRing}
      className="items-center py-1.5"
      accion={
        <button type="button" onClick={onPasar} className={BOTON.chicoPrimario}>
          Pasar lista
        </button>
      }
    >
      <p className="font-semibold">Hoy nadie marcó asistencia ({esperados.length} {esperados.length === 1 ? "trabajador" : "trabajadores"}).</p>
    </AvisoRrhh>
  );
}
