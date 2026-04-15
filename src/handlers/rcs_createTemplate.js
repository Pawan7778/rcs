import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import ddbDocClient from "../utils/db-client.js";
import { sendResponse } from "../utils/response.js";

const TEMPLATE_TABLE = process.env.TEMPLATE_TABLE;
const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET;

const s3Client = new S3Client({});

export const handler = async (event) => {
  try {
    const authorizerContext = event.requestContext && event.requestContext.authorizer ? event.requestContext.authorizer : {};
    const callerUsername = authorizerContext.principalId;

    if (!callerUsername) {
      return sendResponse(401, { message: "Unauthorized" });
    }

    const body = JSON.parse(event.body || "{}");
    const {
      botName,
      templateName,
      templateContentType,
      selectCardOrientation,
      selectMediaHeight,
      cardTitle,
      cardDescription
    } = body;

    if (!botName || !templateName || !templateContentType || !selectCardOrientation || !selectMediaHeight) {
      return sendResponse(400, { message: "Missing required fields." });
    }

    // Enum Validations
    const validContentTypes = ["text message", "rich card stand alone", "rich card carousel"];
    const validOrientations = ["vertical", "horizontal"];
    const validMediaHeights = ["short", "medium"];

    if (!validContentTypes.includes(templateContentType)) {
      return sendResponse(400, { message: `Invalid templateContentType. Valid values: ${validContentTypes.join(", ")}` });
    }
    if (!validOrientations.includes(selectCardOrientation)) {
      return sendResponse(400, { message: `Invalid selectCardOrientation. Valid values: ${validOrientations.join(", ")}` });
    }
    if (!validMediaHeights.includes(selectMediaHeight)) {
      return sendResponse(400, { message: `Invalid selectMediaHeight. Valid values: ${validMediaHeights.join(", ")}` });
    }

    // Check if templateName already exists
    const { Item: existingTemplate } = await ddbDocClient.send(new GetCommand({
      TableName: TEMPLATE_TABLE,
      Key: { templateName }
    }));

    if (existingTemplate) {
      return sendResponse(409, { message: "Template name/code already exists." });
    }

    // Generate Presigned URL for media if needed (simplifying for now)
    const s3Key = `templates/${botName}/${templateName}/media.jpg`;
    const command = new PutObjectCommand({
      Bucket: TEMPLATE_BUCKET,
      Key: s3Key,
      ContentType: "image/jpeg",
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    const mediaUrl = `https://${TEMPLATE_BUCKET}.s3.amazonaws.com/${s3Key}`;

    const newTemplate = {
      templateName,
      botName,
      templateContentType,
      selectCardOrientation,
      selectMediaHeight,
      mediaUrl,
      cardTitle,
      cardDescription,
      belongsTo: callerUsername,
      status: "pending", // Default status
      createdAt: new Date().toISOString()
    };

    await ddbDocClient.send(new PutCommand({
      TableName: TEMPLATE_TABLE,
      Item: newTemplate
    }));

    return sendResponse(201, {
      message: "Template created successfully.",
      template: newTemplate,
      presignedUploadUrl: presignedUrl
    });

  } catch (error) {
    console.error("CreateTemplate error:", error);
    return sendResponse(500, { message: "Internal server error" });
  }
};
