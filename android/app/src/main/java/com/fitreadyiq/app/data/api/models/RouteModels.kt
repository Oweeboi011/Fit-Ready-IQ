package com.fitreadyiq.app.data.api.models

import com.google.gson.annotations.SerializedName

data class Route(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("distance") val distance: Double,
    @SerializedName("elevationGain") val elevationGain: Int,
    @SerializedName("difficulty") val difficulty: String,
    @SerializedName("description") val description: String,
    @SerializedName("estimatedTime") val estimatedTime: String? = null,
    @SerializedName("tags") val tags: List<String> = emptyList()
)
