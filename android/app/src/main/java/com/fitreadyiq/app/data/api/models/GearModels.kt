package com.fitreadyiq.app.data.api.models

import com.google.gson.annotations.SerializedName

data class GearResponse(
    @SerializedName("essential") val essential: List<GearItem>,
    @SerializedName("recommended") val recommended: List<GearItem>,
    @SerializedName("optional") val optional: List<GearItem>
)

data class GearItem(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("category") val category: String,
    @SerializedName("description") val description: String,
    @SerializedName("priority") val priority: String? = null
)
