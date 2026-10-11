"use client";
/**
 * Cabecera de Tienda online › Apariencia en el patrón del panel (11-10):
 * UNA fila con el título y su ⓘ · las secciones (`BarraDeSecciones`, `?sub=`)
 * · «Ver mi tienda» siempre a mano · «⋯» con lo secundario. Debajo, UNA línea
 * de estado: el % configurado y lo que falta, cada aviso lleva a su sección.
 *
 * Antes: una caja de 4 filas (barra de %, cinco chips «Identidad 4/4» que
 * repetían las pestañas, los avisos en filas con «Arreglar →» y el enlace a
 * Contenido) y DEBAJO otra barra de pestañas (tercer nivel en el panel).
 */
import { CheckCircle2, AlertTriangle, Eye, Globe, MoreHorizontal, Paintbrush, Store } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones } from "@/components/admin/shared/BarraDeSecciones";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { SaludTienda } from "./salud";

export type SeccionApariencia = "identidad" | "colores" | "estilos" | "portada" | "contacto" | "avanzado";

export const ID_PANEL_APARIENCIA = "tienda-apariencia-panel";

/** Rótulo y ⓘ de cada sección. La ayuda es la que antes iba en un encabezado con ícono dentro de cada una. */
export const SECCIONES_APARIENCIA: { clave: SeccionApariencia; rotulo: string; ayuda: string }[] = [
  { clave: "identidad", rotulo: "Identidad", ayuda: "Logo, nombre, eslogan y descripción: lo que sale en la cabecera de tu tienda y en Google. Debajo, cómo apareces en Google y el «sobre nosotros»." },
  { clave: "colores", rotulo: "Colores", ayuda: "Empieza con una plantilla o ajusta cada color. Se aplica a botones, enlaces, etiquetas y llamados a la acción de toda tu tienda; la vista previa cambia mientras eliges." },
  { clave: "estilos", rotulo: "Estilos", ayuda: "Cómo se ven las tarjetas de productos, los botones y la barra de arriba. Se aplica al guardar." },
  { clave: "portada", rotulo: "Portada", ayuda: "El banner grande de arriba de tu tienda: qué problema resuelves, en cuánto tiempo, con qué garantía. Mira la vista previa mientras escribes." },
  { clave: "contacto", rotulo: "Contacto", ayuda: "Cómo te escribe el cliente (WhatsApp, teléfono, horarios), qué secciones salen en el inicio, los banners por categoría y qué productos se ven." },
  { clave: "avanzado", rotulo: "Avanzado", ayuda: "Mensajes automáticos, popup de bienvenida, QR, tipografía, bordes, favicon, cómo apareces en Google, la medición y tu CSS." },
];

export function CabeceraApariencia({
  seccion,
  onSeccion,
  salud,
  urlTienda,
  onVistaPrevia,
  onModoCreativo,
}: {
  seccion: SeccionApariencia;
  onSeccion: (s: SeccionApariencia) => void;
  salud: SaludTienda;
  urlTienda: string;
  onVistaPrevia: () => void;
  onModoCreativo: () => void;
}) {
  const actual = SECCIONES_APARIENCIA.find((s) => s.clave === seccion) ?? SECCIONES_APARIENCIA[0];
  const secciones = SECCIONES_APARIENCIA.map(({ clave, rotulo }) => ({
    clave,
    rotulo,
    cuenta: (salud.faltan as Partial<Record<SeccionApariencia, number>>)[clave],
  }));
  const acciones: MenuAccion[] = [
    { id: "vista-previa", label: "Vista previa", hint: "Tu tienda en celular, tablet o computadora, sin salir del panel", icon: Eye, onSelect: onVistaPrevia },
    { id: "creativo", label: "Modo Creativo", hint: "Plantillas completas y el editor a pantalla entera", icon: Paintbrush, onSelect: onModoCreativo },
    {
      id: "contenido",
      label: "Secciones, banners y promociones",
      hint: "Se arman en Tienda online › Contenido",
      icon: Globe,
      onSelect: () => irAEnlace("/admin?tab=pagina-inicio&vista=contenido"),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Apariencia</SectionTitle>
          <InfoTip title={actual.rotulo} what={<span>{actual.ayuda}</span>} />
        </div>
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">
          <BarraDeSecciones secciones={secciones} activa={seccion} onCambiar={onSeccion} etiqueta="Secciones de Apariencia" idPanel={ID_PANEL_APARIENCIA} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <a
            href={urlTienda}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver mi tienda (pestaña nueva)"
            className={button({ variant: "secondary", className: "h-12 rounded-xl max-sm:w-12 max-sm:px-0" })}
          >
            <Store className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Ver mi tienda</span>
          </a>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Vista previa, Modo Creativo y secciones del inicio" />
        </div>
      </div>

      {/* Estado en una línea: el % y lo que falta; cada aviso lleva a su sección. */}
      <div className="flex flex-wrap items-center gap-x-3 text-sm" role="status">
        <span className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
          Tu tienda: {salud.pct} % configurada
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
            <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${salud.pct}%` }} />
          </span>
        </span>
        {salud.avisos.length === 0 ? (
          <span className="flex min-h-12 items-center gap-1.5 font-semibold text-[var(--data-success-ink)]">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Sin pendientes
          </span>
        ) : (
          salud.avisos.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => onSeccion(a.seccion)}
              title={`Ir a ${SECCIONES_APARIENCIA.find((s) => s.clave === a.seccion)?.rotulo ?? a.seccion}`}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-lg px-1 text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
              {a.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
