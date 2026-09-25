const listHandler = require('../../api/list-markdown-files.js');
const { createRequest, createResponse } = require('./adapter-utils.js');

exports.handler = async function (event) {
  const req = createRequest(event);
  const res = createResponse();

  await listHandler(req, res);
  return res.toNetlifyResponse();
};
