/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "script-src 'self' 'unsafe-inline' https://s3.tradingview.com https://*.tradingview.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://*.tradingview.com https://app.hyperliquid.xyz",
          "font-src 'self' data:",
          "connect-src 'self' https://api.hyperliquid.xyz wss://api.hyperliquid.xyz https://*.tradingview.com wss://*.tradingview.com https://auth.privy.io wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com",
          "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
          "frame-src https://*.tradingview.com https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
          "worker-src 'self'",
          "manifest-src 'self'",
          "upgrade-insecure-requests",
        ].join("; "),
      },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
