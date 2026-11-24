import "./globals.css";
import { siteConfig } from "@/lib/config";

export const metadata = {
  title: `Free AI Smile Check · ${siteConfig.clinicName}`,
  description: "Snap 3 photos, answer a few quick questions, and get a personal AI oral health report.",
  icons: { icon: "/img/amend-mark.png" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
