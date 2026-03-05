package com.fitreadyiq.app.data.api

import com.fitreadyiq.app.data.api.models.FitnessSummary
import com.fitreadyiq.app.data.api.models.GearResponse
import com.fitreadyiq.app.data.api.models.HealthResponse
import com.fitreadyiq.app.data.api.models.Route
import com.fitreadyiq.app.data.api.models.ScoreResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface FitReadyApi {

    @GET("health")
    suspend fun getHealth(): Response<HealthResponse>

    @GET("fitness/summary")
    suspend fun getFitnessSummary(): Response<FitnessSummary>

    @GET("score")
    suspend fun getScore(): Response<ScoreResponse>

    @GET("routes")
    suspend fun getRoutes(): Response<List<Route>>

    @GET("gear")
    suspend fun getGear(
        @Query("difficulty") difficulty: String = "moderate"
    ): Response<GearResponse>
}
