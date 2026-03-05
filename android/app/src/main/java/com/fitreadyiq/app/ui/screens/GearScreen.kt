package com.fitreadyiq.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.fitreadyiq.app.ui.components.GearItemRow
import com.fitreadyiq.app.ui.theme.Blue500
import com.fitreadyiq.app.ui.theme.DifficultyEasy
import com.fitreadyiq.app.ui.theme.DifficultyExpert
import com.fitreadyiq.app.ui.theme.DifficultyHard
import com.fitreadyiq.app.ui.theme.DifficultyModerate
import com.fitreadyiq.app.ui.theme.Green500
import com.fitreadyiq.app.viewmodel.GearViewModel

private val gearDifficultyFilters = listOf("easy", "moderate", "hard", "expert")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GearScreen(
    onBack: () -> Unit,
    gearViewModel: GearViewModel = viewModel()
) {
    val uiState by gearViewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Gear Recommendations",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Difficulty selector
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(gearDifficultyFilters) { difficulty ->
                    val isSelected = uiState.selectedDifficulty == difficulty
                    val chipColor = difficultyChipColor(difficulty)

                    FilterChip(
                        selected = isSelected,
                        onClick = { gearViewModel.changeDifficulty(difficulty) },
                        label = {
                            Text(
                                text = difficulty.replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.labelMedium
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = chipColor.copy(alpha = 0.15f),
                            selectedLabelColor = chipColor
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = isSelected,
                            selectedBorderColor = chipColor.copy(alpha = 0.5f)
                        )
                    )
                }
            }

            Text(
                text = "Gear list for ${uiState.selectedDifficulty} difficulty trails",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )

            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = Green500)
                    }
                }

                uiState.error != null -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Failed to load gear recommendations.",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                uiState.gear != null -> {
                    val gear = uiState.gear!!

                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Essential section
                        if (gear.essential.isNotEmpty()) {
                            item {
                                GearSection(
                                    title = "Essential",
                                    subtitle = "Must-have items for this trail difficulty",
                                    color = Green500,
                                    content = {
                                        gear.essential.forEachIndexed { idx, item ->
                                            GearItemRow(
                                                item = item,
                                                priorityColor = Green500
                                            )
                                            if (idx < gear.essential.size - 1) {
                                                Divider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                                            }
                                        }
                                    }
                                )
                            }
                        }

                        // Recommended section
                        if (gear.recommended.isNotEmpty()) {
                            item {
                                GearSection(
                                    title = "Recommended",
                                    subtitle = "Strongly advised for comfort and safety",
                                    color = Blue500,
                                    content = {
                                        gear.recommended.forEachIndexed { idx, item ->
                                            GearItemRow(
                                                item = item,
                                                priorityColor = Blue500
                                            )
                                            if (idx < gear.recommended.size - 1) {
                                                Divider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                                            }
                                        }
                                    }
                                )
                            }
                        }

                        // Optional section
                        if (gear.optional.isNotEmpty()) {
                            item {
                                GearSection(
                                    title = "Optional",
                                    subtitle = "Nice to have for extra comfort",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    content = {
                                        gear.optional.forEachIndexed { idx, item ->
                                            GearItemRow(
                                                item = item,
                                                priorityColor = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                            if (idx < gear.optional.size - 1) {
                                                Divider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                                            }
                                        }
                                    }
                                )
                            }
                        }

                        item { Spacer(modifier = Modifier.height(16.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun GearSection(
    title: String,
    subtitle: String,
    color: Color,
    content: @Composable () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            androidx.compose.material3.Surface(
                shape = RoundedCornerShape(4.dp),
                color = color,
                modifier = Modifier
                    .height(18.dp)
                    .padding(end = 0.dp)
            ) {
                Box(modifier = Modifier.padding(horizontal = 8.dp)) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
                content()
            }
        }
    }
}

private fun difficultyChipColor(difficulty: String): Color = when (difficulty.lowercase()) {
    "easy" -> DifficultyEasy
    "moderate" -> DifficultyModerate
    "hard" -> DifficultyHard
    "expert" -> DifficultyExpert
    else -> DifficultyModerate
}
