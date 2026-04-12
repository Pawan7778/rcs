import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import ddbDocClient from "../utils/db-client.js";
import { sendResponse } from "../utils/response.js";

const USER_TABLE = process.env.USER_TABLE;
const BRAND_TABLE = process.env.BRAND_TABLE;
const BOT_TABLE = process.env.BOT_TABLE;
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
    const { username, brandName, officialWebsiteUrl, industryType, designation, companyAddress } = body;

    if (!username || !brandName || !officialWebsiteUrl || !industryType || !designation || !companyAddress) {
      return sendResponse(400, { message: "Missing required fields: username, brandName, officialWebsiteUrl, industryType, designation, companyAddress" });
    }

    // Validate sub-fields of companyAddress
    const { 
      AddressLine1, AddressLine2, City, State, Zip, Country 
    } = companyAddress;

    if (!AddressLine1 || !City || !State || !Zip || !Country) {
       return sendResponse(400, { message: "Missing address details: AddressLine1, City, State, Zip, and Country are required." });
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
      firstName: targetUser.firstName.toLowerCase() || "",
      lastName: targetUser.lastName.toLowerCase() || "",
      designation: designation.toLowerCase(),
      mobileNumber: targetUser.mobileNumber || "",
      email: targetUser.email || ""
    };

    const createdAt = new Date().toISOString();

    const newBrand = {
      brandName,
      officialWebsiteUrl: officialWebsiteUrl.toLowerCase(),
      brandLogoUrl,
      industryType: industryType.toLowerCase(),
      companyAddress: {
        AddressLine1: AddressLine1.toLowerCase(),
        AddressLine2: AddressLine2 ? AddressLine2.toLowerCase() : "",
        City: City.toLowerCase(),
        State: State.toLowerCase(),
        Zip: Zip.toLowerCase(),
        Country: Country.toLowerCase()
      },
      contactPersonDetails,
      linkedUser: username,
      createdBy: callerUsername,
      createdAt
    };

    const newBot = {
      botName: brandName,
      type: "BOT", // Added for global sorting GSI
      username: username,
      status: "inactive", // Default status for a new bot
      createdAt
    };

    // 7. Perform Inserts
    await ddbDocClient.send(new PutCommand({ TableName: BRAND_TABLE, Item: newBrand }));
    await ddbDocClient.send(new PutCommand({ TableName: BOT_TABLE, Item: newBot }));

    newBrand.status = newBot.status
    
    // 8. Return success with the upload URL
    return sendResponse(201, {
      message: "Brand and Bot created successfully.",
      brand: newBrand,
      bot: newBot,
      presignedUploadUrl: presignedUrl
    });

  } catch (error) {
    console.error("CreateBrand error:", error);
    return sendResponse(500, { message: "Internal server error" });
  }
};
