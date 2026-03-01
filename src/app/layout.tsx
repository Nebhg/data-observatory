import type { Metadata } from "next";
import "./globals.css";
import { ClientLayout } from "./client-layout";

export const metadata: Metadata = {
  title: "Data Pipeline Observatory",
  description: "Monitor and control the macro data pipeline",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
