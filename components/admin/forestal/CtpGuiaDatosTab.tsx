"use client";

/**
 * Pestaña 1 · «Datos de la Guía de Transporte Forestal».
 *
 * Reproduce, bloque por bloque, la pantalla con la que se registra una GTF en el
 * LO-CTP del SNIFFS: la guía y su vigencia, la instancia que registra (este CTP,
 * que el sistema ya conoce), el propietario del producto, el destinatario y el
 * transportista con su vehículo. Abajo, el traslado y los títulos que amparan el
 * origen — sin eso la guía no se puede imprimir (`faltantesGtf`).
 *
 * Todo lo que se tipea acá vive en `gtfDatos` (JSONB validado por Zod): es el
 * cuerpo del documento, uno solo para las N líneas de producto que viajan.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, Check } from "@buleje/design-system/icons";
import { TIPOS_DOCUMENTO_LOCTP } from "@/lib/forestal/loctp-campos";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { FichaCtp } from "@/hooks/use-ficha-ctp";
import type { Parte, RolParte } from "@/lib/forestal/directorio";
import type { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import {
  buscarTitulo,
  completarGuiaConTitulo,
  enumerar,
  titulosElegibles,
  type TituloDeFicha,
} from "@/lib/forestal/titulos-de-la-guia";
import CtpParteBarra, { CtpVehiculoBarra, type ValorParte } from "./CtpParteBarra";
import { ESTADO_LABEL } from "./contratos-ui";
import { Bloque, DocsDeParte, UbicacionDeParte } from "./ctp-guia-bloques";
import { CLASE_FALTA, CLASE_NO_APLICA, Casillero, ResumenDatos, SubBloque, faltantesPorBloque } from "./ctp-guia-piezas";
import { Btn, Field, FormularioClaro, I } from "./ctp-shared";

type Directorio = ReturnType<typeof useDirectorioForestal>;
/** Claves de `GtfDatos` cuyo valor es un objeto plano — las que parchea `set`. */
type SeccionObjeto = "propietario" | "destinatario" | "transportista" | "vehiculo" | "traslado";

const direccionDe = (f: FichaCtp | null) =>
  [f?.direccion, f?.distrito, f?.provincia, f?.region].filter(Boolean).join(", ");

/** Valor del `<select>` para «no está en ninguna lista, lo escribo». */
const TITULO_A_MANO = "__a-mano";

/**
 * (6) Título habilitante — con qué papel sale ESTA madera.
 *
 * El mismo permiso vive en dos lugares y el select miraba uno solo: los
 * `titulos[]` de la Ficha del CTP. Medido en el tenant de QA (2026-09-21) la
 * Ficha declaraba **1** título y los permisos cargados (`ForestContrato`,
 * ADR-421/425) eran **6** — los otros cinco sólo se podían tipear a mano, y un
 * código tipeado en un papel que pasa por un puesto de control es justo lo que
 * no queremos.
 *
 * Los dos grupos van separados a propósito (`<optgroup>`): no son lo mismo. El
 * de la Ficha es el que además IMPRIME sus casilleros (5)(8)(9); el permiso
 * cargado aporta titular, área y vigencia, y se lo dice.
 *
 * Degrada sin pelear: si el tenant no tiene el módulo de permisos, el hook
 * responde `disponible: false` y el campo se comporta como antes — ni grupo
 * vacío ni error.
 */
function CampoTituloHabilitante({
  titulos,
  guia,
  titulosFicha,
  setDatos,
}: {
  titulos: string[];
  guia: GtfDatos["guia"];
  titulosFicha: readonly TituloDeFicha[];
  setDatos: Dispatch<SetStateAction<GtfDatos>>;
}) {
  const permisos = usePermisosForestal();
  /** `auto` = lo decide el código cargado; los otros dos, el operador. */
  const [modo, setModo] = useState<"auto" | "lista" | "libre">("auto");
  /** Qué completó la última elección, atado al código que la hizo. */
  const [completado, setCompletado] = useState<{ codigoNorm: string; campos: string[] } | null>(null);
  /**
   * «Ya sabemos qué permisos hay». Sin esto, entre que el modal monta y el GET
   * vuelve, un título YA guardado se vería como desconocido y el aviso naranja
   * saldría en cada apertura. Se marca cuando una carga termina, no cuando
   * arranca (en el primer render `cargando` todavía es `false`).
   */
  const [consultado, setConsultado] = useState(false);
  const cargandoAntes = useRef(false);
  useEffect(() => {
    if (cargandoAntes.current && !permisos.cargando) setConsultado(true);
    cargandoAntes.current = permisos.cargando;
  }, [permisos.cargando]);

  const opciones = useMemo(
    () => titulosElegibles(titulosFicha, permisos.disponible ? permisos.contratos : []),
    [titulosFicha, permisos.disponible, permisos.contratos],
  );
  const elegido = titulos[0] ?? "";
  const opcion = buscarTitulo(opciones.todos, elegido);
  const hayOpciones = opciones.todos.length > 0;
  /* Avisar, no bloquear: la guía se guarda igual con un código que no está
     cargado (puede ser un papel que todavía nadie registró). */
  const desconocido = consultado && Boolean(elegido.trim()) && !opcion;
  /* Sin título la guía no se imprime (`faltantesGtf`): el casillero se marca. */
  const claseFalta = titulos.some((t) => t.trim()) ? "" : CLASE_FALTA;
  const modoLibre = !hayOpciones || modo === "libre" || (modo === "auto" && desconocido);

  function elegir(valor: string) {
    if (valor === TITULO_A_MANO) {
      setModo("libre");
      setCompletado(null);
      return;
    }
    setModo("auto");
    const t = buscarTitulo(opciones.todos, valor);
    /* Los rótulos se calculan FUERA del updater: en desarrollo React lo invoca
       dos veces para delatar efectos y saldrían repetidos. */
    const { completados } = completarGuiaConTitulo(guia, t);
    setCompletado(t && completados.length ? { codigoNorm: t.codigoNorm, campos: completados } : null);
    setDatos((p) => ({
      ...p,
      titulos: valor ? [valor] : [],
      guia: { ...p.guia, ...completarGuiaConTitulo(p.guia, t).guia },
    }));
  }

  /* De dónde salió lo que se ve, en UNA línea. Al permiso se le agrega qué va a
     pasar en el papel: los casilleros del título se imprimen desde la Ficha
     (`tituloDeGuia`), así que uno que sólo vive como permiso los deja en blanco
     — decirlo evita que alguien dé por impreso lo que está mirando en pantalla. */
  const procedencia =
    opcion?.fuente === "ficha"
      ? `De la ficha del CTP${opcion.resolucion ? ` · Resolución ${opcion.resolucion}` : ""}`
      : opcion
        ? [
            `Permiso cargado${opcion.titular ? ` · ${opcion.titular}` : ""}`,
            opcion.area,
            opcion.resolucion ? `Resolución ${opcion.resolucion}` : null,
            "en el papel, los casilleros (5)(8)(9) salen de la ficha del CTP",
          ]
            .filter(Boolean)
            .join(" · ")
        : "";
  const recienCompletado = completado && opcion && completado.codigoNorm === opcion.codigoNorm ? completado.campos : null;

  return (
    <Field span={8} label="Título habilitante" required hint="Acredita el origen legal de la madera">
      {modoLibre ? (
        <input
          type="text"
          className={`${I} ${claseFalta}`}
          aria-label="Título habilitante"
          aria-required
          placeholder="Escríbelo tal cual está en el papel"
          value={titulos.join(", ")}
          onChange={(e) => {
            // Quien tipea manda: sin esto, al completar un código que SÍ está
            // cargado el campo se convertía en select a mitad de la palabra.
            if (modo !== "libre") setModo("libre");
            setCompletado(null);
            setDatos((p) => ({
              ...p,
              titulos: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10),
            }));
          }}
        />
      ) : (
        <select
          className={`${I} ${claseFalta}`}
          aria-label="Título habilitante"
          aria-required
          value={opcion ? opcion.codigo : ""}
          onChange={(e) => elegir(e.target.value)}
        >
          <option value="">Elige el título</option>
          {opciones.ficha.length > 0 && (
            <optgroup label="De la ficha del CTP">
              {opciones.ficha.map((t) => (
                <option key={t.codigoNorm} value={t.codigo}>{t.etiqueta}</option>
              ))}
            </optgroup>
          )}
          {opciones.permisos.length > 0 && (
            <optgroup label="Permisos cargados">
              {opciones.permisos.map((t) => (
                <option key={t.codigoNorm} value={t.codigo}>
                  {t.etiqueta}
                  {t.estado && t.estado !== "vigente" ? ` · ${ESTADO_LABEL[t.estado]}` : ""}
                </option>
              ))}
            </optgroup>
          )}
          <option value={TITULO_A_MANO}>Otro — lo escribo a mano</option>
        </select>
      )}
      {/* La línea que dice de dónde salió lo que se ve. Viva a propósito: lo
          que cambia acá lo provocó un clic del operador. */}
      <div className="mt-1 space-y-1 text-xs leading-snug" aria-live="polite">
        {desconocido ? (
          <p className="flex items-start gap-1.5 text-[var(--data-warning-ink)]">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {/* El código va NOMBRADO: al volver a la lista el `<select>` queda
                en «Elige el título» y, sin decirlo, el papel seguiría saliendo
                con un código que ya no se ve por ningún lado. */}
            <span>«{elegido}» no está cargado como permiso ni en la ficha del CTP. La guía se guarda igual.</span>
          </p>
        ) : (
          procedencia && <p className="text-[var(--text-tertiary)]">{procedencia}</p>
        )}
        {recienCompletado && (
          <p className="flex items-start gap-1.5 text-[var(--data-success-ink)]">
            <Check className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Se completó {enumerar(recienCompletado)} desde este permiso.</span>
          </p>
        )}
        {modoLibre && hayOpciones && (
          <button
            type="button"
            onClick={() => setModo("lista")}
            className="font-bold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
          >
            Elegirlo de la lista
          </button>
        )}
      </div>
    </Field>
  );
}

export default function CtpGuiaDatosTab({
  datos,
  setDatos,
  ficha,
  directorio,
  emision,
  onEmision,
  gtfNumber,
  onGtfNumber: _onGtfNumber,
  docType,
  onDocType,
  onAnotarParte,
  onAnotarVehiculo,
  onGuardarEnLibreta,
  slotVerificacion,
  llevaCites = false,
}: {
  /** Si lo que sale incluye especie protegida: sin eso, el permiso no aplica. */
  llevaCites?: boolean;
  datos: GtfDatos;
  setDatos: Dispatch<SetStateAction<GtfDatos>>;
  ficha: FichaCtp | null;
  directorio: Directorio;
  /** Fecha de emisión = fecha de la línea del libro (`entryDate`). */
  emision: string;
  onEmision: (v: string) => void;
  gtfNumber: string;
  onGtfNumber: (v: string) => void;
  docType: string;
  onDocType: (v: string) => void;
  onAnotarParte: (p: Parte) => void;
  /** Se llama al elegir una placa de la libreta: el uso se cuenta al guardar. */
  onAnotarVehiculo: (id: string) => void;
  onGuardarEnLibreta: (v: ValorParte, rol: RolParte) => Promise<void>;
  /** Verificación de la guía contra SERFOR: va con el número, que es lo que verifica. */
  slotVerificacion?: React.ReactNode;
}) {
  const esFluvial = datos.vehiculo.modo === "fluvial";

  /** Parche superficial de una sección; el resto de los campos no se toca. */
  function set<K extends SeccionObjeto>(k: K, v: Partial<GtfDatos[K]>) {
    setDatos((p) => ({ ...p, [k]: { ...p[k], ...v } }));
  }
  function setGuia(v: Partial<GtfDatos["guia"]>) {
    setDatos((p) => ({ ...p, guia: { ...p.guia, ...v } }));
  }

  /** El CTP como propietario: su identidad sale de la Ficha. Destildar limpia,
   *  para que no quede el RUC del CTP a nombre de un tercero. */
  function propietarioEsElEmisor(esElCtp: boolean) {
    set(
      "propietario",
      esElCtp
        ? {
            esElCtp,
            nombre: ficha?.razonSocial || ficha?.nombreCtp || "",
            docTipo: "RUC",
            docNumero: ficha?.ruc ?? "",
            direccion: direccionDe(ficha),
            departamento: ficha?.region ?? "",
            provincia: ficha?.provincia ?? "",
            distrito: ficha?.distrito ?? "",
          }
        : { esElCtp, nombre: "", docNumero: "", direccion: "", departamento: "", provincia: "", distrito: "" },
    );
  }

  /** Los títulos de la Ficha, para elegir cuál ampara ESTE viaje. Memoizados
   *  porque el campo los cruza con los permisos cargados en cada render. */
  const titulosFicha = useMemo(() => (ficha?.titulos ?? []).filter((t) => t.codigo?.trim()), [ficha]);

  /**
   * "Autoridad que la ampara" arrancaba con `ficha?.arffs` sólo como
   * `placeholder` — un gris que parece dato cargado pero no lo es: si el
   * operador confiaba en él sin tipear nada, la guía salía con el casillero
   * (2) vacío de verdad. Se semilla el valor REAL una sola vez (mismo patrón
   * que el hijo que semilla estado de un prop que llega tarde, ADR-364): si
   * la Ficha carga después de montado el tab, igual se completa; si el
   * operador la borra a propósito para poner otra autoridad, no se vuelve a
   * pisar.
   */
  const autoridadSemillada = useRef(false);
  useEffect(() => {
    if (autoridadSemillada.current || !ficha?.arffs?.trim()) return;
    autoridadSemillada.current = true;
    const arffs = ficha.arffs;
    setDatos((p) => (p.guia.autoridad?.trim() ? p : { ...p, guia: { ...p.guia, autoridad: arffs } }));
  }, [ficha?.arffs, setDatos]);

  /* Lo que falta, por bloque (misma regla que el pie del modal) y por casillero. */
  const faltan = useMemo(() => faltantesPorBloque(datos, emision), [datos, emision]);
  const vacio = (v: string | null | undefined) => !v?.trim();
  const falta = (v: string | null | undefined) => (vacio(v) ? CLASE_FALTA : "");

  /**
   * El propietario que ES este CTP se lee como resumen: sus datos salen de la
   * Ficha y son los mismos en cada guía. Seis cajas llenas con lo que ya se
   * sabe eran medio bloque de ruido; «Editar» las vuelve a abrir para corregir
   * un dato sin destildar (destildar los BORRA — ver `propietarioEsElEmisor`).
   */
  const [editarPropietario, setEditarPropietario] = useState(false);
  const prop = datos.propietario;
  const propResumido = prop.esElCtp && !editarPropietario;
  const ubicProp = [prop.distrito, prop.provincia, prop.departamento].filter((x) => x?.trim()).join(", ");
  /* La dirección de la Ficha ya trae distrito, provincia y región: no repetirlos. */
  const domicilioProp =
    prop.distrito?.trim() && prop.direccion.toLocaleLowerCase("es").includes(prop.distrito.toLocaleLowerCase("es"))
      ? prop.direccion
      : [prop.direccion, ubicProp].filter((x) => x.trim()).join(" · ");

  const remolqueNoAplica = vacio(datos.vehiculo.placaRemolque);
  const remisionNoAplica = vacio(datos.guia.guiaRemisionNro);

  return (
    <FormularioClaro>
      {/**
       * Dos columnas que se apilan cada una por su lado.
       *
       * Antes iban de a pares por fila y el alto de cada fila lo fijaba el más
       * alto del par: el transportista (615 px) dejaba 237 px vacíos al lado
       * del traslado. Ahora a la izquierda va el papel y quiénes intervienen
       * (documento → instancia → propietario → destinatario) y a la derecha el
       * viaje (transporte → traslado y títulos): el orden del formato oficial,
       * sin huecos. En pantallas angostas es una sola columna, en ese orden.
       */}
      <div data-guia-datos className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <div className="grid gap-3">
          <Bloque
            titulo="Documento"
            hint="Fechas, tipo y número del documento con el que sale el producto."
            faltan={faltan.documento}
            acciones={
              /* El N° NO se tipea (ADR-374): lo asigna el servidor al emitir,
                 con un lock sobre los despachos del tenant — lo único que
                 garantiza una serie sin huecos ni repetidos. Se muestra igual
                 porque es el casillero (4) y quien cotea contra el papel lo
                 busca; como dato, no como caja para escribir. */
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span className="font-medium text-[var(--text-secondary)]">N° de GTF</span>
                <Casillero n={4} />
                {gtfNumber ? (
                  <b className="font-mono tabular-nums text-[var(--text-primary)]">{gtfNumber}</b>
                ) : (
                  <span className="text-[var(--text-tertiary)]">se asigna al emitir</span>
                )}
              </span>
            }
          >
            <Field span={4} label="Fecha de emisión" required>
              <input type="date" className={`${I} ${falta(emision)}`} value={emision} onChange={(e) => onEmision(e.target.value)} />
            </Field>
            <Field span={4} label="Vencimiento" hint="Fecha de vencimiento de la guía: la fija la ARFFS.">
              <input type="date" className={I} value={datos.traslado.fechaFin} onChange={(e) => set("traslado", { fechaFin: e.target.value })} />
            </Field>
            <Field span={4} label="Tipo de documento" casillero={3}>
              <select className={I} value={docType} onChange={(e) => onDocType(e.target.value)}>
                {TIPOS_DOCUMENTO_LOCTP.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.label}</option>
                ))}
              </select>
            </Field>
            {/* 5 + 7 y no mitad y mitad: la verificación trae su botón al lado
                del número y, a la mitad, el rótulo partía en dos renglones. */}
            <div className={slotVerificacion ? "sm:col-span-5" : "sm:col-span-12"}>
              <Field label="Autoridad que la ampara" casillero={2} hint="ARFFS competente">
                <input type="text" className={I} value={datos.guia.autoridad} onChange={(e) => setGuia({ autoridad: e.target.value })} placeholder={ficha?.arffs || "GORE · DRSAFFS"} />
              </Field>
            </div>
            {/* La verificación en SERFOR comparte fila con la autoridad: es del
                mismo acto (de qué papel estamos hablando), no un bloque aparte. */}
            {slotVerificacion && <div className="sm:col-span-7">{slotVerificacion}</div>}
          </Bloque>

          <Bloque titulo="Instancia que registra" hint="Este CTP. Sale de la Ficha del CTP: no se tipea en cada guía. Lo que falte se carga en la pestaña Ficha CTP.">
            <ResumenDatos
              datos={[
                { etiqueta: "RUC", valor: ficha?.ruc ?? "", mono: true, falta: "en Ficha CTP" },
                { etiqueta: "Código de CTP", valor: ficha?.codigoCtp ?? "", mono: true, falta: "lo asigna la ARFFS" },
                { etiqueta: "Razón social", valor: ficha?.razonSocial || ficha?.nombreCtp || "", ancho: 2, falta: "en Ficha CTP" },
                { etiqueta: "Domicilio de la planta", valor: direccionDe(ficha), ancho: 4, falta: "en Ficha CTP" },
              ]}
            />
          </Bloque>

          <Bloque
            titulo="Propietario"
            hint="Dueño del producto. Puede no ser el CTP: la norma distingue al dueño de la madera del titular del centro."
            faltan={faltan.propietario}
            acciones={
              <>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-medium text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={prop.esElCtp}
                    onChange={(e) => {
                      setEditarPropietario(false);
                      propietarioEsElEmisor(e.target.checked);
                    }}
                    className="h-4 w-4 accent-[var(--brand-ink)]"
                  />
                  Es este CTP
                </label>
                {prop.esElCtp ? (
                  <Btn size="sm" variant="ghost" aria-pressed={editarPropietario} onClick={() => setEditarPropietario((v) => !v)}>
                    {editarPropietario ? "Ver resumen" : "Editar"}
                  </Btn>
                ) : (
                  <CtpParteBarra
                    rol="proveedor"
                    valor={prop}
                    opciones={directorio.porRol("proveedor")}
                    onAplicar={(v) => set("propietario", v)}
                    onElegir={onAnotarParte}
                    onGuardar={onGuardarEnLibreta}
                  />
                )}
              </>
            }
          >
            {propResumido ? (
              <ResumenDatos
                datos={[
                  { etiqueta: "Nombre o razón social", valor: prop.nombre, ancho: 3, falta: "toca «Editar»" },
                  { etiqueta: prop.docTipo === "RUC" ? "RUC" : prop.docTipo, valor: prop.docNumero, mono: true },
                  { etiqueta: "Domicilio", valor: domicilioProp, ancho: 4 },
                ]}
              />
            ) : (
              <>
                <Field span={6} label="Nombre o razón social" required>
                  <input type="text" className={`${I} ${falta(prop.nombre)}`} value={prop.nombre} onChange={(e) => set("propietario", { nombre: e.target.value })} />
                </Field>
                <DocsDeParte parte={prop} onChange={(v) => set("propietario", v)} />
                <Field span={12} label="Domicilio">
                  <input type="text" className={I} value={prop.direccion} onChange={(e) => set("propietario", { direccion: e.target.value })} />
                </Field>
                <UbicacionDeParte parte={prop} onChange={(v) => set("propietario", v)} />
              </>
            )}
            {/* La GTF ampara el traslado; el comprobante, la operación. El control
                pide los dos, así que van juntos en el bloque del propietario. */}
            <Field span={6} label="Tipo de comprobante" casillero={20} hint="Comprobante de compra o venta: la guía ampara el traslado y el comprobante, la operación.">
              <select
                className={I}
                value={datos.comprobante.tipo}
                onChange={(e) => setDatos((p) => ({ ...p, comprobante: { ...p.comprobante, tipo: e.target.value as GtfDatos["comprobante"]["tipo"] } }))}
              >
                <option value="ninguno">Seleccionar</option>
                <option value="factura">Factura</option>
                <option value="boleta">Boleta de venta</option>
                <option value="guia_remision">Guía de remisión</option>
                <option value="otro">Otro</option>
              </select>
            </Field>
            <Field span={6} label="N° de comprobante" casillero={21}>
              <input
                type="text"
                className={`${I} font-mono`}
                placeholder="F001-00001234"
                value={datos.comprobante.numero}
                onChange={(e) => setDatos((p) => ({ ...p, comprobante: { ...p.comprobante, numero: e.target.value } }))}
              />
            </Field>
          </Bloque>

          <Bloque
            titulo="Destinatario"
            hint="A quién se le entrega el producto: el aserradero o comprador de destino."
            faltan={faltan.destinatario}
            acciones={
              <CtpParteBarra
                rol="destinatario"
                valor={datos.destinatario}
                opciones={directorio.receptores()}
                onAplicar={(v) => set("destinatario", v)}
                onElegir={onAnotarParte}
                onGuardar={onGuardarEnLibreta}
              />
            }
          >
            <Field span={6} label="Nombre o razón social" required>
              <input type="text" className={`${I} ${falta(datos.destinatario.nombre)}`} value={datos.destinatario.nombre} onChange={(e) => set("destinatario", { nombre: e.target.value })} />
            </Field>
            <DocsDeParte parte={datos.destinatario} onChange={(v) => set("destinatario", v)} />
            <Field span={8} label="Domicilio" required hint="Punto de llegada que cotejan los controles">
              <input type="text" className={`${I} ${falta(datos.destinatario.direccion)}`} value={datos.destinatario.direccion} onChange={(e) => set("destinatario", { direccion: e.target.value })} />
            </Field>
            <UbicacionDeParte parte={datos.destinatario} onChange={(v) => set("destinatario", v)} conZona />
          </Bloque>
        </div>

        <div className="grid gap-3">
          <Bloque titulo="Transporte" hint="Quién mueve la carga, quién maneja y en qué vehículo." faltan={faltan.transporte}>
            <SubBloque
              etiqueta="Transportista"
              acciones={
                <CtpParteBarra
                  rol="transportista"
                  valor={datos.transportista}
                  opciones={directorio.porRol("transportista")}
                  onAplicar={(v) => set("transportista", v)}
                  onElegir={onAnotarParte}
                  onGuardar={onGuardarEnLibreta}
                />
              }
            >
              <Field span={6} label="Nombre o razón social" required hint="Empresa o persona del traslado">
                <input type="text" className={`${I} ${falta(datos.transportista.nombre)}`} value={datos.transportista.nombre} onChange={(e) => set("transportista", { nombre: e.target.value })} />
              </Field>
              <Field span={6} label="Tipo de transporte">
                <select
                  className={I}
                  value={datos.vehiculo.tipoTransporte ?? "privado"}
                  onChange={(e) => set("vehiculo", { tipoTransporte: e.target.value as "privado" | "publico" })}
                >
                  <option value="privado">Privado — vehículo del titular</option>
                  <option value="publico">Público — empresa de transporte</option>
                </select>
              </Field>
              <DocsDeParte parte={datos.transportista} onChange={(v) => set("transportista", v)} span={4} />
              <Field span={4} label="Registro MTC" hint="Si es empresa">
                <input type="text" className={I} value={datos.transportista.registroMtc} onChange={(e) => set("transportista", { registroMtc: e.target.value })} />
              </Field>
            </SubBloque>

            {/* El chofer se elige aparte: en la selva es común que la empresa
                ponga el camión y el chofer sea otro. De la libreta viene con su
                licencia, que es lo que pide el puesto de control. */}
            <SubBloque
              etiqueta={esFluvial ? "Patrón" : "Conductor"}
              acciones={
                <CtpParteBarra
                  rol="conductor"
                  valor={{ nombre: datos.vehiculo.conductor, docTipo: "DNI", docNumero: datos.vehiculo.conductorDni, direccion: "" }}
                  opciones={directorio.porRol("conductor")}
                  onAplicar={(v) =>
                    set("vehiculo", {
                      ...(v.nombre === undefined ? {} : { conductor: v.nombre }),
                      ...(v.docNumero === undefined ? {} : { conductorDni: v.docNumero }),
                    })
                  }
                  onElegir={(p) => {
                    onAnotarParte(p);
                    if (p.licencia) set("vehiculo", { licencia: p.licencia });
                  }}
                  onGuardar={(v) => onGuardarEnLibreta({ ...v, docTipo: "DNI" }, "conductor")}
                />
              }
            >
              <Field span={6} label={esFluvial ? "Patrón de la embarcación" : "Nombre del conductor"} required>
                <input type="text" className={`${I} ${falta(datos.vehiculo.conductor)}`} value={datos.vehiculo.conductor} onChange={(e) => set("vehiculo", { conductor: e.target.value })} />
              </Field>
              <Field span={3} label="DNI">
                <input type="text" className={`${I} font-mono`} value={datos.vehiculo.conductorDni} onChange={(e) => set("vehiculo", { conductorDni: e.target.value })} />
              </Field>
              <Field span={3} label="N° de licencia">
                <input type="text" className={`${I} font-mono`} value={datos.vehiculo.licencia} onChange={(e) => set("vehiculo", { licencia: e.target.value })} />
              </Field>
            </SubBloque>

            <SubBloque
              etiqueta={esFluvial ? "Embarcación" : "Vehículo"}
              acciones={<CtpVehiculoBarra vehiculos={directorio.vehiculosActivos} onAplicar={(v) => set("vehiculo", v)} onElegir={onAnotarVehiculo} />}
            >
              <Field span={4} label="Modo de transporte" hint="Río, carretera o mixto">
                <select
                  className={I}
                  value={datos.vehiculo.modo}
                  onChange={(e) => set("vehiculo", { modo: e.target.value as "terrestre" | "fluvial" | "multimodal" })}
                >
                  <option value="terrestre">Terrestre</option>
                  <option value="fluvial">Fluvial</option>
                  <option value="multimodal">Multimodal (río + carretera)</option>
                </select>
              </Field>
              {esFluvial ? (
                <Field span={4} label="Embarcación" required hint="Nombre de la embarcación">
                  <input type="text" className={`${I} ${falta(datos.vehiculo.embarcacion)}`} value={datos.vehiculo.embarcacion} onChange={(e) => set("vehiculo", { embarcacion: e.target.value })} placeholder="Chata Doña Rosa" />
                </Field>
              ) : (
                <Field span={4} label="Tipo de vehículo" hint="Camión, tráiler…">
                  <input type="text" className={I} value={datos.vehiculo.tipo} onChange={(e) => set("vehiculo", { tipo: e.target.value })} />
                </Field>
              )}
              <Field span={4} label={esFluvial ? "Matrícula" : "Placa"} required>
                <input type="text" className={`${I} font-mono uppercase ${falta(datos.vehiculo.placa)}`} value={datos.vehiculo.placa} onChange={(e) => set("vehiculo", { placa: e.target.value.toUpperCase() })} />
              </Field>
              <Field span={6} label="Placa del remolque" hint={remolqueNoAplica ? "No aplica: sólo si el camión lleva remolque" : undefined}>
                <input
                  type="text"
                  className={`${I} font-mono uppercase ${remolqueNoAplica ? CLASE_NO_APLICA : ""}`}
                  placeholder={remolqueNoAplica ? "no aplica" : undefined}
                  value={datos.vehiculo.placaRemolque ?? ""}
                  onChange={(e) => set("vehiculo", { placaRemolque: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field
                span={6}
                label="Guía de remisión"
                casillero={29}
                hint={`${remisionNoAplica ? "No aplica: sólo si el transportista la emitió. " : ""}Es la guía del transportista, no el comprobante.`}
              >
                <input
                  type="text"
                  className={`${I} font-mono ${remisionNoAplica ? CLASE_NO_APLICA : ""}`}
                  placeholder={remisionNoAplica ? "no aplica" : undefined}
                  value={datos.guia.guiaRemisionNro}
                  onChange={(e) => setGuia({ guiaRemisionNro: e.target.value })}
                />
              </Field>
            </SubBloque>
          </Bloque>

          <Bloque
            titulo="Traslado y títulos"
            hint="La ruta que se autoriza y con qué título sale la madera."
            nota="Sale en original y dos copias, como manda la RDE 122-2015 (art. 5). Lo que falte se puede completar después desde la ficha del despacho."
            faltan={faltan.traslado}
          >
            <Field span={6} label="Punto de partida" required>
              <input type="text" className={`${I} ${falta(datos.traslado.puntoPartida)}`} value={datos.traslado.puntoPartida} onChange={(e) => set("traslado", { puntoPartida: e.target.value })} />
            </Field>
            <Field span={6} label="Punto de llegada" required>
              <input type="text" className={`${I} ${falta(datos.traslado.puntoLlegada)}`} value={datos.traslado.puntoLlegada} onChange={(e) => set("traslado", { puntoLlegada: e.target.value })} />
            </Field>
            <Field span={12} label="Ruta declarada" hint="Los puestos de control la cotejan">
              <input type="text" className={I} value={datos.traslado.ruta} onChange={(e) => set("traslado", { ruta: e.target.value })} />
            </Field>
            <CampoTituloHabilitante
              titulos={datos.titulos}
              guia={datos.guia}
              titulosFicha={titulosFicha}
              setDatos={setDatos}
            />
            <Field
              span={4}
              label="Permiso CITES"
              hint={llevaCites ? "N° de permiso CITES: si la especie es protegida, es legal CON permiso." : "No aplica: ninguna especie de esta guía es protegida."}
            >
              <input
                type="text"
                className={`${I} ${llevaCites ? "" : CLASE_NO_APLICA}`}
                placeholder={llevaCites ? undefined : "no aplica"}
                value={datos.citesPermiso}
                onChange={(e) => setDatos((p) => ({ ...p, citesPermiso: e.target.value }))}
              />
            </Field>
          </Bloque>
        </div>
      </div>
    </FormularioClaro>
  );
}
