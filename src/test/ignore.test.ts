import * as assert from 'assert';
import { IgnoreMatcher, redactPath } from '../ignoreMatcher';

suite('IgnoreMatcher', () => {
  test('matches **/.env', () => {
    const m = new IgnoreMatcher(['**/.env']);
    assert.strictEqual(m.matches('.env'), true);
    assert.strictEqual(m.matches('apps/web/.env'), true);
    assert.strictEqual(m.matches('.env.local'), false);
  });

  test('matches **/.env.*', () => {
    const m = new IgnoreMatcher(['**/.env.*']);
    assert.strictEqual(m.matches('.env.local'), true);
    assert.strictEqual(m.matches('packages/api/.env.production'), true);
    assert.strictEqual(m.matches('env.local'), false);
  });

  test('matches secrets directory', () => {
    const m = new IgnoreMatcher(['**/secrets/**']);
    assert.strictEqual(m.matches('secrets/prod.json'), true);
    assert.strictEqual(m.matches('infra/secrets/aws/key.pem'), true);
    assert.strictEqual(m.matches('src/secret.ts'), false);
  });

  test('normalizes backslashes', () => {
    const m = new IgnoreMatcher(['**/*.pem']);
    assert.strictEqual(m.matches('certs\\prod.pem'), true);
  });

  test('redactPath keeps extension and depth', () => {
    assert.strictEqual(redactPath('src/components/Button.tsx'), '<redacted:3>.tsx');
    assert.strictEqual(redactPath('README.md'), '<redacted:1>.md');
  });
});
