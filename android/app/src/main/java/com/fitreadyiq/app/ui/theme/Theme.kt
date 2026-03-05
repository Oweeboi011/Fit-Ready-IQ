package com.fitreadyiq.app.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = Green500,
    onPrimary = White,
    primaryContainer = Green700,
    onPrimaryContainer = Green200,
    secondary = Blue500,
    onSecondary = White,
    secondaryContainer = Blue700,
    onSecondaryContainer = Blue200,
    background = DarkNavy,
    onBackground = White,
    surface = DarkCard,
    onSurface = White,
    surfaceVariant = DarkNavyVariant,
    onSurfaceVariant = LightGray,
    outline = MediumGray,
    error = ScorePoor,
    onError = White
)

private val LightColorScheme = lightColorScheme(
    primary = Green600,
    onPrimary = White,
    primaryContainer = Green200,
    onPrimaryContainer = Green700,
    secondary = Blue600,
    onSecondary = White,
    secondaryContainer = Blue200,
    onSecondaryContainer = Blue700,
    background = OffWhite,
    onBackground = DarkNavy,
    surface = White,
    onSurface = DarkNavy,
    surfaceVariant = androidx.compose.ui.graphics.Color(0xFFECF0F1L),
    onSurfaceVariant = MediumGray,
    outline = LightGray,
    error = ScorePoor,
    onError = White
)

@Composable
fun FitReadyIQTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = FitReadyTypography,
        content = content
    )
}
