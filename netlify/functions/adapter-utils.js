const { Buffer } = require('node:buffer');

function createRequest(event) {
  let bodyStr = event.body;
  if (event.isBase64Encoded && bodyStr) {
    bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8');
  }

  let parsedBody = null;
  if (bodyStr) {
    try {
      parsedBody = JSON.parse(bodyStr);
    } catch {
      parsedBody = bodyStr;
    }
  }

  const headers = {};
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      headers[key.toLowerCase()] = value;
    }
  }

  const queryString = event.rawQuery || (event.queryStringParameters ? new URLSearchParams(event.queryStringParameters).toString() : '');
  const url = (event.path || '/') + (queryString ? `?${queryString}` : '');

  return {
    method: event.httpMethod || 'GET',
    url,
    headers,
    body: parsedBody || bodyStr || null,
    async *[Symbol.asyncIterator]() {
      if (bodyStr) {
        yield Buffer.from(bodyStr, 'utf8');
      }
    },
  };
}

function createResponse() {
  let statusCode = 200;
  const headers = {};
  let body = '';

  return {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(code, customHeaders = {}) {
      statusCode = code;
      if (customHeaders && typeof customHeaders === 'object') {
        for (const [k, v] of Object.entries(customHeaders)) {
          headers[k.toLowerCase()] = v;
        }
      }
    },
    end(data) {
      if (data) {
        body += typeof data === 'string' ? data : data.toString('utf8');
      }
    },
    toNetlifyResponse() {
      return {
        statusCode,
        headers,
        body,
      };
    },
  };
}

module.exports = { createRequest, createResponse };
