import "server-only";
import nodemailer from "nodemailer";

interface WelcomeEmailData {
  storeName: string;
  slug: string;
  ownerEmail: string;
  adminName: string;
  adminUsername: string;
  plan: string;
  trialEndsAt: Date;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) return; // silently skip if not configured

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const storeUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://bodegasanmartin.com"}/${data.slug}`;
  const adminUrl = `${storeUrl}/admin`;
  const planLabel = PLAN_LABELS[data.plan] ?? data.plan;
  const trialEnd = data.trialEndsAt.toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  await transporter.sendMail({
    from: `"Bodega San Martín" <${smtpUser}>`,
    to: data.ownerEmail,
    subject: `🎉 ¡Bienvenido a Bodega San Martín, ${data.adminName}!`,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">🎉 ¡Tu tienda está lista!</h1>
          <p style="color:#c7d2fe;margin:8px 0 0;font-size:14px;">Bienvenido al ecosistema Bodega San Martín</p>
        </div>

        <!-- Body -->
        <div style="padding:24px;">
          <p style="font-size:15px;color:#333;margin:0 0 16px;">
            Hola <strong>${data.adminName}</strong>, tu tienda <strong>${data.storeName}</strong> ha sido creada exitosamente.
          </p>

          <!-- Store Info Card -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
            <h3 style="margin:0 0 12px;font-size:14px;color:#6366f1;text-transform:uppercase;letter-spacing:0.5px;">Datos de tu tienda</h3>
            <table style="width:100%;font-size:13px;color:#444;">
              <tr><td style="padding:4px 0;font-weight:600;">Tienda:</td><td>${data.storeName}</td></tr>
              <tr><td style="padding:4px 0;font-weight:600;">URL:</td><td><a href="${storeUrl}" style="color:#6366f1;">${storeUrl}</a></td></tr>
              <tr><td style="padding:4px 0;font-weight:600;">Plan:</td><td><span style="background:#6366f1;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;">${planLabel}</span></td></tr>
              <tr><td style="padding:4px 0;font-weight:600;">Trial hasta:</td><td>${trialEnd}</td></tr>
            </table>
          </div>

          <!-- Admin Access Card -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px;">
            <h3 style="margin:0 0 12px;font-size:14px;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px;">Acceso al panel de administración</h3>
            <table style="width:100%;font-size:13px;color:#444;">
              <tr><td style="padding:4px 0;font-weight:600;">Panel admin:</td><td><a href="${adminUrl}" style="color:#16a34a;">${adminUrl}</a></td></tr>
              <tr><td style="padding:4px 0;font-weight:600;">Usuario:</td><td><code style="background:#e5e7eb;padding:2px 6px;border-radius:3px;">${data.adminUsername}</code></td></tr>
              <tr><td style="padding:4px 0;font-weight:600;">Contraseña:</td><td><em style="color:#888;">La que elegiste al registrarte</em></td></tr>
            </table>
          </div>

          <!-- Getting Started -->
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;">
            <h3 style="margin:0 0 12px;font-size:14px;color:#2563eb;text-transform:uppercase;letter-spacing:0.5px;">Primeros pasos</h3>
            <ol style="margin:0;padding-left:20px;font-size:13px;color:#444;line-height:1.8;">
              <li>Ingresa a tu <a href="${adminUrl}" style="color:#2563eb;">panel de administración</a></li>
              <li>Agrega tus productos con fotos y precios</li>
              <li>Configura tus métodos de pago (efectivo, Yape)</li>
              <li>Comparte tu tienda con tus clientes</li>
            </ol>
          </div>

          <!-- CTA -->
          <div style="text-align:center;margin:24px 0 8px;">
            <a href="${adminUrl}" style="background:#6366f1;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
              Ir a mi panel de admin →
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background:#f8fafc;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;color:#999;">
            ¿Necesitas ayuda? Responde a este correo y te asistimos.
          </p>
          <p style="margin:4px 0 0;font-size:11px;color:#bbb;">
            Bodega San Martín — Plataforma SaaS para bodegas y tiendas
          </p>
        </div>
      </div>
    `,
  });
}
