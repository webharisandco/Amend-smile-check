import AdminShell from "@/components/AdminShell";
import { siteConfig } from "@/lib/config";

export const metadata = {
  title: `Admin · ${siteConfig.clinicName} AI Smile Check`,
  robots: { index: false, follow: false },
};

// Access is enforced by middleware.js (and again inside every admin API route).
export default function AdminPanelLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
