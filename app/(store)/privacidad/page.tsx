import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  UserCheck,
  Building2,
  Database,
  Sparkles,
  Share2,
  Cookie,
  Globe2,
  Clock,
  Baby,
  RefreshCw,
  Mail,
  ChevronRight,
} from "lucide-react";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import { LEGAL, LEGAL_COMPLETO } from "@/lib/legal";

const BASE_URL = "https://www.buleje.pe";
const LAST_UPDATED = "2 de junio de 2026";

/** Tarjeta única: borde 1px + elevación sutil del DS (look limpio de negocio). */
const CARD =
  "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description:
    "Cómo Buleje recopila, usa, comparte y protege tus datos personales conforme a la Ley N° 29733 de Protección de Datos Personales del Perú.",
  alternates: { canonical: `${BASE_URL}/privacidad` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Política de Privacidad — Buleje",
    description: "Tratamiento de datos personales conforme a la Ley N° 29733.",
    url: `${BASE_URL}/privacidad`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

const CHIPS = [
  { icon: UserCheck, label: "Derechos ARCO garantizados" },
  { icon: Lock, label: "Datos cifrados y protegidos" },
  { icon: RefreshCw, label: "Consentimiento revocable" },
] as const;

const TOC = [
  { id: "responsable", n: 1, title: "Responsable del tratamiento", icon: Building2 },
  { id: "datos", n: 2, title: "Qué datos recopilamos", icon: Database },
  { id: "finalidades", n: 3, title: "Para qué usamos tus datos", icon: Sparkles },
  { id: "consentimiento", n: 4, title: "Base legal y consentimiento", icon: UserCheck },
  { id: "comparticion", n: 5, title: "Con quién los compartimos", icon: Share2 },
  { id: "cookies", n: 6, title: "Cookies y tecnologías", icon: Cookie },
  { id: "internacional", n: 7, title: "Transferencias internacionales", icon: Globe2 },
  { id: "conservacion", n: 8, title: "Cuánto los conservamos", icon: Clock },
  { id: "derechos", n: 9, title: "Tus derechos (Ley 29733)", icon: ShieldCheck },
  { id: "menores", n: 10, title: "Menores de edad", icon: Baby },
  { id: "seguridad", n: 11, title: "Seguridad", icon: Lock },
  { id: "cambios", n: 12, title: "Cambios y contacto", icon: Mail },
] as const;

function Section({
  id,
  n,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  n: number;
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`${CARD} scroll-mt-24 p-6 sm:p-7`}>
      <h2 className="flex items-center gap-3 text-xl font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <span className="text-sm font-bold text-[var(--text-tertiary)] tabular-nums">{n}.</span>
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-base leading-relaxed text-[var(--text-secondary)]">
        {children}
      </div>
    </section>
  );
}

const LI = "flex gap-2.5";
const Dot = () => (
  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />
);

export default function PrivacidadPage() {
  return (
    <main id="main-content" className="bg-[var(--surface-canvas)]">
      {/* ── Breadcrumb ── */}
      <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <Breadcrumbs items={[{ label: "Política de Privacidad" }]} />
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-[var(--rule-soft)] bg-gradient-to-b from-[var(--accent-soft)]/60 to-[var(--surface-raised)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--accent)]/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--surface-raised)] px-3 py-1 text-sm font-bold text-[var(--accent)] shadow-[var(--shadow-sm)]">
            <ShieldCheck className="h-4 w-4" strokeWidth={2.5} />
            Conforme a la Ley N° 29733 · Protección de Datos Personales
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-5xl">
            Política de Privacidad
          </h1>
          <p className="mt-3 text-sm font-medium text-[var(--text-tertiary)]">
            Última actualización: {LAST_UPDATED}
          </p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            Explicamos en lenguaje claro qué datos recopilamos, para qué los usamos,
            con quién los compartimos y cómo ejerces tus derechos. Tu confianza es la
            base de Buleje.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2.5">
            {CHIPS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm font-bold text-[var(--text-secondary)] shadow-[var(--shadow-sm)]"
              >
                <Icon className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Cuerpo: TOC + contenido ── */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          {/* Índice */}
          <nav aria-label="Índice" className="hidden lg:block lg:sticky lg:top-24">
            <p className="mb-3 text-xs font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
              En esta página
            </p>
            <ul className="space-y-1">
              {TOC.map(({ id, n, title }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="flex gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  >
                    <span className="tabular-nums text-[var(--text-tertiary)]">{n}.</span>
                    {title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Secciones */}
          <div className="space-y-5">
            <Section id="responsable" n={1} title="Responsable del tratamiento" icon={Building2}>
              {LEGAL_COMPLETO ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["Titular del banco de datos", LEGAL.razonSocial],
                      ["RUC", LEGAL.ruc],
                      ["Domicilio", LEGAL.domicilioFiscal],
                      ["Nombre comercial", LEGAL.nombreComercial],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-sm font-bold text-[var(--text-tertiary)]">{k}</dt>
                      <dd className="font-semibold text-[var(--text-primary)]">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>
                  <strong className="text-[var(--text-primary)]">{LEGAL.nombreComercial}</strong> es
                  responsable del tratamiento de los datos personales recopilados a través de esta
                  plataforma. Los datos completos de identificación del titular del banco de datos se
                  publican aquí y pueden solicitarse en cualquier momento.
                </p>
              )}
              <p>
                Para consultas sobre privacidad escríbenos a{" "}
                <a href={`tel:${LEGAL.telefono.replace(/\s/g, "")}`} className="font-bold text-[var(--accent)] hover:underline">
                  {LEGAL.telefono}
                </a>{" "}
                (también por WhatsApp).
              </p>
            </Section>

            <Section id="datos" n={2} title="Qué datos recopilamos" icon={Database}>
              <p>Recopilamos únicamente datos necesarios para operar y mejorar el servicio:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Identificación y contacto:</strong> nombre, teléfono, correo, documento (DNI/RUC/CE) y razón social si compras como negocio.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Entrega y ubicación:</strong> dirección, referencia y, con tu permiso, tu geolocalización para calcular el delivery.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Transaccionales:</strong> historial de pedidos, productos, montos, método de pago (Yape/efectivo/tarjeta) y número de operación.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Cuenta y preferencias:</strong> contraseña cifrada, programa de fidelidad, cumpleaños, etiquetas y preferencias de notificación.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Navegación y dispositivo:</strong> dirección IP, tipo de dispositivo, páginas vistas, productos consultados y cookies/identificadores (ver sección 6).</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Comunicaciones:</strong> mensajes que intercambias con nosotros (incluido WhatsApp) y tus consultas o reclamos.</span></li>
              </ul>
            </Section>

            <Section id="finalidades" n={3} title="Para qué usamos tus datos" icon={Sparkles}>
              <p>Tratamos tus datos para las siguientes finalidades:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Prestar el servicio:</strong> procesar pedidos, coordinar el delivery, gestionar pagos, fidelidad, soporte y postventa.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Comunicaciones del servicio:</strong> avisos sobre tu pedido, cuenta y seguridad por WhatsApp, correo o notificaciones.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Marketing y promociones</strong> (con tu consentimiento): ofertas, novedades y campañas por WhatsApp, correo, SMS o notificaciones, que puedes desactivar cuando quieras.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Personalización y recomendaciones:</strong> analizar tus preferencias e historial para recomendarte productos y mejorar tu experiencia.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Analítica, estadística e investigación:</strong> medir el uso, prevenir fraude y desarrollar nuevos productos, funciones y modelos de inteligencia artificial.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Datos agregados y anonimizados:</strong> generamos información estadística que <strong className="text-[var(--text-primary)]">no te identifica</strong> (tendencias de consumo, reportes de mercado). Al estar disociada, deja de ser dato personal y podemos usarla y compartirla con fines comerciales y de investigación de forma indefinida.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Cumplimiento legal:</strong> facturación electrónica (SUNAT), contabilidad, atención de reclamos y requerimientos de autoridades.</span></li>
              </ul>
            </Section>

            <Section id="consentimiento" n={4} title="Base legal y consentimiento" icon={UserCheck}>
              <p>
                Tratamos tus datos sobre una base legítima: la <strong className="text-[var(--text-primary)]">ejecución del servicio</strong> que solicitas,
                el <strong className="text-[var(--text-primary)]">cumplimiento de obligaciones legales</strong>, nuestro <strong className="text-[var(--text-primary)]">interés legítimo</strong> en
                mejorar y asegurar la plataforma, y tu <strong className="text-[var(--text-primary)]">consentimiento</strong> para las finalidades que lo requieren.
              </p>
              <p>
                Otorgas tu consentimiento al crear tu cuenta, al marcar las casillas de preferencias
                (por ejemplo, recibir promociones) o al aceptar el banner de cookies. El consentimiento
                es <strong className="text-[var(--text-primary)]">libre, informado y revocable</strong>: puedes retirarlo en cualquier momento desde tu
                cuenta o escribiéndonos, sin que ello afecte el servicio esencial ya contratado.
              </p>
            </Section>

            <Section id="comparticion" n={5} title="Con quién compartimos tus datos" icon={Share2}>
              <p>No vendemos tus datos personales identificables. Los compartimos solo en estos casos:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Encargados de tratamiento:</strong> proveedores que nos prestan servicios bajo contrato y nuestras instrucciones — hosting (Supabase, Vercel), mensajería (WhatsApp/Twilio, correo), pasarelas de pago (Stripe, Mercado Pago), analítica y notificaciones.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Tiendas y repartidores del marketplace:</strong> compartimos los datos necesarios del pedido con el vendedor y el repartidor para completar tu compra.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Autoridades:</strong> cuando lo exija la ley, una orden judicial o para proteger derechos y seguridad.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Reorganización o venta del negocio:</strong> si Buleje se fusiona, es adquirida o vende todo o parte de sus activos, tus datos podrán transferirse al adquirente como parte de la operación. El nuevo titular quedará obligado por esta política y te lo notificaremos.</span></li>
              </ul>
            </Section>

            <Section id="cookies" n={6} title="Cookies y tecnologías similares" icon={Cookie}>
              <p>Usamos cookies e identificadores para:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Necesarias:</strong> carrito, sesión, seguridad y preferencias (siempre activas, no requieren consentimiento).</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Analítica y rendimiento:</strong> entender cómo se usa el sitio para mejorarlo.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Personalización y publicidad/medición</strong> (con tu consentimiento): recomendaciones y medir la efectividad de nuestras campañas.</span></li>
              </ul>
              <p>Puedes aceptar o rechazar las no esenciales desde el banner de cookies o la configuración de tu navegador.</p>
            </Section>

            <Section id="internacional" n={7} title="Transferencias internacionales" icon={Globe2}>
              <p>
                Algunos de nuestros proveedores procesan datos en servidores fuera del Perú. En esos
                casos exigimos garantías contractuales de protección equivalentes a las de la Ley 29733,
                de modo que tus datos mantengan el mismo nivel de protección dondequiera que se procesen.
              </p>
            </Section>

            <Section id="conservacion" n={8} title="Cuánto conservamos tus datos" icon={Clock}>
              <p>
                Conservamos tus datos mientras tu cuenta esté activa y por los plazos que exige la ley
                (por ejemplo, obligaciones tributarias y de reclamos). Luego los eliminamos o los
                <strong className="text-[var(--text-primary)]"> anonimizamos</strong> de forma irreversible para usarlos solo con fines estadísticos.
              </p>
            </Section>

            <Section id="derechos" n={9} title="Tus derechos (Ley 29733)" icon={ShieldCheck}>
              <p>Como titular de datos personales en Perú puedes ejercer tus derechos ARCO y más:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Acceso:</strong> obtener una copia de los datos que tenemos sobre ti, su origen y uso.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Rectificación:</strong> corregir datos inexactos o desactualizados.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Cancelación:</strong> eliminar tus datos cuando ya no sean necesarios o retires tu consentimiento.</span></li>
                <li className={LI}><Dot /><span><strong className="text-[var(--text-primary)]">Oposición y revocación:</strong> oponerte a usos específicos (como marketing) o retirar tu consentimiento.</span></li>
              </ul>
              <p>
                Ejérce­los gratis desde{" "}
                <Link href="/marketplace/mi-cuenta/privacidad" className="font-bold text-[var(--accent)] hover:underline">
                  tu cuenta → Privacidad
                </Link>{" "}
                (incluye descarga de tus datos) o escríbenos por WhatsApp al{" "}
                <a href={`tel:${LEGAL.telefono.replace(/\s/g, "")}`} className="font-bold text-[var(--accent)] hover:underline">
                  {LEGAL.telefono}
                </a>
                . Respondemos en los plazos de ley. También puedes acudir a la Autoridad Nacional de
                Protección de Datos Personales (APDP).
              </p>
            </Section>

            <Section id="menores" n={10} title="Menores de edad" icon={Baby}>
              <p>
                Nuestros servicios están dirigidos a mayores de 18 años. No recopilamos datos de menores
                a sabiendas; si detectamos uno sin autorización del padre, madre o tutor, lo eliminamos.
              </p>
            </Section>

            <Section id="seguridad" n={11} title="Seguridad" icon={Lock}>
              <p>
                Aplicamos medidas técnicas y organizativas razonables: cifrado en tránsito, contraseñas
                protegidas, control de accesos, registro de auditoría y monitoreo. Ningún sistema es 100%
                infalible, pero trabajamos para proteger tu información.
              </p>
            </Section>

            <Section id="cambios" n={12} title="Cambios y contacto" icon={Mail}>
              <p>
                Podemos actualizar esta política; te avisaremos de cambios importantes en el sitio o por
                los canales habituales. El uso continuado del servicio implica la aceptación de la versión
                vigente.
              </p>
              <p>
                ¿Dudas? Escríbenos por WhatsApp al{" "}
                <a href={`tel:${LEGAL.telefono.replace(/\s/g, "")}`} className="font-bold text-[var(--accent)] hover:underline">
                  {LEGAL.telefono}
                </a>{" "}
                o revisa nuestros{" "}
                <Link href="/terminos" className="font-bold text-[var(--accent)] hover:underline">
                  Términos y Condiciones
                </Link>{" "}
                y el{" "}
                <Link href="/libro-de-reclamaciones" className="font-bold text-[var(--accent)] hover:underline">
                  Libro de Reclamaciones
                </Link>
                .
              </p>
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}
