import assert from 'node:assert/strict';
import {createWorkflowKeys, requirePreviewWorkflowConfiguration} from '../functions/lib/consultation/workflow-runtime.js';
import {encryptIntake, decryptIntake} from '../functions/lib/consultation/intake-crypto.js';
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS ' + name); }
const keyring = () => Object.fromEntries(['intake', 'contact', 'lookup', 'challenge'].map((purpose, index) =>
  [purpose, {active: purpose + '-v1', keys: {[purpose + '-v1']: (index + 1).toString(16).padStart(2, '0').repeat(32)}}]));
const serialize = value => JSON.stringify(value);
await test('imports isolated nonextractable purpose keys', async () => {
  const keys = await createWorkflowKeys(serialize(keyring()));
  for (const purpose of Object.keys(keys)) {
    const key = await keys[purpose].provider(keys[purpose].activeKeyId);
    assert.equal(key.extractable, false);
    assert.equal(key.algorithm.length, 256);
    assert.equal(key.algorithm.name, ['intake', 'contact'].includes(purpose) ? 'AES-GCM' : 'HMAC');
  }
});
await test('actual intake encryption roundtrip', async () => {
  const {intake} = await createWorkflowKeys(serialize(keyring()));
  const data = {questions: 'Synthetic-only question'};
  const envelope = await encryptIntake(data, {id: 'synthetic-intake', customerId: 1,
    payloadVersion: 1, schemaVersion: 1, keyId: intake.activeKeyId}, intake.provider);
  assert.deepEqual(await decryptIntake(envelope, intake.provider), data);
});
await test('old key versions remain readable after rotation', async () => {
  const ring = keyring(); ring.intake.keys['intake-v2'] = '05'.repeat(32); ring.intake.active = 'intake-v2';
  const keys = await createWorkflowKeys(serialize(ring));
  assert.ok(await keys.intake.provider('intake-v1'));
  assert.ok(await keys.intake.provider('intake-v2'));
});
for (const [name, mutate] of [
  ['missing active key', r => r.intake.active = 'missing'],
  ['weak key length', r => r.intake.keys['intake-v1'] = '01'],
  ['zero key', r => r.intake.keys['intake-v1'] = '00'.repeat(32)],
  ['key alias', r => r.intake.keys['alias'] = r.intake.keys['intake-v1']],
  ['cross-purpose reuse', r => r.contact.keys['contact-v1'] = r.intake.keys['intake-v1']],
  ['unexpected keyring purpose', r => r.extra = {}],
  ['unexpected plaintext metadata', r => r.intake.customerName = 'Synthetic'],
  ['invalid key identifier', r => r.intake.keys['../../key'] = '06'.repeat(32)],
]) await test(name, async () => {
  const ring = keyring(); mutate(ring);
  await assert.rejects(createWorkflowKeys(serialize(ring)), {message: 'Consultation runtime unavailable'});
});
await test('missing and malformed secrets fail safely', async () => {
  for (const input of [undefined, '', '{', 'null', '[]'])
    await assert.rejects(createWorkflowKeys(input), {message: 'Consultation runtime unavailable'});
});
await test('unknown versions fail closed', async () => {
  const keys = await createWorkflowKeys(serialize(keyring()));
  await assert.rejects(keys.intake.provider('unknown'), {message: 'Consultation runtime unavailable'});
});
const config = {enabled: 'true', environment: 'preview', origin: 'https://synthetic.pages.dev',
  expectedDatabaseId: '11111111-1111-4111-8111-111111111111', databaseId: '11111111-1111-4111-8111-111111111111'};
await test('explicit isolated preview configuration', () => assert.equal(requirePreviewWorkflowConfiguration(config).origin, config.origin));
for (const [name, change] of [
  ['disabled', {enabled: undefined}], ['truthy flag', {enabled: true}],
  ['production', {environment: 'production'}], ['database drift', {databaseId: '22222222-2222-4222-8222-222222222222'}],
  ['production database', {databaseId: '20c7c0f8-64e5-4f7a-80b2-445ba36077ff', expectedDatabaseId: '20c7c0f8-64e5-4f7a-80b2-445ba36077ff'}],
  ['custom live origin', {origin: 'https://quantumyijing.com'}], ['insecure origin', {origin: 'http://synthetic.pages.dev'}],
  ['origin path', {origin: 'https://synthetic.pages.dev/path'}], ['notification activation', {subscriptionAutomationEnabled: 'true'}],
]) await test('reject ' + name, () => assert.throws(() => requirePreviewWorkflowConfiguration({...config, ...change}), {message: 'Consultation runtime unavailable'}));
console.log(`RESULT ${passed} passed, 0 failed`);
