const { handleAtlassianRoute } = require('./_atlassian-handlers.js');

function handler(req, res) {
  return handleAtlassianRoute('pull-confluence', req, res);
}

module.exports = handler;
module.exports.handler = handler;
