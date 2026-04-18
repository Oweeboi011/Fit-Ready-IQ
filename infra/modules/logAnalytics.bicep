@description('The Azure region for the workspace.')
param location string

@description('The name of the Log Analytics workspace.')
param name string

@description('Resource tags.')
param tags object = {}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output id string = logAnalytics.id
output customerId string = logAnalytics.properties.customerId
@secure()
output primarySharedKey string = logAnalytics.listKeys().primarySharedKey
