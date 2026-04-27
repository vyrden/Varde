/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Domaines autorisés pour `next/image`. La CDN Discord sert :
    // - `/icons/**` : icônes de guilds (rail)
    // - `/avatars/**` : avatars utilisateurs (UserPanel, audit)
    // - `/avatar-decoration-presets/**` : décorations animées
    //   d'avatar (PNG transparent, overlay Nitro/profil)
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/icons/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/avatars/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/avatar-decoration-presets/**',
      },
    ],
  },
};

export default nextConfig;
