"""Google Maps API client implementation."""

from typing import Any, Optional

import httpx
import structlog
from src.domain.interfaces import IMapClient, IRoutingClient
from src.domain.value_objects import Coordinates

logger = structlog.get_logger(__name__)


class GoogleMapsClient(IMapClient, IRoutingClient):
    """Google Maps API client for geocoding, routing, and elevation."""

    GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"
    DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"
    ELEVATION_URL = "https://maps.googleapis.com/maps/api/elevation/json"
    PLACES_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

    def __init__(self, api_key: str):
        """Initialize Google Maps client.

        Args:
            api_key: Google Maps API key
        """
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=30.0)
        logger.info("google_maps_client_initialized")

    async def geocode(self, address: str) -> Optional[Coordinates]:
        """Convert address to coordinates.

        Args:
            address: Address string to geocode

        Returns:
            Coordinates or None if not found
        """
        try:
            response = await self.client.get(
                self.GEOCODING_URL,
                params={"address": address, "key": self.api_key},
            )
            response.raise_for_status()
            data = response.json()

            if data["status"] == "OK" and data["results"]:
                location = data["results"][0]["geometry"]["location"]
                coords = Coordinates(
                    latitude=location["lat"],
                    longitude=location["lng"],
                )
                logger.info("geocode_success", address=address, coordinates=coords)
                return coords

            logger.warning("geocode_no_results", address=address, status=data["status"])
            return None

        except Exception as e:
            logger.error("geocode_error", error=str(e), address=address)
            return None

    async def reverse_geocode(self, coordinates: Coordinates) -> Optional[str]:
        """Convert coordinates to address.

        Args:
            coordinates: Coordinates to reverse geocode

        Returns:
            Formatted address string or None
        """
        try:
            response = await self.client.get(
                self.GEOCODING_URL,
                params={
                    "latlng": f"{coordinates.latitude},{coordinates.longitude}",
                    "key": self.api_key,
                },
            )
            response.raise_for_status()
            data = response.json()

            if data["status"] == "OK" and data["results"]:
                address = data["results"][0]["formatted_address"]
                logger.info("reverse_geocode_success", coordinates=coordinates, address=address)
                return address

            logger.warning("reverse_geocode_no_results", coordinates=coordinates)
            return None

        except Exception as e:
            logger.error("reverse_geocode_error", error=str(e), coordinates=coordinates)
            return None

    async def get_poi_nearby(
        self, coordinates: Coordinates, radius_meters: float, poi_type: Optional[str] = None
    ) -> list[dict[str, Any]]:
        """Get points of interest near coordinates.

        Args:
            coordinates: Center point
            radius_meters: Search radius in meters (max 50000)
            poi_type: Type of POI (e.g., 'restaurant', 'hospital', 'gas_station')

        Returns:
            List of POI data
        """
        try:
            params = {
                "location": f"{coordinates.latitude},{coordinates.longitude}",
                "radius": min(radius_meters, 50000),  # Max radius 50km
                "key": self.api_key,
            }
            if poi_type:
                params["type"] = poi_type

            response = await self.client.get(self.PLACES_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if data["status"] == "OK":
                logger.info(
                    "poi_search_success",
                    coordinates=coordinates,
                    count=len(data.get("results", [])),
                )
                return data.get("results", [])

            logger.warning("poi_search_no_results", status=data["status"])
            return []

        except Exception as e:
            logger.error("poi_search_error", error=str(e))
            return []

    async def search_routes(
        self, coordinates: Coordinates, radius_km: float, activity_type: str
    ) -> list[dict[str, Any]]:
        """Search for routes near a location.

        Note: Google Maps doesn't provide hiking/biking route discovery.
        This method is implemented for interface compatibility but returns empty.
        Use dedicated trail APIs (OSM, Hiking Project) for route discovery.

        Args:
            coordinates: Center point
            radius_km: Search radius
            activity_type: Activity type

        Returns:
            Empty list (use specialized trail APIs instead)
        """
        logger.info(
            "route_search_not_supported",
            message="Use OSM/Hiking Project for trail discovery",
        )
        return []

    async def get_route_details(self, route_id: str) -> dict[str, Any]:
        """Get route details - not supported by Google Maps."""
        return {}

    async def calculate_route(
        self, start: Coordinates, end: Coordinates, activity_type: str
    ) -> dict[str, Any]:
        """Calculate a route between two points using Google Directions API.

        Args:
            start: Starting coordinates
            end: Ending coordinates
            activity_type: Activity type (walk, bike, drive)

        Returns:
            Route data including polyline, distance, duration
        """
        try:
            # Map activity type to Google Maps travel mode
            mode_mapping = {
                "walk": "walking",
                "hike": "walking",
                "bike": "bicycling",
                "ride": "bicycling",
                "drive": "driving",
            }
            mode = mode_mapping.get(activity_type.lower(), "walking")

            response = await self.client.get(
                self.DIRECTIONS_URL,
                params={
                    "origin": f"{start.latitude},{start.longitude}",
                    "destination": f"{end.latitude},{end.longitude}",
                    "mode": mode,
                    "key": self.api_key,
                },
            )
            response.raise_for_status()
            data = response.json()

            if data["status"] == "OK" and data["routes"]:
                route = data["routes"][0]
                leg = route["legs"][0]

                result = {
                    "distance_meters": leg["distance"]["value"],
                    "duration_seconds": leg["duration"]["value"],
                    "polyline": route["overview_polyline"]["points"],
                    "start_address": leg["start_address"],
                    "end_address": leg["end_address"],
                    "steps": leg["steps"],
                }

                logger.info("route_calculated", distance_km=result["distance_meters"] / 1000)
                return result

            logger.warning("route_calculation_failed", status=data["status"])
            return {}

        except Exception as e:
            logger.error("route_calculation_error", error=str(e))
            return {}

    async def get_elevation_profile(self, coordinates: list[Coordinates]) -> list[float]:
        """Get elevation data for a series of coordinates.

        Args:
            coordinates: List of coordinates (max 512 points)

        Returns:
            List of elevation values in meters
        """
        try:
            # Google Maps Elevation API limits to 512 locations per request
            if len(coordinates) > 512:
                logger.warning(
                    "elevation_request_truncated",
                    requested=len(coordinates),
                    limit=512,
                )
                coordinates = coordinates[:512]

            # Format coordinates for API request
            locations = "|".join([f"{c.latitude},{c.longitude}" for c in coordinates])

            response = await self.client.get(
                self.ELEVATION_URL,
                params={"locations": locations, "key": self.api_key},
            )
            response.raise_for_status()
            data = response.json()

            if data["status"] == "OK":
                elevations = [result["elevation"] for result in data["results"]]
                logger.info("elevation_profile_retrieved", point_count=len(elevations))
                return elevations

            logger.warning("elevation_request_failed", status=data["status"])
            return []

        except Exception as e:
            logger.error("elevation_profile_error", error=str(e))
            return []

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
