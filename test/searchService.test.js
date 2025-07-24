const { SearchService } = require('../src/services/searchService');

describe('SearchService focus helpers', () => {
  const service = new SearchService();

  test('detectOptimalFocus chooses financialSearch for finance keywords', () => {
    const mode = service.detectOptimalFocus('ACME revenue finance profit');
    expect(mode).toBe('financialSearch');
  });

  test('applySearchFocus enriches query and settings', () => {
    const params = { query: 'ACME' };
    const result = service.applySearchFocus(params, 'marketAnalysis');
    expect(result.query).toContain('ACME');
    expect(result.query.length).toBeGreaterThan(params.query.length);
    expect(result.engines).toBe('google,yahoo');
    expect(result.categories).toBe('general');
  });
});
