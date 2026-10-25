"use client";

/**
 * Paso «Dónde y contacto» de la ficha del Directorio: la dirección (el punto de
 * llegada de la guía), el ubigeo en cascada, dónde se carga el camión y cómo
 * se le ubica.
 */

import { MessageCircle } from "@buleje/design-system/icons";
import { ubigeoDeNombres } from "@/lib/peru-ubigeo";
import { Field, I, Seccion } from "./ctp-shared";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import CtpPartePuntoAcopio from "./CtpPartePuntoAcopio";
import { PendientesDelPaso } from "./ctp-parte-salud";
import type { ParteFormEstado } from "./hooks/use-parte-form";

export default function CtpPartePasoDonde({ form }: { form: ParteFormEstado }) {
  const { b, set, whatsappLink } = form;
  return (
    <>
      <PendientesDelPaso pendientes={form.pendientesDe("donde")} />
      <Seccion title="Dónde está" hint="La dirección del destinatario es el punto de llegada de la guía">
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
        <Field label="Zona" span={8} hint="Sector o caserío — identifica el punto de llegada cuando la dirección no tiene numeración">
          <input type="text" className={I} value={b.zona ?? ""} onChange={(e) => set({ zona: e.target.value })} />
        </Field>
        <Field label="Ubigeo" span={4} hint="Se completa solo al elegir departamento, provincia y distrito">
          <input type="text" className={`${I} font-mono`} value={b.ubigeo ?? ""} onChange={(e) => set({ ubigeo: e.target.value })} />
        </Field>
        {/* Dónde se carga el camión: no es la dirección legal. */}
        <CtpPartePuntoAcopio
          lat={b.acopioLat}
          lng={b.acopioLng}
          referencia={b.acopioReferencia ?? ""}
          onCambio={(v) => set(v)}
        />
      </Seccion>

      <Seccion title="Cómo se le ubica" hint="Teléfono, WhatsApp y quién atiende de verdad">
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
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--data-success-500)] text-[var(--data-success-700)] transition-colors hover:bg-[var(--data-success-50)] dark:text-[var(--data-success-500)] dark:hover:bg-[var(--data-success-500)]/12"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
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
        {/* El segundo que contesta. En comunidades y empresas chicas el primer
            contacto se queda sin señal o cambia de número, y la guía se frena
            por no tener a quién llamar. */}
        <Field label="Otro contacto" span={6} hint="El que contesta cuando el primero no">
          <input type="text" className={I} value={b.contacto2Nombre ?? ""} onChange={(e) => set({ contacto2Nombre: e.target.value })} />
        </Field>
        <Field label="Su teléfono" span={6}>
          <input type="text" className={I} value={b.contacto2Telefono ?? ""} onChange={(e) => set({ contacto2Telefono: e.target.value })} />
        </Field>
      </Seccion>
    </>
  );
}
