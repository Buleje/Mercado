"use client";

/**
 * El cuerpo del documento que ampara el ingreso (ADR-336).
 *
 * ## Por qué existe
 *
 * El libro guardaba de la GTF la mitad que le importa a los saldos —titular,
 * origen, especie, volumen— y perdía la otra: **quién es el dueño de la madera**
 * (casilleros 13-21), a quién venía dirigida (22-28) y quién la trajo (29-34).
 * En modo SERFOR se veían en pantalla porque la ficha los traía, pero cargando
 * a mano no había dónde escribirlos y al guardar no quedaban en ningún lado.
 *
 * Eso no es un detalle de completitud: el propietario del producto puede NO ser
 * el titular del título habilitante (D.S. 018-2015 art. 172 inciso d) y es lo
 * que una fiscalización cruza cuando la madera cambió de manos en el camino.
 *
 * ## Cómo se llena sin tipear veinte campos
 *
 * · **Es el mismo titular** copia lo que ya se cargó arriba (el caso más común).
 * · **Soy yo** pone al CTP como destinatario desde su Ficha — en un ingreso, el
 *   destinatario de la guía es esta planta.
 * · La libreta del CTP (ADR-317) autocompleta por RUC/DNI contra SUNAT/RENIEC.
 *
 * Nada se inventa: lo que el documento no dice queda vacío.
 */

import { Building2, Check, Truck, UserCircle } from "@buleje/design-system/icons";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";
import type { DocTipo } from "@/lib/forestal/directorio";
import CtpParteBarra, { type ValorParte } from "./CtpParteBarra";
import type { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { Btn, Field, I, Seccion } from "./ctp-shared";

/** Los tipos de comprobante del casillero (20) del formato. */
const COMPROBANTES: { valor: GtfDatos["comprobante"]["tipo"]; label: string }[] = [
  { valor: "ninguno", label: "No aplica" },
  { valor: "factura", label: "Factura" },
  { valor: "boleta", label: "Boleta de venta" },
  { valor: "guia_remision", label: "Guía de remisión" },
  { valor: "otro", label: "Otro" },
];

const MODOS: { valor: GtfDatos["vehiculo"]["modo"]; label: string }[] = [
  { valor: "terrestre", label: "Terrestre" },
  { valor: "fluvial", label: "Fluvial" },
  { valor: "multimodal", label: "Multimodal" },
];

interface Props {
  datos: GtfDatos;
  /**
   * Updater FUNCIONAL, no un valor.
   *
   * Con `onChange({...datos, x})` cada handler escribe sobre la foto que tenía
   * al renderizar: dos cambios en el mismo tick —«es el mismo titular» y «soy
   * yo» seguidos, o cualquier autocompletado que toque dos bloques— y el
   * segundo pisa al primero. Medido: el propietario se guardaba vacío.
   */
  onChange: (actualizar: (prev: GtfDatos) => GtfDatos) => void;
  directorio: ReturnType<typeof useDirectorioForestal>;
  /** Lo que ya se cargó como titular de la guía: casi siempre es el propietario. */
  titular?: { nombre: string; docTipo: string; docNumero: string };
  /** La Ficha del CTP — en un ingreso, el destinatario de la guía es esta planta. */
  ficha?: CtpFicha | null;
}

export default function CtpGuiaOficialForm({ datos, onChange, directorio, titular, ficha }: Props) {
  /** Parcha una parte (propietario/destinatario/transportista) sin pisar el resto. */
  const setParte = (
    clave: "propietario" | "destinatario" | "transportista",
    v: Partial<ValorParte>,
  ) => onChange((prev) => ({ ...prev, [clave]: { ...prev[clave], ...v } }));

  const setVehiculo = (v: Partial<GtfDatos["vehiculo"]>) =>
    onChange((prev) => ({ ...prev, vehiculo: { ...prev.vehiculo, ...v } }));
  const setGuia = (v: Partial<GtfDatos["guia"]>) =>
    onChange((prev) => ({ ...prev, guia: { ...prev.guia, ...v } }));
  const setComprobante = (v: Partial<GtfDatos["comprobante"]>) =>
    onChange((prev) => ({ ...prev, comprobante: { ...prev.comprobante, ...v } }));
  const setTraslado = (v: Partial<GtfDatos["traslado"]>) =>
    onChange((prev) => ({ ...prev, traslado: { ...prev.traslado, ...v } }));

  const copiarTitular = () =>
    setParte("propietario", {
      nombre: titular?.nombre ?? "",
      docTipo: (titular?.docTipo || "RUC") as DocTipo,
      docNumero: titular?.docNumero ?? "",
    });

  const soyElDestinatario = () =>
    setParte("destinatario", {
      nombre: ficha?.razonSocial || ficha?.nombreCtp || "",
      docTipo: "RUC",
      docNumero: ficha?.ruc ?? "",
      direccion: ficha?.direccion ?? "",
      departamento: ficha?.region ?? "",
      provincia: ficha?.provincia ?? "",
      distrito: ficha?.distrito ?? "",
    });

  const fluvial = datos.vehiculo.modo === "fluvial";

  return (
    <>
      {/* ── Propietario del producto (13 a 21) ─────────────────────── */}
      <Seccion
        title="Propietario del producto"
        hint="Casilleros 13 a 21 de la guía"
        estado={datos.propietario.nombre.trim() ? "ok" : undefined}
      >
        <div className="sm:col-span-12">
          <CtpParteBarra
            rol="proveedor"
            valor={datos.propietario}
            opciones={directorio.porRol("proveedor")}
            onAplicar={(v) => setParte("propietario", v)}
            onGuardar={async (v) => {
              await directorio.guardarParte({
                roles: ["proveedor"],
                nombre: v.nombre,
                docTipo: v.docTipo,
                docNumero: v.docNumero,
              });
            }}
          />
        </div>
        {titular?.nombre?.trim() && titular.nombre.trim() !== datos.propietario.nombre.trim() && (
          <div className="sm:col-span-12">
            <Btn size="sm" variant="secondary" onClick={copiarTitular}>
              <UserCircle className="h-4 w-4" /> Es el mismo titular ({titular.nombre.trim()})
            </Btn>
          </div>
        )}
        <Field span={6} label="Nombre o razón social" casillero={13}>
          <input
            value={datos.propietario.nombre}
            onChange={(e) => setParte("propietario", { nombre: e.target.value })}
            placeholder="Comunidad Nativa / empresa / persona"
            className={I}
          />
        </Field>
        <Field span={3} label="Tipo de documento" hint="(14) DNI · (15) RUC">
          <select
            value={datos.propietario.docTipo}
            onChange={(e) => setParte("propietario", { docTipo: e.target.value as DocTipo })}
            className={I}
          >
            <option value="RUC">RUC</option>
            <option value="DNI">DNI</option>
            <option value="CE">Carnet de extranjería</option>
            <option value="PASAPORTE">Pasaporte</option>
          </select>
        </Field>
        <Field span={3} label="N° de documento" casillero={15}>
          <input
            value={datos.propietario.docNumero}
            onChange={(e) => setParte("propietario", { docNumero: e.target.value })}
            placeholder="20156701263"
            className={`${I} font-mono`}
          />
        </Field>
        <Field span={12} label="Dirección" casillero={16}>
          <input
            value={datos.propietario.direccion}
            onChange={(e) => setParte("propietario", { direccion: e.target.value })}
            placeholder="CC.NN San Luis de Chinchihuani"
            className={I}
          />
        </Field>
        <Field span={4} label="Departamento" casillero={17}>
          <input
            value={datos.propietario.departamento}
            onChange={(e) => setParte("propietario", { departamento: e.target.value })}
            className={I}
          />
        </Field>
        <Field span={4} label="Provincia" casillero={18}>
          <input
            value={datos.propietario.provincia}
            onChange={(e) => setParte("propietario", { provincia: e.target.value })}
            className={I}
          />
        </Field>
        <Field span={4} label="Distrito" casillero={19}>
          <input
            value={datos.propietario.distrito}
            onChange={(e) => setParte("propietario", { distrito: e.target.value })}
            className={I}
          />
        </Field>
        <Field span={6} label="Tipo de comprobante de compra o venta" casillero={20}>
          <select
            value={datos.comprobante.tipo}
            onChange={(e) => setComprobante({ tipo: e.target.value as GtfDatos["comprobante"]["tipo"] })}
            className={I}
          >
            {COMPROBANTES.map((c) => (
              <option key={c.valor} value={c.valor}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field span={6} label="N° de comprobante" casillero={21}>
          <input
            value={datos.comprobante.numero}
            onChange={(e) => setComprobante({ numero: e.target.value })}
            placeholder="F001-000123"
            className={`${I} font-mono`}
          />
        </Field>
      </Seccion>

      {/* ── Destinatario (22 a 28) ─────────────────────────────────── */}
      <Seccion title="Destinatario" hint="Casilleros 22 a 28 — en un ingreso, esta planta">
        <div className="sm:col-span-12 flex flex-wrap items-center gap-2">
          <Btn size="sm" variant="secondary" onClick={soyElDestinatario} disabled={!ficha}>
            <Building2 className="h-4 w-4" /> Soy yo (Ficha del CTP)
          </Btn>
          {!ficha && (
            <span className="text-xs text-[var(--text-tertiary)]">
              Completá la Ficha del CTP para poder copiarla de una.
            </span>
          )}
          {datos.destinatario.nombre.trim() && ficha?.ruc && datos.destinatario.docNumero === ficha.ruc && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <Check className="h-3.5 w-3.5" /> La guía viene dirigida a este centro
            </span>
          )}
        </div>
        <Field span={6} label="Nombre o razón social" casillero={22}>
          <input
            value={datos.destinatario.nombre}
            onChange={(e) => setParte("destinatario", { nombre: e.target.value })}
            className={I}
          />
        </Field>
        <Field span={3} label="Tipo de documento" hint="(23) DNI · (24) RUC">
          <select
            value={datos.destinatario.docTipo}
            onChange={(e) => setParte("destinatario", { docTipo: e.target.value as DocTipo })}
            className={I}
          >
            <option value="RUC">RUC</option>
            <option value="DNI">DNI</option>
            <option value="CE">Carnet de extranjería</option>
            <option value="PASAPORTE">Pasaporte</option>
          </select>
        </Field>
        <Field span={3} label="N° de documento" casillero={24}>
          <input
            value={datos.destinatario.docNumero}
            onChange={(e) => setParte("destinatario", { docNumero: e.target.value })}
            className={`${I} font-mono`}
          />
        </Field>
        <Field span={12} label="Dirección" casillero={25}>
          <input
            value={datos.destinatario.direccion}
            onChange={(e) => setParte("destinatario", { direccion: e.target.value })}
            className={I}
          />
        </Field>
        <Field span={4} label="Departamento" casillero={26}>
          <input
            value={datos.destinatario.departamento}
            onChange={(e) => setParte("destinatario", { departamento: e.target.value })}
            className={I}
          />
        </Field>
        <Field span={4} label="Provincia" casillero={27}>
          <input
            value={datos.destinatario.provincia}
            onChange={(e) => setParte("destinatario", { provincia: e.target.value })}
            className={I}
          />
        </Field>
        <Field span={4} label="Distrito" casillero={28}>
          <input
            value={datos.destinatario.distrito}
            onChange={(e) => setParte("destinatario", { distrito: e.target.value })}
            className={I}
          />
        </Field>
      </Seccion>

      {/* ── Transportista y vehículo (29 a 34) ─────────────────────── */}
      <Seccion title="Transportista y vehículo" hint="Casilleros 29 a 34">
        <div className="sm:col-span-12">
          <CtpParteBarra
            rol="transportista"
            valor={datos.transportista}
            opciones={directorio.porRol("transportista")}
            onAplicar={(v) => setParte("transportista", v)}
            onGuardar={async (v) => {
              await directorio.guardarParte({
                roles: ["transportista"],
                nombre: v.nombre,
                docTipo: v.docTipo,
                docNumero: v.docNumero,
              });
            }}
          />
        </div>
        <Field span={6} label="Transportista" hint="Empresa o persona que hizo el traslado">
          <input
            value={datos.transportista.nombre}
            onChange={(e) => setParte("transportista", { nombre: e.target.value })}
            className={I}
          />
        </Field>
        <Field span={6} label="N° de guía de remisión" casillero={29} hint="La del transportista, no el comprobante de venta">
          <input
            value={datos.guia.guiaRemisionNro}
            onChange={(e) => setGuia({ guiaRemisionNro: e.target.value })}
            placeholder="T001-000456"
            className={`${I} font-mono`}
          />
        </Field>
        <Field span={4} label="Tipo de transporte" casillero={30}>
          <select
            value={datos.vehiculo.modo}
            onChange={(e) => setVehiculo({ modo: e.target.value as GtfDatos["vehiculo"]["modo"] })}
            className={I}
          >
            {MODOS.map((m) => (
              <option key={m.valor} value={m.valor}>{m.label}</option>
            ))}
          </select>
        </Field>
        <Field span={4} label="Tipo de vehículo" casillero={31}>
          <input
            value={datos.vehiculo.tipo}
            onChange={(e) => setVehiculo({ tipo: e.target.value })}
            placeholder="Camión / Carreta"
            className={I}
          />
        </Field>
        <Field span={4} label={fluvial ? "Matrícula de la embarcación" : "Placa"} casillero={31}>
          <input
            value={datos.vehiculo.placa}
            onChange={(e) => setVehiculo({ placa: e.target.value.toUpperCase() })}
            placeholder="W2D-853"
            className={`${I} font-mono`}
          />
        </Field>
        <Field span={4} label={fluvial ? "Patrón de la embarcación" : "Conductor"} casillero={32}>
          <input
            value={datos.vehiculo.conductor}
            onChange={(e) => setVehiculo({ conductor: e.target.value })}
            className={I}
          />
        </Field>
        <Field span={4} label="DNI del conductor" casillero={33}>
          <input
            value={datos.vehiculo.conductorDni}
            onChange={(e) => setVehiculo({ conductorDni: e.target.value })}
            className={`${I} font-mono`}
          />
        </Field>
        <Field span={4} label="Licencia de conducir" casillero={34}>
          <input
            value={datos.vehiculo.licencia}
            onChange={(e) => setVehiculo({ licencia: e.target.value })}
            className={`${I} font-mono`}
          />
        </Field>
        {fluvial && (
          <Field span={12} label="Nombre de la embarcación" hint="Es como la identifica un control fluvial">
            <input
              value={datos.vehiculo.embarcacion}
              onChange={(e) => setVehiculo({ embarcacion: e.target.value })}
              className={I}
            />
          </Field>
        )}
      </Seccion>

      {/* ── Casilleros sueltos del documento ───────────────────────── */}
      <Seccion title="Otros datos de la guía" hint="Autoridad, plan de manejo y vigencia">
        <Field span={6} label="Autoridad Regional Forestal (ARFFS)" casillero={2}>
          <input
            value={datos.guia.autoridad}
            onChange={(e) => setGuia({ autoridad: e.target.value })}
            placeholder="ATFFS Selva Central"
            className={I}
          />
        </Field>
        <Field span={6} label="Plan de manejo (tipo)" casillero={9}>
          <input
            value={datos.guia.planManejoTipo}
            onChange={(e) => setGuia({ planManejoTipo: e.target.value })}
            placeholder="Declaración de Manejo (DEMA)"
            className={I}
          />
        </Field>
        <Field span={3} label="N° de lista de trozas" casillero={35}>
          <input
            value={datos.guia.listaTrozasNro}
            onChange={(e) => setGuia({ listaTrozasNro: e.target.value })}
            placeholder="019-0000001"
            className={`${I} font-mono`}
          />
        </Field>
        <Field span={3} label="N° GTF de origen" casillero={36} hint="Si la madera venía amparada por otra guía">
          <input
            value={datos.guia.gtfOrigenNro}
            onChange={(e) => setGuia({ gtfOrigenNro: e.target.value })}
            placeholder="—"
            className={`${I} font-mono`}
          />
        </Field>
        <Field span={6} label="Vencimiento de la guía" casillero={4} hint="Hasta cuándo ampara el traslado">
          <input
            type="date"
            value={datos.traslado.fechaFin}
            onChange={(e) => setTraslado({ fechaFin: e.target.value })}
            className={I}
          />
        </Field>
        <div className="sm:col-span-12 flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <Truck className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          Estos datos no cambian los saldos: son lo que declara el documento. Se guardan porque es lo que una
          fiscalización cruza contra el libro.
        </div>
      </Seccion>
    </>
  );
}
