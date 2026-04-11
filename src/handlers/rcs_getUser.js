import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
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

    // 2. Fetch all users from the table
    const scanParams = {
      TableName: TABLE_NAME,
    };
    
    // Note: For very large tables, ScanCommand will paginate. 
    // This example fetches the first page of results up to 1MB.
    const { Items } = await ddbDocClient.send(new ScanCommand(scanParams));

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
