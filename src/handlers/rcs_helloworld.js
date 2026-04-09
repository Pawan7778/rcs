import { sendResponse } from "../utils/response";

exports.handler = async (event) => {
  return sendResponse(200, "Hello world");
};
