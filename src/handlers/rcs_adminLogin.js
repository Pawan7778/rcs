import { GetCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import ddbDocClient from "../utils/db-client.js";
import { sendResponse } from "../utils/response.js";

const TABLE_NAME = process.env.USER_TABLE;
const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { username, password } = body;

    if (!username || !password) {
      return sendResponse(400, { message: "Missing username or password" });
    }

    // Get user from DynamoDB
    const getParams = {
      TableName: TABLE_NAME,
      Key: { username },
    };
    const { Item } = await ddbDocClient.send(new GetCommand(getParams));

    if (!Item) {
      return sendResponse(401, { message: "Invalid username or password" });
    }

    // Ensure they have the correct role for this admin endpoint
    if (Item.role !== "admin" && Item.role !== "super-admin") {
      return sendResponse(403, { message: "Access denied. Admin privileges required." });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, Item.password);
    if (!isPasswordValid) {
      return sendResponse(401, { message: "Invalid username or password" });
    }

    // Generate JWT
    const token = jwt.sign(
      { username: Item.username, role: Item.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    return sendResponse(200, {
      message: "Login successful",
      token,
      username: Item.username,
      role: Item.role
    });

  } catch (error) {
    console.error("Admin login error:", error);
    return sendResponse(500, { message: "Internal server error" });
  }
};
