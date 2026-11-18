export const environment = {
  production: true,
  mockLoginEnabled: false,
  apiUrl: '/api/v1',
  keycloak: {
    url: 'https://keycloak.internal/realms/compass',
    clientId: 'compass-frontend',
    realm: 'compass',
  },
  mockUsers: [],
};