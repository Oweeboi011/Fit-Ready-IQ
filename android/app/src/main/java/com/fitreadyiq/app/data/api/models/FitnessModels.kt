package com.fitreadyiq.app.data.api.models

import com.google.gson.annotations.SerializedName

// ── Fitness Summary ──────────────────────────────────────────────────────────

data class FitnessSummary(
    @SerializedName("vo2max") val vo2max: Double,
    @SerializedName("hrv") val hrv: Double,
    @SerializedName("weeklyMiles") val weeklyMiles: Double,
    @SerializedName("trainingLoad") val trainingLoad: Int,
    @SerializedName("recentActivities") val recentActivities: List<RecentActivity>
)

data class RecentActivity(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("type") val type: String,
    @SerializedName("distance") val distance: Double,
    @SerializedName("duration") val duration: Int,
    @SerializedName("date") val date: String,
    @SerializedName("elevationGain") val elevationGain: Double? = null
)

// ── Score ────────────────────────────────────────────────────────────────────

data class ScoreResponse(
    @SerializedName("score") val score: Int,
    @SerializedName("label") val label: String,
    @SerializedName("advice") val advice: String,
    @SerializedName("breakdown") val breakdown: ScoreBreakdown
)

data class ScoreBreakdown(
    @SerializedName("aerobicFitness") val aerobicFitness: Int,
    @SerializedName("recovery") val recovery: Int,
    @SerializedName("consistency") val consistency: Int,
    @SerializedName("recentLoad") val recentLoad: Int
)

// ── Health ───────────────────────────────────────────────────────────────────

data class HealthResponse(
    @SerializedName("status") val status: String,
    @SerializedName("timestamp") val timestamp: String? = null
)
