"use client";

/**
 * Los bloques Destinatario y Transporte de la GTF, compartidos por las dos
 * guías que emite el sistema: la de salida del CTP (`CtpGuiaDatosTab`) y la del
 * bosque (Libro TH, «Despachar con guía», 28-09-2026).
 *
 * Son el mismo papel —casilleros (22) a (34) del formato SERFOR— y eligen de la
 * misma libreta. Vivían dentro de la pestaña del CTP; se mudaron sin cambiar
 * una línea de lo que dibujan para que la guía del bosque no fuera una copia
 * que se queda atrás el día que se toque una.
 *
 * 15-10-2026: cada libreta abre su ventana (`LibretaModal`) con las partes de
 * ese papel, las demás de la libreta abajo (elegir una le suma el papel) y
 * «Agregar nuevo», que guarda la ficha completa en el Directorio (`libretaDe`).
 * Con `llegada`, el destinatario es además el punto de llegada (formato 2024,
 * RDE D000014-2024-MIDAGRI-SERFOR-DE: no hay un bloque de llegada aparte).
 *
 * 16-10-2026: el Transporte se mudó a `ctp-guia-bloque-transporte.tsx` (tamaño)
 * y la libreta y los tipos, a `ctp-guia-partes-comun.ts`.
 */

import { casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import { componerPunto, llegadaDelDestinatario } from "@/lib/forestal/ctp-gtf-datos";
import CtpParteBarra from "./CtpParteBarra";
import { Bloque, DocsDeParte, UbicacionDeParte } from "./ctp-guia-bloques";
import { CLASE_NO_APLICA } from "./ctp-guia-piezas";
import { falta, libretaDe, vacio, type PropsParte } from "./ctp-guia-partes-comun";
import { Field, I, useEstiloFormulario } from "./ctp-shared";

/* Los tipos y la libreta viven en `ctp-guia-partes-comun`; se re-exportan
   para los que ya los importaban de acá. El Transporte se mudó a su archivo. */
export { libretaDe, type Directorio, type PropsParte, type SeccionObjeto, type SetSeccion } from "./ctp-guia-partes-comun";
export { BloqueTransporte } from "./ctp-guia-bloque-transporte";

/**
 * (22)–(28) A quién se le entrega la madera. Con `llegada` (guía del Libro TH,
 * formato 2024): (21) nombre, (22) N° de autorización, (23) DNI/RUC y (24) la
 * dirección hacia donde va la carga, que es el punto de llegada.
 */
export function BloqueDestinatario({
  datos,
  set,
  directorio,
  onAnotarParte,
  onGuardarEnLibreta,
  faltan,
  llegada,
}: PropsParte & { llegada?: boolean }) {
  const d = datos.destinatario;
  const autorizacionNoAplica = vacio(d.autorizacion);
  const punto = llegada ? componerPunto(llegadaDelDestinatario(datos)) : "";
  /* Con `FormularioPapel` (Libro TH): rótulos y números del talonario 2024. */
  const papel = useEstiloFormulario() === "papel";
  const n = (clave: string) => (papel ? casilleroGtf2024(clave) : undefined);
  return (
        <Bloque
          titulo={llegada ? "Destinatario y punto de llegada" : "Destinatario"}
          tituloPapel="Datos del destinatario"
          hint={
            llegada
              ? "A quién se le entrega el producto y a dónde va. En el formato 2024 (RDE D000014-2024-MIDAGRI-SERFOR-DE) la llegada es la dirección del destinatario: no hay otro bloque."
              : "A quién se le entrega el producto: el aserradero o comprador de destino."
          }
          faltan={faltan}
          acciones={
            <CtpParteBarra
              {...libretaDe(directorio, "destinatario", directorio.receptores())}
              titulo={llegada ? "Destinatario y llegada" : undefined}
              valor={d}
              onAplicar={(v) => set("destinatario", v)}
              onElegir={(p) => {
                onAnotarParte(p);
                if (llegada) set("destinatario", { autorizacion: p.codigoCtp ?? "" });
              }}
              onGuardar={onGuardarEnLibreta}
            />
          }
        >
          <Field span={llegada ? 8 : 6} label={papel ? "Destinatario" : "Nombre o razón social"} casillero={n("22")} required>
            <input type="text" className={`${I} ${falta(d.nombre)}`} value={d.nombre} onChange={(e) => set("destinatario", { nombre: e.target.value })} />
          </Field>
          {llegada && (
            <Field
              span={4}
              label="N° de autorización"
              casillero={n("d22")}
              hint="Formato 2024, casillero (22): la autorización del CTP o depósito que recibe. Si es una persona sin establecimiento, «No aplica»."
            >
              <input
                type="text"
                className={`${I} font-mono ${autorizacionNoAplica ? CLASE_NO_APLICA : ""}`}
                placeholder={autorizacionNoAplica ? "no aplica" : undefined}
                value={d.autorizacion}
                onChange={(e) => set("destinatario", { autorizacion: e.target.value })}
              />
            </Field>
          )}
          <DocsDeParte parte={d} onChange={(v) => set("destinatario", v)} span={papel ? 3 : llegada ? 6 : 3} casillero={n("23")} />
          <Field
            span={papel ? 6 : 8}
            label={papel ? "Dirección" : llegada ? "Dirección de llegada" : "Domicilio"}
            casillero={n("25")}
            required
            hint={llegada ? "Formato 2024, casillero (24): la dirección hacia donde se dirige la carga." : "Punto de llegada que cotejan los controles"}
          >
            <input type="text" className={`${I} ${falta(d.direccion)}`} value={d.direccion} onChange={(e) => set("destinatario", { direccion: e.target.value })} />
          </Field>
          <UbicacionDeParte
            parte={d}
            onChange={(v) => set("destinatario", v)}
            conZona
            casilleros={papel ? [n("26"), n("27"), n("28")] : undefined}
          />
          {llegada && (
            <p className="text-xs text-[var(--text-secondary)] sm:col-span-12">
              Llegada en la guía: <b className="text-[var(--text-primary)]">{punto || "falta la dirección y el ubigeo"}</b>
            </p>
          )}
        </Bloque>
  );
}
