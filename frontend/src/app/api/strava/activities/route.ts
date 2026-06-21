import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/strava/activities?token=<access_token>&page=1
 * Fetches the authenticated athlete's activities from the Strava API.
 * The token is passed as a query param so it never needs to be in server config.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const page = request.nextUrl.searchParams.get("page") ?? "1";
  const perPage = "30";

  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }

  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 }, // always fresh
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch activities from Strava" },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
