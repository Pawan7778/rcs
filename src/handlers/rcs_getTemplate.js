import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import ddbDocClient from "../utils/db-client.js";
import { sendResponse } from "../utils/response.js";

const TEMPLATE_TABLE = process.env.TEMPLATE_TABLE;

export const handler = async (event) => {
  try {
    const authorizerContext = event.requestContext && event.requestContext.authorizer ? event.requestContext.authorizer : {};
    const callerUsername = authorizerContext.principalId;

    if (!callerUsername) {
      return sendResponse(401, { message: "Unauthorized" });
    }

    const { botName, status } = event.queryStringParameters || {};

    if (!botName) {
      return sendResponse(400, { message: "Missing required query parameter: botName" });
    }

    let queryParams = {
      TableName: TEMPLATE_TABLE,
      IndexName: "BotStatusIndex",
      KeyConditionExpression: "botName = :botName",
      ExpressionAttributeValues: {
        ":botName": botName
      }
    };

    if (status) {
      queryParams.KeyConditionExpression += " AND #status = :status";
      queryParams.ExpressionAttributeNames = { "#status": "status" };
      queryParams.ExpressionAttributeValues[":status"] = status;
    }

    const { Items } = await ddbDocClient.send(new QueryCommand(queryParams));

    return sendResponse(200, {
      message: "Templates retrieved successfully.",
      templates: Items
    });

  } catch (error) {
    console.error("GetTemplate error:", error);
    return sendResponse(500, { message: "Internal server error" });
  }
};
