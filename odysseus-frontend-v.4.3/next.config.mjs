/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "odysseus-api.onrender.com/:path*",
      },
    ]
  },
}

export default nextConfig