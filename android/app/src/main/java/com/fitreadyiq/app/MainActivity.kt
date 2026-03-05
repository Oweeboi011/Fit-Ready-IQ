package com.fitreadyiq.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.fitreadyiq.app.ui.screens.ConnectScreen
import com.fitreadyiq.app.ui.screens.DashboardScreen
import com.fitreadyiq.app.ui.screens.GearScreen
import com.fitreadyiq.app.ui.screens.HomeScreen
import com.fitreadyiq.app.ui.screens.RoutesScreen
import com.fitreadyiq.app.ui.screens.ScoreDetailScreen
import com.fitreadyiq.app.ui.screens.SplashScreen
import com.fitreadyiq.app.ui.theme.FitReadyIQTheme
import com.fitreadyiq.app.viewmodel.DashboardViewModel

// Navigation route constants
object Routes {
    const val SPLASH = "splash"
    const val HOME = "home"
    const val CONNECT = "connect"
    const val DASHBOARD = "dashboard"
    const val ROUTES = "routes"
    const val GEAR = "gear"
    const val SCORE_DETAIL = "score_detail"
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FitReadyIQTheme(darkTheme = true) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    FitReadyApp()
                }
            }
        }
    }
}

@Composable
fun FitReadyApp() {
    val navController = rememberNavController()

    // Shared DashboardViewModel so Score and Dashboard share state
    val dashboardViewModel: DashboardViewModel = viewModel()

    NavHost(
        navController = navController,
        startDestination = Routes.SPLASH
    ) {
        composable(Routes.SPLASH) {
            SplashScreen(
                onSplashComplete = {
                    navController.navigate(Routes.HOME) {
                        popUpTo(Routes.SPLASH) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.HOME) {
            HomeScreen(
                onConnectClick = {
                    navController.navigate(Routes.CONNECT)
                }
            )
        }

        composable(Routes.CONNECT) {
            ConnectScreen(
                onBack = { navController.navigateUp() },
                onConnected = {
                    navController.navigate(Routes.DASHBOARD) {
                        popUpTo(Routes.HOME) { inclusive = false }
                    }
                }
            )
        }

        composable(Routes.DASHBOARD) {
            DashboardScreen(
                onNavigateToScore = {
                    navController.navigate(Routes.SCORE_DETAIL)
                },
                onNavigateToRoutes = {
                    navController.navigate(Routes.ROUTES)
                },
                onNavigateToGear = {
                    navController.navigate(Routes.GEAR)
                },
                dashboardViewModel = dashboardViewModel
            )
        }

        composable(Routes.SCORE_DETAIL) {
            ScoreDetailScreen(
                onBack = { navController.navigateUp() },
                dashboardViewModel = dashboardViewModel
            )
        }

        composable(Routes.ROUTES) {
            RoutesScreen(
                onBack = { navController.navigateUp() }
            )
        }

        composable(Routes.GEAR) {
            GearScreen(
                onBack = { navController.navigateUp() }
            )
        }
    }
}
