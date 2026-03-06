# Map Setup Guide

## Overview

The home page displays an interactive map showing your current location and nearby routes for hiking, biking, and running.

## Features

### Map Display

- **Mapbox GL JS** - Outdoor-optimized map style
- **User Location** - Automatic geolocation with animated marker
- **Route Markers** - Color-coded by difficulty (Easy=Green, Moderate=Orange, Hard=Red)
- **Route Polylines** - Visual path representation on the map
- **Tooltips** - Hover over markers to see route details
- **Legend** - Visual key for understanding map symbols

### Filtering

- **Activity Type** - Filter by hiking, biking, or running
- **Difficulty** - Filter by easy, moderate, or hard
- **Distance** - Set maximum distance (1-100 km)
- **Elevation** - Filter by elevation gain range (0-3000m)
- **Real-time Updates** - Map updates immediately when filters change

### Route List

- **Sidebar** - Scrollable list of filtered routes
- **Route Cards** - Quick overview with distance, elevation, difficulty, and type
- **Click to Focus** - (Future) Click route card to center map

## Configuration

### 1. Get Mapbox Access Token

1. Create account at [mapbox.com](https://www.mapbox.com/)
2. Navigate to **Account > Access tokens**
3. Create a new token or copy the default public token
4. Token should have `styles:read` and `fonts:read` scopes

### 2. Configure Environment Variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoieW91ci11c2VybmFtZSIsImEiOiJ5b3VyLXRva2VuIn0.your-token
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=Fit-Ready-IQ
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Browser Geolocation Permission

When you first load the map, your browser will request location permission:

- **Allow** - Map centers on your location
- **Deny** - Map uses default location (San Francisco)

## Map Components

### MapView Component (`src/components/MapView.tsx`)

- Renders the interactive map
- Manages user location
- Displays route markers and polylines
- Handles tooltips and legend

**Props:**

```typescript
  routes?: Route[];                   // Array of routes to display
}
```

### RouteFilter Component (`src/components/RouteFilter.tsx`)

- Provides filtering UI
- Manages filter state
- Emits filter changes to parent

**Props:**

```typescriptr changes to parent

**Props:**
```typescript
interface RouteFilterProps {
  onFilterChange: (filters: FilterState) => void;
}
```

## Route Data Structure

```typescript
interface Route {
  id: string;
  name: string;
  coordinates: [number, number];      // [longitude, latitude]
  distance_km: number;
  elevation_gain_m: number;
  difficulty: "easy" | "moderate" | "hard";
  activity_type: "hike" | "bike" | "run";
  polyline?: [number, number][];      // Optional path coordinates
}
## API Integration

### Current Status

The home page currently uses **mock data** for demonstration.

### Next Steps

Replace mock data with API calls:
### Next Steps
Replace mock data with API calls:

```typescript
// In frontend/src/app/page.tsx
const fetchRoutes = async () => {
  try {
    // Get user location
    const userLocation = await getCurrentLocation();
    
    // Call backend API
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/routes/nearby?` +
      `lat=${userLocation.latitude}&` +
      `lon=${userLocation.longitude}&` +
      `radius_km=25`
    );
    
    const data = await response.json();
    setRoutes(data.routes);
  } catch (error) {
    console.error('Failed to fetch routes:', error);
  }
};
### Backend Endpoints Needed

```http
GET /api/routes/nearby
Query params:
GET /api/routes/nearby
Query params:
  - lat: number (user latitude)
  - lon: number (user longitude)
  - radius_km: number (search radius, default 25)
  - activity_type?: string (optional filter)
  - difficulty?: string (optional filter)

Response:
{
  "routes": [
    {
      "id": "uuid",
      "name": "Trail Name",
      "coordinates": [longitude, latitude],
      "distance_km": 11.5,
      "elevation_gain_m": 762,
      "difficulty": "moderate",
      "activity_type": "hike",
      "polyline": [[lon, lat], ...] // optional
    }
  ],
  "total": 42
}
## Map Controls

### Navigation Controls

- **Zoom In/Out** - `+` and `-` buttons
- **Rotate** - Compass button
- **Tilt** - Right-click drag

### Geolocate Control

- **Find Me** - GPS button
- **Track Location** - Follows as you move
- **Show Heading** - Displays direction

## Styling

### Difficulty Colors

```css
### Difficulty Colors
Hard:     #ef4444 (red-500)
```

### Activity Icons

```text
Hike: 🥾
Bike: 🚴
Run:  🏃
```

## Performance Optimization

### Dynamic Import

MapView uses `next/dynamic` to avoid SSR issues:

  loading: () => <LoadingSpinner />,
});
```

### Route Limiting

- Display max 512 points per polyline (Mapbox limit)
- Filter routes before rendering
- Use GeoJSON for efficient rendering

## Troubleshooting

### Map Not Loading

- Check `NEXT_PUBLIC_MAPBOX_TOKEN` is set correctly
- Verify token has required scopes
- Check browser console for errors
- Ensure internet connection for Mapbox tiles

### Location Not Working

- Grant browser location permission
- Check HTTPS (required for geolocation)
- Verify GPS is enabled on device

### Routes Not Appearing

- Check route coordinates are valid `[longitude, latitude]`
- Verify routes are within map bounds
- Check filter settings aren't too restrictive
- Review browser console for errors

## Development

npm run dev
```

### Test Map Locally

1. Set Mapbox token in `.env.local`
2. Start dev server: `npm run dev`
3. Open: `http://localhost:3000`
4. Grant location permission when prompted
```bash
cd frontend
npm install
npm run dev
```

### Test Map Locally
1. Set Mapbox token in `.env.local`
2. Start dev server: `npm run dev`
3. Open: `http://localhost:3000`
4. Grant location permission when prompted

## Resources

- [Mapbox GL JS Documentation](https://docs.mapbox.com/mapbox-gl-js/)
- [react-map-gl Documentation](https://visgl.github.io/react-map-gl/)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
