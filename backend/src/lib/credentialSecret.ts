import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config";

const ENCRYPTED_PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";

const deriveKey = (secret: string) => createHash("sha256").update(secret).digest();

const getEncryptionKey = () => deriveKey(config.credentialSecretKey);

const encodeEncryptedPayload = (iv: Buffer, authTag: Buffer, ciphertext: Buffer) =>
  `${ENCRYPTED_PREFIX}${Buffer.concat([iv, authTag, ciphertext]).toString("base64url")}`;

const decodeEncryptedPayload = (payload: string) => {
  const encoded = payload.slice(ENCRYPTED_PREFIX.length);
  const buffer = Buffer.from(encoded, "base64url");

  if (buffer.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Encrypted credential payload is malformed");
  }

  return {
    iv: buffer.subarray(0, IV_LENGTH),
    authTag: buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH),
    ciphertext: buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH),
  };
};

export const isEncryptedCredentialSecret = (value: string) => value.startsWith(ENCRYPTED_PREFIX);

export const encryptCredentialSecret = (plaintext: string) => {
  if (isEncryptedCredentialSecret(plaintext)) {
    return plaintext;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return encodeEncryptedPayload(iv, authTag, ciphertext);
};

export const decryptCredentialSecret = (value: string) => {
  if (!isEncryptedCredentialSecret(value)) {
    return value;
  }

  const { iv, authTag, ciphertext } = decodeEncryptedPayload(value);
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

export const ensureEncryptedCredentialSecret = (value: string) =>
  isEncryptedCredentialSecret(value) ? value : encryptCredentialSecret(value);
