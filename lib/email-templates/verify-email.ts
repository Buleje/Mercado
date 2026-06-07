import "server-only";
import nodemailer from "nodemailer";

/**
 * Envía el email de verificación de cuenta al owner del tenant.
 * Retorna void y nunca lanza — los errores se suprimen en el caller (fire-and-forget).
 */
export async function sendVerificationEmail(
  ownerEmail: string,
  storeName: string,
  verifyUrl: string,
): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) return; // No configurado — saltar silenciosamente

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: `"Buleje" <${smtpUser}>`,
    to: ownerEmail,
    subject: `Verifica tu email para activar ${storeName}`,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#00A0A0,#8b5cf6);padding:32px 24px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Verifica tu email</h1>
          <p style="color:#c7d2fe;margin:8px 0 0;font-size:14px;">Un paso más para activar tu tienda en Buleje</p>
        </div>

        <!-- Body -->
        <div style="padding:32px 24px;">
          <p style="font-size:15px;color:#333;margin:0 0 16px;line-height:1.6;">
            Hola, para activar tu tienda <strong>${storeName}</strong> necesitamos confirmar que este email te pertenece.
          </p>

          <p style="font-size:14px;color:#555;margin:0 0 28px;line-height:1.6;">
            Haz clic en el botón de abajo para verificar tu cuenta. El enlace es válido por <strong>24 horas</strong>.
          </p>

          <!-- CTA Button -->
          <div style="text-align:center;margin:0 0 32px;">
            <a
              href="${verifyUrl}"
              style="background:#00A0A0;color:#fff;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;letter-spacing:0.3px;"
            >
              Verificar mi email
            </a>
          </div>

          <!-- Fallback URL -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 6px;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
              Si el botón no funciona, copia este enlace en tu navegador:
            </p>
            <p style="margin:0;font-size:12px;color:#00A0A0;word-break:break-all;">
              <a href="${verifyUrl}" style="color:#00A0A0;">${verifyUrl}</a>
            </p>
          </div>

          <p style="font-size:13px;color:#888;margin:0;line-height:1.5;">
            Si no creaste esta cuenta, ignora este correo. No pasará nada.
          </p>
        </div>

        <!-- Footer -->
        <div style="background:#f8fafc;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;color:#999;">
            ¿Necesitas ayuda? Responde a este correo y te asistimos.
          </p>
          <p style="margin:4px 0 0;font-size:11px;color:#bbb;">
            Buleje &mdash; Plataforma SaaS para bodegas y tiendas &mdash; Pucallpa, Perú
          </p>
        </div>
      </div>
    `,
  });
}
