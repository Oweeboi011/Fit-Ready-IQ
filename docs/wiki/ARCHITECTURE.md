# Fit-Ready-IQ Architecture

## 1. Overview

This document describes the system architecture of Fit-Ready-IQ, an adventure readiness platform built for mountaineers, hikers, trail runners, and ultra-distance cyclists. The application runs as a Next.js 14 application deployed on Vercel, with Firebase providing persistence and authentication services, and Google Cloud APIs delivering geographic and weather intelligence.

The architecture follows a **server-route pattern** where the Next.js App Router serves both the frontend UI and backend API logic. Secrets and external API calls are handled exclusively in server routes (serverless functions on Vercel), while client-side code handles rendering, user interaction, and direct Google Maps API calls (which use a browser-restricted API key).

---

## 2. System Architecture

### 2.1 High-Level Topology

```mermaid
graph TB
    subgraph Client["Client Layer (Browser)"]
        direction TB
        NextApp["Next.js 14 App Router<br/>(React + TypeScript + Tailwind)"]
        MapsSDK["Google Maps JS SDK<br/>(Maps + Places + Elevation)"]
    end

    subgraph Vercel["Hosting Layer (Vercel)"]
        direction TB
        SSR["Server-Side Rendering<br/>(Pages + Layouts)"]
        SR["Serverless Functions<br/>(API Routes)"]
    end

    subgraph GoogleCloud["Google Cloud Platform"]
        direction TB
        MapsAPI["Maps JavaScript API"]
        PlacesAPI["Places API"]
        ElevationAPI["Elevation API"]
        WeatherAPI["Weather API (Phase 1)"]
    end

    subgraph Firebase["Firebase Platform"]
        direction TB
        Firestore["Cloud Firestore<br/>(Document Database)"]
        FireAuth["Firebase Auth<br/>(Identity - Phase 3)"]
        FireStorage["Cloud Storage<br/>(File Uploads - Phase 3)"]
    end

    subgraph Providers["Fitness Providers"]
        direction TB
        StravaAPI["Strava API<br/>(OAuth 2.0 + Activities)"]
        GPXFiles["GPX File Import<br/>(COROS, Garmin, Komoot)"]
    end

    subgraph AI["AI Services"]
        GeminiAPI["Gemini 1.5 Flash<br/>(Generative AI)"]
    end

    Client -->|HTTPS| Vercel
    NextApp --> MapsSDK
    MapsSDK --> MapsAPI
    MapsSDK --> PlacesAPI
    MapsSDK --> ElevationAPI

    SR -->|Server-side| WeatherAPI
    SR -->|Server-side| GeminiAPI
    SR -->|Server-side| StravaAPI
    SR -->|Server-side| Firestore
    SR -->|Server-side| FireAuth
```

### 2.2 Request Flow Architecture

```mermaid
sequenceDiagram
    participant Browser as User Browser
    participant Vercel as Vercel Edge/Functions
    participant Google as Google Cloud APIs
    participant Firebase as Firebase
    participant Strava as Strava API
    participant Gemini as Gemini API

    Note over Browser,Gemini: Page Load Flow
    Browser->>Vercel: GET / (initial page load)
    Vercel-->>Browser: SSR HTML + JS bundle
    Browser->>Google: Maps JS API (tiles + markers)
    Browser->>Google: Places textSearch (mountains)
    Browser->>Google: Places nearbySearch (routes, campsites)
    Browser->>Google: Elevation batch (up to 512 locations)
    Google-->>Browser: Geographic data

    Note over Browser,Gemini: Chat Flow
    Browser->>Vercel: POST /api/chat
    Vercel->>Firebase: Check/create session
    Vercel->>Gemini: generateContent()
    Gemini-->>Vercel: AI response
    Vercel->>Firebase: Persist message
    Vercel-->>Browser: JSON response

    Note over Browser,Gemini: Strava Flow
    Browser->>Vercel: POST /api/strava/exchange
    Vercel->>Strava: Token exchange (code -> tokens)
    Strava-->>Vercel: Access + refresh tokens
    Vercel-->>Browser: Token payload
    Browser->>Vercel: GET /api/strava/activities
    Vercel->>Strava: GET /athlete/activities
    Strava-->>Vercel: Activity list
    Vercel-->>Browser: Activities JSON
```

---

## 3. Frontend Architecture

### 3.1 Module Boundaries

```mermaid
graph TD
    subgraph Pages["App Router (app/)"]
        Page["page.tsx<br/>(Orchestration Layer)"]
        Layout["layout.tsx<br/>(Global Layout)"]
        AuthCallback["auth/callback/strava<br/>(OAuth Redirect)"]
    end

    subgraph Components["Components (components/)"]
        MapView["MapView.tsx<br/>(Google Maps Rendering)"]
        Details["DetailsModal.tsx<br/>(Route/Mountain Details)"]
        Filter["RouteFilter.tsx<br/>(Search + Filters)"]
        Connect["ConnectDevicesModal.tsx<br/>(Strava + GPX Import)"]
        Chat["ChatBot.tsx<br/>(AI Assistant UI)"]
    end

    subgraph Lib["Libraries (lib/)"]
        ActivityTypes["activityTypes.ts<br/>(Type Definitions)"]
        GPXParser["gpxParser.ts<br/>(GPX File Parsing)"]
        PolyDecode["polylineDecoder.ts<br/>(Polyline Decoding)"]
        FireAdmin["firebaseAdmin.ts<br/>(Admin SDK Singleton)"]
    end

    subgraph ServerRoutes["Server Routes (app/api/)"]
        ChatAPI["/api/chat<br/>(Gemini + Firestore)"]
        WeatherAPI["/api/weather<br/>(Weather + Cache)"]
        StravaExchange["/api/strava/exchange<br/>(OAuth)"]
        StravaActivities["/api/strava/activities<br/>(Data Fetch)"]
        FirebaseHealth["/api/integrations/firebase<br/>(Health Check)"]
    end

    Page --> MapView
    Page --> Details
    Page --> Filter
    Page --> Connect
    Page --> Chat

    Chat --> ChatAPI
    Details --> WeatherAPI
    Connect --> StravaExchange
    Connect --> StravaActivities

    MapView --> PolyDecode
    Connect --> GPXParser
    Connect --> ActivityTypes
    ChatAPI --> FireAdmin
    FirebaseHealth --> FireAdmin
```

### 3.2 Component Responsibilities

| Component | Responsibility | Key Dependencies |
| --- | --- | --- |
| `page.tsx` | State orchestration, data fetching coordination, layout composition. Manages map center, selected markers, filter state, and modal visibility. | All components, Google Maps hooks |
| `MapView.tsx` | Renders Google Maps instance with custom markers (mountains, routes, campsites). Handles zoom, pan, marker click events. | `@react-google-maps/api`, polylineDecoder |
| `DetailsModal.tsx` | Displays detailed information for selected route/mountain/campsite including elevation profiles, photos, Strava segments, gear recommendations, and weather data. | Google Elevation API, weather data |
| `RouteFilter.tsx` | Provides filtering controls for activity type, difficulty, distance range, and elevation gain. Emits filter state changes to parent. | None (pure UI) |
| `ConnectDevicesModal.tsx` | Manages Strava OAuth flow, GPX file drag-and-drop import, and activity history display with source badges. | Strava routes, GPX parser |
| `ChatBot.tsx` | Conversational AI interface with message history, typing indicators, and session management. | /api/chat route |

### 3.3 State Management Strategy

```mermaid
flowchart TD
    subgraph ClientState["Client-Side State (React useState/useRef)"]
        MapState["Map center, zoom, selected marker"]
        FilterState["Activity type, difficulty, distance filters"]
        ModalState["Modal visibility, selected detail item"]
        ChatState["Chat messages, session ID, loading state"]
        ActivityState["Synced activities, connected devices"]
    end

    subgraph ServerState["Server-Side State (Firestore)"]
        ChatSessions["Chat sessions + message history"]
        WeatherCache["Weather forecast cache (TTL-based)"]
        UserProfiles["User profiles (Phase 3)"]
        SavedRoutes["Saved routes + favorites (Phase 3)"]
    end

    subgraph ExternalState["External State (APIs)"]
        GoogleData["Places, Elevation, Weather data"]
        StravaData["Activities, athlete stats"]
    end

    ClientState -->|Persist on action| ServerState
    ExternalState -->|Fetch on demand| ClientState
```

### 3.4 Design Conventions

- **Palette**: All Tailwind CSS classes use the `slate-*` color scale. No `gray-*` classes are permitted anywhere in the codebase.
- **Icons**: Lucide React icons, imported individually (tree-shaking friendly).
- **TypeScript**: Strict mode enabled. No untyped `any` without documented justification.
- **Interface Alignment**: The `Mountain` interface uses `mountain_type: string` in both `page.tsx` and `MapView.tsx` for consistency.
- **Error Handling**: `console.error` only for caught exceptions. No `console.log` in production code.

---

## 4. Server Route Architecture

### 4.1 Route Design Principles

All server routes follow these principles:

1. **Secret Isolation** -- API keys and service account credentials never reach the browser.
2. **Validation First** -- Every request is validated before processing (payload shape, required fields).
3. **Graceful Degradation** -- External API failures return structured error responses, never crash the route.
4. **Node Runtime** -- All routes that use Firebase Admin SDK are forced to Node.js runtime (not Edge) due to native module requirements.

### 4.2 Route Catalog

```mermaid
graph LR
    subgraph Active["Active Routes"]
        Chat["POST /api/chat<br/>Gemini + Firestore"]
        StravaEx["POST /api/strava/exchange<br/>OAuth Token Exchange"]
        StravaAct["GET /api/strava/activities<br/>Activity Retrieval"]
        FBHealth["GET /api/integrations/firebase<br/>Health Check"]
    end

    subgraph Planned["Planned Routes"]
        Weather["GET /api/weather<br/>Weather + Alerts (Phase 1)"]
        Readiness["POST /api/readiness<br/>Fitness Scoring (Phase 4)"]
        UserAPI["CRUD /api/user/*<br/>Profile Management (Phase 3)"]
    end

    Chat --> Gemini["Gemini API"]
    Chat --> FS1["Firestore"]
    StravaEx --> Strava["Strava API"]
    StravaAct --> Strava
    FBHealth --> FS2["Firestore"]
    Weather --> GW["Google Weather API"]
    Weather --> FS3["Firestore Cache"]
```

### 4.3 Chat Route Flow

```mermaid
flowchart TD
    A[POST /api/chat] --> B{Validate payload}
    B -->|Invalid| C[Return 400]
    B -->|Valid| D{GEMINI_API_KEY set?}
    D -->|No| E[Return 503]
    D -->|Yes| F[Resolve session ID]
    F --> G[Call Gemini generateContent]
    G -->|Error| H[Return 502]
    G -->|Success| I{Firebase configured?}
    I -->|Yes| J[Persist to Firestore]
    I -->|No| K[Skip persistence]
    J --> L[Return response + sessionId]
    K --> L
```

### 4.4 Weather Route Flow (Phase 1)

```mermaid
flowchart TD
    A["GET /api/weather?lat=X&lng=Y&persona=Z"] --> B{Validate params}
    B -->|Invalid| C[Return 400]
    B -->|Valid| D[Check Firestore weather_cache]
    D -->|Fresh data exists| E[Return cached forecast]
    D -->|Stale or missing| F[Call Google Weather API]
    F -->|Error| G[Return fallback/error]
    F -->|Success| H[Store in Firestore cache]
    H --> I[Apply persona-specific alerts]
    I --> J[Return forecast + alerts]
```

---

## 5. Data Architecture

### 5.1 Firestore Data Model

```mermaid
erDiagram
    USERS {
        string uid PK
        string persona
        string fitness_level
        number max_heart_rate
        number weekly_volume_km
        number weekly_elevation_m
        object strava_tokens
        object preferences
        timestamp created_at
        timestamp updated_at
    }

    ACTIVITIES {
        string id PK
        string user_id FK
        string source
        string sport_type
        number distance_km
        number elevation_gain_m
        number moving_time_s
        number avg_heartrate
        string polyline
        timestamp start_date
    }

    SAVED_ROUTES {
        string id PK
        string user_id FK
        string place_id
        string name
        object coordinates
        string activity_type
        number difficulty
        number distance_km
        number elevation_gain_m
        timestamp saved_at
    }

    CHAT_SESSIONS {
        string session_id PK
        string user_id FK
        string source
        timestamp updated_at
    }

    MESSAGES {
        string msg_id PK
        string session_id FK
        array messages
        string assistantReply
        timestamp created_at
    }

    WEATHER_CACHE {
        string place_id PK
        number lat
        number lng
        object forecast
        array alerts
        timestamp fetched_at
        number ttl_minutes
    }

    USERS ||--o{ ACTIVITIES : has
    USERS ||--o{ SAVED_ROUTES : saves
    USERS ||--o{ CHAT_SESSIONS : owns
    CHAT_SESSIONS ||--o{ MESSAGES : contains
```

### 5.2 Data Flow Patterns

| Pattern | Description | Example |
| --- | --- | --- |
| **Client-direct** | Browser calls Google API directly using browser-restricted key | Maps tiles, Places search, Elevation batch |
| **Server-proxy** | Browser calls Next.js route, which calls external API with server secret | Strava activities, Gemini chat |
| **Cache-through** | Server checks Firestore cache, calls external API if stale, caches result | Weather forecasts (60-min TTL) |
| **Persist-on-action** | Server writes to Firestore as side-effect of processing | Chat message persistence |

---

## 6. Configuration Architecture

### 6.1 Environment Variable Flow

```mermaid
flowchart LR
    subgraph Developer["Developer Machine"]
        EnvLocal[".env.local"]
    end

    subgraph Vercel["Vercel Platform"]
        EnvVars["Project Settings<br/>Environment Variables"]
    end

    subgraph Runtime["Next.js Runtime"]
        Public["NEXT_PUBLIC_*<br/>(Bundled into client JS)"]
        Server["Server-only vars<br/>(Available in routes only)"]
    end

    EnvLocal -->|Local dev| Runtime
    EnvVars -->|Production| Runtime
    Public -->|Build time| Browser["Client Bundle"]
    Server -->|Runtime only| Routes["Server Routes"]
```

### 6.2 Variable Catalog

| Variable | Scope | Required | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Client (bundled) | Yes | Google Maps JS API key (browser-restricted) |
| `GOOGLE_WEATHER_API_KEY` | Server only | Phase 1 | Google Weather API key (server-restricted) |
| `GEMINI_API_KEY` | Server only | Yes | Gemini generative AI API key |
| `FIREBASE_PROJECT_ID` | Server only | Yes | GCP/Firebase project identifier |
| `FIREBASE_SERVICE_ACCOUNT_KEY_JSON` | Server only | Recommended | Full service account JSON string |
| `FIREBASE_CLIENT_EMAIL` | Server only | Alternative | Service account email |
| `FIREBASE_PRIVATE_KEY` | Server only | Alternative | Service account private key |
| `STRAVA_CLIENT_ID` | Server only | Yes | Strava OAuth application client ID |
| `STRAVA_CLIENT_SECRET` | Server only | Yes | Strava OAuth application client secret |

---

## 7. Local Development Architecture

### 7.1 Docker Compose Topology

```mermaid
graph TB
    subgraph DockerCompose["Docker Compose (local dev)"]
        Emulators["Firebase Emulator Suite"]
        FirestoreEmu["Firestore Emulator<br/>Port 8080"]
        AuthEmu["Auth Emulator<br/>Port 9099"]
        StorageEmu["Storage Emulator<br/>Port 9199"]
        EmulatorUI["Emulator UI<br/>Port 4000"]
        Backend["FastAPI Backend<br/>Port 8000<br/>(Python 3.11+)"]
    end

    subgraph Local["Host Machine"]
        Frontend["Next.js Dev Server<br/>Port 4790"]
    end

    Frontend -->|Firestore calls| FirestoreEmu
    Frontend -->|Auth calls| AuthEmu
    Backend -->|DB/Cache| Emulators
    EmulatorUI -->|Admin view| Emulators
```

### 7.2 Backend Architecture (Local Only)

The Python FastAPI backend exists for local development experimentation. It is **not deployed** to production. It follows Clean Architecture principles:

```mermaid
graph TD
    subgraph EntryPoint["Entry Point"]
        Main["main.py<br/>(FastAPI app wiring)"]
    end

    subgraph Config["Configuration Layer"]
        Settings["config/settings.py<br/>(pydantic-settings, lru_cache)"]
    end

    subgraph Domain["Domain Layer"]
        Entities["domain/entities/"]
        Interfaces["domain/interfaces/"]
        Services["domain/services/"]
        ValueObjects["domain/value_objects/"]
    end

    subgraph Infrastructure["Infrastructure Layer"]
        APIClients["api_clients/<br/>(Strava, Garmin, COROS, Komoot, Google Maps)"]
        Database["database/<br/>(connection.py, models.py)"]
    end

    Main --> Config
    Main --> Infrastructure
    Infrastructure -->|implements| Interfaces
    Services -->|uses| Interfaces
    Domain -.->|NO imports from| Infrastructure
```

**Layer Rules:**
- Domain layer has zero imports from Infrastructure.
- Infrastructure implements Domain interfaces only.
- Config is loaded via `get_settings()` with `@lru_cache` -- never import settings directly.
- Entry point (`main.py`) handles only FastAPI app wiring -- no business logic.

---

## 8. Planned Architecture Evolution

### 8.1 Phase Roadmap

```mermaid
gantt
    title Architecture Evolution Phases
    dateFormat YYYY-MM
    section Foundation
        Phase 0 - Hardening        :done, p0, 2026-06, 2026-07
    section Intelligence
        Phase 1 - Weather API      :active, p1, 2026-07, 2026-08
        Phase 2 - Persona Routing  :p2, 2026-08, 2026-09
    section Platform
        Phase 3 - Auth + Profiles  :p3, 2026-09, 2026-10
        Phase 4 - Readiness Engine :p4, 2026-10, 2026-11
    section Optimization
        Phase 5 - Smart AI         :p5, 2026-11, 2026-12
        Phase 6 - Performance      :p6, 2026-12, 2027-01
```

### 8.2 Target State Architecture (Phase 6)

```mermaid
graph TB
    subgraph Client["Client Layer"]
        App["Next.js 14 App<br/>(Code-split, optimized)"]
        Hooks["Custom Hooks<br/>(usePlacesData, useActivities,<br/>useWeather, useReadiness)"]
    end

    subgraph Vercel["Vercel Platform"]
        Pages["SSR Pages"]
        ChatRoute["/api/chat<br/>(Context-grounded)"]
        WeatherRoute["/api/weather<br/>(Edge-cached)"]
        ReadinessRoute["/api/readiness<br/>(Scoring engine)"]
        UserRoute["/api/user/*<br/>(CRUD + auth)"]
        StravaRoute["/api/strava/*<br/>(Token lifecycle)"]
    end

    subgraph Services["External Services"]
        Gemini["Gemini<br/>(Grounded prompts)"]
        Google["Google APIs<br/>(Maps + Weather)"]
        Strava["Strava API"]
    end

    subgraph Firebase["Firebase"]
        FS["Firestore<br/>(Indexed collections)"]
        Auth["Firebase Auth"]
        Storage["Cloud Storage"]
    end

    Client --> Vercel
    Hooks --> App
    ChatRoute --> Gemini
    ChatRoute --> FS
    WeatherRoute --> Google
    WeatherRoute --> FS
    ReadinessRoute --> FS
    UserRoute --> Auth
    UserRoute --> FS
    StravaRoute --> Strava
    StravaRoute --> FS
```

---

## 9. Security Architecture

### 9.1 Trust Boundaries

```mermaid
flowchart TD
    subgraph Trusted["Trusted Zone (Server-Side)"]
        Routes["API Routes<br/>(Serverless Functions)"]
        Secrets["Environment Variables<br/>(API Keys, SA Credentials)"]
    end

    subgraph SemiTrusted["Semi-Trusted Zone (Client)"]
        Browser["User Browser<br/>(Public API key only)"]
    end

    subgraph Untrusted["Untrusted Zone (External)"]
        APIs["Third-Party APIs<br/>(Strava, Google, Gemini)"]
    end

    Browser -->|HTTPS only| Routes
    Routes -->|Authenticated| APIs
    Secrets -.->|Never exposed to| Browser
```

### 9.2 Key Principles

1. **No secrets in client bundle** -- Only `NEXT_PUBLIC_*` variables reach the browser, and these are browser-restricted API keys.
2. **Server-side token management** -- OAuth tokens (Strava) are exchanged server-side. Client stores only short-lived access tokens.
3. **Input validation** -- All server routes validate request payloads before processing.
4. **Structured errors** -- External API failures return controlled error responses, never raw upstream errors.

---

## 10. Performance Architecture

### 10.1 Optimization Strategies

| Strategy | Implementation | Impact |
| --- | --- | --- |
| **Batch Elevation** | `getElevationForLocations()` with up to 512 points per request | Reduces API calls by 90%+ |
| **Places Deduplication** | Merge results from textSearch + nearbySearch by place_id | Prevents duplicate markers |
| **Weather Caching** | Firestore TTL cache (60-min default) | Eliminates redundant Weather API calls |
| **Scale-to-Zero** | Vercel serverless (no always-on compute) | Zero cost when idle |
| **Code Splitting** | Dynamic imports for heavy modals (Phase 6) | Smaller initial bundle |
| **Image Optimization** | `next/image` for all media (Phase 0 migration) | WebP, srcset, lazy loading |

### 10.2 API Cost Management

```mermaid
flowchart TD
    A[User Action] --> B{Data in cache?}
    B -->|Yes| C[Serve from cache]
    B -->|No| D[Call external API]
    D --> E[Cache result in Firestore]
    E --> F[Return to user]
    C --> F

    style C fill:#d1fae5
    style D fill:#fef3c7
```

**Cache Locations:**
- Weather data: Firestore `weather_cache/{place_id}` with 60-min TTL
- Places data: In-memory during session (React state)
- Elevation data: Computed once per marker set, held in component state
- Chat sessions: Firestore `chat_sessions/{id}` (permanent)
