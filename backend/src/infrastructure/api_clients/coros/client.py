"""COROS API client implementation.

Note: COROS does not provide a public API for third-party applications.
This client provides FIT file parsing functionality as a workaround.
Users can upload FIT files exported from the COROS app.
"""

from typing import Any

import structlog
from fitparse import FitFile
from src.domain.interfaces import IFileParser

logger = structlog.get_logger(__name__)


class CorosFitParser(IFileParser):
    """Parser for COROS FIT files.

    COROS watches export standard FIT files, so we can reuse the FIT parser logic.
    """

    SUPPORTED_FORMATS = [".fit"]

    async def parse(self, file_content: bytes) -> dict[str, Any]:
        """Parse COROS FIT file and extract activity data.

        Args:
            file_content: Raw FIT file bytes

        Returns:
            Dictionary containing activity data
        """
        try:
            fit_file = FitFile(file_content)
            activity_data = {
                "activities": [],
                "source": "coros_fit_file",
            }

            # Extract records
            records = []
            for record in fit_file.get_messages("record"):
                record_data = {}
                for field in record:
                    record_data[field.name] = field.value
                records.append(record_data)

            # Extract session data
            for session in fit_file.get_messages("session"):
                session_data = {}
                for field in session:
                    session_data[field.name] = field.value

                activity = {
                    "name": "COROS Activity",
                    "activity_type": self._map_sport_type(session_data.get("sport")),
                    "distance_meters": session_data.get("total_distance"),
                    "duration_seconds": session_data.get("total_timer_time"),
                    "elevation_gain_meters": session_data.get("total_ascent"),
                    "average_heart_rate": session_data.get("avg_heart_rate"),
                    "max_heart_rate": session_data.get("max_heart_rate"),
                    "average_power": session_data.get("avg_power"),
                    "calories": session_data.get("total_calories"),
                    "start_time": session_data.get("start_time"),
                    "records": records,
                }
                activity_data["activities"].append(activity)

            logger.info(
                "coros_fit_file_parsed",
                activity_count=len(activity_data["activities"]),
                record_count=len(records),
            )

            return activity_data

        except Exception as e:
            logger.error("coros_fit_parse_error", error=str(e))
            raise ValueError(f"Failed to parse COROS FIT file: {str(e)}")

    def supports_format(self, file_extension: str) -> bool:
        """Check if parser supports the file format."""
        return file_extension.lower() in self.SUPPORTED_FORMATS

    @staticmethod
    def _map_sport_type(sport: str | None) -> str:
        """Map COROS sport type to our activity type."""
        sport_mapping = {
            "running": "run",
            "trail_run": "run",
            "cycling": "ride",
            "mountain_bike": "ride",
            "hiking": "hike",
            "walking": "walk",
            "swimming": "swim",
        }
        return sport_mapping.get(sport.lower() if sport else "", "other")
