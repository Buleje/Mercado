import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  UserCheck,
  Building2,
  Database,
  Users,
  Sparkles,
  Megaphone,
  Cpu,
  Share2,
  Cookie,
  Globe2,
  Archive,
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
const PRIVACY_EMAIL = "contacto@buleje.pe";
const HAS_REP = !LEGAL.representanteLegal.includes("PENDIENTE");

/** Tarjeta única: borde 1px + elevación sutil del DS (look limpio de negocio). */
const CARD =
  "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description:
    "Cómo Buleje recopila, usa, comparte y protege tus datos personales conforme a la Ley N° 29733 de Protección de Datos Personales del Perú. Derechos ARCO y plazos.",
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
  { id: "terceros", n: 3, title: "Datos de terceros que nos das", icon: Users },
  { id: "finalidades", n: 4, title: "Para qué usamos tus datos", icon: Sparkles },
  { id: "consentimiento", n: 5, title: "Base legal y consentimiento", icon: UserCheck },
  { id: "marketing", n: 6, title: "Comunicaciones y marketing", icon: Megaphone },
  { id: "perfilado", n: 7, title: "Perfilado y decisiones automatizadas", icon: Cpu },
  { id: "comparticion", n: 8, title: "Con quién los compartimos", icon: Share2 },
  { id: "cookies", n: 9, title: "Cookies y tecnologías", icon: Cookie },
  { id: "internacional", n: 10, title: "Transferencias internacionales", icon: Globe2 },
  { id: "banco", n: 11, title: "Banco de datos y registro", icon: Archive },
  { id: "conservacion", n: 12, title: "Cuánto los conservamos", icon: Clock },
  { id: "derechos", n: 13, title: "Tus derechos y plazos (Ley 29733)", icon: ShieldCheck },
  { id: "seguridad", n: 14, title: "Seguridad", icon: Lock },
  { id: "menores", n: 15, title: "Menores de edad", icon: Baby },
  { id: "cambios", n: 16, title: "Cambios y contacto", icon: Mail },
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
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
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
function Dot() {
  return <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />;
}
const B = ({ children }: { children: React.ReactNode }) => (
  <strong className="text-[var(--text-primary)]">{children}</strong>
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
                    className="flex gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent)]"
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
                      ...(HAS_REP ? ([["Representante legal", LEGAL.representanteLegal]] as const) : []),
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
                  <B>{LEGAL.nombreComercial}</B> es responsable del tratamiento de los datos
                  personales recopilados a través de esta plataforma. Los datos completos de
                  identificación del titular del banco de datos (razón social, RUC, domicilio
                  y representante legal) se publican aquí y pueden solicitarse en cualquier momento.
                </p>
              )}
              <p>
                Para cualquier asunto de privacidad puedes escribir a nuestro <B>canal de
                privacidad</B>: correo{" "}
                <a href={`mailto:${PRIVACY_EMAIL}`} className="font-bold text-[var(--accent)] hover:underline">
                  {PRIVACY_EMAIL}
                </a>{" "}
                o WhatsApp al{" "}
                <a href={`tel:${LEGAL.telefono.replace(/\s/g, "")}`} className="font-bold text-[var(--accent)] hover:underline">
                  {LEGAL.telefono}
                </a>
                .
              </p>
            </Section>

            <Section id="datos" n={2} title="Qué datos recopilamos" icon={Database}>
              <p>Recopilamos únicamente datos necesarios para operar y mejorar el servicio:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><B>Identificación y contacto:</B> nombre, teléfono, correo, documento (DNI/RUC/CE) y razón social si compras como negocio.</span></li>
                <li className={LI}><Dot /><span><B>Entrega y ubicación:</B> dirección, referencia y, con tu permiso, tu geolocalización para calcular el delivery.</span></li>
                <li className={LI}><Dot /><span><B>Transaccionales:</B> historial de pedidos, productos, montos, método de pago (Yape/efectivo/tarjeta) y número de operación.</span></li>
                <li className={LI}><Dot /><span><B>Cuenta y preferencias:</B> contraseña cifrada, programa de fidelidad, cumpleaños, etiquetas y preferencias de notificación.</span></li>
                <li className={LI}><Dot /><span><B>Navegación y dispositivo:</B> dirección IP, tipo de dispositivo, páginas vistas, productos consultados y cookies/identificadores (ver sección 9).</span></li>
                <li className={LI}><Dot /><span><B>Comunicaciones:</B> mensajes que intercambias con nosotros (incluido WhatsApp) y tus consultas o reclamos.</span></li>
              </ul>
              <p>
                <B>Carácter de los datos:</B> algunos son <B>necesarios</B> para prestarte el
                servicio (sin ellos no podemos procesar tu pedido o tu cuenta); otros son
                <B> opcionales</B> (como tu cumpleaños o tus preferencias) y los das de forma
                voluntaria.
              </p>
              <p>
                <B>Datos sensibles:</B> no requerimos ni recopilamos datos sensibles (origen
                racial, salud, religión, vida sexual, opinión política, etc.). Si llegaras a
                proporcionarlos, solo los trataríamos con tu <B>consentimiento expreso</B>.
              </p>
            </Section>

            <Section id="terceros" n={3} title="Datos de terceros que nos proporcionas" icon={Users}>
              <p>
                Si nos das datos de otra persona —por ejemplo, el nombre, teléfono o dirección
                de quien recibirá un pedido—, declaras que cuentas con su <B>autorización</B>
                para compartirlos y que le informaste de esta Política. Trataremos esos datos
                solo para completar la entrega.
              </p>
            </Section>

            <Section id="finalidades" n={4} title="Para qué usamos tus datos" icon={Sparkles}>
              <p>Tratamos tus datos para las siguientes finalidades:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><B>Prestar el servicio:</B> procesar pedidos, coordinar el delivery, gestionar pagos, fidelidad, soporte y postventa.</span></li>
                <li className={LI}><Dot /><span><B>Comunicaciones del servicio:</B> avisos sobre tu pedido, cuenta y seguridad por WhatsApp, correo o notificaciones.</span></li>
                <li className={LI}><Dot /><span><B>Marketing y promociones</B> (con tu consentimiento): ofertas, novedades y campañas, que puedes desactivar cuando quieras (ver sección 6).</span></li>
                <li className={LI}><Dot /><span><B>Personalización y recomendaciones:</B> analizar tus preferencias e historial para recomendarte productos y mejorar tu experiencia (ver sección 7).</span></li>
                <li className={LI}><Dot /><span><B>Analítica, estadística e investigación:</B> medir el uso, prevenir fraude y desarrollar nuevos productos, funciones y modelos de inteligencia artificial.</span></li>
                <li className={LI}><Dot /><span><B>Datos agregados y anonimizados:</B> generamos información estadística que <B>no te identifica</B>. Al estar disociada, deja de ser dato personal y podemos usarla y compartirla con fines comerciales y de investigación de forma indefinida.</span></li>
                <li className={LI}><Dot /><span><B>Cumplimiento legal:</B> facturación electrónica (SUNAT), contabilidad, atención de reclamos y requerimientos de autoridades.</span></li>
              </ul>
            </Section>

            <Section id="consentimiento" n={5} title="Base legal y consentimiento" icon={UserCheck}>
              <p>
                Tratamos tus datos sobre una base legítima: la <B>ejecución del servicio</B> que
                solicitas, el <B>cumplimiento de obligaciones legales</B>, nuestro <B>interés
                legítimo</B> en mejorar y asegurar la plataforma, y tu <B>consentimiento</B>
                para las finalidades que lo requieren.
              </p>
              <p>
                Otorgas tu consentimiento al crear tu cuenta, al marcar las casillas de
                preferencias o al aceptar el banner de cookies. El consentimiento es
                <B> libre, informado y revocable</B>: puedes retirarlo en cualquier momento
                desde tu cuenta o escribiéndonos, sin que ello afecte el servicio esencial ya
                contratado.
              </p>
            </Section>

            <Section id="marketing" n={6} title="Comunicaciones y marketing" icon={Megaphone}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><B>Comunicaciones operativas:</B> sobre tu cuenta, pedidos y seguridad. Son parte del servicio y se envían por medios electrónicos.</span></li>
                <li className={LI}><Dot /><span><B>Publicidad y promociones:</B> requieren tu <B>consentimiento específico</B>, distinto del consentimiento operativo. Puedes activarlo o retirarlo cuando quieras desde tu cuenta o los enlaces de baja, sin perder el servicio.</span></li>
              </ul>
            </Section>

            <Section id="perfilado" n={7} title="Personalización, perfilado y decisiones automatizadas" icon={Cpu}>
              <p>
                Analizamos tu historial y preferencias para <B>recomendarte productos</B>,
                mostrarte contenido relevante y mejorar la plataforma (perfilado). Estas
                recomendaciones <B>no producen efectos legales</B> ni te afectan
                significativamente de forma similar.
              </p>
              <p>
                No tomamos decisiones basadas <B>únicamente</B> en tratamiento automatizado que
                tengan efectos legales sobre ti. Puedes <B>oponerte</B> al perfilado con fines
                de marketing en cualquier momento.
              </p>
            </Section>

            <Section id="comparticion" n={8} title="Con quién compartimos tus datos" icon={Share2}>
              <p>No vendemos tus datos personales identificables. Los compartimos solo en estos casos:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><B>Encargados de tratamiento:</B> proveedores que nos prestan servicios bajo contrato y nuestras instrucciones — hosting (Supabase, Vercel), mensajería (WhatsApp/Twilio, correo), pasarelas de pago (Stripe, Mercado Pago), analítica y notificaciones.</span></li>
                <li className={LI}><Dot /><span><B>Tiendas y repartidores del marketplace:</B> compartimos los datos necesarios del pedido con el vendedor y el repartidor para completar tu compra.</span></li>
                <li className={LI}><Dot /><span><B>Autoridades:</B> cuando lo exija la ley, una orden judicial o para proteger derechos y seguridad.</span></li>
                <li className={LI}><Dot /><span><B>Reorganización o venta del negocio:</B> si Buleje se fusiona, es adquirida o vende todo o parte de sus activos, tus datos podrán transferirse al adquirente. El nuevo titular quedará obligado por esta política y te lo notificaremos.</span></li>
              </ul>
            </Section>

            <Section id="cookies" n={9} title="Cookies y tecnologías similares" icon={Cookie}>
              <p>Usamos cookies e identificadores para:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><B>Necesarias:</B> carrito, sesión, seguridad y preferencias (siempre activas, no requieren consentimiento).</span></li>
                <li className={LI}><Dot /><span><B>Analítica y rendimiento:</B> entender cómo se usa el sitio para mejorarlo.</span></li>
                <li className={LI}><Dot /><span><B>Personalización y publicidad/medición</B> (con tu consentimiento): recomendaciones y medir la efectividad de nuestras campañas.</span></li>
              </ul>
              <p>Puedes aceptar o rechazar las no esenciales desde el banner de cookies o la configuración de tu navegador.</p>
            </Section>

            <Section id="internacional" n={10} title="Transferencias internacionales" icon={Globe2}>
              <p>
                Algunos de nuestros proveedores (como Supabase o Vercel) procesan datos en
                servidores fuera del Perú. En esos casos exigimos <B>garantías contractuales</B>
                de protección equivalentes a las de la Ley 29733, de modo que tus datos
                mantengan el mismo nivel de protección dondequiera que se procesen.
              </p>
            </Section>

            <Section id="banco" n={11} title="Banco de datos y registro" icon={Archive}>
              <p>
                Tus datos se almacenan en el <B>banco de datos personales de Buleje</B>
                (clientes y usuarios de la plataforma), cuyo titular es el responsable indicado
                en la sección 1. Cuando corresponda, dicho banco se inscribe en el <B>Registro
                Nacional de Protección de Datos Personales (RNPDP)</B> ante la Autoridad Nacional
                de Protección de Datos Personales (APDP), conforme a la Ley N° 29733.
              </p>
            </Section>

            <Section id="conservacion" n={12} title="Cuánto conservamos tus datos" icon={Clock}>
              <p>
                Conservamos tus datos <B>mientras tu cuenta esté activa</B> y por los plazos que
                exige la ley (por ejemplo, los comprobantes y datos tributarios por el plazo
                legal aplicable). Cumplido el fin del tratamiento, los eliminamos o los
                <B> anonimizamos</B> de forma irreversible para usarlos solo con fines
                estadísticos.
              </p>
            </Section>

            <Section id="derechos" n={13} title="Tus derechos y plazos (Ley 29733)" icon={ShieldCheck}>
              <p>Como titular de datos personales en Perú puedes ejercer tus derechos ARCO y más:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><B>Acceso:</B> obtener una copia de los datos que tenemos sobre ti, su origen y uso. Lo atendemos en un máximo de <B>20 días hábiles</B>.</span></li>
                <li className={LI}><Dot /><span><B>Rectificación, cancelación y oposición:</B> corregir, eliminar u oponerte a usos específicos (como marketing). Plazo: <B>10 días hábiles</B>.</span></li>
                <li className={LI}><Dot /><span><B>Revocación del consentimiento:</B> retirarlo en cualquier momento, sin afectar el tratamiento previo.</span></li>
              </ul>
              <p>
                Ejércelos gratis desde{" "}
                <Link href="/marketplace/mi-cuenta/privacidad" className="font-bold text-[var(--accent)] hover:underline">
                  tu cuenta → Privacidad
                </Link>{" "}
                (incluye la descarga de tus datos), por correo a{" "}
                <a href={`mailto:${PRIVACY_EMAIL}`} className="font-bold text-[var(--accent)] hover:underline">
                  {PRIVACY_EMAIL}
                </a>{" "}
                o por WhatsApp al{" "}
                <a href={`tel:${LEGAL.telefono.replace(/\s/g, "")}`} className="font-bold text-[var(--accent)] hover:underline">
                  {LEGAL.telefono}
                </a>
                . Si no estás conforme con nuestra respuesta, puedes presentar un reclamo ante la
                <B> Autoridad Nacional de Protección de Datos Personales (APDP)</B>.
              </p>
            </Section>

            <Section id="seguridad" n={14} title="Seguridad" icon={Lock}>
              <p>
                Aplicamos medidas técnicas y organizativas razonables: cifrado en tránsito,
                contraseñas protegidas, control de accesos, registro de auditoría y monitoreo.
                Ningún sistema es 100% infalible, pero trabajamos para proteger tu información y,
                ante un incidente que te afecte, actuaremos conforme a la ley.
              </p>
            </Section>

            <Section id="menores" n={15} title="Menores de edad" icon={Baby}>
              <p>
                Nuestros servicios están dirigidos a mayores de 18 años. No recopilamos datos de
                menores a sabiendas; si detectamos uno sin autorización del padre, madre o tutor,
                lo eliminamos.
              </p>
            </Section>

            <Section id="cambios" n={16} title="Cambios a esta política y contacto" icon={Mail}>
              <p>
                Podemos actualizar esta política; te avisaremos de cambios importantes en el
                sitio o por los canales habituales. El uso continuado del servicio implica la
                aceptación de la versión vigente.
              </p>
              <p>
                Canal de privacidad:{" "}
                <a href={`mailto:${PRIVACY_EMAIL}`} className="font-bold text-[var(--accent)] hover:underline">
                  {PRIVACY_EMAIL}
                </a>{" "}
                · WhatsApp{" "}
                <a href={`tel:${LEGAL.telefono.replace(/\s/g, "")}`} className="font-bold text-[var(--accent)] hover:underline">
                  {LEGAL.telefono}
                </a>
                . Revisa también nuestros{" "}
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
