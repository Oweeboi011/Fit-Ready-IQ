@description('The Azure region for the Container App.')
param location string

@description('The name of the frontend Container App.')
param name string

@description('The Container Apps environment ID.')
param containerAppsEnvironmentId string

@description('The ACR login server (e.g. myacr.azurecr.io).')
param acrLoginServer string

@description('The resource ID of the user-assigned managed identity.')
param managedIdentityId string

@description('The client ID of the user-assigned managed identity.')
param managedIdentityClientId string

@description('Resource tags.')
param tags object = {}

resource frontendApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: union(tags, { 'azd-service-name': 'frontend' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnvironmentId
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true       // Publicly accessible
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: acrLoginServer
          identity: managedIdentityId  // Pull images with managed identity — no password
        }
      ]
      // No runtime secrets needed: NEXT_PUBLIC_* vars are baked into the image
      // at 'npm run build' time via Docker ARG — see frontend/Dockerfile
    }
    template: {
      containers: [
        {
          name: 'frontend'
          // Placeholder image for initial provision — azd deploy replaces this
          // with the real ACR image using the azd-service-name tag above.
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            // NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is baked in at build time via ARG in Dockerfile
            // It does NOT need to be set here as a runtime env var
            {
              name: 'NEXT_PUBLIC_APP_NAME'
              value: 'Fit-Ready-IQ'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: managedIdentityClientId
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0    // Scale-to-zero for cost savings
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
}

output fqdn string = frontendApp.properties.configuration.ingress.fqdn
output name string = frontendApp.name
output id string = frontendApp.id
