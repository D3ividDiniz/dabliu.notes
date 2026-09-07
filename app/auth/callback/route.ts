import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next")?.startsWith("/") ? requestUrl.searchParams.get("next")! : "/";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin = process.env.NODE_ENV === "development" || !forwardedHost ? requestUrl.origin : `https://${forwardedHost}`;
  const response = NextResponse.redirect(`${origin}${next}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !code) return NextResponse.redirect(`${origin}/?auth_error=missing_code`);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
  return response;
}
