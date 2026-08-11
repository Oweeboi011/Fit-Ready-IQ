"""Domain services: Business logic that operates across multiple entities."""

from datetime import datetime, timedelta

from ..entities import Activity, Route
from ..value_objects import (
    FitnessScore,
    HeartRateZones,
    ReadinessStatus,
    RouteDifficulty,
    RouteMatch,
)


class FitnessScoreCalculator:
    """
    Service for calculating comprehensive fitness scores from activity data.

    Implements multi-factor fitness assessment based on:
    - VO2max estimation
    - Training volume (weekly distance/duration)
    - Training consistency (frequency)
    - Training intensity (heart rate zones)
    """

    def calculate_fitness_score(
        self,
        activities: list[Activity],
        user_age: int | None = None,
        user_max_hr: int | None = None,
    ) -> FitnessScore:
        """
        Calculate comprehensive fitness score from recent activities.

        Args:
            activities: List of recent activities (ideally last 4-8 weeks)
            user_age: User's age for VO2max estimation
            user_max_hr: User's maximum heart rate

        Returns:
            FitnessScore with total and component scores
        """
        if not activities:
            return FitnessScore(total_score=0.0, experience_level="beginner")

        # Calculate component scores
        vo2max_score = self._calculate_vo2max_score(activities, user_age, user_max_hr)
        volume_score = self._calculate_volume_score(activities)
        consistency_score = self._calculate_consistency_score(activities)
        intensity_score = self._calculate_intensity_score(activities, user_max_hr)

        # Weighted combination
        total_score = (
            vo2max_score * 0.35
            + volume_score * 0.25
            + consistency_score * 0.20
            + intensity_score * 0.20
        )

        # Determine experience level
        experience_level = self._determine_experience_level(activities, total_score)

        return FitnessScore(
            total_score=min(100.0, total_score),
            vo2max_score=vo2max_score,
            volume_score=volume_score,
            consistency_score=consistency_score,
            intensity_score=intensity_score,
            experience_level=experience_level,
        )

    def _calculate_vo2max_score(
        self,
        activities: list[Activity],
        user_age: int | None,
        user_max_hr: int | None,
    ) -> float:
        """Estimate VO2max score from activity data."""
        # Filter to running/hiking activities with HR data
        cardio_activities = [
            a
            for a in activities
            if a.activity_type in ["run", "hike"] and a.average_heart_rate
        ]

        if not cardio_activities:
            return 50.0  # Default moderate score

        # Use most recent activities with good data
        recent = sorted(cardio_activities, key=lambda x: x.start_date, reverse=True)[
            :10
        ]

        # Calculate average pace and heart rate
        avg_speeds = [a.speed_kph for a in recent if a.speed_kph]
        avg_hrs = [a.average_heart_rate for a in recent if a.average_heart_rate]

        if not avg_speeds or not avg_hrs:
            return 50.0

        avg_speed = sum(avg_speeds) / len(avg_speeds)

        # Simplified VO2max estimation (Cooper formula adapted)
        # This is a rough estimate - real VO2max requires lab testing
        estimated_vo2max = (avg_speed * 3.5) + 15  # Very simplified

        # Normalize to 0-100 scale (40-80 ml/kg/min typical range)
        vo2max_score = ((estimated_vo2max - 40) / 40) * 100

        return max(0.0, min(100.0, vo2max_score))

    def _calculate_volume_score(self, activities: list[Activity]) -> float:
        """Calculate training volume score."""
        # Get activities from last 4 weeks
        four_weeks_ago = datetime.utcnow() - timedelta(weeks=4)
        recent = [a for a in activities if a.start_date >= four_weeks_ago]

        if not recent:
            return 0.0

        # Calculate weekly average distance and duration
        total_distance_km = sum(a.distance / 1000 for a in recent)
        total_hours = sum(a.duration / 3600 for a in recent)
        weeks = 4

        weekly_distance = total_distance_km / weeks
        weekly_hours = total_hours / weeks

        # Score based on training volume (0-100)
        # Target: 50km or 10 hours per week for high score
        distance_score = min(100, (weekly_distance / 50) * 100)
        duration_score = min(100, (weekly_hours / 10) * 100)

        return (distance_score + duration_score) / 2

    def _calculate_consistency_score(self, activities: list[Activity]) -> float:
        """Calculate training consistency score."""
        # Get last 8 weeks
        eight_weeks_ago = datetime.utcnow() - timedelta(weeks=8)
        recent = [a for a in activities if a.start_date >= eight_weeks_ago]

        if not recent:
            return 0.0

        # Count activities per week
        weeks_dict: dict[int, int] = {}
        for activity in recent:
            week_num = activity.start_date.isocalendar()[1]
            weeks_dict[week_num] = weeks_dict.get(week_num, 0) + 1

        if not weeks_dict:
            return 0.0

        # Calculate consistency metrics
        avg_per_week = sum(weeks_dict.values()) / len(weeks_dict)
        weeks_with_activity = len(weeks_dict)

        # Score based on: activities per week (target 3-5) and consistency
        frequency_score = min(100, (avg_per_week / 4) * 100)
        consistency_ratio = weeks_with_activity / 8

        return frequency_score * 0.6 + consistency_ratio * 100 * 0.4

    def _calculate_intensity_score(
        self, activities: list[Activity], user_max_hr: int | None
    ) -> float:
        """Calculate training intensity score."""
        # Filter activities with heart rate data
        hr_activities = [a for a in activities if a.average_heart_rate]

        if not hr_activities or not user_max_hr:
            return 50.0  # Default moderate

        zones = HeartRateZones(max_hr=user_max_hr)

        # Analyze heart rate distribution
        zone_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        for activity in hr_activities:
            if activity.average_heart_rate:
                zone = zones.get_zone(int(activity.average_heart_rate))
                if zone in zone_counts:
                    zone_counts[zone] += 1

        total = sum(zone_counts.values())
        if total == 0:
            return 50.0

        # Ideal distribution: 80% zone 2, 10% zone 3-4, 10% zone 5
        # Score based on proper intensity distribution
        zone2_ratio = zone_counts[2] / total
        high_intensity_ratio = (zone_counts[4] + zone_counts[5]) / total

        # Good aerobic base (zone 2) and some high intensity
        score = (zone2_ratio * 70 + high_intensity_ratio * 30) * 100

        return min(100.0, score)

    def _determine_experience_level(
        self, activities: list[Activity], total_score: float
    ) -> str:
        """Determine experience level from activity history and score."""
        # Consider both score and activity count
        total_activities = len(activities)

        if total_score >= 80 and total_activities >= 50:
            return "expert"
        elif total_score >= 65 and total_activities >= 30:
            return "advanced"
        elif total_score >= 45 and total_activities >= 15:
            return "intermediate"
        else:
            return "beginner"


class RouteDifficultyCalculator:
    """
    Service for calculating route difficulty scores.

    Factors:
    - Distance
    - Elevation gain/loss
    - Maximum grade
    - Technical rating
    - Surface type
    """

    def calculate_difficulty(self, route: Route) -> RouteDifficulty:
        """
        Calculate comprehensive difficulty score for a route.

        Args:
            route: Route entity to analyze

        Returns:
            RouteDifficulty value object with score and breakdown
        """
        # Calculate component factors
        distance_factor = self._calculate_distance_factor(route.distance)
        elevation_factor = self._calculate_elevation_factor(
            route.elevation_gain, route.distance
        )
        grade_factor = self._calculate_grade_factor(route.max_grade, route.avg_grade)
        technical_factor = self._calculate_technical_factor(
            route.technical_rating, route.surface_types
        )

        # Weighted combination based on activity type
        if route.activity_type == "hike":
            score = (
                distance_factor * 0.20
                + elevation_factor * 0.35
                + grade_factor * 0.25
                + technical_factor * 0.20
            )
        elif route.activity_type == "rock_climb":
            score = (
                distance_factor * 0.10
                + elevation_factor * 0.30
                + grade_factor * 0.25
                + technical_factor * 0.35
            )
        else:  # biking
            score = (
                distance_factor * 0.25
                + elevation_factor * 0.30
                + grade_factor * 0.30
                + technical_factor * 0.15
            )

        return RouteDifficulty.from_score(
            score=min(100.0, score),
            elevation_factor=elevation_factor,
            distance_factor=distance_factor,
            technical_factor=technical_factor,
            grade_factor=grade_factor,
        )

    def _calculate_distance_factor(self, distance_meters: float) -> float:
        """Score distance component (0-100)."""
        distance_km = distance_meters / 1000

        # Non-linear scaling: longer distances disproportionately harder
        if distance_km < 5:
            return (distance_km / 5) * 20
        elif distance_km < 15:
            return 20 + ((distance_km - 5) / 10) * 30
        elif distance_km < 30:
            return 50 + ((distance_km - 15) / 15) * 30
        else:
            return min(100, 80 + ((distance_km - 30) / 20) * 20)

    def _calculate_elevation_factor(
        self, elevation_gain: float, distance_meters: float
    ) -> float:
        """Score elevation component considering gain and distance ratio."""
        if distance_meters == 0:
            return 0.0

        distance_km = distance_meters / 1000
        gain_per_km = elevation_gain / distance_km

        # Score based on elevation gain per km
        # 0-50m/km: easy, 50-100m/km: moderate, 100-150m/km: hard, >150m/km: expert
        if gain_per_km < 50:
            ratio_score = (gain_per_km / 50) * 30
        elif gain_per_km < 100:
            ratio_score = 30 + ((gain_per_km - 50) / 50) * 30
        elif gain_per_km < 150:
            ratio_score = 60 + ((gain_per_km - 100) / 50) * 25
        else:
            ratio_score = min(100, 85 + ((gain_per_km - 150) / 50) * 15)

        # Also consider absolute elevation gain
        if elevation_gain < 200:
            abs_score = (elevation_gain / 200) * 30
        elif elevation_gain < 600:
            abs_score = 30 + ((elevation_gain - 200) / 400) * 30
        elif elevation_gain < 1200:
            abs_score = 60 + ((elevation_gain - 600) / 600) * 25
        else:
            abs_score = min(100, 85 + ((elevation_gain - 1200) / 800) * 15)

        return ratio_score * 0.6 + abs_score * 0.4

    def _calculate_grade_factor(self, max_grade: float, avg_grade: float) -> float:
        """Score based on steepness."""
        # Max grade impact
        if max_grade < 5:
            max_score = (max_grade / 5) * 20
        elif max_grade < 10:
            max_score = 20 + ((max_grade - 5) / 5) * 30
        elif max_grade < 15:
            max_score = 50 + ((max_grade - 10) / 5) * 25
        else:
            max_score = min(100, 75 + ((max_grade - 15) / 10) * 25)

        # Average grade impact
        avg_score = min(100, (avg_grade / 10) * 100)

        return max_score * 0.7 + avg_score * 0.3

    def _calculate_technical_factor(
        self, technical_rating: int, surface_types: list[str]
    ) -> float:
        """Score technical difficulty and terrain."""
        # Technical rating (1-5) base score
        rating_score = (technical_rating / 5) * 60

        # Surface type bonus
        difficult_surfaces = ["rock", "scree", "boulder", "technical"]
        moderate_surfaces = ["gravel", "dirt", "sand"]

        surface_score = 0.0
        for surface in surface_types:
            if surface.lower() in difficult_surfaces:
                surface_score += 15
            elif surface.lower() in moderate_surfaces:
                surface_score += 5

        return min(100.0, rating_score + surface_score)


class RouteMatchingService:
    """
    Service for matching user fitness to route difficulty.

    Provides readiness assessment and recommendations.
    """

    def match_user_to_route(
        self, fitness_score: FitnessScore, route_difficulty: RouteDifficulty
    ) -> RouteMatch:
        """
        Compare user fitness against route difficulty.

        Args:
            fitness_score: User's fitness assessment
            route_difficulty: Route difficulty assessment

        Returns:
            RouteMatch with readiness status and recommendations
        """
        user_score = fitness_score.total_score
        route_score = route_difficulty.score
        gap = route_score - user_score

        # Determine readiness status
        if gap < -15:
            readiness = ReadinessStatus.OVERQUALIFIED
            recommendation = (
                "This route is well within your capabilities. "
                "Consider more challenging routes for optimal training."
            )
            training_weeks = 0
        elif gap <= 5:
            readiness = ReadinessStatus.READY
            recommendation = (
                "You're ready for this route! Your fitness level matches the difficulty. "
                "Ensure proper preparation and pacing."
            )
            training_weeks = 0
        elif gap <= 15:
            readiness = ReadinessStatus.ALMOST_READY
            recommendation = (
                "You're close! 2-4 weeks of focused training should prepare you well. "
                "Work on endurance and strength specific to this route."
            )
            training_weeks = 3
        elif gap <= 25:
            readiness = ReadinessStatus.NOT_READY
            recommendation = (
                "This route is challenging for your current fitness level. "
                "6-8 weeks of progressive training recommended before attempting."
            )
            training_weeks = 7
        else:
            readiness = ReadinessStatus.NOT_READY
            recommendation = (
                "Significant training required. Consider building up with easier routes first, "
                "then progress toward this goal over 10+ weeks."
            )
            training_weeks = max(10, int(gap / 3))

        return RouteMatch(
            readiness=readiness,
            fitness_score=user_score,
            route_difficulty=route_score,
            gap=gap,
            recommendation=recommendation,
            training_weeks_needed=training_weeks,
            confidence=self._calculate_confidence(fitness_score, route_difficulty),
        )

    def _calculate_confidence(
        self, fitness_score: FitnessScore, route_difficulty: RouteDifficulty
    ) -> float:
        """Calculate confidence level in the assessment."""
        confidence = 0.8  # Base confidence

        # Higher confidence if we have detailed component scores
        if fitness_score.vo2max_score and fitness_score.volume_score:
            confidence += 0.1

        # Lower confidence for extreme mismatches
        gap = abs(route_difficulty.score - fitness_score.total_score)
        if gap > 40:
            confidence -= 0.2

        return max(0.5, min(1.0, confidence))
