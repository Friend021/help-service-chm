import { randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';

export interface SigningKeys {
  kid: string;
  alg: 'RS256';
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JWK;
}

/**
 * Ключи генерируются при старте процесса. Это осознанно:
 * мок не должен хранить секреты на диске, а перевыпуск ключей
 * между рестартами безопасен — живых токенов всё равно нет.
 */
export async function createSigningKeys(): Promise<SigningKeys> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const kid = randomUUID();

  Object.assign(publicJwk, { use: 'sig', alg: 'RS256', kid });

  return { kid, alg: 'RS256', privateKey, publicKey, publicJwk };
}
