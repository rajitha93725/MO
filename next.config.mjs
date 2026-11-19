/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  // The app opens on the Order page; the Home dashboard is at /home.
  async redirects() {
    return [{ source: "/", destination: "/order", permanent: false }];
  },
};
export default nextConfig;
