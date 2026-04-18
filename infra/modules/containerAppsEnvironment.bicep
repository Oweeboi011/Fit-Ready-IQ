@description('The Azure region for the Container Apps environment.')
param location string

@description('The name of the Container Apps environment.')
param name string

@description('The Log Analytics workspace customer ID.')
param logAnalyticsCustomerId string

@description('The Log Analytics workspace primary shared key.')
@secure()
param logAnalyticsPrimarySharedKey string

@description('Resource tags.')
param tags object = {}

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsPrimarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

output id string = containerAppsEnv.id
output name string = containerAppsEnv.name
output defaultDomain string = containerAppsEnv.properties.defaultDomain
output staticIp string = containerAppsEnv.properties.staticIp
