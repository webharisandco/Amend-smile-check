// Public branding + links, shown on the patient-facing pages.
// Override any of these with NEXT_PUBLIC_* variables (see .env.example).
// NOTE: NEXT_PUBLIC_* values are baked in at build time — rebuild after changing them.
export const siteConfig = {
  clinicName: process.env.NEXT_PUBLIC_CLINIC_NAME || "Amend Dental Centre",
  websiteUrl: process.env.NEXT_PUBLIC_WEBSITE_URL || "https://amenddental.in/",
  bookingUrl: process.env.NEXT_PUBLIC_BOOKING_URL || "https://ig.me/m/amenddental?ref=w60450777",
  branches: process.env.NEXT_PUBLIC_BRANCHES || "Calicut · Kannur · Thalassery · Nadapuram · Kottakkal",
};

/** "https://amenddental.in/" → "amenddental.in" */
export function displayDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
