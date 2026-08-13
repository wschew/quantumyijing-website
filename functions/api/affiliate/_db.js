export function getDB(env) {
  return env.ENQUIRIES_DB || env.DB || null;
}
