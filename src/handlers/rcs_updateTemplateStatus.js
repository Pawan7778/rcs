import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import ddbDocClient from "../utils/db-client.js";
import { sendResponse } from "../utils/response.js";

const TEMPLATE_TABLE = process.env.TEMPLATE_TABLE;
const USER_TABLE = process.env.USER_TABLE;

export const handler = async (event) => {
  try {
    const authorizerContext = event.requestContext && event.requestContext.authorizer ? event.requestContext.authorizer : {};
    const callerUsername = authorizerContext.principalId;

    if (!callerUsername) {
      return sendResponse(401, { message: "Unauthorized" });
    }

    // 1. Fetch caller role for authorization
    const { Item: callerRecord } = await ddbDocClient.send(new GetCommand({ 
      TableName: USER_TABLE, 
      Key: { username: callerUsername } 
    }));
    
    const isAdmin = callerRecord && (callerRecord.role === "admin" || callerRecord.role === "super-admin");

    if (!isAdmin) {
        return sendResponse(403, { message: "Forbidden: Only admins and super-admins can update template status." });
    }

    // 2. Parse payload
    const body = JSON.parse(event.body || "{}");
    const { templateName, status } = body;

    if (!templateName || !status) {
      return sendResponse(400, { message: "Missing required fields: templateName and status." });
    }

    const validStatuses = ["active", "inactive", "pending"];
    if (!validStatuses.includes(status)) {
      return sendResponse(400, { message: `Invalid status. Valid values: ${validStatuses.join(", ")}` });
    }

    // 3. Update status in DynamoDB
    const updateParams = {
      TableName: TEMPLATE_TABLE,
      Key: { templateName },
      UpdateExpression: "SET #status = :s, updatedAt = :u",
      ExpressionAttributeNames: { "#status": "status" }, // 'status' is a reserved keyword in DDB
      ExpressionAttributeValues: {
        ":s": status,
        ":u": new Date().toISOString()
      },
      ConditionExpression: "attribute_exists(templateName)", // Ensure template exists
      ReturnValues: "ALL_NEW"
    };

    const { Attributes } = await ddbDocClient.send(new UpdateCommand(updateParams));

    return sendResponse(200, {
      message: "Template status updated successfully.",
      template: Attributes
    });

  } catch (error) {
    console.error("UpdateTemplateStatus error:", error);
    if (error.name === "ConditionalCheckFailedException") {
        return sendResponse(404, { message: "Template not found." });
    }
    return sendResponse(500, { message: "Internal server error" });
  }
};
