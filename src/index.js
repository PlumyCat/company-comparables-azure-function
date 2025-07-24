const { app } = require('@azure/functions');

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
    authLevel: 'anonymous',
    handler: searchCompany
});

app.http('getCompanyDetails', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: getCompanyDetails
});

app.http('findComparables', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: findComparables
});

app.http('analyzeMetrics', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: analyzeMetrics
});

app.http('testConnection', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: testConnection
});
