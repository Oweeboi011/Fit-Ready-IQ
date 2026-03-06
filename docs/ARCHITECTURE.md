# Architecture Documentation

## System Overview

Fit-Ready-IQ implements Clean Architecture with SOLID principles, ensuring separation of concerns, testability, and maintainability. The system is designed as a distributed application with a Python FastAPI backend and Next.js frontend.

## Clean Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                            │
│  Handles HTTP requests/responses, validation, authentication     │
│                                                                   │
│  FastAPI:                         Next.js:                       │
│  - Routes                         - Pages/App Router             │
│  - Controllers                    - Components                   │
│  - Middleware                     - API Client                   │
│  - Request/Response Schemas       - State Management             │
└────────────────────────┬──────────────────────────────────────┬─┘
                         │                                      │
                         │ Dependencies point INWARD            │
                         │                                      │
┌────────────────────────▼──────────────────────────────────────▼─┐
│                   APPLICATION LAYER                              │
│  Contains application-specific business rules and use cases      │
│                                                                   │
│  - Use Cases (CalculateFitnessScore, MatchRouteToUser)          │
│  - Application Services (FitnessAnalysisService)                 │
│  - DTOs and Mappers                                              │
│  - Orchestrates domain objects                                   │
└────────────────────────┬──────────────────────────────────────┬─┘
                         │                                      │
                         │ Core business logic                  │
                         │                                      │
┌────────────────────────▼──────────────────────────────────────▼─┐
│                      DOMAIN LAYER                                │
│  Pure business logic - no dependencies on external frameworks    │
│                                                                   │
│  - Entities (User, Activity, Route, TrainingProgram)            │
│  - Value Objects (FitnessScore, RouteDifficulty, Coordinates)   │
│  - Domain Services (FitnessScoreCalculator)                      │
│  - Interfaces (IRepository, IAPIClient, ICacheService)           │
│  - Business Rules and Invariants                                 │
└────────────────────────┬──────────────────────────────────────┬─┘
                         │                                      │
                         │ Implementations of interfaces        │
                         │                                      │
┌────────────────────────▼──────────────────────────────────────▼─┐
│                 INFRASTRUCTURE LAYER                             │
│  All external concerns and implementation details                │
│                                                                   │
│  - Database (SQLAlchemy, PostgreSQL, PostGIS)                   │
│  - External APIs (Strava, Mapbox, OpenWeather)                  │
│  - Caching (Redis)                                               │
│  - File System Access                                            │
│  - Configuration Management                                      │
└──────────────────────────────────────────────────────────────────┘
```

## SOLID Principles Implementation

### Single Responsibility Principle (SRP)
Each class has one reason to change:
- `FitnessScoreCalculator`: Only calculates fitness scores
- `RouteDifficultyCalculator`: Only calculates route difficulty
- `StravaAPIClient`: Only handles Strava API communication
- `UserRepository`: Only manages user persistence

### Open/Closed Principle (OCP)
Open for extension, closed for modification:
```python
# Abstract interface
class IFitnessPlatformClient(ABC):
    @abstractmethod
    async def get_activities(...): pass

# Concrete implementations can be added without modifying existing code
class StravaAPIClient(IFitnessPlatformClient): ...
class GarminAPIClient(IFitnessPlatformClient): ...  # Future
class CorosAPIClient(IFitnessPlatformClient): ...   # Future
```

### Liskov Substitution Principle (LSP)
Subtypes are substitutable for base types:
```python
# Any IFitnessPlatformClient can be used interchangeably
async def sync_activities(client: IFitnessPlatformClient):
    activities = await client.get_activities(token)
    # Works with any concrete implementation
```

### Interface Segregation Principle (ISP)
Clients don't depend on methods they don't use:
```python
# Separate focused interfaces
class IActivityProvider(ABC): ...
class IAthleteStatsProvider(ABC): ...
class IRouteProvider(ABC): ...

# Clients implement only needed interfaces
```

### Dependency Inversion Principle (DIP)
High-level modules don't depend on low-level modules:
```python
# High-level use case depends on abstraction
class CalculateFitnessScoreUseCase:
    def __init__(
        self,
        activity_repo: IActivityRepository,  # Abstract interface
        user_repo: IUserRepository            # Abstract interface
    ):
        self.activity_repo = activity_repo
        self.user_repo = user_repo
```

## Design Patterns

### 1. Repository Pattern
Abstracts data persistence:
```python
class IUserRepository(ABC):
    @abstractmethod
    async def get_by_id(self, id: UUID) -> Optional[User]: pass
    
    @abstractmethod
    async def save(self, user: User) -> User: pass

class UserRepository(IUserRepository):
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def get_by_id(self, id: UUID) -> Optional[User]:
        result = await self.session.execute(
            select(UserModel).where(UserModel.id == id)
        )
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None
```

### 2. Strategy Pattern
Different algorithms for fitness scoring:
```python
class FitnessScoringStrategy(ABC):
    @abstractmethod
    def calculate(self, activities: list[Activity]) -> float: pass

class VO2MaxStrategy(FitnessScoringStrategy): ...
class TrainingLoadStrategy(FitnessScoringStrategy): ...
```

### 3. Factory Pattern
Create appropriate API clients:
```python
class FitnessPlatformClientFactory:
    @staticmethod
    def create(platform: str) -> IFitnessPlatformClient:
        if platform == "strava":
            return StravaAPIClient(...)
        elif platform == "garmin":
            return GarminAPIClient(...)
        raise ValueError(f"Unsupported platform: {platform}")
```

### 4. Adapter Pattern
Normalize external API responses:
```python
class StravaActivityAdapter:
    @staticmethod
    def to_activity_entity(strava_data: dict) -> Activity:
        return Activity(
            external_id=str(strava_data["id"]),
            platform="strava",
            activity_type=strava_data["type"].lower(),
            distance=strava_data["distance"],
            # ... map Strava format to domain entity
        )
```

### 5. Observer Pattern (Webhooks)
React to external events:
```python
class StravaWebhookHandler:
    def __init__(self, sync_service: ActivitySyncService):
        self.sync_service = sync_service
    
    async def handle_activity_created(self, event: dict):
        # Triggered when Strava sends webhook
        await self.sync_service.sync_single_activity(...)
```

### 6. Circuit Breaker Pattern
Handle external API failures:
```python
class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5):
        self.failure_count = 0
        self.state = "closed"  # closed, open, half_open
    
    async def call(self, func, *args, **kwargs):
        if self.state == "open":
            raise CircuitBreakerOpenError()
        
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise
```

## Data Flow

### User Authentication Flow
```
User Browser
    │
    │ 1. Click "Connect Strava"
    │
    ▼
Next.js Frontend
    │
    │ 2. Redirect to Strava OAuth
    │
    ▼
Strava OAuth Server
    │
    │ 3. User authorizes, returns code
    │
    ▼
Next.js Callback Handler
    │
    │ 4. POST /api/auth/strava/callback {code}
    │
    ▼
FastAPI Backend
    │
    │ 5. Exchange code for tokens
    │
    ▼
StravaAPIClient
    │
    │ 6. Store encrypted tokens in DB
    │
    ▼
PostgreSQL Database
    │
    │ 7. Return JWT session token
    │
    ▼
Next.js Frontend (stores JWT)
```

### Activity Sync Flow
```
Next.js Dashboard
    │
    │ 1. Request activity sync
    │
    ▼
FastAPI /api/fitness/sync
    │
    │ 2. Trigger background job
    │
    ▼
SyncActivitiesUseCase
    │
    ├─► 3. Check cache (Redis)
    │   │
    │   └─► If cached, return immediately
    │
    ├─► 4. Fetch from Strava
    │   │
    │   ▼
    │   StravaAPIClient
    │       │
    │       └─► Rate limiting check
    │
    ├─► 5. Transform to domain entities
    │   │
    │   ▼
    │   StravaActivityAdapter
    │
    ├─► 6. Save to database
    │   │
    │   ▼
    │   ActivityRepository
    │
    └─► 7. Cache results (Redis)
        │
        └─► Return synced activities
```

### Route Matching Flow
```
User selects route
    │
    ▼
Frontend: GET /api/matching/compare?route_id=...
    │
    ▼
RouteMatchingController
    │
    ├─► 1. Get user's recent activities
    │   │
    │   ▼
    │   ActivityRepository
    │
    ├─► 2. Calculate fitness score
    │   │
    │   ▼
    │   FitnessScoreCalculator (Domain Service)
    │       │
    │       ├─► VO2max estimation
    │       ├─► Training volume
    │       ├─► Consistency analysis
    │       └─► Intensity distribution
    │
    ├─► 3. Get route details
    │   │
    │   ▼
    │   RouteRepository
    │
    ├─► 4. Calculate route difficulty
    │   │
    │   ▼
    │   RouteDifficultyCalculator (Domain Service)
    │       │
    │       ├─► Distance factor
    │       ├─► Elevation factor
    │       ├─► Grade factor
    │       └─► Technical factor
    │
    └─► 5. Match fitness to difficulty
        │
        ▼
        RouteMatchingService (Domain Service)
            │
            ├─► Compare scores
            ├─► Determine readiness
            ├─► Calculate training weeks
            └─► Generate recommendation
            │
            ▼
        Return RouteMatch result
```

## Database Schema

### Core Tables
```
users
├─ id (UUID, PK)
├─ email (unique)
├─ username
├─ strava_id (unique, indexed)
├─ strava_access_token (encrypted)
├─ strava_refresh_token (encrypted)
├─ fitness_level
├─ max_heart_rate
└─ timestamps

activities
├─ id (UUID, PK)
├─ user_id (FK → users)
├─ external_id (indexed)
├─ platform
├─ activity_type (indexed)
├─ start_date (indexed)
├─ distance, duration
├─ elevation_gain, elevation_loss
├─ average_heart_rate, max_heart_rate
├─ start_location (POINT geometry)
└─ route_geometry (LINESTRING geometry)

routes
├─ id (UUID, PK)
├─ name
├─ activity_type (indexed)
├─ distance, elevation_gain
├─ max_grade, avg_grade
├─ technical_rating
├─ start_location (POINT geometry, spatially indexed)
├─ route_geometry (LINESTRING geometry)
├─ difficulty_score (indexed)
└─ timestamps

training_programs
├─ id (UUID, PK)
├─ user_id (FK → users)
├─ route_id (FK → routes)
├─ start_date, end_date
├─ current_fitness_score
├─ target_fitness_score
└─ status

training_sessions
├─ id (UUID, PK)
├─ program_id (FK → training_programs)
├─ week, session_number
├─ session_type
├─ duration_minutes
├─ intensity_zone
└─ completed, completed_at

itineraries
├─ id (UUID, PK)
├─ user_id (FK → users)
├─ route_id (FK → routes)
├─ planned_date (indexed)
├─ readiness_status
├─ fitness_score, route_difficulty
├─ weather_forecast (JSON)
├─ gear_checklist (JSON)
└─ safety_alerts (TEXT[])
```

### Spatial Indexes
```sql
-- PostGIS spatial index for fast proximity queries
CREATE INDEX idx_routes_start_location 
ON routes USING GIST (start_location);

-- Find routes within 50km of coordinates
SELECT * FROM routes
WHERE ST_DWithin(
    start_location,
    ST_MakePoint(longitude, latitude)::geography,
    50000  -- 50km in meters
);
```

## API Architecture

### RESTful Endpoints
```
/api/auth
├─ POST   /strava/authorize      # Initiate OAuth
├─ POST   /strava/callback       # Handle callback
├─ POST   /refresh               # Refresh JWT
└─ POST   /logout                # End session

/api/fitness
├─ GET    /profile               # User fitness profile
├─ POST   /sync                  # Sync activities
├─ GET    /activities            # List activities
├─ GET    /activities/{id}       # Activity details
├─ GET    /score                 # Current fitness score
└─ POST   /upload                # Upload FIT/GPX file

/api/routes
├─ GET    /search                # Search nearby routes
├─ GET    /search/bounds         # Search by bounding box
├─ GET    /{id}                  # Route details
├─ GET    /{id}/difficulty       # Route difficulty
└─ GET    /{id}/elevation        # Elevation profile

/api/matching
├─ POST   /compare               # Compare fitness to route
└─ GET    /recommendations       # Get route recommendations

/api/training
├─ POST   /generate              # Generate training program
├─ GET    /programs              # List user's programs
├─ GET    /programs/{id}         # Program details
├─ PATCH  /sessions/{id}         # Mark session complete
└─ DELETE /programs/{id}         # Delete program

/api/itinerary
├─ POST   /create                # Create itinerary
├─ GET    /list                  # User's itineraries
├─ GET    /{id}                  # Itinerary details
├─ GET    /weather               # Weather forecast
└─ GET    /gear                  # Gear recommendations
```

### Response Format
```json
{
  "success": true,
  "data": {
    // Response payload
  },
  "meta": {
    "timestamp": "2026-03-07T12:00:00Z",
    "request_id": "uuid"
  }
}

// Error response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {...}
  }
}
```

## Security Architecture

### Authentication Flow
1. **OAuth 2.0**: Strava integration with PKCE
2. **JWT Tokens**: Internal session management
3. **Token Encryption**: AES-256 for stored tokens
4. **Key Vault**: Azure Key Vault for production secrets

### Authorization
- **Role-based**: User, Admin roles
- **Resource ownership**: Users can only access their data
- **API rate limiting**: Per-user and global limits

### Data Protection
- **Encryption at rest**: Database encryption
- **Encryption in transit**: TLS 1.3
- **Password hashing**: Bcrypt with salt
- **Token expiration**: Short-lived access tokens

## Performance Optimizations

### Caching Strategy
```
Layer 1: Browser Cache (static assets)
Layer 2: Redis Cache (API responses)
    - Activities: 15 minutes TTL
    - Routes: 24 hours TTL
    - Weather: 1 hour TTL
Layer 3: Database Query Cache
Layer 4: CDN (static frontend assets)
```

### Database Optimizations
- **Spatial indexes**: PostGIS GIST indexes
- **Compound indexes**: Common query patterns
- **Connection pooling**: SQLAlchemy async pool
- **Read replicas**: Future scaling

### API Rate Limiting
```python
# Per-user limits
60 requests/minute
1000 requests/hour

# Global limits
10000 requests/minute (burst)

# Circuit breaker for external APIs
Max 5 failures before opening circuit
30 second recovery time
```

## Monitoring & Observability

### Metrics
- Request latency (p50, p95, p99)
- Error rates by endpoint
- Database query performance
- External API response times
- Cache hit ratios

### Logging
```python
# Structured logging with context
logger.info(
    "activity_synced",
    user_id=user_id,
    platform="strava",
    activity_count=count,
    duration_ms=duration
)
```

### Health Checks
```
/health
├─ Database connectivity
├─ Redis connectivity
├─ External API availability
└─ System resources
```

## Scalability Considerations

### Horizontal Scaling
- **Stateless backend**: Scale API servers independently
- **Shared cache**: Redis cluster
- **Database connection pooling**: Manage connections efficiently

### Vertical Scaling
- **Optimize queries**: Use indexes and query optimization
- **Async operations**: Non-blocking I/O with FastAPI
- **Background jobs**: Celery for long-running tasks (future)

### Data Partitioning
- **User sharding**: Partition by user_id for activities
- **Geographic sharding**: Partition routes by region
- **Time-based archiving**: Move old activities to cold storage

## Testing Strategy

### Unit Tests
- Domain logic (pure business rules)
- Value objects
- Service calculations

### Integration Tests
- Repository operations
- API client interactions
- Database transactions

### End-to-End Tests
- Complete user workflows
- API endpoint testing
- Frontend interaction

### Test Coverage Goals
- Domain layer: 95%+
- Application layer: 90%+
- Infrastructure layer: 80%+
- Overall: 85%+

---

This architecture ensures maintainability, testability, and scalability while adhering to industry best practices and clean code principles.
