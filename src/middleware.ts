import { NextRequest, NextResponse } from "next/server";
import { isFactorsEnabled, isVaultsEnabled } from "@/lib/appConfig";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    (!isFactorsEnabled() && pathname.startsWith("/factors")) ||
    (!isVaultsEnabled() && pathname.startsWith("/vaults")) ||
    pathname.startsWith("/whales")
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/markets";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/factors/:path*", "/vaults/:path*", "/whales/:path*"],
};
