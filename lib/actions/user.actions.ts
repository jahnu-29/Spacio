"use server";

import { createAdminClient, createSessionClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { Query, ID, Users, Client } from "node-appwrite";
import { parseStringify } from "@/lib/utils";
import { cookies } from "next/headers";
import { avatarPlaceholderUrl } from "@/constants";
import { redirect } from "next/navigation";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getUserByEmail = async (email: string) => {
  const { databases } = await createAdminClient();

  const result = await databases.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.usersCollectionId,
    [Query.equal("email", [email])],
  );

  return result.total > 0 ? result.documents[0] : null;
};

const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
};

// Builds a raw admin client for the Users API
const createUsersClient = () => {
  const client = new Client()
    .setEndpoint(appwriteConfig.endpointUrl)
    .setProject(appwriteConfig.projectId)
    .setKey(appwriteConfig.secretKey);
  return new Users(client);
};

// ─── Auth Actions ─────────────────────────────────────────────────────────────

export const sendEmailOTP = async ({ email }: { email: string }) => {
  const { account } = await createAdminClient();

  try {
    const session = await account.createEmailToken(ID.unique(), email);

    console.log("EMAIL TOKEN RESPONSE:");
    console.log(JSON.stringify(session, null, 2));

    return session.userId;
  } catch (error) {
    handleError(error, "Failed to send email OTP");
  }
};

export const createAccount = async ({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) => {
  const existingUser = await getUserByEmail(email);

  const accountId = await sendEmailOTP({ email });
  if (!accountId) throw new Error("Failed to send an OTP");

  if (!existingUser) {
    const { databases } = await createAdminClient();

    await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.usersCollectionId,
      ID.unique(),
      {
        fullName,
        email,
        avatar: avatarPlaceholderUrl,
        accountId,
      },
    );
  }

  return parseStringify({ accountId });
};
console.log("SECRET KEY:", appwriteConfig.secretKey);
export const verifySecret = async ({
  accountId,
  password,
}: {
  accountId: string;
  password: string;
}) => {
  try {
    console.log("ACCOUNT ID RECEIVED:", accountId);
    console.log("OTP RECEIVED:", password);

    // Step 1: Create the session (secret will be empty — that's expected)
    const { account } = await createAdminClient();
    const session = await account.createSession(accountId, password);

    console.log("SESSION CREATED:", session.$id);
    console.log("SESSION USER ID:", session.userId);

    // Step 2: Generate a JWT tied to this session using the admin Users API.
    // users.createJWT(userId, sessionId) — this is the ONLY way to get a
    // usable auth token when session.secret is empty on Appwrite Cloud 1.6+.
    const users = createUsersClient();
    const jwtResponse = await users.createJWT(session.userId, session.$id);

    console.log("JWT CREATED:", !!jwtResponse.jwt);

    // Step 3: Store the JWT as an httpOnly cookie.
    // createSessionClient() will use client.setJWT(jwt) to authenticate.
    (await cookies()).set("appwrite-jwt", jwtResponse.jwt, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: false, // change to true in production (HTTPS)
    });

    console.log("JWT COOKIE SET SUCCESSFULLY");

    return parseStringify({ sessionId: session.$id });
  } catch (error) {
    handleError(error, "Failed to verify OTP");
  }
};

export const getCurrentUser = async () => {
  try {
    const { databases, account } = await createSessionClient();

    const result = await account.get();

    const user = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.usersCollectionId,
      [Query.equal("accountId", result.$id)],
    );

    if (user.total <= 0) return null;

    return parseStringify(user.documents[0]);
  } catch (error) {
    console.log(error);
  }
};

export const signOutUser = async () => {
  try {
    (await cookies()).delete("appwrite-jwt");
  } catch (error) {
    handleError(error, "Failed to sign out user");
  } finally {
    redirect("/sign-in");
  }
};
export const signInUser = async ({ email }: { email: string }) => {
  try {
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      await sendEmailOTP({ email });
      return parseStringify({ accountId: existingUser.accountId });
    }

    return parseStringify({ accountId: null, error: "User not found" });
  } catch (error) {
    handleError(error, "Failed to sign in user");
  }
};
