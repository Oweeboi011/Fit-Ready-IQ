"""Domain interfaces: Abstract contracts for external dependencies."""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any
from uuid import UUID

from ..entities import Activity, Route, User
from ..value_objects import Coordinates


class IRepository(ABC):
    """Base repository interface."""

    @abstractmethod
    async def get_by_id(self, id: UUID) -> Any | None:
        """Retrieve entity by ID."""
        pass

    @abstractmethod
    async def save(self, entity: Any) -> Any:
        """Save entity to storage."""
        pass

    @abstractmethod
    async def delete(self, id: UUID) -> bool:
        """Delete entity by ID."""
        pass


class IUserRepository(IRepository):
    """Repository interface for User entities."""

    @abstractmethod
    async def get_by_email(self, email: str) -> User | None:
        """Find user by email address."""
        pass

    @abstractmethod
    async def get_by_strava_id(self, strava_id: str) -> User | None:
        """Find user by Strava account ID."""
        pass

    @abstractmethod
    async def update(self, user: User) -> User:
        """Update existing user."""
        pass


class IActivityRepository(IRepository):
    """Repository interface for Activity entities."""

    @abstractmethod
    async def get_by_user(
        self, user_id: UUID, limit: int = 50, offset: int = 0
    ) -> list[Activity]:
        """Get activities for a user."""
        pass

    @abstractmethod
    async def get_by_date_range(
        self, user_id: UUID, start_date: datetime, end_date: datetime
    ) -> list[Activity]:
        """Get activities within date range."""
        pass

    @abstractmethod
    async def get_by_external_id(
        self, external_id: str, platform: str
    ) -> Activity | None:
        """Find activity by external platform ID."""
        pass

    @abstractmethod
    async def save_batch(self, activities: list[Activity]) -> list[Activity]:
        """Save multiple activities efficiently."""
        pass


class IRouteRepository(IRepository):
    """Repository interface for Route entities."""

    @abstractmethod
    async def search_nearby(
        self,
        coordinates: Coordinates,
        radius_meters: float,
        activity_type: str | None = None,
        max_difficulty: float | None = None,
        limit: int = 20,
    ) -> list[Route]:
        """Search for routes near coordinates within radius."""
        pass

    @abstractmethod
    async def search_by_bounds(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float,
        activity_type: str | None = None,
    ) -> list[Route]:
        """Search for routes within geographic bounds."""
        pass

    @abstractmethod
    async def get_by_name(self, name: str) -> list[Route]:
        """Search routes by name."""
        pass


class IFitnessPlatformClient(ABC):
    """Abstract interface for fitness platform API clients (Strava, Garmin, etc.)."""

    @abstractmethod
    async def get_athlete_profile(self, access_token: str) -> dict[str, Any]:
        """Retrieve athlete profile information."""
        pass

    @abstractmethod
    async def get_athlete_stats(self, access_token: str) -> dict[str, Any]:
        """Get athlete statistics and aggregated data."""
        pass

    @abstractmethod
    async def get_activities(
        self,
        access_token: str,
        after: datetime | None = None,
        before: datetime | None = None,
        page: int = 1,
        per_page: int = 30,
    ) -> list[dict[str, Any]]:
        """Fetch activities from the platform."""
        pass

    @abstractmethod
    async def get_activity_detail(
        self, access_token: str, activity_id: str
    ) -> dict[str, Any]:
        """Get detailed information about a specific activity."""
        pass

    @abstractmethod
    async def exchange_token(self, code: str) -> dict[str, Any]:
        """Exchange authorization code for access token."""
        pass

    @abstractmethod
    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        """Refresh an expired access token."""
        pass


class IRoutingClient(ABC):
    """Abstract interface for routing/map API clients (Komoot, OpenRouteService, etc.)."""

    @abstractmethod
    async def search_routes(
        self, coordinates: Coordinates, radius_km: float, activity_type: str
    ) -> list[dict[str, Any]]:
        """Search for routes near a location."""
        pass

    @abstractmethod
    async def get_route_details(self, route_id: str) -> dict[str, Any]:
        """Get detailed route information."""
        pass

    @abstractmethod
    async def calculate_route(
        self, start: Coordinates, end: Coordinates, activity_type: str
    ) -> dict[str, Any]:
        """Calculate a route between two points."""
        pass

    @abstractmethod
    async def get_elevation_profile(
        self, coordinates: list[Coordinates]
    ) -> list[float]:
        """Get elevation data for a series of coordinates."""
        pass


class IMapClient(ABC):
    """Abstract interface for map/geocoding clients."""

    @abstractmethod
    async def geocode(self, address: str) -> Coordinates | None:
        """Convert address to coordinates."""
        pass

    @abstractmethod
    async def reverse_geocode(self, coordinates: Coordinates) -> str | None:
        """Convert coordinates to address."""
        pass

    @abstractmethod
    async def get_poi_nearby(
        self,
        coordinates: Coordinates,
        radius_meters: float,
        poi_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """Get points of interest near coordinates."""
        pass


class IFileParser(ABC):
    """Abstract interface for activity file parsers (GPX, FIT, TCX)."""

    @abstractmethod
    async def parse(self, file_content: bytes) -> dict[str, Any]:
        """Parse activity file and extract data."""
        pass

    @abstractmethod
    def supports_format(self, file_extension: str) -> bool:
        """Check if parser supports file format."""
        pass
