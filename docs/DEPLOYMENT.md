# Deployment Guide

## Overview

This guide covers deploying Fit-Ready-IQ to Azure using Infrastructure as Code (Bicep), CI/CD pipelines, and best practices for production environments.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Azure Cloud                              │
│                                                                   │
│  ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │  Azure Static    │         │   Azure App Service         │  │
│  │  Web Apps        │────────►│   (FastAPI Backend)         │  │
│  │  (Next.js)       │  HTTPS  │   - Python 3.11             │  │
│  │  - CDN           │         │   - Linux Plan              │  │
│  │  - Global Edge   │         │   - Auto-scaling            │  │
│  └──────────────────┘         └─────────────┬───────────────┘  │
│                                              │                   │
│                          ┌──────────────────┴──────────┐        │
│                          │                             │        │
│                ┌─────────▼────────┐        ┌──────────▼──────┐ │
│                │  Azure Database  │        │  Azure Cache    │ │
│                │  for PostgreSQL  │        │  for Redis      │ │
│                │  - PostGIS       │        │  - Standard     │ │
│                │  - Flexible      │        │  - 1GB          │ │
│                └──────────────────┘        └─────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Supporting Services                        │    │
│  │  - Application Insights (monitoring)                    │    │
│  │  - Key Vault (secrets)                                  │    │
│  │  - Log Analytics (logging)                              │    │
│  │  - Application Gateway (WAF)                            │    │
│  └────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Tools
```powershell
# Azure CLI
winget install Microsoft.AzureCLI

# Bicep CLI (included with Azure CLI 2.20.0+)
az bicep install

# GitHub CLI (for secrets management)
winget install GitHub.cli

# Node.js 18+ (for frontend build)
winget install OpenJS.NodeJS.LTS

# Python 3.11+ (for backend)
winget install Python.Python.3.11
```

### Required Accounts
- Azure subscription (with Contributor role)
- GitHub account (for repository and Actions)
- Strava developer account (API credentials)
- Mapbox account (API token)
- OpenWeather account (API key)

## Infrastructure Setup

### 1. Azure Resource Provisioning

#### Using Bicep Templates

Create `infrastructure/main.bicep`:

```bicep
targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string = 'dev'

@description('Location for all resources')
param location string = resourceGroup().location

@description('PostgreSQL administrator username')
@secure()
param postgresAdminUser string

@description('PostgreSQL administrator password')
@secure()
param postgresAdminPassword string

var appName = 'fit-ready-iq'
var uniqueSuffix = uniqueString(resourceGroup().id)

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: '${appName}-plan-${environment}'
  location: location
  sku: {
    name: environment == 'prod' ? 'P1v3' : 'B1'
    tier: environment == 'prod' ? 'Premium' : 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// Backend App Service
resource backendApp 'Microsoft.Web/sites@2022-09-01' = {
  name: '${appName}-backend-${environment}'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.11'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'ENABLE_ORYX_BUILD'
          value: 'true'
        }
      ]
    }
  }
}

// PostgreSQL Flexible Server
resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: '${appName}-db-${environment}-${uniqueSuffix}'
  location: location
  sku: {
    name: environment == 'prod' ? 'Standard_D2s_v3' : 'Standard_B1ms'
    tier: environment == 'prod' ? 'GeneralPurpose' : 'Burstable'
  }
  properties: {
    version: '15'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: environment == 'prod' ? 128 : 32
    }
    backup: {
      backupRetentionDays: environment == 'prod' ? 35 : 7
      geoRedundantBackup: environment == 'prod' ? 'Enabled' : 'Disabled'
    }
    highAvailability: {
      mode: environment == 'prod' ? 'ZoneRedundant' : 'Disabled'
    }
  }
}

// PostgreSQL Database
resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2022-12-01' = {
  parent: postgresServer
  name: '${appName}_${environment}'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// PostGIS Extension
resource postgresExtension 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2022-12-01' = {
  parent: postgresServer
  name: 'azure.extensions'
  properties: {
    value: 'POSTGIS'
    source: 'user-override'
  }
}

// Redis Cache
resource redisCache 'Microsoft.Cache/redis@2022-06-01' = {
  name: '${appName}-redis-${environment}-${uniqueSuffix}'
  location: location
  properties: {
    sku: {
      name: environment == 'prod' ? 'Standard' : 'Basic'
      family: 'C'
      capacity: environment == 'prod' ? 1 : 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
}

// Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2022-07-01' = {
  name: '${appName}-kv-${uniqueSuffix}'
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
  }
}

// Grant Backend App access to Key Vault
resource keyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, backendApp.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: backendApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${appName}-insights-${environment}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: environment == 'prod' ? 90 : 30
  }
}

// Static Web App (Frontend)
resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: '${appName}-frontend-${environment}'
  location: location
  sku: {
    name: environment == 'prod' ? 'Standard' : 'Free'
    tier: environment == 'prod' ? 'Standard' : 'Free'
  }
  properties: {
    repositoryUrl: 'https://github.com/your-org/fit-ready-iq'
    branch: environment == 'prod' ? 'main' : 'develop'
    buildProperties: {
      appLocation: 'frontend'
      outputLocation: '.next'
    }
  }
}

// Outputs
output backendAppName string = backendApp.name
output backendAppUrl string = 'https://${backendApp.properties.defaultHostName}'
output postgresServerName string = postgresServer.name
output postgresDatabaseName string = postgresDatabase.name
output redisHostName string = redisCache.properties.hostName
output keyVaultName string = keyVault.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
```

#### Deploy Infrastructure

```powershell
# Login to Azure
az login

# Set subscription
az account set --subscription "Your-Subscription-Name"

# Create resource group
az group create `
  --name rg-fit-ready-iq-prod `
  --location eastus

# Deploy Bicep template
az deployment group create `
  --resource-group rg-fit-ready-iq-prod `
  --template-file infrastructure/main.bicep `
  --parameters environment=prod `
               postgresAdminUser=fitreadyadmin `
               postgresAdminPassword="YourSecurePassword123!"

# Save outputs
$outputs = az deployment group show `
  --resource-group rg-fit-ready-iq-prod `
  --name main `
  --query properties.outputs `
  | ConvertFrom-Json
```

### 2. Configure Secrets

#### Store Secrets in Key Vault

```powershell
$keyVaultName = $outputs.keyVaultName.value

# JWT Secret
az keyvault secret set `
  --vault-name $keyVaultName `
  --name "JWT-SECRET-KEY" `
  --value "your-long-random-secret-key-min-32-chars"

# Strava API
az keyvault secret set `
  --vault-name $keyVaultName `
  --name "STRAVA-CLIENT-ID" `
  --value "your-strava-client-id"

az keyvault secret set `
  --vault-name $keyVaultName `
  --name "STRAVA-CLIENT-SECRET" `
  --value "your-strava-client-secret"

# Mapbox Token
az keyvault secret set `
  --vault-name $keyVaultName `
  --name "MAPBOX-ACCESS-TOKEN" `
  --value "your-mapbox-token"

# OpenWeather API Key
az keyvault secret set `
  --vault-name $keyVaultName `
  --name "OPENWEATHER-API-KEY" `
  --value "your-openweather-key"

# Encryption Key
az keyvault secret set `
  --vault-name $keyVaultName `
  --name "ENCRYPTION-KEY" `
  --value "your-encryption-key-32-chars"

# Database URL
$dbUrl = "postgresql://fitreadyadmin:YourSecurePassword123!@$($outputs.postgresServerName.value).postgres.database.azure.com:5432/$($outputs.postgresDatabaseName.value)?sslmode=require"
az keyvault secret set `
  --vault-name $keyVaultName `
  --name "DATABASE-URL" `
  --value $dbUrl

# Redis URL
$redisUrl = "rediss://:$(az redis list-keys --resource-group rg-fit-ready-iq-prod --name $($outputs.redisHostName.value.Split('.')[0]) --query primaryKey -o tsv)@$($outputs.redisHostName.value):6380/0"
az keyvault secret set `
  --vault-name $keyVaultName `
  --name "REDIS-URL" `
  --value $redisUrl
```

### 3. Configure Backend App Service

```powershell
$backendAppName = $outputs.backendAppName.value

# Configure app settings with Key Vault references
az webapp config appsettings set `
  --resource-group rg-fit-ready-iq-prod `
  --name $backendAppName `
  --settings `
    "KEY_VAULT_URL=https://$keyVaultName.vault.azure.net/" `
    "JWT_SECRET_KEY=@Microsoft.KeyVault(SecretUri=https://$keyVaultName.vault.azure.net/secrets/JWT-SECRET-KEY/)" `
    "STRAVA_CLIENT_ID=@Microsoft.KeyVault(SecretUri=https://$keyVaultName.vault.azure.net/secrets/STRAVA-CLIENT-ID/)" `
    "STRAVA_CLIENT_SECRET=@Microsoft.KeyVault(SecretUri=https://$keyVaultName.vault.azure.net/secrets/STRAVA-CLIENT-SECRET/)" `
    "MAPBOX_ACCESS_TOKEN=@Microsoft.KeyVault(SecretUri=https://$keyVaultName.vault.azure.net/secrets/MAPBOX-ACCESS-TOKEN/)" `
    "OPENWEATHER_API_KEY=@Microsoft.KeyVault(SecretUri=https://$keyVaultName.vault.azure.net/secrets/OPENWEATHER-API-KEY/)" `
    "ENCRYPTION_KEY=@Microsoft.KeyVault(SecretUri=https://$keyVaultName.vault.azure.net/secrets/ENCRYPTION-KEY/)" `
    "DATABASE_URL=@Microsoft.KeyVault(SecretUri=https://$keyVaultName.vault.azure.net/secrets/DATABASE-URL/)" `
    "REDIS_URL=@Microsoft.KeyVault(SecretUri=https://$keyVaultName.vault.azure.net/secrets/REDIS-URL/)" `
    "APPLICATIONINSIGHTS_CONNECTION_STRING=$($outputs.appInsightsConnectionString.value)" `
    "ENVIRONMENT=production"
```

### 4. Initialize Database

```powershell
# Connect to PostgreSQL
$env:PGPASSWORD = "YourSecurePassword123!"
psql -h "$($outputs.postgresServerName.value).postgres.database.azure.com" `
     -U fitreadyadmin `
     -d $($outputs.postgresDatabaseName.value) `
     -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Run migrations (after deploying backend code)
# This will be done automatically in CI/CD pipeline
```

## CI/CD Pipeline

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  AZURE_RESOURCE_GROUP: rg-fit-ready-iq-prod
  BACKEND_APP_NAME: fit-ready-iq-backend-prod
  PYTHON_VERSION: '3.11'
  NODE_VERSION: '18'

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:15-3.3
        env:
          POSTGRES_USER: testuser
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      
      - name: Install Poetry
        run: |
          curl -sSL https://install.python-poetry.org | python3 -
          echo "$HOME/.local/bin" >> $GITHUB_PATH
      
      - name: Install dependencies
        working-directory: ./backend
        run: poetry install
      
      - name: Run linting
        working-directory: ./backend
        run: |
          poetry run black --check .
          poetry run isort --check-only .
          poetry run mypy src/
      
      - name: Run tests
        working-directory: ./backend
        env:
          DATABASE_URL: postgresql://testuser:testpass@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379/0
          JWT_SECRET_KEY: test_secret_key_min_32_characters_long
          ENCRYPTION_KEY: test_encryption_key_32_chars_xx
        run: poetry run pytest --cov=src --cov-report=xml
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./backend/coverage.xml

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        working-directory: ./frontend
        run: npm ci
      
      - name: Run linting
        working-directory: ./frontend
        run: npm run lint
      
      - name: Run type check
        working-directory: ./frontend
        run: npm run type-check
      
      - name: Run tests
        working-directory: ./frontend
        run: npm test -- --coverage
      
      - name: Build
        working-directory: ./frontend
        env:
          NEXT_PUBLIC_API_URL: https://fit-ready-iq-backend-prod.azurewebsites.net
        run: npm run build

  deploy-backend:
    needs: [test-backend, test-frontend]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: ${{ env.PYTHON_VERSION }}
      
      - name: Install dependencies
        working-directory: ./backend
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      
      - name: Azure Login
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      
      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v2
        with:
          app-name: ${{ env.BACKEND_APP_NAME }}
          package: ./backend
      
      - name: Run database migrations
        run: |
          # Install Alembic
          pip install alembic
          
          # Get database URL from Key Vault
          DATABASE_URL=$(az keyvault secret show \
            --vault-name fit-ready-iq-kv-prod \
            --name DATABASE-URL \
            --query value -o tsv)
          
          # Run migrations
          cd backend
          export DATABASE_URL=$DATABASE_URL
          alembic upgrade head

  deploy-frontend:
    needs: [test-backend, test-frontend]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build and Deploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "/frontend"
          output_location: ".next"
          app_build_command: "npm run build"
        env:
          NEXT_PUBLIC_API_URL: https://fit-ready-iq-backend-prod.azurewebsites.net
          NEXT_PUBLIC_MAPBOX_TOKEN: ${{ secrets.MAPBOX_ACCESS_TOKEN }}
```

### Configure GitHub Secrets

```powershell
# Create Azure service principal
$sp = az ad sp create-for-rbac `
  --name "fit-ready-iq-github-actions" `
  --role Contributor `
  --scopes /subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/rg-fit-ready-iq-prod `
  --sdk-auth | ConvertFrom-Json

# Add to GitHub secrets
gh secret set AZURE_CREDENTIALS --body ($sp | ConvertTo-Json)

# Get Static Web App deployment token
$swaToken = az staticwebapp secrets list `
  --name fit-ready-iq-frontend-prod `
  --resource-group rg-fit-ready-iq-prod `
  --query properties.apiKey -o tsv

gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --body $swaToken

# Add other secrets
gh secret set MAPBOX_ACCESS_TOKEN --body "your-mapbox-token"
```

## Monitoring & Logging

### Application Insights Integration

```python
# backend/src/main.py
from opencensus.ext.azure.log_exporter import AzureLogHandler
from opencensus.ext.azure.trace_exporter import AzureExporter
from opencensus.trace import config_integration
from opencensus.trace.samplers import ProbabilitySampler
from opencensus.trace.tracer import Tracer

# Configure Application Insights
config_integration.trace_integrations(['fastapi', 'postgresql', 'redis'])

# Add to logging
logger.addHandler(
    AzureLogHandler(
        connection_string=settings.application_insights_connection_string
    )
)

# Add request tracing middleware
@app.middleware("http")
async def trace_requests(request: Request, call_next):
    tracer = Tracer(
        exporter=AzureExporter(
            connection_string=settings.application_insights_connection_string
        ),
        sampler=ProbabilitySampler(1.0)
    )
    
    with tracer.span(name=f"{request.method} {request.url.path}"):
        response = await call_next(request)
    
    return response
```

### Monitoring Dashboard

Access monitoring at:
- Application Insights: Azure Portal → fit-ready-iq-insights-prod
- Log Analytics: Query logs with KQL
- Metrics: Track request rates, response times, error rates

### Alerts Configuration

```powershell
# High error rate alert
az monitor metrics alert create `
  --name "high-error-rate" `
  --resource-group rg-fit-ready-iq-prod `
  --scopes /subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/rg-fit-ready-iq-prod/providers/Microsoft.Web/sites/fit-ready-iq-backend-prod `
  --condition "count requests/failed > 50" `
  --window-size 5m `
  --evaluation-frequency 1m `
  --action-group-ids /subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/rg-fit-ready-iq-prod/providers/microsoft.insights/actionGroups/ops-team

# High response time alert
az monitor metrics alert create `
  --name "slow-response-time" `
  --resource-group rg-fit-ready-iq-prod `
  --scopes /subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/rg-fit-ready-iq-prod/providers/Microsoft.Web/sites/fit-ready-iq-backend-prod `
  --condition "avg requests/duration > 2000" `
  --window-size 5m `
  --evaluation-frequency 1m `
  --action-group-ids /subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/rg-fit-ready-iq-prod/providers/microsoft.insights/actionGroups/ops-team
```

## Backup & Recovery

### Database Backups

```powershell
# Automated backups (configured in Bicep)
# Retention: 35 days for production
# Geo-redundant: Enabled for production

# Manual backup
az postgres flexible-server backup create `
  --resource-group rg-fit-ready-iq-prod `
  --name fit-ready-iq-db-prod `
  --backup-name manual-backup-$(Get-Date -Format "yyyyMMdd")

# Point-in-time restore
az postgres flexible-server restore `
  --resource-group rg-fit-ready-iq-prod `
  --name fit-ready-iq-db-prod-restored `
  --source-server fit-ready-iq-db-prod `
  --restore-time "2024-01-15T10:30:00Z"
```

### Disaster Recovery

1. **RPO (Recovery Point Objective)**: 5 minutes (continuous backup)
2. **RTO (Recovery Time Objective)**: 4 hours (manual restore + verification)

Recovery steps:
1. Create new resource group in secondary region
2. Deploy Bicep template to secondary region
3. Restore database from geo-redundant backup
4. Update DNS/Traffic Manager to point to secondary region
5. Verify application functionality

## Scaling

### Automatic Scaling (Production)

```powershell
# Configure autoscale for App Service
az monitor autoscale create `
  --resource-group rg-fit-ready-iq-prod `
  --resource fit-ready-iq-backend-prod `
  --resource-type Microsoft.Web/serverfarms `
  --name backend-autoscale `
  --min-count 2 `
  --max-count 10 `
  --count 2

# Scale up on CPU
az monitor autoscale rule create `
  --resource-group rg-fit-ready-iq-prod `
  --autoscale-name backend-autoscale `
  --condition "Percentage CPU > 70 avg 5m" `
  --scale out 1

# Scale down on CPU
az monitor autoscale rule create `
  --resource-group rg-fit-ready-iq-prod `
  --autoscale-name backend-autoscale `
  --condition "Percentage CPU < 30 avg 10m" `
  --scale in 1
```

## Cost Optimization

### Production Costs (Estimated Monthly)

| Service | SKU | Cost |
|---------|-----|------|
| App Service Plan | P1v3 | $146 |
| Static Web App | Standard | $9 |
| PostgreSQL Flexible | Standard_D2s_v3 | $143 |
| Redis Cache | Standard C1 | $75 |
| Application Insights | (usage-based) | $10-50 |
| Key Vault | Standard | $0.03 |
| **Total** | | **~$383-423/month** |

### Cost Saving Tips

1. **Use Reserved Instances**: 1-year commitment saves 30-40%
2. **Scale Down Non-Production**: Use B1 tier for dev/staging
3. **Auto-shutdown Dev Environments**: Stop resources after hours
4. **Monitor Unused Resources**: Delete orphaned resources
5. **Use Spot Instances**: For batch processing jobs

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common deployment issues and solutions.

## Security Checklist

Before going live:
- [ ] All secrets in Key Vault
- [ ] HTTPS enforced (httpsOnly: true)
- [ ] Managed identity configured
- [ ] Database firewall rules set
- [ ] Network Security Groups configured
- [ ] Application Insights enabled
- [ ] Automated backups verified
- [ ] Disaster recovery plan tested
- [ ] Alerts configured
- [ ] Access reviewed (principle of least privilege)

## Post-Deployment Verification

```powershell
# Test backend health
Invoke-WebRequest -Uri "https://fit-ready-iq-backend-prod.azurewebsites.net/health"

# Test frontend
Invoke-WebRequest -Uri "https://fit-ready-iq-frontend-prod.azurestaticapps.net"

# Check database connection
az postgres flexible-server connect `
  --name fit-ready-iq-db-prod `
  --resource-group rg-fit-ready-iq-prod `
  --admin-user fitreadyadmin `
  --query-database fit_ready_iq_prod

# Verify PostGIS extension
psql -c "SELECT PostGIS_Version();"

# Check Application Insights
az monitor app-insights metrics show `
  --app fit-ready-iq-insights-prod `
  --resource-group rg-fit-ready-iq-prod `
  --metric requests/count
```

## Rollback Procedure

If deployment fails:

```powershell
# Rollback backend to previous version
az webapp deployment slot swap `
  --resource-group rg-fit-ready-iq-prod `
  --name fit-ready-iq-backend-prod `
  --slot staging `
  --target-slot production

# Rollback database (if needed)
az postgres flexible-server restore `
  --resource-group rg-fit-ready-iq-prod `
  --name fit-ready-iq-db-prod-rollback `
  --source-server fit-ready-iq-db-prod `
  --restore-time "2024-01-15T09:00:00Z"  # Before deployment

# Rollback frontend (redeploy previous commit)
# Trigger GitHub Actions workflow on previous commit
```

## Support Contacts

- **Infrastructure Issues**: ops@fit-ready-iq.com
- **Application Errors**: dev@fit-ready-iq.com
- **Security Concerns**: security@fit-ready-iq.com
- **Azure Support**: Portal → Help + support

## References

- [Azure App Service Documentation](https://learn.microsoft.com/azure/app-service/)
- [Azure Static Web Apps Documentation](https://learn.microsoft.com/azure/static-web-apps/)
- [Azure PostgreSQL Documentation](https://learn.microsoft.com/azure/postgresql/)
- [Bicep Documentation](https://learn.microsoft.com/azure/azure-resource-manager/bicep/)
- [GitHub Actions Documentation](https://docs.github.com/actions)
