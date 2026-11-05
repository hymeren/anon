// Cloudflare tells us which continent a visitor is connecting from. First-time visitors can start in that lobby.
export const CONTINENT_ROOM = { AF: 'africa', AS: 'asia', EU: 'europe', NA: 'north america', SA: 'south america', OC: 'oceania' };
export function startRoom(cf, env) {   // Antarctica, unknown places, or START_IN_CONTINENT = "0" all start in main
  const on = String((env && env.START_IN_CONTINENT) || '1') === '1';
  return (on && cf && CONTINENT_ROOM[cf.continent]) || 'main';
}
