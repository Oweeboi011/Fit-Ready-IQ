# Troubleshooting Guide

## Common Issues and Solutions

### Development Environment

#### Docker Issues

##### Container fails to start with "port already in use"

**Symptom:**
```
Error starting userland proxy: listen tcp4 0.0.0.0:8000: bind: address already in use
```

**Solution:**
```powershell
# Find process using port 8000
Get-NetTCPConnection -LocalPort 8000 | Select-Object -Property OwningProcess

# Stop the process
Stop-Process -Id <PID> -Force

# Or change port in docker-compose.yml
ports:
  - "8001:8000"  # Changed from 8000:8000
```

##### PostgreSQL container exits immediately

**Symptom:**
```
postgres_1 exited with code 1
```

**Solution:**
```powershell
# Check logs
docker-compose logs postgres

# Common causes:
# 1. Permission issues with volume
docker-compose down -v
docker-compose up -d

# 2. Corrupted data directory
docker volume rm fit-ready-iq_postgres_data
docker-compose up -d
```

##### PostGIS extension not available

**Symptom:**
```
ERROR: could not open extension control file "postgis.control"
```

**Solution:**
```sql
-- Verify PostGIS installation
SELECT PostGIS_Version();

-- If not installed, enable it
CREATE EXTENSION IF NOT EXISTS postgis;

-- Check available extensions
SELECT * FROM pg_available_extensions WHERE name LIKE 'postgis%';
```

Ensure docker-compose.yml uses PostGIS image:
```yaml
postgres:
  image: postgis/postgis:15-3.3  # Not plain postgres:15
```

#### Backend Issues

##### Poetry dependency resolution fails

**Symptom:**
```
Because project depends on package (x.y.z) which doesn't match any versions, version solving failed.
```

**Solution:**
```powershell
# Clear Poetry cache
poetry cache clear pypi --all

# Update Poetry
poetry self update

# Remove lock file and reinstall
Remove-Item poetry.lock
poetry install

# If specific package conflict:
poetry add package@latest
```

##### Database connection timeout

**Symptom:**
```
sqlalchemy.exc.OperationalError: could not connect to server: Connection timed out
```

**Solution:**
```python
# Check DATABASE_URL format
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/dbname

# Verify database is running
docker-compose ps

# Test connection manually
docker-compose exec postgres psql -U fitreadyuser -d fit_ready_iq_dev

# Check firewall rules (Azure)
az postgres flexible-server firewall-rule create \
  --resource-group rg-fit-ready-iq-prod \
  --name fit-ready-iq-db-prod \
  --rule-name allow-azure-services \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

##### Alembic migration fails

**Symptom:**
```
alembic.util.exc.CommandError: Target database is not up to date.
```

**Solution:**
```powershell
# Check current revision
poetry run alembic current

# View migration history
poetry run alembic history

# Downgrade to base
poetry run alembic downgrade base

# Upgrade to head
poetry run alembic upgrade head

# If migration conflict:
poetry run alembic merge heads
poetry run alembic upgrade head

# Create new migration after model changes
poetry run alembic revision --autogenerate -m "description"
```

##### Import errors with asyncio

**Symptom:**
```
RuntimeError: Event loop is closed
```

**Solution:**
```python
# Use asyncio.run() for entry points
import asyncio

async def main():
    # Your async code
    pass

if __name__ == "__main__":
    asyncio.run(main())

# For pytest, ensure pytest-asyncio is installed
# In pyproject.toml:
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

#### Frontend Issues

##### Next.js build fails with TypeScript errors

**Symptom:**
```
Type error: Property 'xyz' does not exist on type 'ABC'
```

**Solution:**
```powershell
# Delete .next and node_modules
Remove-Item -Recurse -Force .next, node_modules

# Clear npm cache
npm cache clean --force

# Reinstall dependencies
npm install

# Run type check
npm run type-check

# If specific type issues:
# Add type definitions to types/index.d.ts
```

##### Mapbox map not rendering

**Symptom:**
Map container is blank, console shows "Mapbox access token required"

**Solution:**
```typescript
// Verify token in .env.local
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...

// Check token is loaded
console.log(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

// Ensure CSS is imported
import 'mapbox-gl/dist/mapbox-gl.css';

// Verify container has height
<div style={{ height: '400px' }}>
  <Map ... />
</div>
```

##### API calls failing with CORS error

**Symptom:**
```
Access to fetch at 'http://localhost:8000/api/...' from origin 'http://localhost:3000' 
has been blocked by CORS policy
```

**Solution:**
```python
# In backend/src/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://yourdomain.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Authentication Issues

#### Strava OAuth redirect fails

**Symptom:**
User redirected to Strava but returns with error "redirect_uri mismatch"

**Solution:**
```
1. Check Strava app settings (strava.com/settings/api):
   - Authorization Callback Domain: localhost (dev) or yourdomain.com (prod)

2. Verify redirect_uri in code matches exactly:
   - http://localhost:3000/auth/callback (dev)
   - https://yourdomain.com/auth/callback (prod)

3. Ensure no trailing slashes or extra parameters

4. Check state parameter is preserved
```

#### JWT token validation fails

**Symptom:**
```
401 Unauthorized: Invalid token
```

**Solution:**
```python
# Verify JWT_SECRET_KEY is consistent
# In .env:
JWT_SECRET_KEY=your_long_random_secret_key_min_32_chars

# Check token expiration
from jose import jwt, JWTError

try:
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    print(f"Token expires at: {payload['exp']}")
except JWTError as e:
    print(f"Token error: {e}")

# Refresh token if expired
POST /api/auth/refresh
```

#### Token encryption/decryption fails

**Symptom:**
```
cryptography.fernet.InvalidToken
```

**Solution:**
```python
# Ensure ENCRYPTION_KEY is 32 bytes base64-encoded
from cryptography.fernet import Fernet

# Generate new key (one-time setup)
key = Fernet.generate_key()
print(key.decode())

# Verify key length
import base64
key_bytes = base64.urlsafe_b64decode(settings.encryption_key)
assert len(key_bytes) == 32, "Key must be 32 bytes"

# IMPORTANT: Changing key will invalidate existing encrypted tokens
# Need to re-authenticate users if key changes
```

### Database Issues

#### PostGIS spatial queries return no results

**Symptom:**
```python
routes = await session.execute(
    select(RouteModel).where(
        func.ST_DWithin(RouteModel.start_location, location_point, radius_meters)
    )
)
# Returns empty list when routes should exist
```

**Solution:**
```python
# Verify PostGIS is installed
SELECT PostGIS_Version();

# Check SRID (Spatial Reference ID) consistency
# All geometry should use SRID 4326 (WGS84)

# Verify geometry column
SELECT ST_SRID(start_location) FROM routes LIMIT 1;
# Should return 4326

# If wrong SRID, update:
UPDATE routes SET start_location = ST_SetSRID(start_location, 4326);

# Check distance calculation
# ST_DWithin uses meters for geography type
# For POINT (lat, lon), use geography cast:
func.ST_DWithin(
    func.cast(RouteModel.start_location, Geography),
    func.ST_GeogFromText(f'POINT({lon} {lat})'),
    radius_meters
)

# Create spatial index if missing
CREATE INDEX idx_routes_start_location ON routes USING GIST(start_location);
```

#### Database migration deadlock

**Symptom:**
```
alembic.util.exc.CommandError: deadlock detected
```

**Solution:**
```powershell
# Find blocking queries
docker-compose exec postgres psql -U fitreadyuser -d fit_ready_iq_dev -c "
SELECT 
    pg_stat_activity.pid,
    pg_stat_activity.query,
    pg_stat_activity.state
FROM pg_stat_activity
WHERE state != 'idle';
"

# Kill blocking process
docker-compose exec postgres psql -U fitreadyuser -d fit_ready_iq_dev -c "
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE state = 'idle in transaction' AND state_change < now() - interval '10 minutes';
"

# Retry migration
poetry run alembic upgrade head
```

#### Connection pool exhaustion

**Symptom:**
```
sqlalchemy.exc.TimeoutError: QueuePool limit of size 20 overflow 10 reached
```

**Solution:**
```python
# Increase pool size in connection.py
engine = create_async_engine(
    database_url,
    pool_size=50,        # Increased from 20
    max_overflow=20,     # Increased from 10
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Ensure connections are properly closed
async with get_db_context() as session:
    # Your code
    pass  # Session automatically closed

# Check for connection leaks
# Monitor: SELECT count(*) FROM pg_stat_activity;
```

### External API Issues

#### Strava API rate limit exceeded

**Symptom:**
```
httpx.HTTPStatusError: 429 Rate Limit Exceeded
```

**Solution:**
```python
# Strava limits: 200 requests/15min, 2000 requests/day

# Implement exponential backoff
import asyncio
from httpx import HTTPStatusError

async def strava_request_with_retry(url, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
        except HTTPStatusError as e:
            if e.response.status_code == 429:
                retry_after = int(e.response.headers.get('Retry-After', 60))
                logger.warning(f"Rate limited, waiting {retry_after}s")
                await asyncio.sleep(retry_after)
            else:
                raise

# Cache responses in Redis
from datetime import timedelta

async def get_activities_cached(user_id: str):
    cache_key = f"activities:{user_id}"
    cached = await redis.get(cache_key)
    
    if cached:
        return json.loads(cached)
    
    # Fetch from Strava
    activities = await strava_client.get_activities(user_id)
    
    # Cache for 15 minutes
    await redis.setex(cache_key, timedelta(minutes=15), json.dumps(activities))
    
    return activities
```

#### Mapbox geocoding fails

**Symptom:**
```
httpx.HTTPStatusError: 401 Unauthorized
```

**Solution:**
```bash
# Verify Mapbox token
curl "https://api.mapbox.com/geocoding/v5/mapbox.places/new%20york.json?access_token=YOUR_TOKEN"

# Check token scopes in Mapbox account
# Required scopes: styles:read, fonts:read, geocoding:read

# Verify environment variable
echo $MAPBOX_ACCESS_TOKEN

# Regenerate token if compromised
# Update in Key Vault and restart app
```

#### OpenWeather API 401 error

**Symptom:**
```
httpx.HTTPStatusError: 401 Unauthorized: Invalid API key
```

**Solution:**
```bash
# Verify API key at openweathermap.org/api_keys
# Note: New keys can take up to 2 hours to activate

# Test API key
curl "https://api.openweathermap.org/data/2.5/weather?q=London&appid=YOUR_API_KEY"

# Check correct endpoint (free tier)
# Use api.openweathermap.org NOT pro.openweathermap.org

# Verify key in environment
python -c "from src.config.settings import settings; print(settings.openweather_api_key)"
```

### Production Issues

#### App Service fails to start

**Symptom:**
Application logs show "Container didn't respond to HTTP pings on port 8000"

**Solution:**
```bash
# Check App Service logs
az webapp log tail \
  --resource-group rg-fit-ready-iq-prod \
  --name fit-ready-iq-backend-prod

# Common causes:

# 1. Missing startup command
# In Azure Portal → Configuration → General Settings → Startup Command:
gunicorn -w 4 -k uvicorn.workers.UvicornWorker src.main:app --bind 0.0.0.0:8000

# 2. Dependencies not installed
# Enable build during deployment:
az webapp config appsettings set \
  --resource-group rg-fit-ready-iq-prod \
  --name fit-ready-iq-backend-prod \
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true

# 3. Environment variables not set
az webapp config appsettings list \
  --resource-group rg-fit-ready-iq-prod \
  --name fit-ready-iq-backend-prod

# 4. Port mismatch
# Ensure app listens on port specified in App Service (8000 or PORT env var)
```

#### Key Vault access denied

**Symptom:**
```
Azure.Identity.AuthenticationFailedException: ManagedIdentityCredential authentication failed
```

**Solution:**
```powershell
# Verify Managed Identity is enabled
az webapp identity show \
  --resource-group rg-fit-ready-iq-prod \
  --name fit-ready-iq-backend-prod

# Grant Key Vault access
$principalId = (az webapp identity show `
  --resource-group rg-fit-ready-iq-prod `
  --name fit-ready-iq-backend-prod `
  --query principalId -o tsv)

az keyvault set-policy `
  --name fit-ready-iq-kv-prod `
  --object-id $principalId `
  --secret-permissions get list

# Verify access
az webapp config appsettings set \
  --resource-group rg-fit-ready-iq-prod \
  --name fit-ready-iq-backend-prod \
  --settings KEY_VAULT_URL=https://fit-ready-iq-kv-prod.vault.azure.net/

# Restart app to pick up new permissions
az webapp restart \
  --resource-group rg-fit-ready-iq-prod \
  --name fit-ready-iq-backend-prod
```

#### Static Web App deployment fails

**Symptom:**
GitHub Actions workflow fails with "Build failed"

**Solution:**
```yaml
# Check GitHub Actions logs for errors

# Common issues:

# 1. Wrong app_location
# In workflow file:
app_location: "/frontend"  # Correct
# NOT: "frontend" or "/frontend/"

# 2. Missing environment variables
# Add to GitHub Secrets and reference in workflow:
env:
  NEXT_PUBLIC_API_URL: ${{ secrets.API_URL }}

# 3. Build command fails
# Test locally:
cd frontend
npm install
npm run build

# 4. Output location incorrect
output_location: ".next"  # For Next.js
# NOT: "out" or "build"

# 5. API backend URL not set
# In staticwebapp.config.json:
{
  "routes": [
    {
      "route": "/api/*",
      "rewrite": "https://fit-ready-iq-backend-prod.azurewebsites.net/api/*"
    }
  ]
}
```

#### High response latency

**Symptom:**
API responses taking > 2 seconds

**Solution:**
```python
# 1. Enable database query logging
import logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)

# Identify slow queries in logs

# 2. Add indexes
CREATE INDEX idx_activities_user_id_start_time ON activities(user_id, start_time DESC);
CREATE INDEX idx_routes_difficulty_score ON routes(difficulty_score);

# 3. Use connection pooling
# Already configured in connection.py

# 4. Implement caching
from functools import lru_cache

@lru_cache(maxsize=128)
async def get_route_cached(route_id: str):
    # Expensive operation
    pass

# 5. Use select_related to avoid N+1 queries
from sqlalchemy.orm import selectinload

stmt = select(User).options(
    selectinload(User.activities)
).where(User.id == user_id)

# 6. Monitor with Application Insights
# Slow requests automatically logged
# View in Azure Portal → Application Insights → Performance
```

### Testing Issues

#### Tests fail with fixture errors

**Symptom:**
```
pytest.FixtureException: fixture 'db_session' not found
```

**Solution:**
```python
# Ensure conftest.py in tests directory
# tests/conftest.py

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        yield session

# Import in test file
from tests.conftest import db_session

async def test_create_user(db_session):
    # Test code
    pass
```

#### Mock external APIs not working

**Symptom:**
Tests make real API calls instead of using mocks

**Solution:**
```python
# Use pytest-mock or unittest.mock

import pytest
from unittest.mock import AsyncMock

@pytest.fixture
def mock_strava_client(mocker):
    mock = AsyncMock()
    mock.get_activities.return_value = [
        {"id": 1, "name": "Morning Run", "distance": 5000}
    ]
    mocker.patch("src.infrastructure.api_clients.strava.client.StravaClient", return_value=mock)
    return mock

async def test_sync_activities(mock_strava_client):
    # Test uses mock, not real API
    result = await sync_activities_use_case.execute(user_id)
    assert result.synced_count == 1
```

## Performance Optimization

### Slow route searches

**Issue:** PostGIS spatial queries taking > 5 seconds

**Solution:**
```sql
-- Verify spatial index exists
\d routes
-- Should show: "idx_routes_start_location" gist (start_location)

-- If missing, create it:
CREATE INDEX CONCURRENTLY idx_routes_start_location 
ON routes USING GIST(start_location);

-- Analyze query plan
EXPLAIN ANALYZE
SELECT * FROM routes
WHERE ST_DWithin(
    start_location::geography,
    ST_GeogFromText('POINT(-74.0060 40.7128)'),
    50000
);

-- Should use: "Index Scan using idx_routes_start_location"
-- If "Seq Scan", index not being used

-- Update table statistics
ANALYZE routes;
```

### Frontend bundle size too large

**Issue:** Next.js bundle > 1MB, slow initial load

**Solution:**
```typescript
// 1. Use dynamic imports
const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => <div>Loading map...</div>
});

// 2. Analyze bundle
npm run build
npm install -g @next/bundle-analyzer
ANALYZE=true npm run build

// 3. Remove unused dependencies
npm prune

// 4. Use tree-shaking imports
// Bad:
import _ from 'lodash';
// Good:
import { debounce } from 'lodash-es';

// 5. Optimize images
import Image from 'next/image';

<Image 
  src="/hero.jpg" 
  width={800} 
  height={600}
  quality={75}
  loading="lazy"
/>
```

## Monitoring and Debugging

### Enable debug logging

```python
# Development
import structlog
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
)

# Production (structured JSON logs)
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ],
)
```

### Query Application Insights

```kusto
// Slow requests (> 2 seconds)
requests
| where duration > 2000
| project timestamp, name, duration, resultCode
| order by duration desc

// Error rate
requests
| where success == false
| summarize ErrorCount=count() by bin(timestamp, 5m)
| render timechart

// Dependency failures (external APIs)
dependencies
| where success == false
| project timestamp, name, target, resultCode, duration
| order by timestamp desc
```

## Getting Help

If issues persist:

1. **Check logs:**
   - Development: `docker-compose logs -f backend`
   - Production: Azure Portal → App Service → Log stream

2. **Search existing issues:**
   - GitHub Issues: github.com/your-org/fit-ready-iq/issues

3. **Create new issue:**
   - Include error messages, logs, steps to reproduce
   - Tag with appropriate label (bug, deployment, docs)

4. **Contact support:**
   - Email: support@fit-ready-iq.com
   - Include: environment (dev/prod), error message, request ID

5. **Community:**
   - Discord: discord.gg/fit-ready-iq
   - Stack Overflow: Tag `fit-ready-iq`
