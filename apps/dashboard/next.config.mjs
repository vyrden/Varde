import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */

/**
 * Headers de sécurité globaux (jalon 5). Posés sur toutes les routes
 * (pages + API). Choix par défaut : strict mais sans casser le dev
 * (Turbopack a besoin de `'unsafe-eval'` pour le runtime, HMR via
 * websocket sur le même origin). En prod, le HSTS s'active dès que
 * Next reçoit le trafic en HTTPS via reverse-proxy.
 *
 * CSP : `'unsafe-inline'` reste autorisé sur `script-src` et
 * `style-src` parce que (a) Next.js injecte du JSON d'hydratation
 * inline avant que React monte, (b) Tailwind 4 émet des styles
 * runtime. Migrer vers une CSP nonce-based ferait une PR à part
 * (ROI faible tant que le rendu reste server-driven et la surface
 * d'injection minuscule).
 *
 * `connect-src 'self'` : les appels à l'API Fastify passent tous par
 * des Server Actions (`'use server'`), donc le browser ne tape jamais
 * directement `localhost:4000` — il appelle le dashboard, qui fetch
 * l'API côté serveur. Pas besoin d'élargir.
 *
 * `form-action` : Auth.js déclenche les redirections OAuth Discord
 * via `<form action="https://discord.com/oauth2/authorize">`, il faut
 * donc autoriser explicitement ce host.
 */
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://cdn.discordapp.com`,
  `font-src 'self' data:`,
  `connect-src 'self'${isDev ? ' ws://localhost:* http://localhost:*' : ''}`,
  `frame-ancestors 'none'`,
  `form-action 'self' https://discord.com`,
  `base-uri 'self'`,
  `object-src 'none'`,
].join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: csp,
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'off',
  },
];

const nextConfig = {
  // Output autonome pour les images Docker : Next isole le runtime
  // dans `.next/standalone/` (server.js + node_modules réduit aux
  // dépendances réellement utilisées). Voir docker/Dockerfile.dashboard.
  output: 'standalone',
  // Racine de tracing pour le monorepo pnpm. Sans ça, Next prendrait
  // par défaut `apps/dashboard/` et ne traceait pas les paquets
  // workspace (`@varde/ui`, `@varde/contracts`, etc.) — le bundle
  // standalone serait cassé en runtime.
  outputFileTracingRoot: path.join(__dirname, '../..'),
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
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
