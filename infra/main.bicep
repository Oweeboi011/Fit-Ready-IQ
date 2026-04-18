targetScope = 'resourceGroup'

@description('The name of the AZD environment.')
param environmentName string

@description('The Azure region to deploy resources.')
param location string = resourceGroup().location

@description('Your Google Maps API key — stored in Key Vault, never in app config.')
@secure()
param googleMapsApiKey string

// ── Naming ─────────────────────────────────────────────────────────────────
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
  project: 'fit-ready-iq'
}// Declare kvName here so it is deterministic at deployment start
// (module outputs cannot be used in child resource names due to BCP120)
var kvName = 'kv-fri-${take(resourceToken, 8)}'
// ── Managed Identity ────────────────────────────────────────────────────────
module identity 'modules/managedIdentity.bicep' = {
  name: 'identity'
  params: {
    name: 'id-fitreadyiq-${resourceToken}'
    location: location
    tags: tags
  }
}

// ── Container Registry ──────────────────────────────────────────────────────
module acr 'modules/containerRegistry.bicep' = {
  name: 'acr'
  params: {
    name: 'acrfitreadyiq${resourceToken}'
    location: location
    managedIdentityPrincipalId: identity.outputs.principalId
    tags: tags
  }
}

// ── Key Vault ────────────────────────────────────────────────────────────────
module keyVault 'modules/keyVault.bicep' = {
  name: 'keyVault'
  params: {
    name: kvName
    location: location
    managedIdentityPrincipalId: identity.outputs.principalId
    tags: tags
  }
}

// ── Store Google Maps API key as a Key Vault secret ─────────────────────────
// Slash-in-name notation. kvName is a var (not a module output) so it is
// deterministic at deployment start — required by Bicep BCP120.
resource googleMapsSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${kvName}/google-maps-api-key'
  properties: {
    value: googleMapsApiKey
    attributes: {
      enabled: true
    }
  }
  dependsOn: [keyVault] // explicit dep since name interpolation uses a var, not the module ref
}

// ── Log Analytics ────────────────────────────────────────────────────────────
module logAnalytics 'modules/logAnalytics.bicep' = {
  name: 'logAnalytics'
  params: {
    name: 'log-fitreadyiq-${resourceToken}'
    location: location
    tags: tags
  }
}

// ── Container Apps Environment ───────────────────────────────────────────────
module containerAppsEnv 'modules/containerAppsEnvironment.bicep' = {
  name: 'containerAppsEnv'
  params: {
    name: 'cae-fitreadyiq-${resourceToken}'
    location: location
    logAnalyticsCustomerId: logAnalytics.outputs.customerId
    logAnalyticsPrimarySharedKey: logAnalytics.outputs.primarySharedKey
    tags: tags
  }
}

// ── Frontend Container App ───────────────────────────────────────────────────
module frontend 'modules/containerApp-frontend.bicep' = {
  name: 'frontend'
  params: {
    // ca-fri-fe- (10) + 13 resourceToken chars = 23 — safely under Azure's 32-char limit
    name: 'ca-fri-fe-${resourceToken}'
    location: location
    containerAppsEnvironmentId: containerAppsEnv.outputs.id
    acrLoginServer: acr.outputs.loginServer
    managedIdentityId: identity.outputs.id
    managedIdentityClientId: identity.outputs.clientId
    tags: tags
  }
  // KV secret must be created before the Container App is provisioned
  // (even though the app reads the key at build time, not runtime)
  dependsOn: [
    googleMapsSecret
  ]
}

// ── Outputs (consumed by azd) ────────────────────────────────────────────────
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = acr.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = acr.outputs.name
output AZURE_KEY_VAULT_NAME string = kvName
output AZURE_KEY_VAULT_ENDPOINT string = keyVault.outputs.uri
output FRONTEND_URL string = 'https://${frontend.outputs.fqdn}'
output SERVICE_FRONTEND_CONTAINER_APP_NAME string = frontend.outputs.name
