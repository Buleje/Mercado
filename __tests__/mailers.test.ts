import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// We must mock nodemailer before importing the modules under test
const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

import { sendWelcomeEmail } from "@/lib/mailer-onboarding";
import { sendSuperAdminAlert } from "@/lib/mailer-superadmin";

describe("mailer-onboarding: sendWelcomeEmail", () => {
  const sampleData = {
    storeName: "Mi Bodega",
    slug: "mi-bodega",
    ownerEmail: "owner@test.com",
    adminName: "Juan",
    adminUsername: "juanadmin",
    plan: "pro",
    trialEndsAt: new Date("2026-04-01"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  it("silently skips when SMTP_USER is not set", async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    await sendWelcomeEmail(sampleData);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("silently skips when SMTP_PASS is not set", async () => {
    process.env.SMTP_USER = "test@gmail.com";
    delete process.env.SMTP_PASS;
    await sendWelcomeEmail(sampleData);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("sends email when SMTP is configured", async () => {
    process.env.SMTP_USER = "test@gmail.com";
    process.env.SMTP_PASS = "app-password";
    process.env.NEXT_PUBLIC_BASE_URL = "https://example.com";

    await sendWelcomeEmail(sampleData);

    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("owner@test.com");
    expect(call.subject).toContain("Juan");
    expect(call.subject).toContain("Bienvenido");
    expect(call.html).toContain("Mi Bodega");
    expect(call.html).toContain("mi-bodega");
    expect(call.html).toContain("juanadmin");
    expect(call.html).toContain("Pro");
    expect(call.html).toContain("https://example.com/mi-bodega");
    expect(call.html).toContain("https://example.com/mi-bodega/admin");
  });

  it("uses default base URL when NEXT_PUBLIC_BASE_URL not set", async () => {
    process.env.SMTP_USER = "test@gmail.com";
    process.env.SMTP_PASS = "app-password";
    delete process.env.NEXT_PUBLIC_BASE_URL;

    await sendWelcomeEmail(sampleData);

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain("buleje.com/mi-bodega");
  });

  it("includes plan label for enterprise plan", async () => {
    process.env.SMTP_USER = "test@gmail.com";
    process.env.SMTP_PASS = "app-password";

    await sendWelcomeEmail({ ...sampleData, plan: "enterprise" });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain("Enterprise");
  });

  it("includes trial end date in email body", async () => {
    process.env.SMTP_USER = "test@gmail.com";
    process.env.SMTP_PASS = "app-password";

    await sendWelcomeEmail(sampleData);

    const call = mockSendMail.mock.calls[0][0];
    // Should contain the trial date formatted
    expect(call.html).toContain("2026");
  });
});

describe("mailer-superadmin: sendSuperAdminAlert", () => {
  const sampleAlert = {
    subject: "Test Alert",
    title: "🆕 Test Title",
    items: [
      { label: "Store", value: "Test Store", color: "#0d9488" },
      { label: "Plan", value: "PRO" },
    ],
    actionUrl: "https://example.com/superadmin",
    actionLabel: "Ver detalles",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SUPERADMIN_NOTIFY_EMAIL;
  });

  it("silently skips when SMTP is not configured", async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    await sendSuperAdminAlert(sampleAlert);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("sends alert email to SMTP_USER by default", async () => {
    process.env.SMTP_USER = "admin@gmail.com";
    process.env.SMTP_PASS = "app-password";

    await sendSuperAdminAlert(sampleAlert);

    expect(mockSendMail).toHaveBeenCalledOnce();
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("admin@gmail.com");
    expect(call.subject).toBe("Test Alert");
    expect(call.html).toContain("Test Title");
    expect(call.html).toContain("Test Store");
    expect(call.html).toContain("PRO");
  });

  it("sends to SUPERADMIN_NOTIFY_EMAIL when set", async () => {
    process.env.SMTP_USER = "admin@gmail.com";
    process.env.SMTP_PASS = "app-password";
    process.env.SUPERADMIN_NOTIFY_EMAIL = "boss@corp.com";

    await sendSuperAdminAlert(sampleAlert);

    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe("boss@corp.com");
  });

  it("includes action button when actionUrl provided", async () => {
    process.env.SMTP_USER = "admin@gmail.com";
    process.env.SMTP_PASS = "app-password";

    await sendSuperAdminAlert(sampleAlert);

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain("https://example.com/superadmin");
    expect(call.html).toContain("Ver detalles");
  });

  it("omits action button when no actionUrl", async () => {
    process.env.SMTP_USER = "admin@gmail.com";
    process.env.SMTP_PASS = "app-password";

    await sendSuperAdminAlert({
      subject: "No Action",
      title: "Simple Alert",
      items: [{ label: "Info", value: "test" }],
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).not.toContain("Ver en SuperAdmin →");
  });

  it("applies custom colors to items", async () => {
    process.env.SMTP_USER = "admin@gmail.com";
    process.env.SMTP_PASS = "app-password";

    await sendSuperAdminAlert(sampleAlert);

    const call = mockSendMail.mock.calls[0][0];
    expect(call.html).toContain("#0d9488"); // custom color for first item
  });
});
