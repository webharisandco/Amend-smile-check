import { notFound } from "next/navigation";
import ReportView from "@/components/ReportView";
import { findLead, serializeLead } from "@/lib/data";
import { siteConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Your Smile Report · ${siteConfig.clinicName}`,
  robots: { index: false, follow: false },
};

export default async function ReportPage({ params }) {
  const { id } = await params;
  const doc = await findLead(id);
  if (!doc) notFound();
  // forPatient: strips phone/email, staff notes, lead score and the internal consultation angle.
  return <ReportView lead={serializeLead(doc, { forPatient: true })} />;
}
