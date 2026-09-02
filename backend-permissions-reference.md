# Backend (BE) Implementation Guide: User Permissions & Hierarchical RBAC

This document outlines the Backend Cloud Functions (Firebase Functions Gen2 / Node.js) and Firestore security architecture to enforce hierarchical permissions:
1. **Super Admin**: Has unrestricted full control. Can manage permissions for **both Sub Admins and Makers**.
2. **Sub Admin**: If granted `canManagePermissions` by Super Admin, can manage permissions **only for Makers**. Cannot modify Sub Admins or Super Admin.
3. **Maker**: Cannot modify permissions.

---

## 1. Updated Permission Schema

Each user document in Firestore `users` collection stores a `permissions` map:

```json
{
  "id": "usr_1787728140466",
  "name": "Sub Admin User",
  "email": "subadmin@goldcash.com",
  "role": "sub_admin",
  "status": "active",
  "permissions": {
    "canAddLead": true,
    "canDeleteLead": true,
    "canSendMessage": true,
    "canAddNote": true,
    "canExportExcel": true,
    "canAssignLead": true,
    "canViewLogs": true,
    "canViewTeams": true,
    "canChangePassword": true,
    "canManagePermissions": true
  },
  "updatedAt": "2026-08-30T17:30:00.000Z"
}
```

---

## 2. Firebase Cloud Functions (Gen2 / Node.js)

Add/Update these callable functions in your Firebase backend (`functions/index.js`):

```javascript
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

/**
 * 1. Hierarchical Permissions Update
 * - Super Admin can update Sub Admins & Makers
 * - Sub Admin with 'canManagePermissions' can update Makers ONLY
 */
exports.updateUserPermissions = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const callerUid = request.auth.uid;
  const { targetUserId, permissions } = request.data;

  if (!targetUserId || !permissions || typeof permissions !== "object") {
    throw new HttpsError("invalid-argument", "targetUserId and permissions object are required.");
  }

  // 1. Fetch caller document
  const callerDoc = await db.collection("users").doc(callerUid).get();
  if (!callerDoc.exists) {
    throw new HttpsError("permission-denied", "Caller profile not found.");
  }

  const callerData = callerDoc.data();
  const callerRole = callerData.role;
  const isSuperAdmin = callerRole === "super_admin" || callerRole === "admin";
  const isSubAdmin = callerRole === "sub_admin";
  const canManageMakerPerms = isSubAdmin && callerData.permissions && callerData.permissions.canManagePermissions === true;

  if (!isSuperAdmin && !canManageMakerPerms) {
    throw new HttpsError("permission-denied", "You do not have authorization to modify user permissions.");
  }

  // 2. Fetch target user
  const targetRef = db.collection("users").doc(targetUserId);
  const targetDoc = await targetRef.get();

  if (!targetDoc.exists) {
    throw new HttpsError("not-found", "Target user does not exist.");
  }

  const targetData = targetDoc.data();

  // Super Admin account is always protected
  if (targetData.role === "super_admin" || targetData.role === "admin") {
    throw new HttpsError("invalid-argument", "Super Admin permissions cannot be modified.");
  }

  // Sub Admin is strictly restricted to modifying Makers
  if (isSubAdmin && (targetData.role !== "maker" && targetData.role !== "agent")) {
    throw new HttpsError("permission-denied", "Sub Admins are only authorized to configure permissions for Makers.");
  }

  // 3. Whitelist allowed permission keys
  const validKeys = [
    "canAddLead",
    "canDeleteLead",
    "canSendMessage",
    "canAddNote",
    "canExportExcel",
    "canAssignLead",
    "canViewLogs",
    "canViewTeams",
    "canChangePassword",
    "canManagePermissions"
  ];

  const sanitizedPermissions = {};
  for (const key of validKeys) {
    if (typeof permissions[key] === "boolean") {
      // Sub Admins cannot grant 'canManagePermissions'
      if (isSubAdmin && key === "canManagePermissions") continue;
      sanitizedPermissions[key] = permissions[key];
    }
  }

  // 4. Update in Firestore
  await targetRef.update({
    permissions: sanitizedPermissions,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    message: `Permissions updated successfully for ${targetData.name || targetUserId}.`,
    permissions: sanitizedPermissions
  };
});
```

---

## 3. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    // Users Collection
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow create, update, delete: if isAuthenticated();
    }

    // Leads & Subcollections
    match /leads/{leadId} {
      allow read, write: if isAuthenticated();

      match /{allSubcollections=**} {
        allow read, write: if isAuthenticated();
      }
    }

    // Conversations & Subcollections
    match /conversations/{conversationId} {
      allow read, write: if isAuthenticated();

      match /{allSubcollections=**} {
        allow read, write: if isAuthenticated();
      }
    }

    // Activity Logs
    match /activity_logs/{logId} {
      allow read, write: if isAuthenticated();
    }
  }
}
```
