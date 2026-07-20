import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from './token-encryption.service';

function buildService(key = 'a'.repeat(64)) {
  const configService = { getOrThrow: jest.fn().mockReturnValue(key) } as unknown as ConfigService;
  return new TokenEncryptionService(configService);
}

describe('TokenEncryptionService', () => {
  it('decrypts back to the original plaintext', () => {
    const service = buildService();
    const encrypted = service.encrypt('super-secret-access-token');
    expect(service.decrypt(encrypted)).toBe('super-secret-access-token');
  });

  it('produces a different ciphertext each time due to a random IV', () => {
    const service = buildService();
    const a = service.encrypt('same-plaintext');
    const b = service.encrypt('same-plaintext');
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe('same-plaintext');
    expect(service.decrypt(b)).toBe('same-plaintext');
  });

  it('rejects a tampered ciphertext (auth tag mismatch)', () => {
    const service = buildService();
    const encrypted = service.encrypt('super-secret-access-token');
    const [iv, authTag, ciphertext] = encrypted.split(':');
    const tampered = [iv, authTag, ciphertext.slice(0, -2) + (ciphertext.slice(-2) === '00' ? '01' : '00')].join(
      ':',
    );
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('rejects a malformed payload', () => {
    const service = buildService();
    expect(() => service.decrypt('not-a-valid-payload')).toThrow('Invalid encrypted token payload format');
  });

  it('cannot decrypt a payload encrypted with a different key', () => {
    const serviceA = buildService('1'.repeat(64));
    const serviceB = buildService('2'.repeat(64));
    const encrypted = serviceA.encrypt('secret');
    expect(() => serviceB.decrypt(encrypted)).toThrow();
  });
});
