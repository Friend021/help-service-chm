import { buildApp } from './app.js';
import { loadEnv } from './config.js';

const env = loadEnv();
const app = await buildApp({ env });

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'останавливаю мок-бэкенд');
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.port, host: env.host });
  app.log.info(`Compass mock backend: ${env.publicUrl}/docs`);
  app.log.info(`Mock Keycloak issuer: ${env.publicUrl}/realms/${env.realm}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
