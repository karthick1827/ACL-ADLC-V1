const saveHandler = require('../../api/save-markdown.js');
const { createRequest, createResponse } = require('./adapter-utils.js');

exports.handler = async function (event) {
  const req = createRequest(event);
  const res = createResponse();

  await saveHandler(req, res);
  return res.toNetlifyResponse();
};
