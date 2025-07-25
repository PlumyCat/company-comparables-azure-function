const { app } = require('@azure/functions');
const { validateConfig } = require('./config');

try {
    validateConfig();
} catch (err) {
    console.error(err.message);
    process.exit(1);
}

// Import Azure Functions
const { searchCompany } = require('./functions/searchCompany');
const { getCompanyDetails } = require('./functions/getCompanyDetails');
const { findComparables } = require('./functions/findComparables');
const { analyzeMetrics } = require('./functions/analyzeMetrics');
const { testConnection } = require('./functions/testConnection');

app.setup({
    enableHttpStream: true,
});

// Register HTTP functions
app.http('searchCompany', {
    methods: ['POST'],
    authLevel: 'function',
    handler: searchCompany
});

app.http('getCompanyDetails', {
    methods: ['POST'],
    authLevel: 'function',
    handler: getCompanyDetails
});

app.http('findComparables', {
    methods: ['POST'],
    authLevel: 'function',
    handler: findComparables
});

app.http('analyzeMetrics', {
    methods: ['POST'],
    authLevel: 'function',
    handler: analyzeMetrics
});

app.http('testConnection', {
    methods: ['GET', 'POST'],
    authLevel: 'function',
    handler: testConnection
});
