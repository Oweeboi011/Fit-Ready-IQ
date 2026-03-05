package com.fitreadyiq.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fitreadyiq.app.ui.theme.ScoreExcellent
import com.fitreadyiq.app.ui.theme.ScoreFair
import com.fitreadyiq.app.ui.theme.ScoreGood
import com.fitreadyiq.app.ui.theme.ScorePoor

@Composable
fun ScoreGauge(
    score: Int,
    label: String,
    modifier: Modifier = Modifier,
    size: Dp = 220.dp,
    strokeWidth: Float = 28f
) {
    val animatedProgress = remember { Animatable(0f) }
    val targetProgress = score / 100f

    LaunchedEffect(score) {
        animatedProgress.animateTo(
            targetValue = targetProgress,
            animationSpec = tween(durationMillis = 1200)
        )
    }

    val scoreColor = when {
        score >= 80 -> ScoreExcellent
        score >= 60 -> ScoreGood
        score >= 40 -> ScoreFair
        else -> ScorePoor
    }

    val trackColor = scoreColor.copy(alpha = 0.15f)

    Box(
        modifier = modifier.size(size),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.size(size)) {
            val diameter = this.size.minDimension - strokeWidth * 2
            val topLeft = Offset(
                x = (this.size.width - diameter) / 2f,
                y = (this.size.height - diameter) / 2f
            )
            val arcSize = Size(diameter, diameter)
            val startAngle = 135f
            val sweepAngle = 270f

            // Track arc (background)
            drawArc(
                color = trackColor,
                startAngle = startAngle,
                sweepAngle = sweepAngle,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
            )

            // Score arc (foreground)
            drawArc(
                color = scoreColor,
                startAngle = startAngle,
                sweepAngle = sweepAngle * animatedProgress.value,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
            )
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "$score",
                fontSize = 52.sp,
                fontWeight = FontWeight.Bold,
                color = scoreColor
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                color = scoreColor.copy(alpha = 0.8f),
                letterSpacing = 2.sp
            )
        }
    }
}
