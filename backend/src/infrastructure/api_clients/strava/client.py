"""Strava API client implementation."""

from datetime import datetime
from typing import Any, Optional

import httpx
import structlog

from ....domain.interfaces import IFitnessPlatformClient

logger = structlog.get_logger()


class StravaAPIClient(IFitnessPlatformClient):
    """
    Concrete implementation of Strava API client.

    Implements OAuth 2.0 authentication and activity fetching from Strava.
    API Documentation: https://developers.strava.com/docs/reference/
    """

    BASE_URL = "https://www.strava.com/api/v3"
    AUTH_URL = "https://www.strava.com/oauth/authorize"
    TOKEN_URL = "https://www.strava.com/oauth/token"

    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        """
        Initialize Strava client.

        Args:
            client_id: Strava application client ID
            client_secret: Strava application client secret
            redirect_uri: OAuth callback URL
        """
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self._http_client = httpx.AsyncClient(timeout=30.0)

    def get_authorization_url(self, state: str, scope: str = "read,activity:read_all") -> str:
        """
        Generate Strava OAuth authorization URL.

        Args:
            state: CSRF protection state parameter
            scope: Requested permissions (comma-separated)

        Returns:
            Full authorization URL for user redirect
        """
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": scope,
            "state": state,
        }

        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.AUTH_URL}?{query_string}"

    async def exchange_token(self, code: str) -> dict[str, Any]:
        """
        Exchange authorization code for access token.

        Args:
            code: Authorization code from callback

        Returns:
            Token response with access_token, refresh_token, expires_at

        Raises:
            httpx.HTTPError: If token exchange fails
        """
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "grant_type": "authorization_code",
        }

        try:
            response = await self._http_client.post(self.TOKEN_URL, json=payload)
            response.raise_for_status()

            data = response.json()
            logger.info("strava_token_exchanged", athlete_id=data.get("athlete", {}).get("id"))

            return data
        except httpx.HTTPError as e:
            logger.error("strava_token_exchange_failed", error=str(e))
            raise

    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        """
        Refresh an expired access token.

        Args:
            refresh_token: Refresh token from previous authentication

        Returns:
            New token response
        """
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

        try:
            response = await self._http_client.post(self.TOKEN_URL, json=payload)
            response.raise_for_status()

            data = response.json()
            logger.info("strava_token_refreshed")

            return data
        except httpx.HTTPError as e:
            logger.error("strava_token_refresh_failed", error=str(e))
            raise

    async def get_athlete_profile(self, access_token: str) -> dict[str, Any]:
        """
        Get authenticated athlete's profile.

        Args:
            access_token: Valid Strava access token

        Returns:
            Athlete profile data
        """
        headers = {"Authorization": f"Bearer {access_token}"}

        try:
            response = await self._http_client.get(f"{self.BASE_URL}/athlete", headers=headers)
            response.raise_for_status()

            return response.json()
        except httpx.HTTPError as e:
            logger.error("strava_profile_fetch_failed", error=str(e))
            raise

    async def get_athlete_stats(
        self, access_token: str, athlete_id: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Get athlete statistics (totals and recent activity).

        Args:
            access_token: Valid Strava access token
            athlete_id: Athlete ID (uses authenticated athlete if None)

        Returns:
            Statistics including recent run/ride totals
        """
        # If no athlete_id provided, get current athlete's ID
        if not athlete_id:
            profile = await self.get_athlete_profile(access_token)
            athlete_id = profile["id"]

        headers = {"Authorization": f"Bearer {access_token}"}

        try:
            response = await self._http_client.get(
                f"{self.BASE_URL}/athletes/{athlete_id}/stats", headers=headers
            )
            response.raise_for_status()

            return response.json()
        except httpx.HTTPError as e:
            logger.error("strava_stats_fetch_failed", error=str(e))
            raise

    async def get_activities(
        self,
        access_token: str,
        after: Optional[datetime] = None,
        before: Optional[datetime] = None,
        page: int = 1,
        per_page: int = 30,
    ) -> list[dict[str, Any]]:
        """
        Fetch athlete's activities.

        Args:
            access_token: Valid Strava access token
            after: Only activities after this date
            before: Only activities before this date
            page: Page number for pagination
            per_page: Results per page (max 200)

        Returns:
            List of activity summaries
        """
        headers = {"Authorization": f"Bearer {access_token}"}
        params: dict[str, Any] = {
            "page": page,
            "per_page": min(per_page, 200),  # Strava max is 200
        }

        if after:
            params["after"] = int(after.timestamp())
        if before:
            params["before"] = int(before.timestamp())

        try:
            response = await self._http_client.get(
                f"{self.BASE_URL}/athlete/activities", headers=headers, params=params
            )
            response.raise_for_status()

            activities = response.json()
            logger.info("strava_activities_fetched", count=len(activities), page=page)

            return activities
        except httpx.HTTPError as e:
            logger.error("strava_activities_fetch_failed", error=str(e))
            raise

    async def get_activity_detail(self, access_token: str, activity_id: str) -> dict[str, Any]:
        """
        Get detailed information about a specific activity.

        Args:
            access_token: Valid Strava access token
            activity_id: Strava activity ID

        Returns:
            Detailed activity data including streams
        """
        headers = {"Authorization": f"Bearer {access_token}"}

        try:
            response = await self._http_client.get(
                f"{self.BASE_URL}/activities/{activity_id}", headers=headers
            )
            response.raise_for_status()

            return response.json()
        except httpx.HTTPError as e:
            logger.error(
                "strava_activity_detail_fetch_failed", activity_id=activity_id, error=str(e)
            )
            raise

    async def close(self) -> None:
        """Close HTTP client connection."""
        await self._http_client.aclose()

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
