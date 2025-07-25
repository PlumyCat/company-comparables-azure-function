
function formatArgs(args) {
    return args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch (_) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
}

function log(level, args) {
    const message = formatArgs(args);
    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message
    };
    if (level === 'error') {
        console.error(JSON.stringify(logEntry));
    } else {
        console.log(JSON.stringify(logEntry));
    }
}

module.exports = {
    info: (...args) => log('info', args),
    warn: (...args) => log('warn', args),
    error: (...args) => log('error', args),
    debug: (...args) => log('debug', args)
};
