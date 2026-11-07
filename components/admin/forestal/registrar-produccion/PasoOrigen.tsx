"use client";

/**
 * Paso 1 de «Registrar producción»: de dónde sale la madera y qué corrida es.
 * El día de la tira, el material (especie, trozas, guías y títulos) y la
 * línea, la fecha y la observación de la corrida — lo que se llena UNA vez.
 * Enter en un campo de la corrida pasa a las piezas.
 */
import CtpMaterialPanel from "../CtpMaterialPanel";
import CtpSemanaDeProduccion from "../CtpSemanaDeProduccion";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { esIsoValido } from "@/lib/forestal/semana-de-registro";
import { Bloque, CAMPO, Campo, Dato, fmtDia } from "./campos";
import type { RegistrarProduccionProps } from "./tipos";
import type { RegistrarProduccion } from "./use-registrar-produccion";

export default function PasoOrigen({
  r,
  p,
  onSiguiente,
}: {
  r: RegistrarProduccion;
  p: RegistrarProduccionProps;
  onSiguiente: () => void;
}) {
  const { lote, material, trozas, paquetesPrevios, onCambioEnElLibro } = p;
  const {
    previo,
    dia,
    setDia,
    semana,
    setSemana,
    jornadas,
    linea,
    setLinea,
    observaciones,
    setObservaciones,
  } = r;
  return (
    <div className="space-y-3">
      {/**
       * El día de la jornada, debajo de la franja de estado.
       *
       * La misma tira que «Producir sin lote»: el Libro se registra día por
       * día y el parte de la sierra llega tarde. Cada casillero dice lo que
       * ese día YA tiene declarado, que es lo que evita cargar dos veces la
       * misma jornada.
       *
       * Sólo al DECLARAR: ampliando, la fecha es la del asiento que ya
       * existe y el servidor no la toca — ahí abajo se muestra como dato, y
       * ofrecer una tira que no cambia nada sería mentir.
       */}
      {previo === 0 && (
        /* Con «Anular el día» (2026-09-23), igual que en «Producir sin lote»:
           la misma tira y la misma regla en los dos modales que declaran. */
        <CtpSemanaDeProduccion
          valor={dia}
          onElegir={(iso) => {
            setDia(iso);
            setSemana(iso);
          }}
          semana={semana}
          onSemana={setSemana}
          porDia={jornadas.porDia}
          cargando={jornadas.cargando}
          error={jornadas.error}
          onReleer={() => void jornadas.recargar()}
          onCambioEnElLibro={onCambioEnElLibro}
        />
      )}

      <div className="grid gap-3 @3xl:grid-cols-2">
        <div className="@container">
          <Bloque
            titulo="Material"
            meta={
              lote
                ? `Lote ${lote.code} · ${fmtDia(lote.inicioProceso ?? lote.fechaApertura)} → ${fmtDia(lote.finProceso)}`
                : undefined
            }
          >
            <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
              <div
                className={material.piezas > 0 ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-3"}
              >
                <Dato
                  label="Especie"
                  valor={
                    material.especieCientifica
                      ? `${material.especieCientifica} (${material.especie.toUpperCase()})`
                      : material.especie
                  }
                />
              </div>
              {material.piezas > 0 && <Dato label="Cantidad" valor={String(material.piezas)} />}
              <Dato label="Volumen" valor={fmtM3(material.volumenM3)} />
            </div>
            {/* El reparto entre títulos depende de los paquetes: va en «Revisar». */}
            {material.permisos.length > 0 && (
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                Amparada por {material.permisos.length === 1 ? "el título" : "los títulos"}{" "}
                <b className="text-[var(--text-secondary)]">{material.permisos.join(" · ")}</b>
              </p>
            )}

            {/**
             * Lo que hay que tener a mano mientras se declara: la madera pieza por
             * pieza, de qué guía y título viene, y lo que la corrida ya declaró.
             * Plegado en solapas — sin esto había que cerrar el modal (perdiendo
             * lo tipeado) para ir a buscarlo a otra pestaña.
             */}
            <CtpMaterialPanel
              trozas={trozas}
              origenes={material.origenes}
              paquetesPrevios={paquetesPrevios}
              fecha={dia}
            />
          </Bloque>
        </div>

        {/* ── La corrida: se llena UNA vez ──────────────────────────────────
          Estaba mezclada con los campos del paquete, que se repiten por cada
          atado. Dos cosas distintas en la misma grilla hacían tipear la línea
          y la fecha creyendo que eran del paquete. */}
        <div className="@container">
          <Bloque
            titulo="La corrida"
            meta="Enter pasa a las piezas"
            onKeyDown={(e) => {
              /* Enter avanza desde un campo de texto o fecha; en un `select`
                 Enter elige la opción y no se le roba. */
              if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
              if ((e.target as HTMLElement).tagName !== "INPUT") return;
              e.preventDefault();
              onSiguiente();
            }}
          >
            <div className="grid gap-3 @lg:grid-cols-2 @2xl:grid-cols-3">
              {/**
               * Ampliando, la corrida YA existe: su fecha y su línea son las del
               * asiento que se está completando y el servidor no las toca. Se
               * muestran como dato — un campo editable que no viaja es una mentira
               * de la pantalla.
               */}
              {previo > 0 ? (
                <>
                  <Dato label="Línea de producción" valor={linea} />
                  <Dato label="Fecha de producción" valor={fmtDia(dia)} />
                </>
              ) : (
                <>
                  <Campo label="Línea de producción">
                    <select
                      value={linea}
                      onChange={(e) => setLinea(e.target.value)}
                      className={CAMPO}
                    >
                      {/* Las dos del Cuadro Resumen 3: principal y recuperación. */}
                      <option value="LP">LP · línea principal</option>
                      <option value="LRE">LRE · línea de recuperación</option>
                    </select>
                  </Campo>
                  <Campo label="Fecha de producción">
                    <input
                      type="date"
                      value={dia}
                      onChange={(e) => {
                        setDia(e.target.value);
                        /* Tipear una fecha de otra semana mueve la tira de arriba. */
                        if (esIsoValido(e.target.value)) setSemana(e.target.value);
                      }}
                      className={CAMPO}
                    />
                  </Campo>
                </>
              )}
              <Campo label="Observación de la corrida">
                <input
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder={
                    previo > 0 ? "Si la escribes, reemplaza la anterior" : "Turno, sierra…"
                  }
                  maxLength={300}
                  className={CAMPO}
                />
              </Campo>
            </div>
          </Bloque>
        </div>
      </div>
    </div>
  );
}
