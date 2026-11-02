const { handleAtlassianRoute } = require('./_atlassian-handlers.js');

function handler(req, res) {
  return handleAtlassianRoute('config', req, res);
}

module.exports = handler;
module.exports.handler = handler;
