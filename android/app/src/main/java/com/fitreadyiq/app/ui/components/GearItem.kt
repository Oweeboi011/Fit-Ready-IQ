package com.fitreadyiq.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Backpack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fitreadyiq.app.data.api.models.GearItem

@Composable
fun GearItemRow(
    item: GearItem,
    priorityColor: Color,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp, horizontal = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Priority indicator dot
        Surface(
            modifier = Modifier.size(10.dp),
            shape = CircleShape,
            color = priorityColor
        ) {}

        // Icon
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = priorityColor.copy(alpha = 0.12f),
            modifier = Modifier.size(40.dp)
        ) {
            Icon(
                imageVector = categoryIcon(item.category),
                contentDescription = item.name,
                tint = priorityColor,
                modifier = Modifier.padding(8.dp)
            )
        }

        // Text content
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            Text(
                text = item.name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = item.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2
            )
        }
    }
}

@Composable
private fun categoryIcon(category: String) = when (category.lowercase()) {
    "footwear" -> Icons.Default.CheckCircle
    "hydration" -> Icons.Default.CheckCircle
    "electronics" -> Icons.Default.CheckCircle
    "safety" -> Icons.Default.CheckCircle
    "apparel" -> Icons.Default.CheckCircle
    "nutrition" -> Icons.Default.CheckCircle
    "equipment" -> Icons.Default.Backpack
    else -> Icons.Default.Backpack
}
