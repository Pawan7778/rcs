import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import ddbDocClient from "../utils/db-client.js";
import { sendResponse } from "../utils/response.js";

const BRAND_TABLE = process.env.BRAND_TABLE;
const BOT_TABLE = process.env.BOT_TABLE;

export const handler = async (event) => {
  try {
    const authorizerContext = event.requestContext && event.requestContext.authorizer ? event.requestContext.authorizer : {};
    const callerUsername = authorizerContext.principalId;

    if (!callerUsername) {
      return sendResponse(401, { message: "Unauthorized" });
    }

    const queryParams = event.queryStringParameters || {};
    const { brandName, onlyName } = queryParams;
    const isOnlyName = onlyName === "true";

    // CASE 1: Fetch specific brand details
    if (brandName) {
      const { Item: brand } = await ddbDocClient.send(new GetCommand({
        TableName: BRAND_TABLE,
        Key: { brandName }
      }));

      if (!brand) {
        return sendResponse(404, { message: "Brand not found" });
      }

      // Fetch the status from the bot table using a simple GetCommand (no Sort Key needed now)
      const { Item: bot } = await ddbDocClient.send(new GetCommand({
          TableName: BOT_TABLE,
          Key: { botName: brandName }
      }));

      const brandData = {
        ...brand,
        status: bot ? bot.status : "inactive"
      };

      return sendResponse(200, {
        message: "Brand retrieved successfully",
        brand: isOnlyName ? { brandName: brandData.brandName } : brandData
      });
    }

    // CASE 2: Fetch all brand names and statuses (sorted by createdAt)
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: BOT_TABLE,
      IndexName: "BotGlobalIndex",
      KeyConditionExpression: "#type = :t",
      ExpressionAttributeNames: { "#type": "type" },
      ExpressionAttributeValues: { ":t": "BOT" },
      ScanIndexForward: false // Descending order (newest first)
    }));

    const brandList = (result.Items || []).map(item => {
      if (isOnlyName) {
        return { brandName: item.botName };
      }
      return {
        brandName: item.botName,
        status: item.status,
        createdAt: item.createdAt
      };
    });

    return sendResponse(200, {
      message: "Brands list retrieved successfully",
      count: brandList.length,
      brands: brandList
    });

  } catch (error) {
    console.error("GetBrand error:", error);
    return sendResponse(500, { message: "Internal server error" });
  }
};
