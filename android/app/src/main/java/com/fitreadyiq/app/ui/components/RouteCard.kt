package com.fitreadyiq.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fitreadyiq.app.data.api.models.Route
import com.fitreadyiq.app.ui.theme.DifficultyEasy
import com.fitreadyiq.app.ui.theme.DifficultyExpert
import com.fitreadyiq.app.ui.theme.DifficultyHard
import com.fitreadyiq.app.ui.theme.DifficultyModerate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteCard(
    route: Route,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val difficultyColor = difficultyColor(route.difficulty)

    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Header row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = route.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f)
                )
                AssistChip(
                    onClick = {},
                    label = {
                        Text(
                            text = route.difficulty.replaceFirstChar { it.uppercase() },
                            style = MaterialTheme.typography.labelSmall
                        )
                    },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = difficultyColor.copy(alpha = 0.15f),
                        labelColor = difficultyColor
                    ),
                    border = AssistChipDefaults.assistChipBorder(
                        enabled = true,
                        borderColor = difficultyColor.copy(alpha = 0.4f)
                    )
                )
            }

            // Description
            Text(
                text = route.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2
            )

            // Stats row
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                StatItem(
                    icon = { Icon(Icons.Default.LocationOn, null, tint = difficultyColor, modifier = Modifier.padding(end = 2.dp)) },
                    text = "%.1f mi".format(route.distance)
                )
                StatItem(
                    icon = { Icon(Icons.Default.TrendingUp, null, tint = difficultyColor, modifier = Modifier.padding(end = 2.dp)) },
                    text = "${route.elevationGain} ft"
                )
                if (route.estimatedTime != null) {
                    StatItem(
                        icon = { Icon(Icons.Default.Timer, null, tint = difficultyColor, modifier = Modifier.padding(end = 2.dp)) },
                        text = route.estimatedTime
                    )
                }
            }
        }
    }
}

@Composable
private fun StatItem(
    icon: @Composable () -> Unit,
    text: String
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        icon()
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

fun difficultyColor(difficulty: String): Color = when (difficulty.lowercase()) {
    "easy" -> DifficultyEasy
    "moderate" -> DifficultyModerate
    "hard" -> DifficultyHard
    "expert" -> DifficultyExpert
    else -> DifficultyModerate
}
