# Backend (BE) Implementation Guide: Password Management & RBAC

This document contains the complete backend architecture, Cloud Functions (Node.js / Firebase Functions Gen2), and Firestore Security Rules for password management and role-based access control.

---

## 1. Firebase Cloud Functions (Gen2 / Node.js)

Place these functions in your Firebase Cloud Functions directory (`functions/index.js`):

```javascript
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const bcrypt = require("bcrypt");

admin.initializeApp();
const db = admin.firestore();

const SALT_ROUNDS = 10;

/**
 * 1. Self-Service Change Password (Callable Function)
 * Allows ANY authenticated user (Super Admin, Sub Admin, Maker) to change their own password.
 * Strictly verifies the OLD PASSWORD before updating.
 */
exports.changeUserPassword = onCall(async (request) => {
  // Ensure user is authenticated
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to change your password.");
  }

  const { oldPassword, newPassword } = request.data;
  const callerUid = request.auth.uid;

  if (!oldPassword || typeof oldPassword !== "string" || !oldPassword.trim()) {
    throw new HttpsError("invalid-argument", "Current (Old) Password is mandatory.");
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.trim().length < 6) {
    throw new HttpsError("invalid-argument", "New Password must be at least 6 characters long.");
  }

  // Fetch caller's user record from Firestore
  const userDocRef = db.collection("users").doc(callerUid);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    throw new HttpsError("not-found", "User profile not found in database.");
  }

  const userData = userDoc.data();

  // Validate Old Password against stored password/hash
  let isPasswordValid = false;
  if (userData.passwordHash) {
    isPasswordValid = await bcrypt.compare(oldPassword.trim(), userData.passwordHash);
  } else if (userData.password) {
    isPasswordValid = userData.password.trim() === oldPassword.trim();
  }

  if (!isPasswordValid) {
    throw new HttpsError("permission-denied", "Incorrect Current (Old) Password. Please try again.");
  }

  if (oldPassword.trim() === newPassword.trim()) {
    throw new HttpsError("invalid-argument", "New password cannot be identical to old password.");
  }

  // Hash new password securely
  const newHashedPassword = await bcrypt.hash(newPassword.trim(), SALT_ROUNDS);

  // Update in Firestore
  await userDocRef.update({
    password: newPassword.trim(), // Optional plain text for demo or omit in production
    passwordHash: newHashedPassword,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Also update Firebase Authentication user record if using Firebase Auth
  try {
    await admin.auth().updateUser(callerUid, {
      password: newPassword.trim()
    });
  } catch (authErr) {
    console.warn("Auth user password sync (optional):", authErr.message);
  }

  return {
    success: true,
    message: "Password changed successfully."
  };
});

/**
 * 2. Admin Reset User Password (Callable Function)
 * Allows ONLY Super Admins to reset the password of any Sub Admin or Maker.
 * Does NOT require the old password.
 */
exports.adminResetUserPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const callerUid = request.auth.uid;
  const { targetUserId, newPassword } = request.data;

  if (!targetUserId || !newPassword || newPassword.trim().length < 6) {
    throw new HttpsError("invalid-argument", "Valid targetUserId and newPassword (min 6 chars) required.");
  }

  // 1. Verify Caller Role (Must be super_admin)
  const callerDoc = await db.collection("users").doc(callerUid).get();
  if (!callerDoc.exists) {
    throw new HttpsError("permission-denied", "Caller profile not found.");
  }

  const callerRole = callerDoc.data().role;
  const isSuperAdmin = callerRole === "super_admin" || callerRole === "admin";

  if (!isSuperAdmin) {
    throw new HttpsError("permission-denied", "Permission denied: Only Super Admin can reset user passwords.");
  }

  // 2. Fetch Target User
  const targetDocRef = db.collection("users").doc(targetUserId);
  const targetDoc = await targetDocRef.get();

  if (!targetDoc.exists) {
    throw new HttpsError("not-found", "Target user does not exist.");
  }

  const targetData = targetDoc.data();

  // Hash new password
  const newHashedPassword = await bcrypt.hash(newPassword.trim(), SALT_ROUNDS);

  await targetDocRef.update({
    password: newPassword.trim(),
    passwordHash: newHashedPassword,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  try {
    await admin.auth().updateUser(targetUserId, {
      password: newPassword.trim()
    });
  } catch (authErr) {
    console.warn("Auth user password sync (optional):", authErr.message);
  }

  return {
    success: true,
    message: `Password reset successfully for user ${targetData.name || targetUserId}.`
  };
});
```

---

## 2. Firestore Security Rules (`firestore.rules`)

Add these rules to ensure database-level permission enforcement:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isSuperAdmin() {
      return isAuthenticated() && (
        request.auth.token.role == 'super_admin' ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin'
      );
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // Rules for 'users' Collection
    match /users/{userId} {
      // Any authenticated user can read user documents (needed for team lists / chat assignees)
      allow read: if isAuthenticated();

      // Only Super Admin can create new users or delete users
      allow create, delete: if isSuperAdmin();

      // Users can update their own document, OR Super Admin can update any document
      allow update: if isOwner(userId) || isSuperAdmin();
    }

    // Rules for 'leads' and 'conversations'
    match /leads/{leadId} {
      allow read, write: if isAuthenticated();
    }

    match /conversations/{conversationId} {
      allow read, write: if isAuthenticated();
    }
  }
}
```

---

## 3. How Frontend Calls Backend

If you want to invoke the Cloud Functions directly from the browser SDK:

```javascript
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';

// 1. Change Own Password
export async function callBackendChangePassword(oldPassword, newPassword) {
  const functions = getFunctions();
  const changePasswordCallable = httpsCallable(functions, 'changeUserPassword');
  const response = await changePasswordCallable({ oldPassword, newPassword });
  return response.data;
}

// 2. Admin Reset Password
export async function callBackendAdminResetPassword(targetUserId, newPassword) {
  const functions = getFunctions();
  const adminResetCallable = httpsCallable(functions, 'adminResetUserPassword');
  const response = await adminResetCallable({ targetUserId, newPassword });
  return response.data;
}
```
