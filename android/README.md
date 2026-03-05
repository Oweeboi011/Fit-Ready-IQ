# FitReady IQ — Android App

Native Android application for the FitReady IQ fitness readiness platform, built with **Kotlin + Jetpack Compose**.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Kotlin 1.9.x |
| UI | Jetpack Compose + Material3 |
| Navigation | Navigation Compose |
| HTTP | Retrofit2 + OkHttp3 + Gson |
| State | StateFlow + ViewModel |
| Min SDK | 26 (Android 8.0) |
| Target SDK | 34 (Android 14) |

## App Screens

| Screen | Description |
|---|---|
| `SplashScreen` | Animated logo + tagline on launch |
| `HomeScreen` | Welcome screen with feature overview and CTA |
| `ConnectScreen` | OAuth connect for Strava, Garmin, COROS |
| `DashboardScreen` | Score gauge, key metrics, recent activities |
| `RoutesScreen` | Filterable trail route list |
| `GearScreen` | Gear recommendations by difficulty |
| `ScoreDetailScreen` | Full score breakdown + coach advice |

## Project Structure

```
android/
├── build.gradle              # Project-level Gradle config
├── settings.gradle
├── gradle.properties
└── app/
    ├── build.gradle          # App-level dependencies + build config
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/fitreadyiq/app/
        │   ├── MainActivity.kt          # Entry point + NavHost
        │   ├── ui/
        │   │   ├── theme/               # Material3 theme (green/blue/dark)
        │   │   ├── screens/             # All 7 app screens
        │   │   └── components/          # Reusable UI components
        │   ├── data/
        │   │   ├── api/                 # Retrofit API interface + client
        │   │   │   └── models/          # Data classes (Fitness, Route, Gear)
        │   │   └── repository/          # Data layer with mock fallback
        │   └── viewmodel/               # DashboardVM, RoutesVM, GearVM
        └── res/
            ├── values/strings.xml
            ├── values/colors.xml
            ├── values/themes.xml
            └── drawable/ic_launcher_foreground.xml
```

## Getting Started

### Prerequisites
- Android Studio Hedgehog (2023.1.1) or later
- JDK 17
- Android SDK 34

### Build & Run

1. Open the `android/` folder in Android Studio.
2. Let Gradle sync (first run downloads dependencies).
3. Run on an emulator (API 26+) or physical device.

### Backend Connection

The app connects to `http://10.0.2.2:3001/api` — the Android emulator's loopback address mapping to `localhost:3001` on the host machine.

Start the FitReady IQ backend before running the app for live data:

```bash
cd ../backend
npm install && npm start
```

The app **gracefully falls back to rich mock data** when the backend is unreachable, so it works standalone for development and demos.

## API Endpoints Used

| Endpoint | Description |
|---|---|
| `GET /api/health` | Backend availability check |
| `GET /api/fitness/summary` | VO₂max, HRV, weekly miles, training load |
| `GET /api/score` | Readiness score, label, advice, breakdown |
| `GET /api/routes` | List of trail routes |
| `GET /api/gear?difficulty=moderate` | Gear recommendations |

## Color Palette

| Token | Hex | Usage |
|---|---|---|
| Primary Green | `#2ecc71` | CTA buttons, scores, success states |
| Secondary Blue | `#3498db` | Secondary actions, metrics |
| Dark Navy | `#1a1a2e` | App background |
| Dark Card | `#1e2a3a` | Card surfaces |

## Key Components

- **`ScoreGauge`** — Custom `Canvas`-drawn animated circular arc gauge
- **`MetricCard`** — Icon + value + unit display card for fitness metrics
- **`RouteCard`** — Tappable trail card with difficulty badge and stats
- **`GearItemRow`** — Priority-coloured gear item with category icon

## Architecture

```
UI Layer (Compose Screens)
    ↕ collectAsState()
ViewModel Layer (StateFlow)
    ↕ suspend functions
Repository Layer (mock fallback)
    ↕ Retrofit / mock
Data Layer (API models)
```
