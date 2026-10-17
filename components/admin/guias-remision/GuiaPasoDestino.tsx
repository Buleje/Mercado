"use client";

/** Etapa «Destino» de la guía nueva: quién recibe y la ruta, con lo usado antes a un toque (F19). */
import { button } from "@/components/ui-system/button-variants";
import { BloqueGuia, CampoGuia, errorDe, UsarDeNuevo } from "./guia-piezas";
import type { NuevaGuia } from "./use-nueva-guia";

export function GuiaPasoDestino({ g }: { g: NuevaGuia }) {
  const { form } = g;
  const err = errorDe(g.pendientes, g.visitados.includes("destino"));
  const partidas = g.frecuentes.partidas.filter((p) => p !== form.puntoPartida);
  const llegadaIgualDireccion = !form.puntoLlegada.trim() && form.destinatarioDireccion.trim();

  return (
    <div className="space-y-5">
      <BloqueGuia titulo="Quién recibe">
        {!g.pedido && <UsarDeNuevo opciones={g.frecuentes.destinos} rotulo={(d) => d.nombre} onUsar={g.usarDestino} />}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoGuia etiqueta="Nombre o razón social" required placeholder="Bodega Doña Rosa" valor={form.destinatarioNombre} onCambio={(v) => g.campo("destinatarioNombre", v)} error={err("destinatarioNombre")} />
          <CampoGuia etiqueta="RUC o DNI" soloNumeros maxLength={11} placeholder="11 u 8 números" valor={form.destinatarioRuc} onCambio={(v) => g.campo("destinatarioRuc", v)} error={err("destinatarioRuc")} />
          <CampoGuia
            etiqueta="Dirección de quien recibe"
            required
            placeholder="Jr. Tarapacá 244, Pucallpa"
            valor={form.destinatarioDireccion}
            onCambio={(v) => g.campo("destinatarioDireccion", v)}
            error={err("destinatarioDireccion")}
            className="sm:col-span-2"
          />
        </div>
      </BloqueGuia>

      <BloqueGuia titulo="Ruta">
        <UsarDeNuevo opciones={partidas} rotulo={(p) => `Sale de ${p}`} onUsar={(p) => g.campo("puntoPartida", p)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoGuia etiqueta="Punto de partida" required placeholder="De dónde sale la carga" valor={form.puntoPartida} onCambio={(v) => g.campo("puntoPartida", v)} error={err("puntoPartida")} />
          <div className="space-y-2">
            <CampoGuia etiqueta="Punto de llegada" required placeholder="A dónde llega la carga" valor={form.puntoLlegada} onCambio={(v) => g.campo("puntoLlegada", v)} error={err("puntoLlegada")} />
            {llegadaIgualDireccion && (
              <button type="button" onClick={() => g.campo("puntoLlegada", form.destinatarioDireccion.trim())} className={button({ variant: "ghost", className: "rounded-xl" })}>
                Usar la dirección de quien recibe
              </button>
            )}
          </div>
        </div>
      </BloqueGuia>
    </div>
  );
}
