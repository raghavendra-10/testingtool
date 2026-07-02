/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@speclyn/shared-types'],
}

export default nextConfig
