import { NextRequest, NextResponse } from "next/server";
import { isFactorsEnabled } from "@/lib/appConfig";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if ((!isFactorsEnabled() && pathname.startsWith("/factors")) || pathname.startsWith("/whales")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/markets";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/factors/:path*", "/whales/:path*"],
};
