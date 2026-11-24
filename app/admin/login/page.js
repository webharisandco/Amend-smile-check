import AdminLoginForm from "@/components/AdminLoginForm";
import { siteConfig } from "@/lib/config";

export const metadata = {
  title: `Admin login · ${siteConfig.clinicName}`,
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return <AdminLoginForm />;
}
