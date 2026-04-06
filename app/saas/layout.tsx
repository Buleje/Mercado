import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.buleje.pe"),
};

export default function SaasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 antialiased">
      {children}
    </div>
  );
}
