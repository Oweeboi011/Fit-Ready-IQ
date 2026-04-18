@description('The Azure region for the managed identity.')
param location string

@description('The name of the user-assigned managed identity.')
param name string

@description('Resource tags.')
param tags object = {}

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: name
  location: location
  tags: tags
}

output id string = managedIdentity.id
output clientId string = managedIdentity.properties.clientId
output principalId string = managedIdentity.properties.principalId
output name string = managedIdentity.name
