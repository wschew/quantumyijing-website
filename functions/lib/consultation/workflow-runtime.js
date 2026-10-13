// Server configuration only. Never accept this configuration from request JSON.
const HEX = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PURPOSES = ['intake', 'contact', 'lookup', 'challenge'];
const reject = () => { throw new Error('Consultation runtime unavailable'); };

export async function createWorkflowKeys(serializedKeyring) {
  try {
    if (typeof serializedKeyring !== 'string' || serializedKeyring.length > 32768) reject();
    const ring = JSON.parse(serializedKeyring);
    if (!ring || Array.isArray(ring) || Object.keys(ring).length !== PURPOSES.length ||
        Object.keys(ring).some(name => !PURPOSES.includes(name))) reject();
    const material = new Set();
    const identifiers = new Set();
    const result = {};
    for (const purpose of PURPOSES) {
      const entry = ring[purpose];
      if (!entry || Object.keys(entry).sort().join(',') !== 'active,keys' ||
          !ID.test(entry.active) || !entry.keys || Array.isArray(entry.keys)) reject();
      const versions = Object.entries(entry.keys);
      if (versions.length < 1 || versions.length > 16 || !Object.hasOwn(entry.keys, entry.active)) reject();
      const imported = new Map();
      for (const [id, value] of versions) {
        // Never alias the same key under multiple versions or across purposes.
        if (!ID.test(id) || identifiers.has(id) || typeof value !== 'string' ||
            !HEX.test(value) || /^0{64}$/.test(value) || material.has(value)) reject();
        identifiers.add(id);
        material.add(value);
        const raw = Uint8Array.from(value.match(/../g), byte => Number.parseInt(byte, 16));
        try {
          const algorithm = ['intake', 'contact'].includes(purpose)
            ? {name: 'AES-GCM'} : {name: 'HMAC', hash: 'SHA-256'};
          const usages = algorithm.name === 'AES-GCM' ? ['encrypt', 'decrypt'] : ['sign', 'verify'];
          imported.set(id, await crypto.subtle.importKey('raw', raw, algorithm, false, usages));
        } finally { raw.fill(0); }
      }
      result[purpose] = Object.freeze({activeKeyId: entry.active, provider: async id => {
        if (!imported.has(id)) reject();
        return imported.get(id);
      }});
    }
    return Object.freeze(result);
  } catch { reject(); }
}

export function requirePreviewWorkflowConfiguration(config) {
  // No route is wired by this module. This is a prerequisite, not customer authorization.
  try {
    if (!config || config.enabled !== 'true' || config.environment !== 'preview' ||
        config.subscriptionAutomationEnabled === 'true') reject();
    const origin = new URL(config.origin);
    if (origin.protocol !== 'https:' || origin.origin !== config.origin ||
        origin.username || origin.password || origin.port ||
        !origin.hostname.endsWith('.pages.dev')) reject();
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    if (!uuid.test(config.expectedDatabaseId) || config.databaseId !== config.expectedDatabaseId ||
        ['20c7c0f8-64e5-4f7a-80b2-445ba36077ff', '8f5c1f5f-3da2-40f9-a956-231d71b4cba4',
         '7018d16d-8a7d-4dc0-ad68-592c7506d147'].includes(config.databaseId)) reject();
    return Object.freeze({origin: origin.origin, databaseId: config.databaseId});
  } catch { reject(); }
}
