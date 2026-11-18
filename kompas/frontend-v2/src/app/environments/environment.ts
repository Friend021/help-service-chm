export const environment = {
  production: false,
  // Keycloak redirect-flow (как в бою): логинимся через OIDC-провайдер,
  // а не через mock-пароль. Dev-провайдер — mock-Keycloak на :3000.
  mockLoginEnabled: false,
  // Реальный бэк «Компас» (Spring). Локальный bootRun слушает :8090
  // (8080 занят чужим контейнером cft-navigator). Совпадает с портом docker-compose.
  apiUrl: 'http://localhost:8090/api/v1',
  keycloak: {
    // Пока dev mock-Keycloak; на боевой переключимся сменой этого URL.
    url: 'http://localhost:3000/realms/compass',
    clientId: 'compass-frontend',
    realm: 'compass',
  },
  // Пусто → login-страница идёт по keycloak-js redirect, а не по паролю.
  mockUsers: [] as Array<{ username: string; password: string; role: string }>,
};