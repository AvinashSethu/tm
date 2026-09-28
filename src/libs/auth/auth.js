import "server-only";
import { dynamoDB } from "@/src/utils/awsAgent";
import {
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { timingSafeEqual } from "crypto";
import {
  hashPassword,
  verifyPassword,
  generateOTP,
  generateToken,
  verifyToken,
} from "@/src/utils/crypto";
import { randomUUID } from "crypto";
import { sendOTPToMail } from "@/src/utils/mail";
import { getValidProSubscription } from "@/src/libs/proSubscription/subscriptionController";
import { normalizeEmail } from "@/src/utils/email";

const USER_TABLE = `${process.env.AWS_DB_NAME}users`;

export async function getUserByEmail(email) {
  const target = normalizeEmail(email);
  const params = {
    TableName: `${process.env.AWS_DB_NAME}users`,
    IndexName: "GSI1-index",
    KeyConditionExpression: "#gsi1PKey = :email AND #gsi1SKey = :email",
    ExpressionAttributeNames: {
      "#gsi1PKey": "GSI1-pKey",
      "#gsi1SKey": "GSI1-sKey",
    },
    ExpressionAttributeValues: {
      ":email": `USER#${target}`,
    },
  };

  let result;
  try {
    result = await dynamoDB.send(new QueryCommand(params));
  } catch (error) {
    console.error("Error fetching user by email:", error);
    throw error; // propagate real DynamoDB errors — do NOT swallow as null
  }

  if (!result.Items || result.Items.length === 0) {
    return null; // user genuinely not found
  }

  const user = result.Items[0];

  // Self-heal: enforce invariant `user.email === GSI key`. The NextAuth
  // DynamoDB adapter's linkAccount path can rewrite GSI without touching
  // email, leaving the session callback unable to re-find the row by
  // user.email and causing infinite "loading" on the sign-in form.
  if (normalizeEmail(user.email) !== target) {
    try {
      await dynamoDB.send(
        new UpdateCommand({
          TableName: USER_TABLE,
          Key: { pKey: user.pKey, sKey: user.sKey },
          UpdateExpression: "SET email = :e, updatedAt = :now",
          ConditionExpression: "id = :id",
          ExpressionAttributeValues: {
            ":e": target,
            ":id": user.id,
            ":now": Date.now(),
          },
        }),
      );
      console.warn(
        `[getUserByEmail] self-healed email field for ${user.id}: ${JSON.stringify(user.email)} -> ${JSON.stringify(target)}`,
      );
      user.email = target;
    } catch (err) {
      console.error(`[getUserByEmail] self-heal failed for ${user.id}:`, err);
    }
  }

  const isUpdated = await updateUserProSubscription(user);
  if (!isUpdated) {
    return user;
  }

  const updatedResult = await dynamoDB.send(new QueryCommand(params));
  return updatedResult.Items[0];
}

export async function updateUserProSubscription(user) {
  // 1. Fetch the latest valid pro‐subscription for this user.
  const result = await getValidProSubscription(user.id);
  // 2. Determine desired fields:
  //    - If there's a successful active subscription that hasn't expired, user should be "PRO".
  //    - Otherwise, user should be "FREE".
  let desiredAccountType = "FREE";
  let desiredExpiresAt = null;
  let desiredSource = null;

  if (result.success && Array.isArray(result.data) && result.data.length > 0) {
    const sub = result.data[0]; // assume sorted so [0] is most relevant
    const now = Date.now();
    const isActive = sub.status === "active" && sub.expiresAt > now;

    if (isActive) {
      desiredAccountType = "PRO";
      desiredExpiresAt = sub.expiresAt;
      desiredSource = sub.subscriptionSource || null;
    }
  }

  // 3. If user currently is PRO but no valid subscription → revert to FREE
  //    (Note: desiredAccountType takes care of that.)

  // 4. Compare with existing user fields to see if any change is needed:
  const currentlyPro = user.accountType === "PRO";
  const currentExpiresAt = user.subscriptionExpiresAt || null;
  const currentSource = user.subscriptionSource || null;

  const noChange =
    user.accountType === desiredAccountType &&
    currentExpiresAt === desiredExpiresAt &&
    currentSource === desiredSource;

  if (noChange) {
    return false; // nothing to update
  }

  // 5. Build a minimal UpdateExpression that sets the three fields:
  const nowTs = Date.now();
  const updateParams = {
    TableName: USER_TABLE,
    Key: { pKey: user.pKey, sKey: user.sKey },
    UpdateExpression:
      "SET accountType = :acct, subscriptionExpiresAt = :exp, subscriptionSource = :src, updatedAt = :u",
    ExpressionAttributeValues: {
      ":acct": desiredAccountType,
      ":exp": desiredExpiresAt,
      ":src": desiredSource,
      ":u": nowTs,
    },
  };

  // 6. Execute the update
  try {
    await dynamoDB.send(new UpdateCommand(updateParams));
    return true;
  } catch (error) {
    console.error("Error updating user pro subscription:", error);
    throw new Error("Failed to update user pro subscription");
  }
}
export async function updateUserEmailVerified(email) {
  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error("User not found");
  }
  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: `${process.env.AWS_DB_NAME}users`,
        Key: { pKey: user.pKey, sKey: user.sKey },
        UpdateExpression: "set emailVerified = :emailVerified",
        ExpressionAttributeValues: { ":emailVerified": true },
      })
    );
  } catch (error) {
    console.error("Error updating user email verified:", error);
    throw new Error("Failed to update user email verified");
  }
}

export async function createUser({ email, name, password }) {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await getUserByEmail(normalizedEmail);
  //check if user is already verified
  if (existingUser?.emailVerified) {
    throw new Error("A user with that email already exists");
  }
  if (existingUser) {
    await dynamoDB.send(
      new DeleteCommand({
        TableName: `${process.env.AWS_DB_NAME}users`,
        Key: {
          pKey: existingUser.pKey,
          sKey: existingUser.sKey,
        },
      })
    );
  }

  const userID = randomUUID();
  const hashedPassword = await hashPassword(password);
  const params = {
    TableName: `${process.env.AWS_DB_NAME}users`,
    Item: {
      pKey: `USER#${userID}`,
      sKey: `USER#${userID}`,
      email: normalizedEmail,
      name: name || "",
      id: userID,
      password: hashedPassword,
      "GSI1-pKey": `USER#${normalizedEmail}`,
      "GSI1-sKey": `USER#${normalizedEmail}`,
      emailVerified: false, // or you might store a timestamp once verified
      role: "user", // user, admin, superadmin
      status: "active", // active, inactive, deleted
      otp: {
        otp: generateOTP(),
        expiresAt: Date.now() + 1000 * 60 * 5, // 5 minutes from now
        attemptsRemaining: 3,
      },
      phoneNumber: "",
      gender: "",
      accountType: "FREE",
      subscriptionExpiresAt: 0,
      billingInfo: [],
      subscriptionSource: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    ConditionExpression: "attribute_not_exists(email)",
  };

  try {
    await dynamoDB.send(new PutCommand(params));
    await sendOTPToMail({ to: email, otp: params.Item.otp.otp });
    return {
      success: true,
      message: "OTP sent to email",
    };
  } catch (error) {
    throw new Error("Failed to create user");
  }
}

export async function resendOTP({ email }) {
  const user = await getUserByEmail(email);
  if (!user) {
    // Return success to prevent user enumeration
    return { success: true, message: "If an account exists, an OTP has been sent" };
  }
  if (user.otp.expiresAt > Date.now() && user.otp.attemptsRemaining > 0) {
    await sendOTPToMail({ to: email, otp: user.otp.otp });
    return {
      success: true,
      message: "OTP sent",
    };
  }

  if (user.otp.attemptsRemaining === 0) {
    throw new Error("OTP attempts exceeded");
  }

  user.otp.otp = generateOTP();
  user.otp.expiresAt = Date.now() + 1000 * 60 * 5; // 5 minutes from now

  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: `${process.env.AWS_DB_NAME}users`,
        Key: { pKey: user.pKey, sKey: user.sKey },
        UpdateExpression: "set otp.otp = :otp, otp.expiresAt = :expiresAt",
        ExpressionAttributeValues: {
          ":otp": user.otp.otp,
          ":expiresAt": user.otp.expiresAt,
        },
      })
    );
    await sendOTPToMail({ to: email, otp: user.otp.otp });
    return {
      success: true,
      message: "OTP sent",
    };
  } catch (error) {
    console.error("Error sending OTP:", error);
    throw new Error("Failed to send OTP");
  }
}

export async function verifyOTP({ email, otp }) {
  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error("Invalid email or OTP");
  }
  //reduce OTP attempts
  if (user.otp.attemptsRemaining > 0) {
    user.otp.attemptsRemaining--;
    await dynamoDB.send(
      new UpdateCommand({
        TableName: `${process.env.AWS_DB_NAME}users`,
        Key: { pKey: user.pKey, sKey: user.sKey },
        UpdateExpression: "set otp.attemptsRemaining = :attemptsRemaining",
        ExpressionAttributeValues: {
          ":attemptsRemaining": user.otp.attemptsRemaining,
        },
      })
    );
  } else {
    throw new Error("OTP attempts exceeded. Please request a new OTP.");
  }
  //check if OTP is expired first
  if (user.otp.expiresAt < Date.now()) {
    throw new Error("OTP expired. Please request a new OTP.");
  }
  //check if OTP is correct using timing-safe comparison
  const storedOtp = Buffer.from(String(user.otp.otp));
  const providedOtp = Buffer.from(String(otp));
  if (storedOtp.length !== providedOtp.length || !timingSafeEqual(storedOtp, providedOtp)) {
    throw new Error("Invalid OTP");
  }

  await dynamoDB.send(
    new UpdateCommand({
      TableName: `${process.env.AWS_DB_NAME}users`,
      Key: { pKey: user.pKey, sKey: user.sKey },
      UpdateExpression: "set emailVerified = :emailVerified",
      ExpressionAttributeValues: { ":emailVerified": true },
    })
  );
  return {
    success: true,
    message: "Email verified",
  };
}

export async function forgotPassword({ email }) {
  const user = await getUserByEmail(email);
  if (!user) {
    // Return success to prevent user enumeration
    return { success: true, message: "If an account exists, an OTP has been sent" };
  }
  user.otp = user.otp || {};
  user.otp.otp = generateOTP();
  user.otp.expiresAt = Date.now() + 1000 * 60 * 5; // 5 minutes from now
  user.otp.attemptsRemaining = 3;
  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: `${process.env.AWS_DB_NAME}users`,
        Key: { pKey: user.pKey, sKey: user.sKey },
        UpdateExpression: "set otp = :otp",
        ExpressionAttributeValues: { ":otp": user.otp },
      })
    );
    await sendOTPToMail({ to: email, otp: user.otp.otp, purpose: "reset" });
    return {
      success: true,
      message: "OTP sent",
    };
  } catch (error) {
    console.error("Error sending OTP:", error);
    throw new Error("Failed to send OTP");
  }
}

export async function verifyOTPForPasswordReset({ email, otp }) {
  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error("Invalid email or OTP");
  }
  //reduce OTP attempts
  if (user.otp.attemptsRemaining > 0) {
    user.otp.attemptsRemaining--;
    await dynamoDB.send(
      new UpdateCommand({
        TableName: `${process.env.AWS_DB_NAME}users`,
        Key: { pKey: user.pKey, sKey: user.sKey },
        UpdateExpression: "set otp.attemptsRemaining = :attemptsRemaining",
        ExpressionAttributeValues: {
          ":attemptsRemaining": user.otp.attemptsRemaining,
        },
      })
    );
  } else {
    throw new Error("OTP attempts exceeded. Please request a new OTP.");
  }
  //check if OTP is expired first
  if (user.otp.expiresAt < Date.now()) {
    throw new Error("OTP expired. Please request a new OTP.");
  }
  //check if OTP is correct using timing-safe comparison
  const storedOtp = Buffer.from(String(user.otp.otp));
  const providedOtp = Buffer.from(String(otp));
  if (storedOtp.length !== providedOtp.length || !timingSafeEqual(storedOtp, providedOtp)) {
    throw new Error("Invalid OTP");
  }

  //generate token
  const token = generateToken({ id: user.pKey.split("#")[1], email });
  //token is reserved keyword in dynamoDB so we need to use a different name
  await dynamoDB.send(
    new UpdateCommand({
      TableName: `${process.env.AWS_DB_NAME}users`,
      Key: { pKey: user.pKey, sKey: user.sKey },
      UpdateExpression: "set otp.#tk = :token, otp.isTokenUsed = :isTokenUsed",
      ExpressionAttributeNames: {
        "#tk": "token",
      },
      ExpressionAttributeValues: {
        ":token": token,
        ":isTokenUsed": false,
      },
    })
  );
  return {
    success: true,
    message: "OTP verified",
    data: {
      token: token,
    },
  };
}

export async function updateUserPassword({ password, token }) {
  const { email, id } = verifyToken(token);
  if (!email || !id) {
    throw new Error("Time out");
  }
  const user = await getUserByEmail(email);
  if (!user) {
    throw new Error("User not found");
  }
  if (!user.emailVerified) {
    throw new Error("Email not verified");
  }
  if (user.otp?.isTokenUsed) {
    throw new Error("Token already used");
  }
  // A valid signature only proves the JWT was signed with JWT_SECRET; it
  // must also be the exact token issued by OTP verification for this user.
  const storedToken = Buffer.from(user.otp?.token || "");
  const providedToken = Buffer.from(token);
  if (
    id !== user.pKey.split("#")[1] ||
    storedToken.length === 0 ||
    storedToken.length !== providedToken.length ||
    !timingSafeEqual(storedToken, providedToken)
  ) {
    throw new Error("Invalid token");
  }
  const hashedPassword = await hashPassword(password);
  //check if new password is the same as the old password
  if (user.password) {
    const isSamePassword = await verifyPassword(password, user.password);
    if (isSamePassword) {
      throw new Error("New password cannot be the same as the old password");
    }
  }
  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: `${process.env.AWS_DB_NAME}users`,
        Key: { pKey: user.pKey, sKey: user.sKey },
        UpdateExpression:
          "set password = :password, otp.isTokenUsed = :isTokenUsed, otp.#tk = :token",
        // Consume the token atomically so two concurrent submits can't both succeed.
        ConditionExpression:
          "otp.#tk = :issuedToken AND otp.isTokenUsed = :notUsed",
        ExpressionAttributeNames: {
          "#tk": "token",
        },
        ExpressionAttributeValues: {
          ":password": hashedPassword,
          ":isTokenUsed": true,
          ":token": null,
          ":issuedToken": token,
          ":notUsed": false,
        },
      })
    );
    return {
      success: true,
      message: "Password updated",
    };
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      throw new Error("Token already used");
    }
    console.error("Error updating user password:", error);
    throw new Error("Failed to update user password");
  }
}

export async function changePassword({ userID, oldPassword, newPassword }) {
  const TableName = `${process.env.AWS_DB_NAME}users`;
  const Key = {
    pKey: `USER#${userID}`,
    sKey: `USER#${userID}`,
  };

  // Fetch user to verify old password
  const { Item: user } = await dynamoDB.send(
    new GetCommand({ TableName, Key })
  );

  if (!user) {
    throw new Error("User not found");
  }

  // If user has no password (e.g. Google auth only), they can't change it this way
  // Unless we allow setting a password for the first time without old password?
  // For security, let's require old password if one exists.

  if (user.password) {
    const isMatch = await verifyPassword(oldPassword, user.password);
    if (!isMatch) {
      throw new Error("Incorrect old password");
    }

    // Check if new password is same as old
    const isSame = await verifyPassword(newPassword, user.password);
    if (isSame) {
      throw new Error("New password cannot be the same as the old password");
    }
  } else {
    // If no password exists (Google login), we might want to allow setting one
    // But usually we'd want some verification. For now, let's assume this flow is for password users.
    // Or we can allow it if they are logged in (which they are).
    // Let's allow it.
  }

  const hashedPassword = await hashPassword(newPassword);

  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName,
        Key,
        UpdateExpression: "set password = :password, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":password": hashedPassword,
          ":updatedAt": Date.now(),
        },
      })
    );
    return {
      success: true,
      message: "Password changed successfully",
    };
  } catch (error) {
    console.error("Error changing password:", error);
    throw new Error("Failed to change password");
  }
}
