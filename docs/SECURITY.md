# Security Guidelines

## Overview

Fit-Ready-IQ implements multiple security layers to protect user data, credentials, and system integrity. This document outlines security measures and best practices.

## Authentication & Authorization

### OAuth 2.0 Flow (Strava Integration)

```
┌──────────┐                                    ┌─────────────┐
│  User    │                                    │   Strava    │
│  Browser │                                    │   OAuth     │
└────┬─────┘                                    └──────┬──────┘
     │                                                 │
     │  1. Click "Connect Strava"                     │
     │────────────────────────────────►               │
     │                                  ┌──────────┐  │
     │                                  │ Next.js  │  │
     │                                  │ Frontend │  │
     │  2. Redirect to Strava OAuth    └──────────┘  │
     │◄─────────────────────────────────              │
     │                                                 │
     │  3. Authorize app                              │
     │────────────────────────────────────────────────►
     │                                                 │
     │  4. Return with authorization code              │
     │◄────────────────────────────────────────────────
     │                                                 │
     │  5. POST /api/auth/strava/callback             │
     │        {code, state}            ┌──────────┐  │
     │────────────────────────────────►│ FastAPI  │  │
     │                                  │ Backend  │  │
     │                                  └────┬─────┘  │
     │                                       │         │
     │                                       │  6. Exchange code for tokens
     │                                       │─────────────────►
     │                                       │                  │
     │                                       │  7. Return tokens
     │                                       │◄─────────────────
     │                                       │
     │                                       │  8. Encrypt & store tokens
     │                                       │─────────────►
     │                                       │            [Database]
     │                                       │
     │  9. Return JWT session token          │
     │◄──────────────────────────────────────│
     │                                       │
     │  Store JWT in httpOnly cookie        │
     │                                       │
```

#### Security Measures
- **PKCE (Proof Key for Code Exchange)**: Prevents authorization code interception
- **State Parameter**: CSRF protection
- **Short-lived Tokens**: Access tokens expire in 6 hours
- **Refresh Token Rotation**: New refresh token issued on each use
- **Secure Storage**: Tokens encrypted with AES-256 before database storage

### JWT Authentication

#### Token Structure
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user_id",
    "email": "user@example.com",
    "exp": 1709820000,
    "iat": 1709816400
  }
}
```

#### Implementation
```python
from jose import jwt
from datetime import datetime, timedelta

def create_access_token(data: dict) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expiration_minutes)
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm
    )
    return encoded_jwt
```

#### Token Storage
- **Frontend**: httpOnly cookies (prevents XSS attacks)
- **API Requests**: Authorization header `Bearer <token>`
- **Expiration**: 24 hours default, configurable
- **Refresh**: Automatic refresh before expiration

## Data Protection

### Encryption at Rest

#### Sensitive Data Fields
```python
# Encrypted before storage
- strava_access_token
- strava_refresh_token
- api_keys (if user-provided)
```

#### Encryption Implementation
```python
from cryptography.fernet import Fernet
import base64

class EncryptionService:
    def __init__(self, key: str):
        self.cipher = Fernet(base64.urlsafe_b64encode(key.encode()[:32]))
    
    def encrypt(self, plaintext: str) -> str:
        """Encrypt sensitive data."""
        return self.cipher.encrypt(plaintext.encode()).decode()
    
    def decrypt(self, ciphertext: str) -> str:
        """Decrypt sensitive data."""
        return self.cipher.decrypt(ciphertext.encode()).decode()
```

### Encryption in Transit

#### TLS Configuration
- **Minimum Version**: TLS 1.2
- **Preferred Version**: TLS 1.3
- **Cipher Suites**: Strong ciphers only (AES-256-GCM)
- **HSTS**: HTTP Strict Transport Security enabled
- **Certificate**: Let's Encrypt or Azure-managed

#### Headers
```python
# Security headers (added by middleware)
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'
```

## Secrets Management

### Development
```bash
# .env file (never committed)
JWT_SECRET_KEY=your_long_random_secret_key_min_32_chars
STRAVA_CLIENT_SECRET=your_strava_secret
ENCRYPTION_KEY=your_encryption_key_32_chars
DATABASE_URL=postgresql://user:pass@localhost/db
```

### Production (Azure)

#### Azure Key Vault Integration
```python
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

class AzureKeyVaultService:
    def __init__(self, vault_url: str):
        credential = DefaultAzureCredential()
        self.client = SecretClient(vault_url=vault_url, credential=credential)
    
    def get_secret(self, name: str) -> str:
        """Retrieve secret from Key Vault."""
        return self.client.get_secret(name).value
```

#### Secrets Stored
- JWT signing key
- Database credentials
- API keys (Strava, Mapbox, OpenWeather)
- Encryption keys
- Connection strings

#### Access Control
- **Managed Identity**: Backend app has read-only access
- **RBAC**: Principle of least privilege
- **Audit Logs**: All secret access logged

## Input Validation

### Backend Validation (Pydantic)
```python
from pydantic import BaseModel, Field, validator

class CreateItineraryRequest(BaseModel):
    route_id: UUID
    planned_date: datetime = Field(..., description="Adventure date")
    
    @validator('planned_date')
    def validate_future_date(cls, v):
        if v < datetime.utcnow():
            raise ValueError('Planned date must be in the future')
        if v > datetime.utcnow() + timedelta(days=365):
            raise ValueError('Planned date cannot be more than 1 year ahead')
        return v
    
    class Config:
        schema_extra = {
            "example": {
                "route_id": "550e8400-e29b-41d4-a716-446655440000",
                "planned_date": "2026-04-15T08:00:00Z"
            }
        }
```

### Frontend Validation (Zod)
```typescript
import { z } from 'zod';

const itinerarySchema = z.object({
  routeId: z.string().uuid(),
  plannedDate: z.date()
    .min(new Date(), 'Date must be in the future')
    .max(
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      'Date cannot be more than 1 year ahead'
    ),
});

type ItineraryInput = z.infer<typeof itinerarySchema>;
```

### SQL Injection Prevention
- **ORM Usage**: SQLAlchemy parameterized queries
- **No Raw SQL**: Except for complex spatial queries (still parameterized)
- **Input Sanitization**: All user input validated

```python
# SAFE: Parameterized query
await session.execute(
    select(User).where(User.email == user_email)
)

# UNSAFE: String concatenation (NEVER DO THIS)
# await session.execute(f"SELECT * FROM users WHERE email = '{user_email}'")
```

## Rate Limiting

### Implementation
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.get("/api/routes/search")
@limiter.limit("60/minute")
async def search_routes(request: Request):
    # Endpoint limited to 60 requests per minute per IP
    pass
```

### Limits
```
Public endpoints:
- 60 requests/minute per IP
- 1000 requests/hour per IP

Authenticated endpoints:
- 100 requests/minute per user
- 2000 requests/hour per user

Heavy operations (file upload, sync):
- 10 requests/minute per user
```

### DDoS Protection
- **Azure Application Gateway**: WAF rules
- **Rate limiting**: Per-IP and per-user
- **Circuit breaker**: For external API failures
- **Request size limits**: Max 10MB upload

## API Security

### CORS Configuration
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://fit-ready-iq.azurewebsites.net",
        "http://localhost:3000"  # Development only
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
    max_age=86400,  # Cache preflight for 24 hours
)
```

### API Key Validation
```python
async def verify_api_key(api_key: str = Header(...)):
    """Verify API key for webhook endpoints."""
    expected_key = settings.webhook_verify_token
    if not secrets.compare_digest(api_key, expected_key):
        raise HTTPException(status_code=401, detail="Invalid API key")
    return api_key
```

## Database Security

### Connection Security
```python
# Encrypted connection string
DATABASE_URL=postgresql://user:pass@server.postgres.database.azure.com:5432/db?sslmode=require

# Connection pooling with limits
engine = create_async_engine(
    database_url,
    pool_size=20,           # Max connections
    max_overflow=10,        # Additional connections under load
    pool_pre_ping=True,     # Verify connections
    pool_recycle=3600,      # Recycle connections every hour
)
```

### Access Control
```sql
-- Application user (limited permissions)
CREATE USER app_user WITH PASSWORD 'secure_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
REVOKE CREATE ON SCHEMA public FROM app_user;

-- Read-only user (analytics, reporting)
CREATE USER readonly_user WITH PASSWORD 'secure_password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;

-- No DROP or TRUNCATE permissions for application users
```

### Row-Level Security (Future)
```sql
-- Enable RLS
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Users can only access their own activities
CREATE POLICY user_activities_policy ON activities
FOR ALL TO app_user
USING (user_id = current_setting('app.user_id')::uuid);
```

## Monitoring & Incident Response

### Security Monitoring
```python
import structlog

logger = structlog.get_logger()

# Log security events
logger.warning(
    "failed_login_attempt",
    email=email,
    ip_address=request.client.host,
    user_agent=request.headers.get("user-agent")
)

logger.info(
    "token_refreshed",
    user_id=user_id,
    token_type="strava",
    ip_address=request.client.host
)
```

### Alerts
- Failed authentication attempts (> 5 in 10 minutes)
- Unusual API usage patterns
- External API failures
- Database connection issues
- Certificate expiration warnings (30 days)

### Incident Response
1. **Detection**: Automated alerts + monitoring
2. **Containment**: Disable affected accounts/endpoints
3. **Investigation**: Review logs, identify scope
4. **Remediation**: Fix vulnerability, update systems
5. **Communication**: Notify affected users
6. **Documentation**: Post-mortem report

## Security Checklist

### Deployment
- [ ] All secrets in Key Vault (not environment variables)
- [ ] HTTPS enabled with valid certificate
- [ ] Security headers configured
- [ ] CORS whitelist production domain only
- [ ] Rate limiting enabled
- [ ] Database firewall rules configured
- [ ] Monitoring and alerting active
- [ ] Backup and recovery tested

### Code Review
- [ ] No hardcoded secrets
- [ ] Input validation on all endpoints
- [ ] Authentication required for protected routes
- [ ] Authorization checks for resource access
- [ ] Parameterized database queries
- [ ] Error messages don't leak sensitive info
- [ ] Logging doesn't include passwords/tokens

### Regular Maintenance
- [ ] Dependency updates (monthly)
- [ ] Security patch application (weekly)
- [ ] Certificate renewal (automated)
- [ ] Access review (quarterly)
- [ ] Penetration testing (annually)
- [ ] Security training (annually)

## Compliance

### GDPR Considerations
- **User Consent**: Explicit consent for data collection
- **Data Minimization**: Only collect necessary data
- **Right to Access**: Users can export their data
- **Right to Deletion**: Users can delete their account
- **Data Portability**: Export in machine-readable format
- **Privacy Policy**: Clear disclosure of data usage

### Implementation
```python
@app.delete("/api/users/me")
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete user account and all associated data (GDPR compliance)."""
    # Cascade delete handles related records
    await user_repo.delete(current_user.id)
    
    # Log deletion for audit
    logger.info(
        "account_deleted",
        user_id=current_user.id,
        email=current_user.email
    )
    
    return {"message": "Account deleted successfully"}

@app.get("/api/users/me/export")
async def export_data(current_user: User = Depends(get_current_user)):
    """Export all user data (GDPR compliance)."""
    # Gather all user data
    data = {
        "user": user_data,
        "activities": activities_data,
        "routes": saved_routes,
        "training_programs": programs_data,
        "itineraries": itineraries_data
    }
    
    return JSONResponse(content=data)
```

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** open a public GitHub issue
2. Email security@fit-ready-iq.com with details
3. Include steps to reproduce
4. Allow 48 hours for initial response
5. Coordinate disclosure timing

Thank you for helping keep Fit-Ready-IQ secure!
