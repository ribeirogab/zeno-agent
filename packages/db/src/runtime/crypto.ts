import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Spec 0071 — envelope encryption for credentials at rest.
 *
 * AES-256-GCM with a fresh 12-byte IV per record. The DEK is derived from a
 * single 32-byte master key (`ZENO_MASTER_KEY` env) via HKDF-SHA256, with the
 * profile id as the `info` parameter. Per-profile DEK isolation means a leaked
 * key for profile A never decrypts profile B's rows even if they share the
 * master key (defense-in-depth for multi-profile setups).
 *
 * All credential reads/writes in `repos/backend-credentials.ts` and
 * `repos/connectors.ts` flow through this module — no SQL touches plaintext.
 *
 * Master-key loss = unrecoverable credentials. The boot helper warns the
 * operator to back the key up offline.
 */

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const HKDF_SALT = Buffer.from('zeno-backend-credentials-v1', 'utf8');

function deriveDek(masterKey: Buffer, profileId: string): Buffer {
  const info = Buffer.from(`profile:${profileId}`, 'utf8');
  return Buffer.from(hkdfSync('sha256', masterKey, HKDF_SALT, info, 32));
}

export interface EncryptedBlob {
  iv: Buffer;
  /** ciphertext concatenated with the 16-byte auth tag at the end. */
  ciphertext: Buffer;
}

export function encrypt(masterKey: Buffer, profileId: string, plaintext: string): EncryptedBlob {
  const dek = deriveDek(masterKey, profileId);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, dek, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ciphertext: Buffer.concat([enc, tag]) };
}

export function decrypt(
  masterKey: Buffer,
  profileId: string,
  iv: Buffer,
  ciphertext: Buffer,
): string {
  if (ciphertext.length < TAG_LEN) {
    throw new Error(`crypto: ciphertext too short (${ciphertext.length} bytes)`);
  }
  const dek = deriveDek(masterKey, profileId);
  const tag = ciphertext.subarray(ciphertext.length - TAG_LEN);
  const data = ciphertext.subarray(0, ciphertext.length - TAG_LEN);
  const decipher = createDecipheriv(ALG, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
