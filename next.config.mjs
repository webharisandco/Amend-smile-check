/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Lets a check build run into a separate folder without disturbing a running `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Old static-site URLs (share links, QR codes, WhatsApp messages already sent)
  // keep working after the move to Next.js.
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/test.html", destination: "/test", permanent: true },
      {
        source: "/report.html",
        has: [{ type: "query", key: "id", value: "(?<id>.+)" }],
        destination: "/report/:id",
        permanent: true,
      },
      { source: "/admin-login.html", destination: "/admin/login", permanent: true },
      { source: "/admin-dashboard.html", destination: "/admin", permanent: true },
    ];
  },

  // Patient reports and the admin area must never show up in search engines,
  // and shouldn't leak their URL to other sites via the Referer header.
  async headers() {
    const privateHeaders = [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    return [
      { source: "/admin/:path*", headers: privateHeaders },
      { source: "/report/:path*", headers: privateHeaders },
    ];
  },
};

export default nextConfig;
