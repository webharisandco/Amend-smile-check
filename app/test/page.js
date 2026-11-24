import SmileTest from "@/components/SmileTest";
import { siteConfig } from "@/lib/config";

export const metadata = {
  title: `AI Smile Check · ${siteConfig.clinicName}`,
};

export default function TestPage() {
  return <SmileTest />;
}
