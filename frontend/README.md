# FitReady IQ — Frontend

A React 18 web application providing a fitness readiness dashboard for the FitReady IQ platform. It connects to Strava, Garmin, and COROS to calculate a personalised readiness score and recommend matching trail routes and gear.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment config
cp .env.example .env

# 3. Start development server
npm start
```

The app will be available at **http://localhost:3000**.

## Environment Variables

| Variable             | Description                        | Default                    |
|---------------------|------------------------------------|----------------------------|
| `REACT_APP_API_URL` | Base URL of the FitReady IQ backend | `http://localhost:3000`   |

Copy `.env.example` to `.env` and set `REACT_APP_API_URL` to point at your running backend instance.

## Production Build

```bash
npm run build
```

Outputs a minified production build to the `build/` folder, ready for static hosting (Netlify, Vercel, S3, etc.).

## Pages & Routes

| Path         | Page              | Description                                          |
|-------------|-------------------|------------------------------------------------------|
| `/`          | Home              | Landing page with feature highlights and CTA         |
| `/connect`   | Connect           | OAuth connection buttons for Strava, Garmin, COROS   |
| `/dashboard` | Dashboard         | Readiness score gauge, key metric cards, activities  |
| `/routes`    | Routes            | Trail cards with difficulty filter and match button  |
| `/gear`      | Gear              | Gear recommendations by difficulty & conditions      |
| `/score`     | Score Details     | Full score breakdown with per-metric explanations    |

## Architecture

```
src/
├── api/client.js          Axios instance + typed API functions
├── context/AppContext.js  Global state (score, user, connections) + mock fallback
├── components/            Reusable UI components
│   ├── Navbar/            Responsive top navigation
│   ├── ScoreGauge/        SVG arc gauge (red/yellow/green by score)
│   ├── MetricCard/        Metric stat card with trend indicator
│   ├── RouteCard/         Trail card with stats and difficulty badge
│   └── GearList/          Collapsible gear category sections
└── pages/                 Route-level page components
```

## Mock Data

When the backend is not reachable, the app automatically falls back to realistic demo data so all pages remain fully functional. A blue banner is shown to indicate demo mode. This behaviour is controlled by the `useMock` flag in `AppContext`.

## Tech Stack

- **React 18** — functional components with hooks
- **React Router v6** — client-side routing
- **Axios** — HTTP client with JWT interceptor
- **CSS** — plain CSS with custom properties (no framework dependencies)

## Colour Palette

| Token             | Hex       | Usage                          |
|------------------|-----------|--------------------------------|
| `--primary`       | `#2ecc71` | CTA buttons, active states     |
| `--secondary`     | `#3498db` | Secondary actions, Garmin      |
| `--dark`          | `#1a1a2e` | Page background                |
| `--dark-card`     | `#16213e` | Card backgrounds               |
| `--text-light`    | `#e8f4f8` | Primary text                   |
| `--text-muted`    | `#a0b4c0` | Secondary / label text         |
