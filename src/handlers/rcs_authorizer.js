import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

// Policy helper function
const generatePolicy = (principalId, effect, resource) => {
  const authResponse = {};
  authResponse.principalId = principalId;
  if (effect && resource) {
    const policyDocument = {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: resource,
        },
      ],
    };
    authResponse.policyDocument = policyDocument;
  }
  return authResponse;
};

export const handler = async (event) => {
  try {
    const token = event.authorizationToken;

    if (!token) {
      throw new Error("Unauthorized");
    }

    // Token is usually in the format: "Bearer <token>"
    const tokenParts = token.split(" ");
    const tokenString = tokenParts.length === 2 ? tokenParts[1] : tokenParts[0];

    // Verify token
    const decoded = jwt.verify(tokenString, JWT_SECRET);

    // If verified successfully, allow access
    // decoded.username is used as the principalId
    return generatePolicy(decoded.username, "Allow", event.methodArn);

  } catch (error) {
    console.error("Authorizer error", error);
    // Return Deny policy instead of throwing to ensure standard 403 Response instead of 500
    // Actually, throwing "Unauthorized" specifically returns a 401 in API Gateway.
    throw new Error("Unauthorized");
  }
};
