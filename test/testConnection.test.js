const { generateRecommendations } = require('../src/functions/testConnection');

describe('generateRecommendations', () => {
  test('returns errors when connection and auth fail', () => {
    const recs = generateRecommendations(false, { success: false }, { configured: false, errors: [] }, 'timeout');
    const types = recs.map(r => r.type);
    expect(types).toEqual(expect.arrayContaining(['error', 'auth_error', 'configuration']));
  });

  test('returns success recommendation when all good', () => {
    const recs = generateRecommendations(true, { success: true }, { configured: true, errors: [] }, null);
    expect(recs[recs.length - 1]).toEqual(expect.objectContaining({ type: 'success' }));
  });
});
