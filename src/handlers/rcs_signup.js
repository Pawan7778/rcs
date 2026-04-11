import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import ddbDocClient from "../utils/db-client.js";
import { sendResponse } from "../utils/response.js";
import { isValidEmail, isValidIndianMobileNumber, isValidHexColor } from "../utils/validation.js";

const TABLE_NAME = process.env.USER_TABLE;

export const handler = async (event) => {
  try {
    const authorizerContext = event.requestContext && event.requestContext.authorizer ? event.requestContext.authorizer : {};
    const isSetupMode = authorizerContext.isSetupMode === "true";
    const callerUsername = authorizerContext.principalId; // Populated by JWT verify or Setup key

    let callerRecord = null;

    // 1. Fetch caller from DB to verify role and get createdBy lineage
    if (!isSetupMode && callerUsername) {
      const getParams = {
        TableName: TABLE_NAME,
        Key: { username: callerUsername },
      };
      const { Item } = await ddbDocClient.send(new GetCommand(getParams));

      if (!Item || (Item.role !== "admin" && Item.role !== "super-admin")) {
        return sendResponse(403, { message: "Forbidden: Only admins and super-admins can create accounts." });
      }
      callerRecord = Item;
    }

    // 2. Parse payload
    const body = JSON.parse(event.body || "{}");
    let { username, email, password, role, billingMethod, priority, status, billingCycle, expiryDate, mobileNumber, userType, themeColor, configuration, firstName, lastName } = body;

    if (!username || !email || !password || !mobileNumber) {
      return sendResponse(400, { message: "Missing required fields: username, email, password, mobileNumber" });
    }

    if (!isValidEmail(email)) {
      return sendResponse(400, { message: "Invalid email format." });
    }

    if (!isValidIndianMobileNumber(mobileNumber)) {
      return sendResponse(400, { message: "Invalid mobile number. Must be a valid Indian number." });
    }

    username = username.toLowerCase();

    const requestedRole = role || "user"; // strict defaults

    let userProfilesFields = {};
    if (requestedRole === "user") {
      if (billingMethod && !["wallet", "credit"].includes(billingMethod.toLowerCase())) {
        return sendResponse(400, { message: "Invalid billingMethod. Must be wallet or credit." });
      }
      
      const prioStr = priority ? String(priority) : undefined;
      if (prioStr && !["high", "medium", "low"].includes(prioStr.toLowerCase())) {
        return sendResponse(400, { message: "Invalid priority. Must be high, medium, or low." });
      }

      if (status && !["active", "inactive"].includes(status.toLowerCase())) {
        return sendResponse(400, { message: "Invalid status. Must be active or inactive." });
      }

      if (billingCycle && !["monthly", "quarterly", "annually", "anualy"].includes(billingCycle.toLowerCase())) {
        return sendResponse(400, { message: "Invalid billingCycle." });
      }

      if (userType && !["client", "seller"].includes(userType.toLowerCase())) {
        return sendResponse(400, { message: "Invalid userType. Must be client or seller." });
      }

      if (themeColor && !isValidHexColor(themeColor)) {
        return sendResponse(400, { message: "Invalid themeColor. Must be a valid hex color code starting with #." });
      }

      const config = configuration || {};

      userProfilesFields = {
        billingMethod: billingMethod ? billingMethod.toLowerCase() : "wallet",
        priority: priority ? prioStr.toLowerCase() : "low",
        status: status ? status.toLowerCase() : "active",
        billingCycle: billingCycle ? billingCycle.toLowerCase() : "monthly",
        userType: userType ? userType.toLowerCase() : "client",
        themeColor: themeColor || "",
        configuration: {
          messageExpiry: !!config.messageExpiry,
          dirHandover: !!config.dirHandover,
          numberBlacklistAllow: !!config.numberBlacklistAllow,
          frequency: !!config.frequency
        }
      };

      if (expiryDate) {
        userProfilesFields.expiryDate = expiryDate;
      }
    }

    // 3. Enforce Permissions Matrix
    if (!isSetupMode) {
      if (callerRecord.role === "admin") {
        if (requestedRole === "super-admin") {
          return sendResponse(403, { message: "Forbidden: Admins cannot create super-admins." });
        }
      }
      // super-admin can create any role, so no else block needed
    } else {
      // Setup mode: can only be used to bootstrap a user, typically a super-admin.
      if (!["user", "admin", "super-admin"].includes(requestedRole)) {
        return sendResponse(400, { message: "Invalid role specified." });
      }
    }

    // 4. Calculate `createdBy`
    let createdBy = "system"; // Default for setup mode
    if (callerRecord) {
      if (callerRecord.role === "super-admin") {
        createdBy = callerRecord.username;
      } else if (callerRecord.role === "admin") {
        // Carry over the super-admin that created this admin
        createdBy = callerRecord.createdBy || "unknown-super-admin";
      }
    }

    // 5. Check if user already exists
    const checkUserParams = {
      TableName: TABLE_NAME,
      Key: { username },
    };
    const { Item: existingUser } = await ddbDocClient.send(new GetCommand(checkUserParams));

    if (existingUser) {
      return sendResponse(409, { message: "Username already exists" });
    }

    // 6. Hash password and insert
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const timestamp = new Date().toISOString();

    const userToSave = {
        username,
        email: email.toLowerCase(),
        firstName: firstName ? firstName.toLowerCase() : "",
        lastName: lastName ? lastName.toLowerCase() : "",
        mobileNumber,
        password: hashedPassword,
        role: requestedRole,
        createdBy,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...userProfilesFields
    };

    const putParams = {
      TableName: TABLE_NAME,
      Item: userToSave,
    };

    await ddbDocClient.send(new PutCommand(putParams));

    const { password: _, ...userWithoutPassword } = userToSave;

    return sendResponse(201, {
      message: "User created successfully",
      user: userWithoutPassword
    });

  } catch (error) {
    console.error("Signup error:", error);
    return sendResponse(500, { message: "Internal server error" });
  }
};
