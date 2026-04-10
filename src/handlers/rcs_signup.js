import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import ddbDocClient from "../utils/db-client.js";
import { sendResponse } from "../utils/response.js";

const TABLE_NAME = process.env.USER_TABLE;

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { username, email, password, role } = body;

    if (!username || !email || !password) {
      return sendResponse(400, { message: "Missing required fields: username, email, password" });
    }

    // Default role to 'user' if not provided or invalid
    let assignedRole = "user";
    if (role && ["user", "admin", "super-admin"].includes(role)) {
      assignedRole = role;
    }

    // Check if user already exists
    const getParams = {
      TableName: TABLE_NAME,
      Key: { username },
    };
    const { Item } = await ddbDocClient.send(new GetCommand(getParams));

    if (Item) {
      return sendResponse(409, { message: "Username already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const timestamp = new Date().toISOString();

    const putParams = {
      TableName: TABLE_NAME,
      Item: {
        username,
        email,
        password: hashedPassword,
        role: assignedRole,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };

    await ddbDocClient.send(new PutCommand(putParams));

    return sendResponse(201, {
      message: "User created successfully",
      username,
      role: assignedRole,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return sendResponse(500, { message: "Internal server error" });
  }
};
