# API Reference

## Base URL

```
Development: http://localhost:8000
Production:  https://fit-ready-iq-backend-prod.azurewebsites.net
```

## Authentication

Most endpoints require authentication using JWT tokens obtained via OAuth 2.0 flow.

```http
Authorization: Bearer <your_jwt_token>
```

## Response Format

### Success Response
```json
{
  "status": "success",
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0.0"
  }
}
```

### Error Response
```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "planned_date",
      "reason": "Date must be in the future"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `EXTERNAL_API_ERROR` | 502 | External service unavailable |
| `INTERNAL_ERROR` | 500 | Internal server error |

## Endpoints

### Health & Status

#### GET /health
Health check endpoint for monitoring.

**Authentication:** None required

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "strava_api": "operational"
  }
}
```

---

### Authentication

#### GET /api/auth/strava/authorize
Initiate Strava OAuth 2.0 flow.

**Authentication:** None required

**Query Parameters:**
- `redirect_uri` (optional, string): Custom redirect URI

**Response:**
```json
{
  "authorization_url": "https://www.strava.com/oauth/authorize?client_id=...",
  "state": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Example:**
```bash
curl http://localhost:8000/api/auth/strava/authorize
```

#### POST /api/auth/strava/callback
Exchange authorization code for access token.

**Authentication:** None required

**Request Body:**
```json
{
  "code": "authorization_code_from_strava",
  "state": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 86400,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "athlete@example.com",
    "strava_id": 12345678
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/auth/strava/callback \
  -H "Content-Type: application/json" \
  -d '{"code": "abc123", "state": "xyz789"}'
```

#### POST /api/auth/refresh
Refresh expired JWT token.

**Authentication:** Required (expired token acceptable)

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 86400
}
```

#### POST /api/auth/logout
Revoke current session.

**Authentication:** Required

**Response:**
```json
{
  "message": "Successfully logged out"
}
```

---

### Fitness Data

#### POST /api/fitness/sync
Sync activities from Strava.

**Authentication:** Required

**Query Parameters:**
- `since` (optional, datetime): Sync activities after this date
- `limit` (optional, integer, default=50, max=200): Number of activities

**Request Body:**
```json
{
  "full_sync": false
}
```

**Response:**
```json
{
  "synced_count": 42,
  "new_activities": 5,
  "updated_activities": 2,
  "last_sync": "2024-01-15T10:30:00Z",
  "activities": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Morning Run",
      "activity_type": "run",
      "distance_meters": 5000,
      "duration_seconds": 1800,
      "elevation_gain_meters": 50,
      "start_time": "2024-01-15T06:00:00Z"
    }
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/fitness/sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"full_sync": false}'
```

#### GET /api/fitness/activities
List user's activities.

**Authentication:** Required

**Query Parameters:**
- `activity_type` (optional, enum): Filter by type (run, ride, hike)
- `start_date` (optional, datetime): Activities after this date
- `end_date` (optional, datetime): Activities before this date
- `page` (optional, integer, default=1): Page number
- `page_size` (optional, integer, default=50, max=200): Items per page

**Response:**
```json
{
  "activities": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Morning Run",
      "activity_type": "run",
      "distance_meters": 5000,
      "duration_seconds": 1800,
      "elevation_gain_meters": 50,
      "average_heart_rate": 145,
      "max_heart_rate": 175,
      "average_power": null,
      "start_time": "2024-01-15T06:00:00Z",
      "pace_per_km": "00:06:00",
      "speed_kph": 10.0
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total_items": 142,
    "total_pages": 3
  }
}
```

**Example:**
```bash
curl http://localhost:8000/api/fitness/activities?activity_type=run&page=1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### GET /api/fitness/activities/{activity_id}
Get detailed activity information.

**Authentication:** Required

**Path Parameters:**
- `activity_id` (uuid): Activity identifier

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Morning Run",
  "description": "Easy recovery run",
  "activity_type": "run",
  "distance_meters": 5000,
  "duration_seconds": 1800,
  "elevation_gain_meters": 50,
  "average_heart_rate": 145,
  "max_heart_rate": 175,
  "average_power": null,
  "start_time": "2024-01-15T06:00:00Z",
  "start_location": {
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "route_geometry": {
    "type": "LineString",
    "coordinates": [[-74.0060, 40.7128], [-74.0050, 40.7130]]
  },
  "splits": [
    {
      "kilometer": 1,
      "time_seconds": 360,
      "elevation_gain": 10
    }
  ]
}
```

#### GET /api/fitness/score
Calculate fitness score.

**Authentication:** Required

**Query Parameters:**
- `recalculate` (optional, boolean, default=false): Force recalculation

**Response:**
```json
{
  "score": {
    "total_score": 72.5,
    "grade": "B",
    "components": {
      "vo2max": {
        "value": 48.5,
        "score": 75.0,
        "weight": 0.35
      },
      "volume": {
        "weekly_distance_km": 45.0,
        "score": 70.0,
        "weight": 0.25
      },
      "consistency": {
        "activities_per_week": 4.2,
        "score": 68.0,
        "weight": 0.20
      },
      "intensity": {
        "high_intensity_percentage": 15.0,
        "score": 75.0,
        "weight": 0.20
      }
    },
    "fitness_level": "intermediate",
    "calculated_at": "2024-01-15T10:30:00Z",
    "valid_until": "2024-01-22T10:30:00Z"
  }
}
```

**Example:**
```bash
curl http://localhost:8000/api/fitness/score \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### GET /api/fitness/stats
Get user fitness statistics.

**Authentication:** Required

**Query Parameters:**
- `period` (optional, enum, default=month): Stats period (week, month, year, all_time)

**Response:**
```json
{
  "period": "month",
  "stats": {
    "total_activities": 18,
    "total_distance_km": 180.5,
    "total_duration_hours": 18.5,
    "total_elevation_gain_m": 2450,
    "average_pace_per_km": "00:06:10",
    "by_activity_type": {
      "run": {
        "count": 12,
        "distance_km": 120.0,
        "duration_hours": 12.0
      },
      "ride": {
        "count": 4,
        "distance_km": 50.5,
        "duration_hours": 4.5
      },
      "hike": {
        "count": 2,
        "distance_km": 10.0,
        "duration_hours": 2.0
      }
    }
  }
}
```

---

### Routes

#### POST /api/routes/search
Search for routes near a location.

**Authentication:** Required

**Request Body:**
```json
{
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "activity_type": "hike",
  "radius_km": 50,
  "min_difficulty": 1,
  "max_difficulty": 5,
  "min_distance_km": 5,
  "max_distance_km": 20,
  "limit": 20
}
```

**Response:**
```json
{
  "routes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Bear Mountain Loop",
      "description": "Scenic mountain trail with views",
      "activity_type": "hike",
      "distance_km": 12.5,
      "elevation_gain_m": 450,
      "difficulty": {
        "score": 62.5,
        "level": "moderate"
      },
      "start_location": {
        "latitude": 41.3128,
        "longitude": -74.0060
      },
      "distance_from_search_km": 45.2,
      "estimated_duration_hours": 4.5,
      "features": ["scenic_views", "loop_trail", "dog_friendly"]
    }
  ],
  "count": 12,
  "search_radius_km": 50
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/routes/search \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {"latitude": 40.7128, "longitude": -74.0060},
    "activity_type": "hike",
    "radius_km": 50
  }'
```

#### GET /api/routes/{route_id}
Get detailed route information.

**Authentication:** Required

**Path Parameters:**
- `route_id` (uuid): Route identifier

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Bear Mountain Loop",
  "description": "Scenic mountain trail with panoramic views...",
  "activity_type": "hike",
  "distance_km": 12.5,
  "elevation_gain_m": 450,
  "difficulty": {
    "score": 62.5,
    "level": "moderate",
    "factors": {
      "distance": 50.0,
      "elevation": 45.0,
      "grade": 20.0,
      "technical": 15.0
    }
  },
  "start_location": {
    "latitude": 41.3128,
    "longitude": -74.0060,
    "address": "Bear Mountain State Park, NY"
  },
  "route_geometry": {
    "type": "LineString",
    "coordinates": [...]
  },
  "elevation_profile": [
    {"distance_km": 0.0, "elevation_m": 120},
    {"distance_km": 1.0, "elevation_m": 180},
    {"distance_km": 2.0, "elevation_m": 250}
  ],
  "waypoints": [
    {
      "name": "Scenic Overlook",
      "distance_km": 5.2,
      "elevation_m": 380,
      "description": "Great views of the valley"
    }
  ],
  "features": ["scenic_views", "loop_trail", "dog_friendly"],
  "surface_type": "dirt_trail",
  "estimated_duration_hours": 4.5,
  "best_seasons": ["spring", "fall"],
  "hazards": ["steep_sections", "rocky_terrain"]
}
```

#### GET /api/routes/{route_id}/elevation
Get elevation profile for a route.

**Authentication:** Required

**Path Parameters:**
- `route_id` (uuid): Route identifier

**Query Parameters:**
- `resolution` (optional, integer, default=100): Number of points

**Response:**
```json
{
  "route_id": "550e8400-e29b-41d4-a716-446655440000",
  "total_distance_km": 12.5,
  "elevation_gain_m": 450,
  "elevation_loss_m": 430,
  "min_elevation_m": 120,
  "max_elevation_m": 550,
  "average_grade_percent": 3.6,
  "max_grade_percent": 18.5,
  "profile": [
    {
      "distance_km": 0.0,
      "elevation_m": 120,
      "grade_percent": 0.0
    },
    {
      "distance_km": 0.125,
      "elevation_m": 130,
      "grade_percent": 8.0
    }
  ]
}
```

---

### Route Matching

#### POST /api/matching/compare
Compare user fitness to route difficulty.

**Authentication:** Required

**Request Body:**
```json
{
  "route_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "user_fitness_score": 72.5,
  "route_difficulty_score": 62.5,
  "match": {
    "fitness_gap": -10.0,
    "readiness_status": "ready",
    "training_weeks_needed": 0,
    "recommendation": "You are well-prepared for this route. Your fitness level exceeds the route requirements."
  },
  "details": {
    "user_strengths": [
      "Strong cardiovascular endurance",
      "Good weekly training volume"
    ],
    "user_weaknesses": [
      "Could improve consistency"
    ],
    "route_challenges": [
      "Moderate elevation gain",
      "Technical rocky sections"
    ]
  },
  "suggested_preparation": {
    "recommended_gear": ["hiking_boots", "trekking_poles", "hydration_pack"],
    "training_focus": [],
    "estimated_completion_time_hours": 4.2
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/matching/compare \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"route_id": "550e8400-e29b-41d4-a716-446655440000"}'
```

---

### Training Programs

#### POST /api/training/generate
Generate personalized training program.

**Authentication:** Required

**Request Body:**
```json
{
  "route_id": "550e8400-e29b-41d4-a716-446655440000",
  "target_date": "2024-06-15",
  "current_weekly_volume_km": 30,
  "available_days_per_week": 4
}
```

**Response:**
```json
{
  "program": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "route_id": "550e8400-e29b-41d4-a716-446655440000",
    "route_name": "Bear Mountain Loop",
    "duration_weeks": 8,
    "start_date": "2024-04-20",
    "target_date": "2024-06-15",
    "goal": "Prepare for 12.5km hike with 450m elevation gain",
    "current_fitness_assessment": {
      "fitness_score": 72.5,
      "weekly_volume_km": 30,
      "fitness_level": "intermediate"
    },
    "weekly_sessions": [
      {
        "week": 1,
        "sessions": [
          {
            "day": 1,
            "type": "endurance",
            "activity_type": "run",
            "distance_km": 8,
            "target_heart_rate_zone": "zone_2",
            "description": "Easy aerobic run, focus on maintaining steady pace"
          },
          {
            "day": 3,
            "type": "strength",
            "activity_type": "gym",
            "duration_minutes": 45,
            "description": "Leg strength: squats, lunges, calf raises"
          },
          {
            "day": 5,
            "type": "hills",
            "activity_type": "hike",
            "distance_km": 6,
            "elevation_gain_m": 200,
            "description": "Hill repeats to build climbing strength"
          },
          {
            "day": 7,
            "type": "long",
            "activity_type": "hike",
            "distance_km": 10,
            "description": "Long endurance hike, practice with gear"
          }
        ],
        "weekly_volume_km": 24,
        "focus": "Base building and aerobic endurance"
      }
    ],
    "progression_plan": {
      "weeks_1_to_3": "Build aerobic base, increase volume gradually",
      "weeks_4_to_6": "Add intensity, hill-specific training",
      "weeks_7_to_8": "Taper and maintain fitness"
    },
    "tips": [
      "Gradually increase weekly volume by 10%",
      "Practice with actual gear you'll use",
      "Include strength training for injury prevention"
    ]
  }
}
```

#### GET /api/training/programs
List user's training programs.

**Authentication:** Required

**Query Parameters:**
- `status` (optional, enum): Filter by status (active, completed, planned)

**Response:**
```json
{
  "programs": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "route_name": "Bear Mountain Loop",
      "duration_weeks": 8,
      "start_date": "2024-04-20",
      "target_date": "2024-06-15",
      "status": "active",
      "progress": {
        "current_week": 3,
        "completed_sessions": 8,
        "total_sessions": 32,
        "completion_percentage": 25
      }
    }
  ]
}
```

#### PATCH /api/training/programs/{program_id}/sessions/{session_id}
Mark training session as completed.

**Authentication:** Required

**Path Parameters:**
- `program_id` (uuid): Training program identifier
- `session_id` (uuid): Training session identifier

**Request Body:**
```json
{
  "completed": true,
  "actual_distance_km": 8.2,
  "actual_duration_minutes": 48,
  "notes": "Felt strong, maintained good pace"
}
```

**Response:**
```json
{
  "session": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "completed": true,
    "completed_at": "2024-04-22T18:30:00Z",
    "planned_distance_km": 8.0,
    "actual_distance_km": 8.2,
    "notes": "Felt strong, maintained good pace"
  }
}
```

---

### Itinerary Planning

#### POST /api/itinerary/create
Create adventure itinerary.

**Authentication:** Required

**Request Body:**
```json
{
  "route_id": "550e8400-e29b-41d4-a716-446655440000",
  "planned_date": "2024-06-15T08:00:00Z",
  "group_size": 2,
  "include_weather": true,
  "include_gear": true,
  "include_safety": true
}
```

**Response:**
```json
{
  "itinerary": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "route": {
      "name": "Bear Mountain Loop",
      "distance_km": 12.5,
      "elevation_gain_m": 450
    },
    "planned_date": "2024-06-15T08:00:00Z",
    "readiness_assessment": {
      "fitness_match": "ready",
      "recommendation": "You are well-prepared for this route",
      "estimated_completion_time": "4.5 hours"
    },
    "weather_forecast": {
      "date": "2024-06-15",
      "temperature_celsius": {
        "min": 18,
        "max": 24
      },
      "conditions": "partly_cloudy",
      "precipitation_probability": 10,
      "wind_speed_kph": 12,
      "sunrise": "05:30:00",
      "sunset": "20:15:00",
      "alert": null
    },
    "gear_checklist": {
      "essentials": [
        {"item": "Hiking boots", "reason": "Rocky terrain", "checked": false},
        {"item": "Hydration pack (2L)", "reason": "4.5 hour activity", "checked": false},
        {"item": "Trail map/GPS", "reason": "Navigation", "checked": false}
      ],
      "recommended": [
        {"item": "Trekking poles", "reason": "Steep descents", "checked": false},
        {"item": "Sun protection", "reason": "Exposed sections", "checked": false},
        {"item": "First aid kit", "reason": "Safety", "checked": false}
      ],
      "optional": [
        {"item": "Camera", "reason": "Scenic views", "checked": false}
      ]
    },
    "timeline": [
      {
        "time": "08:00",
        "milestone": "Start at trailhead",
        "distance_km": 0.0,
        "elevation_m": 120
      },
      {
        "time": "09:30",
        "milestone": "Reach scenic overlook",
        "distance_km": 5.2,
        "elevation_m": 380
      },
      {
        "time": "11:00",
        "milestone": "Summit",
        "distance_km": 7.8,
        "elevation_m": 550
      },
      {
        "time": "12:30",
        "milestone": "Return to trailhead",
        "distance_km": 12.5,
        "elevation_m": 120
      }
    ],
    "safety_information": {
      "hazards": [
        {"type": "terrain", "description": "Rocky sections, use caution"},
        {"type": "wildlife", "description": "Bear country, carry bear spray"}
      ],
      "emergency_contacts": {
        "local_ranger": "+1-845-555-0100",
        "emergency_services": "911"
      },
      "cell_coverage": "Limited on trail, good at summit"
    },
    "nutrition_plan": {
      "pre_activity": "Carb-rich breakfast 2 hours before",
      "during_activity": "200-300 calories/hour, electrolytes",
      "post_activity": "Protein within 30 minutes"
    }
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/itinerary/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "route_id": "550e8400-e29b-41d4-a716-446655440000",
    "planned_date": "2024-06-15T08:00:00Z",
    "group_size": 2
  }'
```

#### GET /api/itinerary/list
List user's itineraries.

**Authentication:** Required

**Query Parameters:**
- `upcoming` (optional, boolean): Show only upcoming itineraries
- `page` (optional, integer, default=1): Page number

**Response:**
```json
{
  "itineraries": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "route_name": "Bear Mountain Loop",
      "planned_date": "2024-06-15T08:00:00Z",
      "readiness_status": "ready",
      "weather_summary": "Partly cloudy, 18-24°C",
      "created_at": "2024-04-20T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 5
  }
}
```

---

## Rate Limits

| Endpoint Category | Rate Limit |
|-------------------|------------|
| Authentication | 10 requests/minute |
| Public endpoints | 60 requests/minute |
| Authenticated endpoints | 100 requests/minute |
| Heavy operations (sync, search) | 20 requests/minute |

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705323600
```

## Webhooks (Future)

### Strava Activity Webhook
Receive real-time activity updates from Strava.

**Endpoint:** `/api/webhooks/strava`
**Method:** POST
**Authentication:** Webhook verify token

**Payload:**
```json
{
  "object_type": "activity",
  "object_id": 12345678,
  "aspect_type": "create",
  "owner_id": 87654321,
  "subscription_id": 123456,
  "event_time": 1705323600
}
```

## SDKs & Libraries

### Python Client (Coming Soon)
```python
from fit_ready_iq import Client

client = Client(api_key="your_api_key")
routes = client.routes.search(
    location={"latitude": 40.7128, "longitude": -74.0060},
    activity_type="hike"
)
```

### TypeScript/JavaScript Client
```typescript
import { FitReadyIQClient } from '@fit-ready-iq/client';

const client = new FitReadyIQClient({ apiKey: 'your_api_key' });
const routes = await client.routes.search({
  location: { latitude: 40.7128, longitude: -74.0060 },
  activityType: 'hike'
});
```

## Support

- **API Issues:** api-support@fit-ready-iq.com
- **Documentation:** https://docs.fit-ready-iq.com
- **Status Page:** https://status.fit-ready-iq.com
