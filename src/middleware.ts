import { NextRequest, NextResponse } from "next/server";
import { isFactorsEnabled, isWhalesEnabled } from "@/lib/appConfig";

function buildCsp() {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://s3.tradingview.com https://*.tradingview.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tradingview.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.hyperliquid.xyz wss://api.hyperliquid.xyz https://*.tradingview.com wss://*.tradingview.com",
    "frame-src https://*.tradingview.com",
    "manifest-src 'self'",
  ];

  if (process.env.NODE_ENV === "production") {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("Content-Security-Policy", buildCsp());
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)",
  );

  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    (!isFactorsEnabled() && pathname.startsWith("/factors")) ||
    (!isWhalesEnabled() && pathname.startsWith("/whales"))
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/markets";
    redirectUrl.search = "";
    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 307));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
