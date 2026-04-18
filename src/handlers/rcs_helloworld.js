import { sendResponse } from "../utils/response.js";

export const handler = async (event) => {
  return sendResponse(200, {
    message: "Hello",
  });
};
