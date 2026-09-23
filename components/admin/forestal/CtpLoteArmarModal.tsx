"use client";

/**
 * Programar un lote de aserrío (ADR-342).
 *
 * Copia el formulario oficial del SNIFFS —«Programar producción»—: N° de lote,
 * orden de producción, tipo de producto a consumir, ventana del proceso,
 * especie y descripción. **Acá el lote se DECLARA, no se llena**: las piezas se
 * eligen después en Consumos, ya filtradas por esta especie y este tipo.
 *
 * Antes este modal pedía las dos cosas a la vez —identidad y piezas— y obligaba
 * a tener la madera decidida antes de poder anotar la orden. En la planta la
 * orden se programa a la mañana y la pila se elige frente a la sierra.
 *
 * La especie sale de lo que HAY en el patio, con su conteo y su volumen: elegir
 * una especie sin madera disponible crea un lote que nace vacío y nadie sabe por
 * qué. Cuando el patio está vacío se puede tipear igual — el lote programado
 * espera a la guía que va a llegar.
 *
 * **Modo INVENTARIO (Brandon, 2026-08-31):** una existencia previa al sistema no
 * tiene trozas del patio que elegir — se sabe cuánto se consumió y qué salió,
 * pero no la pieza por pieza. Este modal sólo declara el volumen consumido; los
 * paquetes de producción se cargan después en `CtpRegistrarProduccionModal`
 * (mismo formulario que usa el resto del libro, sin duplicar esa UI acá).
 */

import { useEffect, useMemo, useState } from "react";
import { Archive, Boxes, Loader2, Plus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { PRODUCTOS_CONSUMIBLES_LOTE, disponiblePorEspecie, disponiblePorPermiso } from "@/lib/forestal/lote-programacion";
import { TIPOS_PRODUCTO_SALIDA } from "@/lib/forestal/loctp-catalogos";
import { Btn, Field, I, ModalBody, ModalFooter, Seccion, useAtajoGuardar } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import CtpPegarSniffsLote from "./CtpPegarSniffsLote";
import { CtpEspecieInput, CtpEspecieSelect, useEspeciesConCatalogo } from "./ctp-especie-campo";
import type { DetalleProduccionSniffs } from "@/lib/forestal/sniffs-produccion-parse";
import { formatNumber } from "@/lib/format";

export interface LoteProgramado {
  speciesCommon: string;
  speciesScientific?: string | null;
  notes?: string | null;
  ordenProduccion?: string | null;
  tipoProductoConsumir?: string | null;
  inicioProceso?: string | null;
  finProceso?: string | null;
  /** Código a mano; vacío = correlativo automático `LA-2026-00N`. */
  code?: string | null;
  /** El título habilitante que va a consumir (ADR-393). `null` = todos. */
  permiso?: string | null;
}

/** Lo que declara el modo inventario: el material, no todavía los paquetes. */
export interface MaterialDeInventario {
  speciesCommon: string;
  speciesScientific?: string | null;
  volumenConsumidoM3: number;
  fecha: string;
  /** Cierre de la ventana del proceso. Sin fecha = sigue abierta. */
  finProceso?: string | null;
  /** Con qué producto se abre el paso 2: sólo precarga el primer paquete —el
   *  operador lo puede cambiar ahí, esto no se guarda aparte. */
  productType?: string | null;
  code?: string | null;
  notes?: string | null;
  /**
   * La pantalla del SNIFFS que se pegó acá (ADR-398): viaja al paso 2 para que
   * sus productos aparezcan listos para revisar, y se guarda con el lote para
   * poder cotejarlo después.
   */
  sniffs?: DetalleProduccionSniffs | null;
}

export default function CtpLoteArmarModal({
  trozas,
  crear,
  onIniciarInventario,
  onListo,
  onClose,
}: {
  /** El patio, para ofrecer las especies que de verdad hay. */
  trozas: TrozaConsumible[];
  crear: (input: LoteProgramado) => Promise<{ code: string | null }>;
  /**
   * Modo inventario: entrega el material declarado y el padre abre el modal de
   * paquetes (`CtpRegistrarProduccionModal`) — este modal no crea nada todavía.
   */
  onIniciarInventario: (input: MaterialDeInventario) => void;
  onListo: (mensaje: string, tono: "ok" | "aviso") => void;
  onClose: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [modo, setModo] = useState<"trozas" | "inventario">("trozas");
  /* El permiso va PRIMERO y acota lo que sigue (ADR-393). Un lote con madera de
     dos títulos habilitantes no puede decir después de cuál salió su corrida.
     Vacío = «todos», que es lo que necesita un CTP de una sola fuente: lo que
     no puede pasar es mezclar sin querer. */
  const [permiso, setPermiso] = useState("");
  const [especie, setEspecie] = useState("");
  const [orden, setOrden] = useState("");
  const [tipo, setTipo] = useState<string>(PRODUCTOS_CONSUMIBLES_LOTE[0]?.valor ?? "rolliza");
  const [inicio, setInicio] = useState(hoy);
  const [fin, setFin] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [volumenConsumido, setVolumenConsumido] = useState("");
  /** Sólo para el modo inventario: qué va a producir, para precargar el paso 2. */
  const [productoAserrado, setProductoAserrado] = useState<string>(TIPOS_PRODUCTO_SALIDA[0]?.valor ?? "");
  /** Vacío = correlativo automático `LA-2026-00N` (Brandon, 2026-08-31). */
  const [codigo, setCodigo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * La pantalla del SNIFFS pegada acá (ADR-398). Llena los campos de abajo —que
   * siguen siendo editables— y viaja al paso 2 con sus productos.
   */
  const [sniffs, setSniffs] = useState<DetalleProduccionSniffs | null>(null);

  /** Lo leído se VUELCA a los campos; no se guarda aparte hasta confirmar. */
  function tomarDelSniffs(d: DetalleProduccionSniffs) {
    setSniffs(d);
    setModo("inventario");
    if (d.lote) setCodigo(d.lote);
    if (d.especieComun) setEspecie(d.especieComun);
    if (d.fechaInicio) setInicio(d.fechaInicio);
    if (d.fechaFin) setFin(d.fechaFin);
    if (d.volumenConsumidoM3 != null && d.volumenConsumidoM3 > 0) {
      setVolumenConsumido(String(d.volumenConsumidoM3));
    }
    /* El producto del paso 2 sale del primero que declaró el SNIFFS: es el que
       más veces acierta, y se puede cambiar allá igual. */
    const primero = d.productos.find((p) => p.productType)?.productType;
    if (primero) setProductoAserrado(primero);
  }

  /**
   * Las especies del patio con lo que hay de cada una. Se cuenta sólo lo libre
   * —sin lote y sin bloqueo—: es la madera que este lote podría llegar a tomar.
   */
  const permisos = useMemo(() => disponiblePorPermiso(trozas), [trozas]);
  const especies = useMemo(() => disponiblePorEspecie(trozas, permiso || null), [trozas, permiso]);
  /**
   * Lo que hay en el patio y NO se puede elegir porque su guía sigue sin
   * recepcionar: cuántas especies y cuánto volumen.
   *
   * Se cuenta sobre las especies que no están ya ofrecidas, para no contar dos
   * veces una que tiene parte recepcionada y parte no.
   */
  const trabadas = useMemo(() => {
    const ofrecidas = new Set(especies.map((e) => claveEspecie(e.nombre)));
    const m = new Map<string, number>();
    for (const t of trozas) {
      if (t.guiaRecepcionada !== false) continue;
      const clave = claveEspecie((t.especieComun ?? "").trim());
      if (!clave || ofrecidas.has(clave)) continue;
      m.set(clave, (m.get(clave) ?? 0) + (Number(t.volumenM3) || 0));
    }
    return { especies: m.size, m3: Math.round([...m.values()].reduce((a, b) => a + b, 0) * 1000) / 1000 };
  }, [trozas, especies]);
  /* El catálogo de la planta (ADR-410): el patio dice qué madera HAY; el
     catálogo, qué especies trabaja este aserradero. Un lote se programa para
     la guía que todavía no llegó, así que las dos fuentes tienen que estar. */
  const catalogoEspecies = useEspeciesConCatalogo();
  const opcionesDelPatio = useMemo(
    () =>
      especies.map((e) => ({
        nombre: e.nombre,
        meta: `${e.piezas} pza · ${fmtM3(e.volumen)} m³`,
      })),
    [especies],
  );

  /* Si la especie elegida no tiene madera del permiso nuevo, se suelta: dejarla
     puesta arma un lote que nace sin nada que tomar.
     SÓLO en el modo «con trozas», donde la especie sale de un <select> del
     patio. En «inventario (sin trozas)» el campo es texto libre —el hint dice
     «escribí la especie aunque el patio no tenga stock»— y este efecto borraba
     cada letra tipeada porque «T», «To», «Tor»… no son especies del patio
     (Brandon 2026-09-07: «no me permite poner el nombre de la especie»). */
  useEffect(() => {
    if (modo !== "trozas") return;
    if (!especie) return;
    if (especies.some((e) => e.nombre === especie)) return;
    /* Del catálogo NO se suelta (ADR-410): programar el lote de una especie que
       todavía no llegó al patio es el caso normal —la guía llega mañana— y el
       pie del modal ya avisa que no hay madera de esa especie todavía. Lo que
       se suelta es lo que no está en ninguna de las dos listas. */
    if (catalogoEspecies.nombres.includes(especie)) return;
    setEspecie("");
  }, [modo, especies, especie, catalogoEspecies.nombres]);

  const elegida = especies.find((e) => e.nombre === especie) ?? null;
  const fechasAlReves = Boolean(inicio && fin && fin < inicio);
  const puedeGuardar =
    modo === "trozas"
      ? especie.trim().length > 0 && !fechasAlReves && !guardando
      : especie.trim().length > 0 && Number(volumenConsumido) > 0 && !fechasAlReves && !guardando;

  async function guardar() {
    if (!puedeGuardar) return;
    if (modo === "inventario") {
      /* No crea nada acá: el lote y la corrida nacen juntos recién cuando se
         declaran los paquetes, para no dejar un lote de inventario a medio
         armar si el operador cierra el modal siguiente sin guardar. */
      onIniciarInventario({
        speciesCommon: especie.trim(),
        speciesScientific: elegida?.cientifico ?? catalogoEspecies.cientificoDe(especie),
        volumenConsumidoM3: Number(volumenConsumido),
        fecha: inicio,
        finProceso: fin || null,
        productType: productoAserrado || null,
        code: codigo.trim() || null,
        notes: descripcion.trim() || null,
        sniffs,
      });
      onClose();
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await crear({
        speciesCommon: especie.trim(),
        speciesScientific: elegida?.cientifico ?? catalogoEspecies.cientificoDe(especie),
        notes: descripcion.trim() || null,
        ordenProduccion: orden.trim() || null,
        tipoProductoConsumir: tipo,
        permiso: permiso.trim() || null,
        inicioProceso: inicio || null,
        finProceso: fin || null,
        code: codigo.trim() || null,
      });
      onListo(
        `Lote ${r.code ?? ""} programado para ${especie.trim()}${permiso ? ` · permiso ${permiso}` : ""}.` +
          (elegida ? ` Hay ${elegida.piezas} troza${elegida.piezas === 1 ? "" : "s"} de esa especie para cargarlo desde Consumos.` : ""),
        elegida ? "ok" : "aviso",
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const refCuerpo = useAtajoGuardar(() => void guardar(), puedeGuardar);

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="wide"
      icon={Boxes}
      title="Programar un lote de aserrío"
      description={
        modo === "trozas"
          ? "Se declara acá; las piezas se eligen en Consumos, filtradas por esta especie"
          : "Existencia previa al sistema: declarás cuánto se consumió y en el paso siguiente, qué salió"
      }
      footer={
        <ModalFooter
          error={error ?? (fechasAlReves ? "El fin del proceso no puede ser anterior al inicio." : null)}
          nota={
            modo === "inventario"
              ? "El siguiente paso pide los paquetes que produjo esta madera"
              : elegida
                ? `Disponible de ${elegida.nombre}: ${elegida.piezas} pza · ${fmtM3(elegida.volumen)} m³ · ${formatNumber(pieTablarDe(elegida.volumen))} pt`
                : especie.trim()
                  /* Especie del catálogo sin madera en el patio: se puede
                     programar igual —la guía llega mañana— pero se dice, o el
                     lote nace vacío y nadie sabe por qué. */
                  ? `No hay ${especie.trim()} libre en el patio todavía: el lote queda programado esperando la guía`
                  : "Elige la especie que va a aserrarse en este lote"
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={guardando}>
            Cerrar
          </Btn>
          <Btn variant="primary" onClick={() => void guardar()} disabled={!puedeGuardar}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {modo === "inventario" ? "Seguir a declarar producción" : "Guardar"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody ref={refCuerpo}>
        {/* El toggle de modo, primero: cambia qué pide el resto del formulario. */}
        <div role="tablist" aria-label="Cómo armar el lote" className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["trozas", Boxes, "Con trozas del patio", "Se elige la madera después, en Consumos"],
              ["inventario", Archive, "Inventario (sin trozas)", "Existencia previa: declarás el volumen directo"],
            ] as const
          ).map(([m, Icon, titulo, sub]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={`flex-1 rounded-xl border-2 px-3 min-h-10 text-left transition-colors ${
                modo === m ? "border-primary bg-primary/10" : "border-[var(--rule-base)] hover:border-primary/50"
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--text-primary)]">
                <Icon className="h-4 w-4 shrink-0" aria-hidden /> {titulo}
              </span>
              <span className="block text-sm text-[var(--text-tertiary)]">{sub}</span>
            </button>
          ))}
        </div>

        {/**
         * Traer del SNIFFS (ADR-398): la misma captura llena el lote entero.
         * Va ARRIBA del formulario porque lo llena: ofrecerlo después sería
         * pedir que se tipee primero y se corrija con lo pegado.
         */}
        {modo === "inventario" && (
          <CtpPegarSniffsLote detalle={sniffs} onDetalle={tomarDelSniffs} onDescartar={() => setSniffs(null)} />
        )}

        {modo === "inventario" && (
          <Seccion numero={1} title="El material" hint="Lo que ya se sabe de esta madera, sin ir pieza por pieza">
            <Field
              span={6}
              label="Especie"
              required
              hint="Escribe la especie aunque el patio no tenga stock de ella · el botón abre el catálogo de la planta"
            >
              <CtpEspecieInput
                id="ctp-lote-inventario-especies"
                value={especie}
                onChange={setEspecie}
                catalogo={catalogoEspecies}
                opciones={opcionesDelPatio}
              />
            </Field>
            <Field span={6} label="Volumen consumido en trozas (m³)" required hint="Lo que entró a la sierra, de una vez">
              <input
                type="number"
                min={0}
                step="0.0001"
                value={volumenConsumido}
                onChange={(e) => setVolumenConsumido(e.target.value)}
                placeholder="12.5000"
                className={`${I} font-mono`}
              />
            </Field>
            <Field span={4} label="N° de lote" hint="Vacío = correlativo automático LA-2026-00N">
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="LA-2026-00N"
                maxLength={60}
                className={`${I} font-mono`}
              />
            </Field>
            <Field span={4} label="Inicio del proceso">
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={I} />
            </Field>
            <Field span={4} label="Fin del proceso" hint="Se puede dejar en blanco hasta que termine">
              <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} min={inicio || undefined} className={I} />
            </Field>
            <Field span={4} label="Producto que va a salir" hint="Precarga el paso siguiente; se puede cambiar ahí">
              <select value={productoAserrado} onChange={(e) => setProductoAserrado(e.target.value)} className={I}>
                {TIPOS_PRODUCTO_SALIDA.map((p) => (
                  <option key={p.valor} value={p.valor} title={p.label}>
                    {p.valor}
                  </option>
                ))}
              </select>
            </Field>
            <Field span={12} label="Notas">
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="De dónde viene esta existencia, por qué no tiene trozas registradas…"
                className={`${I} h-auto py-2`}
              />
            </Field>
          </Seccion>
        )}

        {modo === "trozas" && (
        <Seccion numero={1} title="El lote" hint="Vacío = correlativo automático del centro">
          <Field span={6} label="N° de lote" hint="Vacío = correlativo automático LA-2026-00N">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="LA-2026-00N"
              maxLength={60}
              className={`${I} font-mono`}
            />
          </Field>
          <Field span={6} label="Orden de producción">
            <input
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              placeholder="OP-2026-014"
              className={`${I} font-mono`}
            />
          </Field>
          {/* El permiso, ANTES que la especie: acota lo que sigue (ADR-393). Un
              lote con madera de dos títulos habilitantes no puede decir después
              de cuál salió su corrida. */}
          <Field
            span={12}
            label="N° de permiso"
            hint={
              permisos.length === 0
                ? "El patio no tiene piezas con título habilitante cargado"
                : "Elígelo primero: las especies de abajo se acotan a la madera de ese permiso"
            }
          >
            <select value={permiso} onChange={(e) => setPermiso(e.target.value)} className={I}>
              <option value="">Todos los permisos</option>
              {permisos.map((p) => (
                <option key={p.permiso} value={p.permiso}>
                  {p.permiso} · {p.piezas} {p.piezas === 1 ? "pieza" : "piezas"} · {fmtM3(p.volumen)} m³
                  {p.especies > 1 ? ` · ${p.especies} especies` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field span={6} label="Tipo de producto a consumir" required>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={I}>
              {PRODUCTOS_CONSUMIBLES_LOTE.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            span={6}
            label="Especie"
            required
            hint={
              /* La lista deja afuera la madera de guías sin recepcionar (mismo
                 criterio que `trozasDelLote`: ofrecerla armaría un lote que
                 después nace vacío). Correcto — pero sin decirlo, el operador
                 ve una sola especie con la pila llena delante y no sabe que las
                 otras están a un trámite de distancia. Medido en el tenant:
                 12 especies en el patio, 1 ofrecida. */
              trabadas.especies > 0
                ? `${trabadas.especies} especie${trabadas.especies === 1 ? "" : "s"} más (${fmtM3(trabadas.m3)} m³) no figuran: su guía está sin recepcionar.`
                : especies.length > 0
                  ? "Arriba, las que hay en el patio con su stock; abajo, el resto del catálogo de la planta"
                  : "El patio no tiene piezas libres todavía: se ofrece el catálogo de la planta"
            }
          >
            <CtpEspecieSelect
              value={especie}
              onChange={setEspecie}
              catalogo={catalogoEspecies}
              opciones={opcionesDelPatio}
            />
          </Field>
          <Field span={6} label="Inicio del proceso">
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={I} />
          </Field>
          <Field span={6} label="Fin del proceso" hint="Se puede dejar en blanco hasta que termine">
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} min={inicio || undefined} className={I} />
          </Field>
          <Field span={12} label="Descripción">
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Para el pedido de Satipo, turno mañana…"
              className={`${I} h-auto py-2`}
            />
          </Field>
        </Seccion>
        )}

        {modo === "trozas" && elegida && (
          <p className="mt-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Al guardar, en <b className="text-[var(--text-primary)]">Consumos</b> vas a elegir este lote y la tabla del
            patio se filtra sola a <b className="text-[var(--text-primary)]">{elegida.nombre}</b> —{" "}
            <span className="font-mono tabular-nums">
              {elegida.piezas} pza · {fmtM3(elegida.volumen)} m³
            </span>{" "}
            disponibles hoy.
          </p>
        )}
      </ModalBody>
      {catalogoEspecies.modal}
    </AdminModal>
  );
}
