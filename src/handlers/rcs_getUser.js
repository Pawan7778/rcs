import { ScanCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import ddbDocClient from "../utils/db-client.js";
import { sendResponse } from "../utils/response.js";

const TABLE_NAME = process.env.USER_TABLE;

export const handler = async (event) => {
  try {
    const authorizerContext = event.requestContext && event.requestContext.authorizer ? event.requestContext.authorizer : {};
    const callerUsername = authorizerContext.principalId; 

    // 1. Fetch caller from DB to verify role
    if (!callerUsername) {
       return sendResponse(401, { message: "Unauthorized" });
    }

    const getParams = {
      TableName: TABLE_NAME,
      Key: { username: callerUsername },
    };
    const { Item: callerRecord } = await ddbDocClient.send(new GetCommand(getParams));

    if (!callerRecord || (callerRecord.role !== "admin" && callerRecord.role !== "super-admin")) {
      return sendResponse(403, { message: "Forbidden: Only admins and super-admins can view all users." });
    }

    // 2. Determine fetch strategy based on query parameter
    const queryParams = event.queryStringParameters || {};
    const fetchType = queryParams.type ? queryParams.type.toLowerCase() : "";

    if (fetchType !== "seller" && fetchType !== "client") {
      return sendResponse(400, { message: "Invalid or missing query parameter. '?type' strictly must be 'seller' or 'client'." });
    }

    const queryParamsObj = {
      TableName: TABLE_NAME,
      IndexName: "UserTypeIndex",
      KeyConditionExpression: "userType = :userType",
      ExpressionAttributeValues: {
        ":userType": fetchType,
      },
      ScanIndexForward: false // Natively sorts backwards targeting the new 'createdAt' Sort Key!
    };
    const { Items } = await ddbDocClient.send(new QueryCommand(queryParamsObj));

    // 3. Remove hashed passwords before returning the profiles!
    const safeUsers = (Items || []).map(user => {
      const { password, ...safeUser } = user;
      return safeUser;
    });

    return sendResponse(200, {
      message: "Users retrieved successfully",
      count: safeUsers.length,
      users: safeUsers
    });

  } catch (error) {
    console.error("GetUsers error:", error);
    return sendResponse(500, { message: "Internal server error" });
  }
};
