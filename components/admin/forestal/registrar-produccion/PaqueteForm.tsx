"use client";

/**
 * El formulario de UN paquete (paso «Piezas»): dictado, «las de siempre»,
 * código, producto, presentación y cantidad; las medidas y el botón de añadir
 * viven en `PaqueteMedidas`. Movido desde `CtpRegistrarProduccionModal.tsx`
 * (28-10) con el mismo Enter = Añadir.
 */
import { Casilla } from "@/components/ui-system/Casilla";
import { button } from "@/components/ui-system/button-variants";
import {
  PRESENTACIONES_LOCTP,
  TIPOS_PRODUCTO_SALIDA,
  presentacionSugerida,
} from "@/lib/forestal/loctp-catalogos";
import { AYUDA_FORMA_CODIGO, codigoTieneForma } from "@/lib/forestal/produccion-paquetes";
import { Bloque, CAMPO, Campo } from "./campos";
import DictadoDePaquete from "./Dictado";
import PaqueteMedidas from "./PaqueteMedidas";
import type { RegistrarProduccion } from "./use-registrar-produccion";

/* Botones del DS (ADR-489), con el mismo alto y la misma forma que tenían. */
const MEDIDA = button({
  variant: "secondary",
  className: "rounded-xl px-3 font-mono font-normal tabular-nums hover:border-[var(--accent)]",
});
const ENLACE = button({
  variant: "link",
  className:
    "h-auto px-0 font-bold text-[var(--accent-dark)] underline underline-offset-2 dark:text-[var(--accent)]",
});

export default function PaqueteForm({ r, activo }: { r: RegistrarProduccion; activo: boolean }) {
  const {
    editandoId,
    editando,
    dimensionar,
    setDimensionar,
    noEntra,
    agregar,
    medidas,
    medidasDeOtros,
    producto,
    setProducto,
    setEspesor,
    setAncho,
    setLargo,
    presentacion,
    setPresentacion,
    presentacionAuto,
    setPresentacionAuto,
    codigo,
    setCodigo,
    codigoTocado,
    codigosPlanta,
    codigoCanonicoLibre,
    cantidadRef,
    cantidad,
    setCantidad,
  } = r;
  /* ── El paquete: se repite por cada atado que sale de la sierra ── */
  return (
    <Bloque
      titulo={
        editandoId ? `Corrigiendo el paquete ${editando?.codigo ?? ""}` : "Agregar paquete"
      }
      meta={editandoId ? "Enter guarda el cambio" : "Enter añade · Ctrl+Enter guarda"}
      /* El interruptor era una fila entera para una casilla. En la barra de
         título ocupa cero alto y sigue estando ANTES de los campos que
         cambia, que es lo que importa para entenderlo. */
      acciones={
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-sm font-bold text-[var(--text-secondary)]">
          <Casilla checked={dimensionar} onChange={(e) => setDimensionar(e.target.checked)} />
          Dimensionar (espesor × ancho × largo)
        </label>
      }
      onKeyDown={(e) => {
        /* Enter añade, como en cualquier planilla. En un `select` no: ahí
           Enter es «elegir esta opción», y robárselo cambiaría el producto
           sin querer. Ctrl+Enter lo maneja el atajo global de guardar. */
        if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
        const t = e.target as HTMLElement;
        if (t.tagName === "SELECT" || t.tagName === "BUTTON" || t.tagName === "TEXTAREA")
          return;
        e.preventDefault();
        if (!noEntra) agregar();
      }}
    >
      <DictadoDePaquete r={r} activo={activo} />
      {/* Las medidas de siempre, antes del formulario: se elige una y los
          cuatro campos quedan puestos. */}
      {medidas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            {medidasDeOtros
              ? "Las de siempre (de otros productos)"
              : `Las de siempre en ${producto}`}
          </span>
          {medidas.map((m) => (
            <button
              key={`${m.productType}-${m.presentacion}-${m.espesorCm}-${m.anchoCm}-${m.largoM}`}
              type="button"
              title={`Usada ${m.veces} ${m.veces === 1 ? "vez" : "veces"}${m.productType ? ` · ${m.productType}` : ""}`}
              onClick={() => {
                /* Se dimensiona sí o sí: el volumen sale de las medidas, y
                   dejarlo en manual daría dos verdades para el mismo bulto. */
                setDimensionar(true);
                setEspesor(String(m.espesorCm));
                setAncho(String(m.anchoCm));
                setLargo(String(m.largoM));
                if (m.productType) setProducto(m.productType);
                if (m.presentacion) setPresentacion(m.presentacion);
              }}
              className={MEDIDA}
            >
              {m.espesorCm} × {m.anchoCm} cm × {m.largoM} m
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
        <Campo label="Código de paquete">
          <input
            value={codigo}
            onChange={(e) => {
              codigoTocado.current = true;
              setCodigo(e.target.value);
            }}
            placeholder="PQ-001"
            maxLength={60}
            className={CAMPO}
          />
          {/* De dónde salió el sugerido: el código es único en TODA la
              planta, así que se propone el próximo libre de la serie. */}
          {!codigoTocado.current && codigo && (
            <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
              Siguiente libre de la serie · {codigosPlanta.length} código
              {codigosPlanta.length === 1 ? "" : "s"} ya usados en la planta
            </span>
          )}
          {/* Un código sin forma (19 de los 33 del libro real son sólo un
              número) no se distingue de un N.º de línea ni de un permiso
              cuando alguien lo cita. Se AVISA y se ofrece el canónico; no se
              fuerza: la serie de la planta la decide el aserradero. */}
          {codigo.trim() !== "" && !codigoTieneForma(codigo) && (
            <span className="mt-1 block text-sm text-[var(--text-secondary)]">
              {AYUDA_FORMA_CODIGO}{" "}
              <button
                type="button"
                onClick={() => {
                  codigoTocado.current = true;
                  setCodigo(codigoCanonicoLibre());
                }}
                className={ENLACE}
              >
                Usar {codigoCanonicoLibre()}
              </button>
            </span>
          )}
        </Campo>
        <Campo label="Producto">
          {/**
           * Elegir el producto pone la presentación: la paquetería sale
           * ATADA (PAQUETES) y el resto de la aserrada se cuenta pieza por
           * pieza (PIEZAS). Se hace en el gesto y no en un efecto, para que
           * cambiarla a mano después no se revierta sola.
           */}
          <select
            value={producto}
            onChange={(e) => {
              const valor = e.target.value;
              setProducto(valor);
              const sugerida = presentacionSugerida(valor);
              setPresentacionAuto(sugerida != null);
              if (sugerida) setPresentacion(sugerida);
            }}
            className={CAMPO}
          >
            {/* El valor oficial del catálogo, tal cual — es como ya se
                muestra en la tabla del libro y en la tarjeta del lote;
                una versión acortada acá sería un segundo vocabulario para
                lo mismo (Brandon, 2026-08-31). */}
            {TIPOS_PRODUCTO_SALIDA.map((t) => (
              <option key={t.valor} value={t.valor} title={t.label}>
                {t.valor}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Presentación">
          <select
            value={presentacion}
            onChange={(e) => {
              setPresentacion(e.target.value);
              setPresentacionAuto(false);
            }}
            className={CAMPO}
          >
            {PRESENTACIONES_LOCTP.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {/* Un campo que se llena solo sin avisar se lee como un error de
              la pantalla. Y se puede cambiar: el libro tiene que poder decir
              que esta vez salió suelto. */}
          {presentacionAuto && (
            <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
              La puso el producto — cámbiala si esta vez salió de otra forma.
            </span>
          )}
        </Campo>
        <Campo label="Cantidad (piezas)">
          <input
            ref={cantidadRef}
            type="number"
            min={0}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className={CAMPO}
          />
        </Campo>
      </div>
      <PaqueteMedidas r={r} />
    </Bloque>
  );
}
