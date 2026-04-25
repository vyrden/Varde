/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Domaines autorisés pour `next/image`. La CDN d'icônes Discord
    // sert les avatars de guild affichés dans le rail.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/icons/**',
      },
    ],
  },
};

export default nextConfig;
