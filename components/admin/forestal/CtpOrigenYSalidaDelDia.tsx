/**
 * Origen y salida de UN día (ADR-445), en dos bloques: lo usa el detalle
 * flotante de la tira y el modal «Lo que salió el …».
 *
 *  · Origen: lo declarado, lo que explican los paquetes cubicados pieza por
 *    pieza y lo que complementan las cubicaciones vinculadas.
 *  · Salida: cada guía que se llevó madera del día (N° de GTF o borrador,
 *    fecha, m³ y paquetes), lo que salió sin guía, lo reprocesado, lo que sigue
 *    en el patio y lo apartado.
 *
 * Todo sale del servidor (`OrigenYSalida`); acá no se suma nada. Un renglón en
 * cero no se muestra, salvo «pieza por pieza»: en un día por tipo, ese 0 es
 * justo el dato.
 */

import { cn } from "@/lib/utils";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { etiquetaCorta, nombreDelDia } from "@/lib/forestal/semana-de-registro";
import type { OrigenYSalida } from "@/lib/forestal/origen-y-salida-del-dia";
import { Bloque, plural, Renglon } from "./CtpDetalleDeJornadaPartes";
import { MarcaConTexto } from "./ctp-casillero-marcas";
import {
  fraseDeSalida,
  MARCA_ORIGEN,
  MARCA_SALIDA,
  origenVisibleDelDia,
  textoDeGuia,
} from "./marcas-del-dia";

const m3 = (v: number) => `${fmtM3(v)} m³`;

export default function CtpOrigenYSalidaDelDia({
  os,
  dosColumnas,
}: {
  os: OrigenYSalida;
  /**
   * Origen | Salida lado a lado: `true` siempre, `"sm"` desde 640 px (el modal
   * del día: a 400 px las guías se cortaban en «GTF…»), `false` uno debajo del otro.
   */
  dosColumnas: boolean | "sm";
}) {
  const s = os.salida;
  const nombres = os.cubicaciones
    .map((c) => `${c.nombre} (${fmtM3(c.m3)} m³, ${c.piezas} pza)`)
    .join(" · ");
  return (
    <div
      className={cn(
        "grid gap-x-5",
        dosColumnas === "sm" ? "sm:grid-cols-2" : dosColumnas && "grid-cols-2",
      )}
      data-origen-y-salida
    >
      <Bloque
        titulo="Origen"
        extra={<MarcaConTexto marca={MARCA_ORIGEN[origenVisibleDelDia(os)]} />}
      >
        <Renglon nombre="Declarado" cifras={m3(os.m3Declarado)} />
        <Renglon
          nombre="Pieza por pieza"
          cifras={m3(os.m3Cubicado)}
          apagado={os.m3Cubicado === 0}
        />
        {os.cubicaciones.length > 0 && (
          <Renglon
            nombre={
              os.cubicaciones.length === 1
                ? "Con cubicación"
                : `Con ${os.cubicaciones.length} cubicaciones`
            }
            titulo={nombres}
            cifras={m3(os.m3ConCubicacion)}
          />
        )}
        {os.porDeclarar > 0 && (
          <Renglon nombre="Por declarar" cifras={plural(os.porDeclarar, "corrida", "corridas")} />
        )}
      </Bloque>

      <Bloque
        titulo="Salida"
        extra={
          <MarcaConTexto
            marca={MARCA_SALIDA[s.estado]}
            etiqueta={fraseDeSalida(s.estado, s.guias)}
          />
        }
      >
        {s.guias.map((g) => (
          <Renglon
            key={g.despachoEntryId}
            titulo={g.paquetes.length > 0 ? `Paquetes: ${g.paquetes.join(", ")}` : undefined}
            nombre={
              <>
                <b
                  className={cn(
                    "text-xs",
                    g.gtfNumber ? "font-mono" : "text-[var(--text-secondary)]",
                  )}
                >
                  {textoDeGuia(g)}
                </b>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {" "}
                  · {nombreDelDia(g.fecha)} {etiquetaCorta(g.fecha)}
                </span>
              </>
            }
            cifras={`${m3(g.m3)}${g.paquetes.length > 0 ? ` · ${g.paquetes.length} paq` : ""}`}
          />
        ))}
        {s.m3SinGuia > 0 && (
          <Renglon
            nombre={
              <span className="font-semibold text-[var(--data-warning-ink)]">Salió sin guía</span>
            }
            titulo="Marcado «usado» sin una guía en el libro"
            cifras={m3(s.m3SinGuia)}
          />
        )}
        {s.m3Reprocesado > 0 && <Renglon nombre="Reprocesado" cifras={m3(s.m3Reprocesado)} />}
        {s.m3EnPatio > 0 && <Renglon nombre="En el patio" cifras={m3(s.m3EnPatio)} />}
        {s.apartados > 0 && (
          <Renglon nombre="Apartados" cifras={plural(s.apartados, "paquete", "paquetes")} />
        )}
      </Bloque>
    </div>
  );
}
