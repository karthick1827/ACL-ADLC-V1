// Universal Serverless Function: health.js
async function universalHandler(arg1, arg2) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  const body = JSON.stringify({
    ok: true,
    service: 'acl-markdown-studio',
    timestamp: new Date().toISOString(),
  });

  if (arg2 && typeof arg2.writeHead === 'function') {
    arg2.writeHead(200, headers);
    arg2.end(body);
    return;
  }
  return { statusCode: 200, headers, body };
}

module.exports = universalHandler;
module.exports.handler = universalHandler;
