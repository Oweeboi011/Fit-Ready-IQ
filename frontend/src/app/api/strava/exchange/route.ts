import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/strava/exchange
 * Exchanges a Strava OAuth authorization code for an access token.
 * Keeps STRAVA_CLIENT_SECRET server-side only.
 */
export async function POST(request: NextRequest) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Strava credentials are not configured on the server" },
      { status: 500 }
    );
  }

  let code: string;
  try {
    const body = await request.json();
    code = body.code;
    if (!code || typeof code !== "string") throw new Error();
  } catch {
    return NextResponse.json(
      { error: "Missing or invalid authorization code" },
      { status: 400 }
    );
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Strava token exchange failed", detail },
      { status: 400 }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
