"use server";

import { Account, Avatars, Client, Databases, Storage } from "node-appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { cookies } from "next/headers";

// ─── Session Client ───────────────────────────────────────────────────────────
// Reads the JWT from the cookie and uses client.setJWT() to authenticate
// as the user. The JWT was generated server-side right after OTP verification.
export const createSessionClient = async () => {
  const jwtCookie = (await cookies()).get("appwrite-jwt");

  console.log("COOKIE appwrite-jwt found:", !!jwtCookie?.value);

  if (!jwtCookie?.value) {
    throw new Error("No session");
  }

  const client = new Client()
    .setEndpoint(appwriteConfig.endpointUrl)
    .setProject(appwriteConfig.projectId);

  // setJWT authenticates the client as the user who owns this JWT
  client.setJWT(jwtCookie.value);

  return {
    get account() {
      return new Account(client);
    },
    get databases() {
      return new Databases(client);
    },
  };
};

// ─── Admin Client ─────────────────────────────────────────────────────────────
// Uses the secret API key — never exposed to the browser.
export const createAdminClient = async () => {
  const client = new Client()
    .setEndpoint(appwriteConfig.endpointUrl)
    .setProject(appwriteConfig.projectId)
    .setKey(appwriteConfig.secretKey);

  return {
    get account() {
      return new Account(client);
    },
    get databases() {
      return new Databases(client);
    },
    get storage() {
      return new Storage(client);
    },
    get avatars() {
      return new Avatars(client);
    },
  };
};
