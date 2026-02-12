/**
 * Polo Core API — AES-256-CBC Encryption
 * 
 * Used to encrypt/decrypt Stellar private keys at rest.
 * Keys are encrypted before DB storage and decrypted only
 * in-memory when signing transactions.
 * 
 * ⚠️ ENCRYPTION_SECRET must be exactly 64 hex characters (32 bytes).
 */
import crypto from 'crypto';

const IV_LENGTH = 16; // AES block size

function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_SECRET;

    if (!key || key.length !== 64) {
        throw new Error(
            '[Polo Crypto] ENCRYPTION_SECRET must be set and be exactly 64 hex characters (32 bytes). ' +
            `Current length: ${key?.length ?? 0}`
        );
    }

    return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plaintext string (e.g., Stellar secret key).
 * Returns the encrypted content and the IV used.
 */
export function encrypt(text: string): { iv: string; content: string } {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
        iv: iv.toString('hex'),
        content: encrypted,
    };
}

/**
 * Decrypt an encrypted string using provided IV.
 * Returns the original plaintext (e.g., Stellar secret key).
 * 
 * ⚠️ The decrypted value should NEVER leave the server process.
 */
export function decrypt(encryptedContent: string, ivHex: string): string {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
