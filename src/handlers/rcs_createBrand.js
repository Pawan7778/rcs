import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import ddbDocClient from "../utils/db-client.js";
import { sendResponse } from "../utils/response.js";

const USER_TABLE = process.env.USER_TABLE;
const BRAND_TABLE = process.env.BRAND_TABLE;
const BRAND_BUCKET = process.env.BRAND_BUCKET || "default-brand-bucket";

// Standard S3 client creation
const s3Client = new S3Client({});

export const handler = async (event) => {
  try {
    const authorizerContext = event.requestContext && event.requestContext.authorizer ? event.requestContext.authorizer : {};
    const callerUsername = authorizerContext.principalId; 

    // 1. Verify caller role (Admins only)
    if (!callerUsername) {
       return sendResponse(401, { message: "Unauthorized" });
    }
    const { Item: callerRecord } = await ddbDocClient.send(new GetCommand({ TableName: USER_TABLE, Key: { username: callerUsername } }));
    if (!callerRecord || (callerRecord.role !== "admin" && callerRecord.role !== "super-admin")) {
      return sendResponse(403, { message: "Forbidden: Only admins and super-admins can create brands." });
    }

    // 2. Parse payload
    const body = JSON.parse(event.body || "{}");
    const { username, brandName, officialWebsiteUrl, industryType, designation } = body;

    if (!username || !brandName || !officialWebsiteUrl || !industryType || !designation) {
      return sendResponse(400, { message: "Missing required fields: username, brandName, officialWebsiteUrl, industryType, designation" });
    }

    // 3. Check if brand already exists
    const { Item: existingBrand } = await ddbDocClient.send(new GetCommand({ TableName: BRAND_TABLE, Key: { brandName } }));
    if (existingBrand) {
      return sendResponse(409, { message: "Brand name already exists" });
    }

    // 4. Fetch the target user details
    const { Item: targetUser } = await ddbDocClient.send(new GetCommand({ TableName: USER_TABLE, Key: { username } }));
    if (!targetUser) {
      return sendResponse(404, { message: "Target user not found" });
    }

    // 5. Generate Presigned URL
    const s3Key = `rcs_brand/${brandName}/brandlogo.jpg`;
    
    const command = new PutObjectCommand({
      Bucket: BRAND_BUCKET,
      Key: s3Key,
      ContentType: "image/jpeg",
    });

    // Create Presigned URL valid for 15 minutes (900 seconds)
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    // Official public URL format (without parameters)
    const brandLogoUrl = `https://${BRAND_BUCKET}.s3.amazonaws.com/${s3Key}`;

    // 6. Assemble contact info and insert to DB
    const contactPersonDetails = {
      firstName: targetUser.firstName || "",
      lastName: targetUser.lastName || "",
      designation: designation,
      mobileNumber: targetUser.mobileNumber || "",
      email: targetUser.email || ""
    };

    const newBrand = {
      brandName,
      officialWebsiteUrl,
      brandLogoUrl,
      industryType,
      contactPersonDetails,
      linkedUser: username,
      createdBy: callerUsername,
      createdAt: new Date().toISOString()
    };

    await ddbDocClient.send(new PutCommand({ TableName: BRAND_TABLE, Item: newBrand }));

    // 7. Return success with the upload URL
    return sendResponse(201, {
      message: "Brand created successfully. Please use the presignedUploadUrl to upload the brand logo.",
      brand: newBrand,
      presignedUploadUrl: presignedUrl
    });

  } catch (error) {
    console.error("CreateBrand error:", error);
    return sendResponse(500, { message: "Internal server error" });
  }
};
