# Backend (BE) Implementation Guide: Role-Based Access Control (RBAC)

This document provides the full backend architectural specifications, Firestore schema, Cloud Functions (Node.js / Gen2), and Security Rules for the **Role-Based Access Control (RBAC)** system.

---

## 1. System Overview

The CRM uses a centralized **Role-Based Access Control (RBAC)** model with **3 Core Roles**:

1. **`super_admin` (Super Admin)**: Full unrestricted access across all CRM features, lead pipelines, chat, logs, team management, and role permission matrices.
2. **`sub_admin` (Sub Admin)**: Operational administrative access with lead management, WhatsApp messaging, exporting Excel, audit logs, team access, and permission management for Makers.
3. **`maker` (Maker / Agent)**: Focused agent role handling lead management, WhatsApp messaging, and notes (restricted from deleting leads or viewing audit logs/team management).

---

## 2. Standard CRM Permissions List (11 Permissions)

| Permission Key | Display Label | Category | Description |
| :--- | :--- | :--- | :--- |
| `canAddLead` | Can Add New Lead | Leads & Pipeline | Create and add new leads to CRM dashboard |
| `canDeleteLead` | Can Delete Lead | Leads & Pipeline | Delete existing leads and conversations |
| `canExportExcel` | Can Export to Excel | Leads & Pipeline | Download lead data as Excel spreadsheets |
| `canAssignLead` | Can Reassign Lead | Leads & Pipeline | Change assigned team member for any lead |
| `canChangeStatus` | Can Change Status | Leads & Pipeline | Update lead pipeline status (New, Contacted, Converted, etc.) |
| `canAddNote` | Can Add / Edit Notes | Leads & Pipeline | Add and update internal notes on leads |
| `canSendMessage` | Can Send WhatsApp Messages | WhatsApp & Chat | Compose and send live replies in chat pane |
| `canViewLogs` | Can View Audit Logs | System & Administration | Access System Audit & Activity Logs page |
| `canViewTeams` | Can View Team Management | System & Administration | Access Team & Sub-Users management section |
| `canChangePassword` | Can Change Password | System & Administration | Allow user to update their own password |
| `canManagePermissions` | Can Manage Permissions | System & Administration | Allow Sub Admin to configure permissions for Makers |

---

## 3. Firestore Data Schemas

### A. `roles` Collection (`/roles/{roleId}`)

There are 3 standard role documents in the `roles` collection:

#### 1. Document `/roles/super_admin`
```json
{
  "id": "super_admin",
  "name": "Super Admin",
  "badgeClass": "super_admin",
  "color": "#df8516",
  "description": "Full unrestricted access to all CRM modules, settings, and team control.",
  "isSystem": true,
  "permissions": {
    "canAddLead": true,
    "canDeleteLead": true,
    "canSendMessage": true,
    "canAddNote": true,
    "canExportExcel": true,
    "canAssignLead": true,
    "canChangeStatus": true,
    "canViewLogs": true,
    "canViewTeams": true,
    "canChangePassword": true,
    "canManagePermissions": true
  },
  "updatedAt": "2026-09-02T13:00:00.000Z"
}
```

#### 2. Document `/roles/sub_admin`
```json
{
  "id": "sub_admin",
  "name": "Sub Admin",
  "badgeClass": "sub_admin",
  "color": "#2563eb",
  "description": "Administrative operational access with lead management, messaging, and team control.",
  "isSystem": true,
  "permissions": {
    "canAddLead": true,
    "canDeleteLead": true,
    "canSendMessage": true,
    "canAddNote": true,
    "canExportExcel": true,
    "canAssignLead": true,
    "canChangeStatus": true,
    "canViewLogs": true,
    "canViewTeams": true,
    "canChangePassword": true,
    "canManagePermissions": true
  },
  "updatedAt": "2026-09-02T13:00:00.000Z"
}
```

#### 3. Document `/roles/maker`
```json
{
  "id": "maker",
  "name": "Maker",
  "badgeClass": "maker",
  "color": "#0284c7",
  "description": "Handles lead capture, customer conversations, and follow-ups.",
  "isSystem": true,
  "permissions": {
    "canAddLead": true,
    "canDeleteLead": false,
    "canSendMessage": true,
    "canAddNote": true,
    "canExportExcel": false,
    "canAssignLead": false,
    "canChangeStatus": true,
    "canViewLogs": false,
    "canViewTeams": false,
    "canChangePassword": true,
    "canManagePermissions": false
  },
  "updatedAt": "2026-09-02T13:00:00.000Z"
}
```

---

### B. `users` Collection (`/users/{userId}`)

```json
{
  "id": "usr_subadmin_demo",
  "name": "Sub Admin",
  "email": "subadmin@goldcash.com",
  "role": "sub_admin",
  "status": "active",
  "createdAt": "2026-09-02T12:00:00.000Z",
  "updatedAt": "2026-09-02T13:00:00.000Z"
}
```

---

## 4. Firebase Cloud Functions (Gen2 / Node.js)

Add these functions in your Firebase backend (`functions/index.js`):

```javascript
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

/**
 * 1. Update Role Permissions Matrix (Super Admin only)
 */
exports.updateRolePermissions = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const callerUid = request.auth.uid;
  const { roleId, permissions } = request.data;

  if (!roleId || !permissions || typeof permissions !== "object") {
    throw new HttpsError("invalid-argument", "roleId and permissions object are required.");
  }

  // 1. Verify caller is Super Admin
  const callerDoc = await db.collection("users").doc(callerUid).get();
  if (!callerDoc.exists) {
    throw new HttpsError("permission-denied", "Caller profile not found.");
  }

  const callerRole = callerDoc.data().role;
  if (callerRole !== "super_admin" && callerRole !== "admin") {
    throw new HttpsError("permission-denied", "Only Super Admin can modify role permissions.");
  }

  if (roleId === "super_admin") {
    throw new HttpsError("invalid-argument", "Super Admin role is locked to full access.");
  }

  // 2. Update role document in Firestore
  const roleRef = db.collection("roles").doc(roleId);
  await roleRef.set(
    {
      permissions,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    success: true,
    message: `Permissions updated successfully for role [${roleId}].`,
    roleId,
    permissions
  };
});

/**
 * 2. Assign Role to User (Super Admin & Sub Admin)
 */
exports.assignUserRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const callerUid = request.auth.uid;
  const { targetUserId, newRoleId } = request.data;

  if (!targetUserId || !newRoleId) {
    throw new HttpsError("invalid-argument", "targetUserId and newRoleId are required.");
  }

  const callerDoc = await db.collection("users").doc(callerUid).get();
  if (!callerDoc.exists) {
    throw new HttpsError("permission-denied", "Caller profile not found.");
  }

  const callerRole = callerDoc.data().role;
  const isSuperAdmin = callerRole === "super_admin" || callerRole === "admin";
  const isSubAdmin = callerRole === "sub_admin";

  if (!isSuperAdmin && !isSubAdmin) {
    throw new HttpsError("permission-denied", "You do not have authorization to assign roles.");
  }

  // Sub Admin can only assign Maker role
  if (isSubAdmin && (newRoleId === "super_admin" || newRoleId === "sub_admin")) {
    throw new HttpsError("permission-denied", "Sub Admins cannot assign administrative roles.");
  }

  const targetRef = db.collection("users").doc(targetUserId);
  const targetDoc = await targetRef.get();
  if (!targetDoc.exists) {
    throw new HttpsError("not-found", "Target user does not exist.");
  }

  await targetRef.update({
    role: newRoleId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    message: `Assigned user [${targetUserId}] to role [${newRoleId}].`
  };
});
```

---

## 5. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }

    function isSuperAdmin() {
      return isAuthenticated() && (getUserRole() == 'super_admin' || getUserRole() == 'admin');
    }

    // 1. Roles Collection
    match /roles/{roleId} {
      allow read: if isAuthenticated();
      allow write: if isSuperAdmin();
    }

    // 2. Users Collection
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated();
    }

    // 3. Leads Collection
    match /leads/{leadId} {
      allow read, write: if isAuthenticated();

      match /{allSubcollections=**} {
        allow read, write: if isAuthenticated();
      }
    }

    // 4. Conversations Collection
    match /conversations/{conversationId} {
      allow read, write: if isAuthenticated();

      match /{allSubcollections=**} {
        allow read, write: if isAuthenticated();
      }
    }

    // 5. Activity Logs Collection
    match /activity_logs/{logId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
    }
  }
}
```

---

## 6. Summary of BE Tasks
1. Initialize the `roles` collection in Firestore with the 3 default documents: `super_admin`, `sub_admin`, and `maker`.
2. Deploy the Cloud Functions (`updateRolePermissions`, `assignUserRole`).
3. Deploy the updated Firestore security rules.
