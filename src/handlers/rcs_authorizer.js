import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const SETUP_SECRET_KEY = process.env.SETUP_SECRET_KEY || "my_super_secret_setup_key_123";

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

    const tokenParts = token.split(" ");
    const type = tokenParts[0];
    const value = tokenParts.length === 2 ? tokenParts[1] : tokenParts[0];

    // Check for "Setup" bypass mechanism (e.g. "Authorization: Setup my_secret_key")
    if (type && type.toLowerCase() === "setup") {
      if (value === SETUP_SECRET_KEY) {
        const policy = generatePolicy("setup-admin", "Allow", event.methodArn);
        policy.context = {
          isSetupMode: "true" // API Gateway context stringifies values
        };
        return policy;
      }
      throw new Error("Unauthorized");
    }

    // Otherwise, verify as a standard JWT Bearer token
    const decoded = jwt.verify(value, JWT_SECRET);

    // If verified successfully, allow access
    const policy = generatePolicy(decoded.username, "Allow", event.methodArn);
    policy.context = {
      isSetupMode: "false"
    };
    return policy;

  } catch (error) {
    console.error("Authorizer error", error);
    // Return Deny policy instead of throwing to ensure standard 403 Response instead of 500
    throw new Error("Unauthorized");
  }
};
