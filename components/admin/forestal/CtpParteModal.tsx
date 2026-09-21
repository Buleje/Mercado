"use client";

/**
 * CtpParteModal — alta y edición de una parte del directorio forestal (ADR-317).
 *
 * El formulario largo (todos los campos, todos los roles) vive acá; la guía usa
 * la barra rápida. Lo que hace útil a este modal es el botón de padrón: se tipea
 * el RUC y SUNAT devuelve razón social y domicilio fiscal — que es exactamente
 * lo que va en la guía y lo que nadie recuerda de memoria.
 */

import { useMemo, useState } from "react";
import { Download, Loader2, MessageCircle, Save, Users } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import { ubigeoDeNombres } from "@/lib/peru-ubigeo";
import {
  completitud,
  estadoTitulo,
  motivoCciInvalido,
  pendientesDeFicha,
  type FichaParaSalud,
} from "@/lib/forestal/directorio-salud";
import {
  CATEGORIAS_PARTE,
  CATEGORIA_LABEL,
  DOC_TIPOS,
  ROLES_PARTE,
  ROL_DESCRIPCION,
  ROL_LABEL,
  categoriaEfectiva,
  fuenteAutocompletado,
  motivoDocInvalido,
  motivoRepresentanteDniInvalido,
  normalizarDocumento,
  partesParecidas,
  type CategoriaParte,
  type DocTipo,
  type Parte,
  type ParteInput,
  type RolParte,
  type Vehiculo,
} from "@/lib/forestal/directorio";
import { consultarDocumento } from "@/hooks/use-directorio-forestal";
import { Btn, CampoGrid, Field, I, ModalBody, ModalFooter, Seccion, useAtajoGuardar, useCierreSeguro, useHayCambios } from "./ctp-shared";
import CtpParteLogo from "./CtpParteLogo";
import CtpParteAdjuntos from "./CtpParteAdjuntos";

type Borrador = ParteInput & { id?: string };

function aBorrador(p: Parte | null, rolInicial: RolParte): Borrador {
  if (!p) return { roles: [rolInicial], nombre: "", categoria: "ccnn", docTipo: "RUC" };
  return {
    id: p.id,
    roles: p.roles.length ? p.roles : [rolInicial],
    nombre: p.nombre,
    categoria: categoriaEfectiva(p.categoria),
    codigoCtp: p.codigoCtp ?? "",
    docTipo: p.docTipo ?? "RUC",
    docNumero: p.docNumero ?? "",
    direccion: p.direccion ?? "",
    region: p.region ?? "",
    provincia: p.provincia ?? "",
    distrito: p.distrito ?? "",
    zona: p.zona ?? "",
    ubigeo: p.ubigeo ?? "",
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    registroMtc: p.registroMtc ?? "",
    licencia: p.licencia ?? "",
    tituloHabilitante: p.tituloHabilitante ?? "",
    resolucion: p.resolucion ?? "",
    planManejo: p.planManejo ?? "",
    arffs: p.arffs ?? "",
    representante: p.representante ?? "",
    representanteDni: p.representanteDni ?? "",
    notas: p.notas ?? "",
    activo: p.activo,
    logo: p.logo ?? "",
    adjuntos: p.adjuntos ?? [],
  };
}

export default function CtpParteModal({
  parte,
  rolInicial,
  existentes = [],
  vehiculos: vehiculosDeLaLibreta = [],
  onGuardar,
  onClose,
}: {
  /** `null` = alta. */
  parte: Parte | null;
  rolInicial: RolParte;
  /** La libreta de vehículos ya cargada, para listar los de este transportista. */
  vehiculos?: readonly Vehiculo[];
  /** El resto de la libreta — para avisar si el documento ya es de otra ficha
   *  (el problema #1 que este módulo existe para evitar: "MADERERA DEL
   *  ORIENTE SAC" y "Maderera del Oriente" como dos filas distintas). */
  existentes?: Parte[];
  onGuardar: (input: Borrador) => Promise<void>;
  onClose: () => void;
}) {
  const [b, setB] = useState<Borrador>(() => aBorrador(parte, rolInicial));
  const [estado, setEstado] = useState<"idle" | "consultando" | "guardando">("idle");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const docTipo = (b.docTipo ?? "RUC") as DocTipo;
  const fuente = fuenteAutocompletado(docTipo);
  const docMal = motivoDocInvalido(docTipo, b.docNumero ?? "");
  const dniRepresentanteMal = motivoRepresentanteDniInvalido(b.representanteDni ?? "");
  const set = (v: Partial<Borrador>) => setB((p) => ({ ...p, ...v }));

  /**
   * Otra ficha con el MISMO documento — el problema #1 que este módulo existe
   * para evitar ("MADERERA DEL ORIENTE SAC" y "Maderera del Oriente" como dos
   * filas). Al AGREGAR, el servidor ya fusiona los roles solo (mismo criterio
   * que la placa del vehículo); acá sólo se avisa, sin bloquear. Al EDITAR una
   * ficha existente hacia un documento que YA es de otra, no hay fusión del
   * lado del servidor — ahí sí bloquea, como el duplicado de placa.
   */
  const docNorm = normalizarDocumento(b.docNumero ?? "");
  const coincide = useMemo(
    () =>
      docNorm && !docMal
        ? (existentes.find((p) => p.docTipo === docTipo && normalizarDocumento(p.docNumero ?? "") === docNorm && p.id !== b.id) ?? null)
        : null,
    [existentes, docTipo, docNorm, docMal, b.id],
  );
  const coincideBloquea = Boolean(coincide && b.id);

  /**
   * El otro duplicado: el que el documento no caza.
   *
   * Una parte sin RUC —comunidades y compradores informales, que son muchos—
   * podía entrar dos veces sin que nada avisara. Se compara el núcleo del
   * nombre (sin la forma societaria, que es lo que la gente omite al tipear).
   * Avisa y no bloquea: dos aserraderos del mismo dueño pueden llamarse
   * parecido y ser dos fichas legítimas.
   */
  const parecidas = useMemo(
    () => (coincide ? [] : partesParecidas(b.nombre ?? "", existentes, { excluirId: b.id ?? null })),
    [b.nombre, b.id, existentes, coincide],
  );

  function alternarRol(rol: RolParte) {
    const tiene = b.roles.includes(rol);
    // Siempre queda al menos uno: una parte sin rol no aparece en ninguna lista
    // y se vuelve invisible desde la UI.
    if (tiene && b.roles.length === 1) return;
    set({ roles: tiene ? b.roles.filter((r) => r !== rol) : [...b.roles, rol] });
  }

  async function traerDelPadron() {
    setEstado("consultando");
    setError(null);
    setAviso(null);
    try {
      const datos = await consultarDocumento(docTipo, b.docNumero ?? "");
      if (!datos) {
        setError(`No se encontró el ${docTipo} en ${fuente}.`);
        return;
      }
      set({
        nombre: datos.nombre,
        direccion: datos.direccion ?? b.direccion,
        region: datos.region ?? b.region,
        provincia: datos.provincia ?? b.provincia,
        distrito: datos.distrito ?? b.distrito,
        ubigeo: datos.ubigeo ?? b.ubigeo,
      });
      setAviso(
        datos.estado && datos.estado.toUpperCase() !== "ACTIVO"
          ? `Traído de ${fuente}. Ojo: figura ${datos.estado}.`
          : `Traído de ${fuente}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEstado("idle");
    }
  }

  async function guardar() {
    if (b.nombre.trim().length < 2) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (docMal) {
      setError(docMal);
      return;
    }
    if (dniRepresentanteMal) {
      setError(dniRepresentanteMal);
      return;
    }
    if (coincideBloquea && coincide) {
      setError(`Ese documento ya lo tiene ${coincide.nombre}. Edita esa ficha en vez de repetir el documento acá.`);
      return;
    }
    setEstado("guardando");
    setError(null);
    try {
      await onGuardar(b);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEstado("idle");
    }
  }

  const esTransportista = b.roles.includes("transportista");
  const esConductor = b.roles.includes("conductor");
  const esProveedor = b.roles.includes("proveedor");
  const categoriaProveedor = categoriaEfectiva(b.categoria as CategoriaParte | null | undefined);

  /**
   * «Según el papel» sólo aparece para ciertos roles, y con los números fijos el
   * formulario mostraba 01·02·03·05: el operador buscaba una sección 04 que no
   * existía. Se numeran las que de verdad se pintan.
   */
  const hayPapel = esTransportista || esConductor || esProveedor;
  const base = hayPapel ? 4 : 3;
  const nro = {
    roles: 1,
    identidad: 2,
    donde: 3,
    papel: 4,
    pago: base + 1,
    logo: base + 2,
    notas: base + 3,
  };

  // Qué le falta a esta ficha para servir en los papeles que cumple.
  const pendientes = pendientesDeFicha(b as FichaParaSalud);
  const listo = completitud(b as FichaParaSalud);
  const cciMal = motivoCciInvalido(b.cuentaCci);
  const vigencia = estadoTitulo(b.tituloVigenciaHasta || null);

  /**
   * Los vehículos de ESTE transportista.
   *
   * Existen desde siempre y tienen su propia pestaña en el Directorio, pero la
   * ficha del transportista no los mencionaba: había que acordarse de ir a
   * «Vehículos» y filtrar por dueño. Acá se listan en lectura —el alta sigue
   * siendo la de esa pestaña, que ya valida placas duplicadas— para que la
   * ficha conteste «con qué camiones trabaja este».
   */
  const susVehiculos = useMemo(
    () => (b.id ? vehiculosDeLaLibreta.filter((v) => v.transportistaId === b.id && v.activo) : []),
    [b.id, vehiculosDeLaLibreta],
  );
  /**
   * `wa.me` quiere el número sin signos y con código de país. Un celular
   * peruano de 9 dígitos se asume +51: es lo que hay en el 99 % de las fichas,
   * y si alguien carga el código completo se respeta.
   */
  const whatsappLink = (() => {
    const n = (b.whatsapp ?? "").replace(/\D/g, "");
    if (!n) return null;
    const conPais = n.length === 9 ? `51${n}` : n;
    return conPais.length >= 10 ? `https://wa.me/${conPais}` : null;
  })();

  const bodyRef = useAtajoGuardar(() => void guardar(), estado === "idle");
  const cerrar = useCierreSeguro(useHayCambios(b) && estado !== "guardando", onClose);

  return (
    <AdminModal
      open
      onClose={cerrar}
      title={parte ? `Editar ${parte.nombre}` : "Agregar al directorio"}
      description={b.roles.map((r) => ROL_LABEL[r]).join(" · ")}
      icon={Users}
      variant="info"
      footer={
        <ModalFooter
          error={error}
          aviso={aviso}
          nota={coincide && !coincideBloquea ? `Ese documento ya es de ${coincide.nombre} — al guardar se combina con esa ficha, no se crea una nueva.` : undefined}
          atajo
        >
          <Btn variant="ghost" onClick={cerrar}>Cancelar</Btn>
          <Btn variant="primary" disabled={estado === "guardando" || coincideBloquea} onClick={() => void guardar()}>
            {estado === "guardando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody ref={bodyRef}>
        {/* Qué le falta a esta ficha para servir. No bloquea: es una lista de
            pendientes, que es lo contrario de un formulario que no deja guardar. */}
        <div className="col-span-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {listo === 100 ? "Ficha completa para lo que hace" : `Ficha al ${listo}%`}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              {pendientes.length === 0
                ? "No falta nada de lo que piden estos papeles"
                : `${pendientes.length} dato${pendientes.length === 1 ? "" : "s"} por cargar`}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            role="progressbar"
            aria-valuenow={listo}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Qué parte de la ficha está cargada"
          >
            <div
              className={`h-full rounded-full transition-[width] ${
                listo === 100 ? "bg-[var(--data-success-500)]" : listo >= 60 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]"
              }`}
              style={{ width: `${Math.max(4, listo)}%` }}
            />
          </div>
          {pendientes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {pendientes.slice(0, 4).map((x) => (
                <li key={x.campo} className="flex items-start gap-1.5 text-xs">
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                      x.nivel === "alto" ? "bg-[var(--data-error-500)]" : "bg-[var(--data-warning-500)]"
                    }`}
                  />
                  <span className="text-[var(--text-secondary)]">
                    <b className="text-[var(--text-primary)]">{x.campo}</b> — {x.porque}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Seccion numero={nro.roles} title="Qué papel cumple" hint="Se puede marcar más de uno">
          <div className="sm:col-span-12 flex flex-wrap gap-2">
            {ROLES_PARTE.map((rol) => {
              const on = b.roles.includes(rol);
              return (
                <button
                  key={rol}
                  type="button"
                  aria-pressed={on}
                  title={ROL_DESCRIPCION[rol]}
                  onClick={() => alternarRol(rol)}
                  className={`inline-flex h-11 items-center rounded-xl border-2 px-3.5 text-sm font-semibold transition-colors ${
                    on
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                  }`}
                >
                  {ROL_LABEL[rol]}
                </button>
              );
            })}
          </div>
        </Seccion>

        <Seccion numero={nro.identidad} title="Identidad">
          <Field label="Tipo de documento" span={3}>
            <select className={I} value={docTipo} onChange={(e) => set({ docTipo: e.target.value as DocTipo })}>
              {DOC_TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field
            label="N° de documento"
            span={4}
            hint={docMal ?? (coincideBloquea ? "Ya es de otra ficha" : coincide ? "Ya existe — se va a combinar" : undefined)}
          >
            <input
              type="text"
              aria-invalid={coincideBloquea ? true : undefined}
              className={`${I} font-mono ${coincideBloquea ? "border-[var(--data-error-500)]" : ""}`}
              value={b.docNumero ?? ""}
              onChange={(e) => set({ docNumero: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-5 flex items-end">
            {fuente && (
              <Btn variant="secondary" disabled={!!docMal || !b.docNumero || estado !== "idle"} onClick={() => void traerDelPadron()}>
                {estado === "consultando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Traer de {fuente}
              </Btn>
            )}
          </div>
          <Field label="Nombre o razón social" required span={12}>
            <input type="text" className={I} value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} />
          </Field>

          {parecidas.length > 0 && (
            <div className="col-span-12 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-100)] px-3 py-2 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
              <p className="font-bold">
                {parecidas.length === 1 ? "Ya hay una ficha parecida" : `Ya hay ${parecidas.length} fichas parecidas`}
              </p>
              <ul className="mt-1 space-y-0.5">
                {parecidas.slice(0, 3).map((p) => (
                  <li key={p.id ?? p.nombre} className="truncate">
                    · {p.nombre}
                    {p.docNumero ? ` — ${p.docTipo ?? "Doc"} ${p.docNumero}` : " — sin documento"}
                  </li>
                ))}
              </ul>
              <p className="mt-1 opacity-90">
                Si es la misma, cancela y edita la que ya existe. Si de verdad son dos, sigue: esto es sólo un aviso.
              </p>
            </div>
          )}
        </Seccion>

        <Seccion numero={nro.donde} title="Dónde está" hint="La dirección del destinatario es el punto de llegada de la guía">
          <Field label="Dirección" span={12}>
            <input type="text" className={I} value={b.direccion ?? ""} onChange={(e) => set({ direccion: e.target.value })} />
          </Field>
          {/* Región · provincia · distrito en cascada, con el mismo selector que
              ya usa la Ficha del CTP. Antes eran tres campos de texto libre:
              «Coronel Portillo» y «CORONEL PORTILLO» quedaban como dos lugares
              distintos, y el ubigeo había que buscarlo aparte. Ahora el código
              INEI sale solo de los tres nombres elegidos. */}
          <CtpUbigeoSelects
            span={4}
            valor={{ departamento: b.region ?? "", provincia: b.provincia ?? "", distrito: b.distrito ?? "" }}
            onChange={(v) => {
              /**
               * `CtpUbigeoSelects` emite un PATCH PARCIAL, no el valor entero:
               * al cambiar la provincia manda `{provincia, distrito}` sin el
               * departamento. Leerlo como `v.departamento ?? ""` borraba la
               * región y dejaba el distrito sin opciones — se vio eligiendo
               * Ucayali → Coronel Portillo y quedándose sin distritos.
               */
              const region = v.departamento !== undefined ? v.departamento : (b.region ?? "");
              const provincia = v.provincia !== undefined ? v.provincia : (b.provincia ?? "");
              const distrito = v.distrito !== undefined ? v.distrito : (b.distrito ?? "");
              const code = ubigeoDeNombres(region, provincia, distrito);
              set({
                region,
                provincia,
                distrito,
                // Sólo se pisa el ubigeo cuando los tres nombres resuelven a un
                // código: si alguien lo tenía cargado a mano y la selección
                // todavía está a medias, su dato no se borra.
                ...(code ? { ubigeo: code } : {}),
              });
            }}
          />
          <Field label="Zona" span={6} hint="Sector o caserío — identifica el punto de llegada cuando la dirección no tiene numeración">
            <input type="text" className={I} value={b.zona ?? ""} onChange={(e) => set({ zona: e.target.value })} />
          </Field>
          <Field label="Ubigeo" span={6} hint="Se completa solo al elegir departamento, provincia y distrito">
            <input type="text" className={`${I} font-mono`} value={b.ubigeo ?? ""} onChange={(e) => set({ ubigeo: e.target.value })} />
          </Field>
          <Field label="Teléfono" span={4}>
            <input type="text" className={I} value={b.telefono ?? ""} onChange={(e) => set({ telefono: e.target.value })} />
          </Field>
          {/* WhatsApp aparte: en la selva el fijo no existe y el número que
              contesta no siempre es el que figura en el RUC. */}
          {/* El enlace va FUERA del Field, como el botón de SUNAT: `Field`
              asocia el id por `htmlFor` y sólo a un input/select/textarea —
              envolviéndolo en un div, el label quedaba sin campo asociado (se
              vio: `label[for]` vacío para WhatsApp). */}
          <Field label="WhatsApp" span={3} hint="Solo números, con o sin +51">
            <input type="text" className={I} value={b.whatsapp ?? ""} onChange={(e) => set({ whatsapp: e.target.value })} />
          </Field>
          <div className="sm:col-span-1 flex items-end">
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir el chat de WhatsApp"
                aria-label="Abrir el chat de WhatsApp"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--data-success-500)] text-[var(--data-success-700)] transition-colors hover:bg-[var(--data-success-50)]"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
          </div>
          <Field label="Email" span={4}>
            <input type="email" className={I} value={b.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          {/* Quien atiende de verdad, cuando no es el representante legal. */}
          <Field label="Contacto" span={6} hint="El que coordina el flete o la entrega">
            <input type="text" className={I} value={b.contactoNombre ?? ""} onChange={(e) => set({ contactoNombre: e.target.value })} />
          </Field>
          <Field label="Teléfono del contacto" span={6}>
            <input type="text" className={I} value={b.contactoTelefono ?? ""} onChange={(e) => set({ contactoTelefono: e.target.value })} />
          </Field>
        </Seccion>

        {(esTransportista || esConductor || esProveedor) && (
          <Seccion numero={nro.papel} title="Según el papel">
            {esTransportista && (
              <>
              {susVehiculos.length > 0 && (
                <div className="col-span-12 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2">
                  <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Sus vehículos
                  </span>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {susVehiculos.map((v) => (
                      <li
                        key={v.id}
                        className="rounded-lg bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--text-primary)]"
                        title={[v.marca, v.tipo, v.capacidadM3 ? `${v.capacidadM3} m³` : null].filter(Boolean).join(" · ")}
                      >
                        {v.placa}
                        {v.placaRemolque && <span className="text-[var(--text-tertiary)]"> + {v.placaRemolque}</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Se dan de alta en Directorio → Vehículos, que valida las placas repetidas.
                  </p>
                </div>
              )}
              <Field label="Registro MTC" span={4} hint="Si es empresa de transporte">
                <input type="text" className={I} value={b.registroMtc ?? ""} onChange={(e) => set({ registroMtc: e.target.value })} />
              </Field>
              </>
            )}
            {esConductor && (
              <Field label="Licencia de conducir" span={4} hint="Es lo que pide el puesto de control">
                <input type="text" className={`${I} font-mono`} value={b.licencia ?? ""} onChange={(e) => set({ licencia: e.target.value })} />
              </Field>
            )}
            {esProveedor && (
              <>
                <div className="sm:col-span-12">
                  <span className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Categoría</span>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS_PARTE.map((cat) => {
                      const on = categoriaProveedor === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set({ categoria: cat })}
                          className={`inline-flex h-10 items-center rounded-xl border-2 px-3.5 text-sm font-semibold transition-colors ${
                            on
                              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                          }`}
                        >
                          {CATEGORIA_LABEL[cat]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    Decide qué pide este bloque: una CCNN extrae con título habilitante, un aserradero tiene su propio Código de CTP.
                  </p>
                </div>
                {categoriaProveedor === "ccnn" && (
                  <>
                    <Field label="Título habilitante" span={4} hint="Permiso, concesión o plantación con la que extrae">
                      <input type="text" className={I} value={b.tituloHabilitante ?? ""} onChange={(e) => set({ tituloHabilitante: e.target.value })} />
                    </Field>
                    {/* Los tres casilleros que la guía pide del titular y que, sin
                        esto, había que tipear en cada guía: (8) resolución, (9)
                        plan de manejo y (2) autoridad. */}
                    <Field label="N° de resolución" span={4} hint="Casillero (8) de la GTF">
                      <input type="text" className={I} value={b.resolucion ?? ""} onChange={(e) => set({ resolucion: e.target.value })} />
                    </Field>
                    <Field label="Plan de manejo" span={4} hint="Casillero (9) — ej. DEMA, PMFI">
                      <input type="text" className={I} value={b.planManejo ?? ""} onChange={(e) => set({ planManejo: e.target.value })} />
                    </Field>
                    {/* Comprarle a alguien con el título vencido invalida la GTF
                      que se emita con esa madera: es un dato de riesgo. */}
                  <Field
                    label="Su título vence el"
                    span={6}
                    hint={vigencia.nivel === "sin_dato" ? "Para que el sistema avise antes de comprarle" : vigencia.texto}
                  >
                    <input
                      type="date"
                      className={`${I} ${
                        vigencia.tono === "danger"
                          ? "border-[var(--data-error-500)]"
                          : vigencia.tono === "warn"
                            ? "border-[var(--data-warning-500)]"
                            : ""
                      }`}
                      value={(b.tituloVigenciaHasta ?? "").slice(0, 10)}
                      onChange={(e) => set({ tituloVigenciaHasta: e.target.value })}
                    />
                  </Field>
                  {vigencia.nivel === "vencido" && (
                    <p className="col-span-12 rounded-xl border border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] px-3 py-2 text-xs font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
                      {vigencia.texto}. Pídele la renovación antes de registrar un ingreso con su guía.
                    </p>
                  )}
                  <Field label="ARFFS competente" span={6} hint="Casillero (2) — la autoridad regional del titular">
                      <input type="text" className={I} value={b.arffs ?? ""} onChange={(e) => set({ arffs: e.target.value })} />
                    </Field>
                  </>
                )}
                {categoriaProveedor === "aserradero" && (
                  <Field label="Código de CTP" span={6} hint="El código que le dio ARFFS a SU planta, no la nuestra">
                    <input type="text" className={`${I} font-mono`} value={b.codigoCtp ?? ""} onChange={(e) => set({ codigoCtp: e.target.value })} />
                  </Field>
                )}
                <Field label="Representante legal" span={6} hint="El que firma; cuelga del (7)">
                  <input type="text" className={I} value={b.representante ?? ""} onChange={(e) => set({ representante: e.target.value })} />
                </Field>
                <Field label="DNI del representante" span={6} hint={dniRepresentanteMal ?? "El jefe de la comunidad o el gerente que firma"}>
                  <input
                    type="text"
                    className={`${I} font-mono`}
                    value={b.representanteDni ?? ""}
                    onChange={(e) => set({ representanteDni: e.target.value })}
                  />
                </Field>
              </>
            )}
          </Seccion>
        )}

        {/* Sin esto, cada pago vuelve a pedir el número de cuenta por chat. */}
        <Seccion numero={nro.pago} title="Cómo se le paga" hint="Para transferirle sin volver a pedir los datos">
          <Field label="Banco" span={4}>
            <input type="text" className={I} value={b.banco ?? ""} onChange={(e) => set({ banco: e.target.value })} placeholder="BCP, Interbank…" />
          </Field>
          <Field label="N° de cuenta" span={4}>
            <input type="text" className={`${I} font-mono`} value={b.cuentaNumero ?? ""} onChange={(e) => set({ cuentaNumero: e.target.value })} />
          </Field>
          <Field
            label="CCI"
            span={4}
            hint={cciMal ?? "20 dígitos — es el que sirve para transferir entre bancos distintos"}
          >
            <input
              type="text"
              inputMode="numeric"
              className={`${I} font-mono ${cciMal ? "border-[var(--data-error-500)]" : ""}`}
              value={b.cuentaCci ?? ""}
              onChange={(e) => set({ cuentaCci: e.target.value })}
            />
          </Field>
          <Field label="La cuenta está a nombre de" span={12} hint="Sólo si no coincide con el titular de la ficha (pasa: la comunidad cobra en la cuenta de su jefe)">
            <input type="text" className={I} value={b.cuentaTitular ?? ""} onChange={(e) => set({ cuentaTitular: e.target.value })} />
          </Field>
        </Seccion>

        <Seccion numero={nro.logo} title="Logo y papeles del titular">
          <CampoGrid className="sm:col-span-12">
            <Field label="Membrete de sus documentos" span={12} hint="Sale en la cabecera de la guía y sus anexos">
              <CtpParteLogo logo={b.logo ?? ""} onCambio={(logo) => set({ logo })} />
            </Field>
            <Field label="Documentos del titular" span={12} hint="Permiso, resolución, copia del RUC — se guardan en el Drive">
              <CtpParteAdjuntos
                adjuntos={b.adjuntos ?? []}
                nombreParte={b.nombre}
                onCambio={(adjuntos) => set({ adjuntos })}
              />
            </Field>
          </CampoGrid>
        </Seccion>

        <Seccion numero={nro.notas} title="Notas">
          <CampoGrid className="sm:col-span-12">
            <Field label="Observaciones internas" span={12}>
              <input type="text" className={I} value={b.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} />
            </Field>
          </CampoGrid>
        </Seccion>

      </ModalBody>
    </AdminModal>
  );
}
