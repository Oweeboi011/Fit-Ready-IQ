package com.fitreadyiq.app.data.repository

import com.fitreadyiq.app.data.api.ApiClient
import com.fitreadyiq.app.data.api.models.FitnessSummary
import com.fitreadyiq.app.data.api.models.GearItem
import com.fitreadyiq.app.data.api.models.GearResponse
import com.fitreadyiq.app.data.api.models.RecentActivity
import com.fitreadyiq.app.data.api.models.Route
import com.fitreadyiq.app.data.api.models.ScoreBreakdown
import com.fitreadyiq.app.data.api.models.ScoreResponse

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val message: String, val cause: Throwable? = null) : Result<Nothing>()
    object Loading : Result<Nothing>()
}

class FitReadyRepository {

    private val api = ApiClient.api

    // ── Fitness Summary ──────────────────────────────────────────────────────

    suspend fun getFitnessSummary(): Result<FitnessSummary> {
        return try {
            val response = api.getFitnessSummary()
            if (response.isSuccessful) {
                response.body()?.let { Result.Success(it) }
                    ?: Result.Error("Empty response body")
            } else {
                Result.Success(mockFitnessSummary())
            }
        } catch (e: Exception) {
            // Fall back to mock data when the backend is unreachable
            Result.Success(mockFitnessSummary())
        }
    }

    // ── Score ────────────────────────────────────────────────────────────────

    suspend fun getScore(): Result<ScoreResponse> {
        return try {
            val response = api.getScore()
            if (response.isSuccessful) {
                response.body()?.let { Result.Success(it) }
                    ?: Result.Error("Empty response body")
            } else {
                Result.Success(mockScore())
            }
        } catch (e: Exception) {
            Result.Success(mockScore())
        }
    }

    // ── Routes ───────────────────────────────────────────────────────────────

    suspend fun getRoutes(): Result<List<Route>> {
        return try {
            val response = api.getRoutes()
            if (response.isSuccessful) {
                response.body()?.let { Result.Success(it) }
                    ?: Result.Error("Empty response body")
            } else {
                Result.Success(mockRoutes())
            }
        } catch (e: Exception) {
            Result.Success(mockRoutes())
        }
    }

    // ── Gear ─────────────────────────────────────────────────────────────────

    suspend fun getGear(difficulty: String = "moderate"): Result<GearResponse> {
        return try {
            val response = api.getGear(difficulty)
            if (response.isSuccessful) {
                response.body()?.let { Result.Success(it) }
                    ?: Result.Error("Empty response body")
            } else {
                Result.Success(mockGear(difficulty))
            }
        } catch (e: Exception) {
            Result.Success(mockGear(difficulty))
        }
    }

    // ── Health Check ─────────────────────────────────────────────────────────

    suspend fun checkHealth(): Boolean {
        return try {
            val response = api.getHealth()
            response.isSuccessful
        } catch (e: Exception) {
            false
        }
    }

    // ── Mock Data ─────────────────────────────────────────────────────────────

    private fun mockFitnessSummary() = FitnessSummary(
        vo2max = 48.5,
        hrv = 62.0,
        weeklyMiles = 32.4,
        trainingLoad = 74,
        recentActivities = listOf(
            RecentActivity(
                id = "1",
                name = "Morning Trail Run",
                type = "Run",
                distance = 8.2,
                duration = 58,
                date = "2024-01-15",
                elevationGain = 420.0
            ),
            RecentActivity(
                id = "2",
                name = "Weekend Long Run",
                type = "Run",
                distance = 14.5,
                duration = 112,
                date = "2024-01-13",
                elevationGain = 680.0
            ),
            RecentActivity(
                id = "3",
                name = "Recovery Easy Jog",
                type = "Run",
                distance = 5.1,
                duration = 38,
                date = "2024-01-11",
                elevationGain = 120.0
            ),
            RecentActivity(
                id = "4",
                name = "Interval Training",
                type = "Run",
                distance = 10.0,
                duration = 70,
                date = "2024-01-09",
                elevationGain = 200.0
            )
        )
    )

    private fun mockScore() = ScoreResponse(
        score = 78,
        label = "Good",
        advice = "You're in solid shape! Focus on maintaining your current weekly mileage and consider adding one extra recovery day to optimize HRV. Your aerobic base is strong — try a tempo run this week to boost performance.",
        breakdown = ScoreBreakdown(
            aerobicFitness = 82,
            recovery = 71,
            consistency = 85,
            recentLoad = 68
        )
    )

    private fun mockRoutes() = listOf(
        Route(
            id = "r1",
            name = "Cascade Creek Loop",
            distance = 6.2,
            elevationGain = 380,
            difficulty = "easy",
            description = "A gentle loop through pine forest with creek crossings. Perfect for recovery days and beginners.",
            estimatedTime = "1h 45m",
            tags = listOf("forest", "creek", "loop")
        ),
        Route(
            id = "r2",
            name = "Ridgeline Traverse",
            distance = 11.8,
            elevationGain = 1240,
            difficulty = "moderate",
            description = "Scenic ridge trail with panoramic mountain views. Steady climb with technical sections near the summit.",
            estimatedTime = "3h 30m",
            tags = listOf("ridge", "views", "technical")
        ),
        Route(
            id = "r3",
            name = "Summit Push",
            distance = 16.4,
            elevationGain = 2800,
            difficulty = "hard",
            description = "Demanding summit route with significant elevation gain. Requires strong aerobic fitness and sure footing on talus.",
            estimatedTime = "6h 00m",
            tags = listOf("summit", "alpine", "strenuous")
        ),
        Route(
            id = "r4",
            name = "Valley Meadow Run",
            distance = 4.5,
            elevationGain = 120,
            difficulty = "easy",
            description = "Flat, scenic run through wildflower meadows alongside the river. Ideal for active recovery.",
            estimatedTime = "1h 00m",
            tags = listOf("flat", "meadow", "recovery")
        ),
        Route(
            id = "r5",
            name = "Technical Ridge Route",
            distance = 14.2,
            elevationGain = 3400,
            difficulty = "expert",
            description = "Class 3 scramble route requiring hands-on rock navigation. Only for highly experienced trail runners in peak condition.",
            estimatedTime = "7h 30m",
            tags = listOf("scramble", "exposed", "expert")
        ),
        Route(
            id = "r6",
            name = "Forest Half Marathon",
            distance = 13.1,
            elevationGain = 650,
            difficulty = "moderate",
            description = "Classic forest route covering mixed terrain. Good benchmark run for tracking fitness progress.",
            estimatedTime = "2h 45m",
            tags = listOf("forest", "benchmark", "mixed")
        )
    )

    private fun mockGear(difficulty: String) = when (difficulty.lowercase()) {
        "easy" -> GearResponse(
            essential = listOf(
                GearItem("g1", "Trail Running Shoes", "footwear", "Grippy outsole for light trail surfaces.", "essential"),
                GearItem("g2", "Hydration Pack (1.5L)", "hydration", "Sufficient water for shorter efforts.", "essential"),
                GearItem("g3", "Moisture-Wicking Shirt", "apparel", "Breathable base layer.", "essential")
            ),
            recommended = listOf(
                GearItem("g4", "Running Cap", "accessories", "Sun protection on exposed sections.", "recommended"),
                GearItem("g5", "Energy Gels (x2)", "nutrition", "Quick carbohydrates for sustained energy.", "recommended")
            ),
            optional = listOf(
                GearItem("g6", "Trekking Poles", "equipment", "Optional stability on slight inclines.", "optional")
            )
        )
        "hard", "expert" -> GearResponse(
            essential = listOf(
                GearItem("g1", "Technical Trail Shoes", "footwear", "Maximum grip and rock plate protection.", "essential"),
                GearItem("g2", "Hydration Vest (2L+)", "hydration", "High-capacity hydration with storage.", "essential"),
                GearItem("g3", "Navigation GPS Watch", "electronics", "Track route and monitor vitals.", "essential"),
                GearItem("g4", "Emergency Bivy", "safety", "Lightweight emergency shelter.", "essential"),
                GearItem("g5", "First Aid Kit", "safety", "Comprehensive trail first aid.", "essential")
            ),
            recommended = listOf(
                GearItem("g6", "Trekking Poles", "equipment", "Critical for steep ascents/descents.", "recommended"),
                GearItem("g7", "Headlamp + Spare Batteries", "lighting", "Essential if start/finish in low light.", "recommended"),
                GearItem("g8", "Wind/Rain Shell", "apparel", "Protection from rapid weather changes.", "recommended"),
                GearItem("g9", "Energy Gels (x6+)", "nutrition", "Adequate fueling for long efforts.", "recommended")
            ),
            optional = listOf(
                GearItem("g10", "Satellite Communicator", "electronics", "Two-way comms in remote areas.", "optional"),
                GearItem("g11", "Micro Spikes", "footwear", "If snow/ice conditions possible.", "optional")
            )
        )
        else -> GearResponse( // moderate (default)
            essential = listOf(
                GearItem("g1", "Trail Running Shoes", "footwear", "Aggressive lugs for mixed terrain grip.", "essential"),
                GearItem("g2", "Hydration Vest (1.5–2L)", "hydration", "Hands-free hydration with storage pockets.", "essential"),
                GearItem("g3", "GPS Watch", "electronics", "Monitor pace, distance, and elevation.", "essential"),
                GearItem("g4", "Moisture-Wicking Layers", "apparel", "Breathable, quick-dry apparel system.", "essential")
            ),
            recommended = listOf(
                GearItem("g5", "Trekking Poles", "equipment", "Aid on steep climbs and technical descents.", "recommended"),
                GearItem("g6", "Energy Gels (x4)", "nutrition", "Sustain energy on longer efforts.", "recommended"),
                GearItem("g7", "Light Shell Jacket", "apparel", "Protection against wind and light rain.", "recommended"),
                GearItem("g8", "Electrolyte Tablets", "nutrition", "Prevent cramping on warm days.", "recommended")
            ),
            optional = listOf(
                GearItem("g9", "Headlamp", "lighting", "Useful for early starts or long routes.", "optional"),
                GearItem("g10", "Gaiters", "footwear", "Keep debris out on dusty trails.", "optional")
            )
        )
    }
}
