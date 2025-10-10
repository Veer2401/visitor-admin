# Setting Up Custom Claims for User Roles

Your Firestore security rules now require custom claims on user tokens to work properly. Users need `role` and `branchId` claims to access the visitors collection.

## Required Custom Claims

Each user needs these custom claims:
- `role`: One of `"super_admin"`, `"branch_admin"`, or `"staff"`
- `branchId`: String identifier for the branch (not needed for super_admin)

## How to Set Custom Claims

### Option 1: Using Firebase Admin SDK (Recommended)

Create a Node.js script or Cloud Function to set custom claims:

```javascript
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Set custom claims for a user
async function setUserClaims(uid, role, branchId = null) {
  const customClaims = { role };
  if (branchId) {
    customClaims.branchId = branchId;
  }
  
  await admin.auth().setCustomUserClaims(uid, customClaims);
  console.log(`Set claims for user ${uid}:`, customClaims);
}

// Example usage:
// setUserClaims('user-uid-here', 'super_admin');
// setUserClaims('user-uid-here', 'branch_admin', 'branch-001');
// setUserClaims('user-uid-here', 'staff', 'branch-001');
```

### Option 2: Using Firebase CLI

If you have Firebase CLI set up with admin privileges:

```bash
# Set super admin
firebase auth:import users.json --project your-project-id

# Where users.json contains:
{
  "users": [
    {
      "uid": "user-uid-here",
      "email": "admin@example.com",
      "customClaims": {
        "role": "super_admin"
      }
    }
  ]
}
```

### Option 3: Create an Admin Panel

Create a simple admin interface that uses Firebase Admin SDK to set claims:

1. Deploy a Cloud Function that sets custom claims
2. Create a protected admin page that calls this function
3. Use it to assign roles to users

## Default Test Setup

For immediate testing, you can temporarily modify the Firestore rules to allow your specific email:

```javascript
// Add this to the top of your rules for testing
function isTestUser() {
  return request.auth != null && request.auth.token.email == 'your-email@gmail.com';
}

// Then modify the visitors collection rule to include:
allow create, read, update: if isTestUser() || /* existing conditions */;
```

## Branch Setup

You'll also need to create branch documents in the `branches` collection:

```javascript
// Example branch document structure
{
  id: "branch-001",
  name: "Main Branch",
  address: "123 Main St",
  createdAt: serverTimestamp()
}
```

## Verification

After setting custom claims, users need to:
1. Sign out and sign back in (to refresh their tokens)
2. Check that their role appears in the UI
3. Test that they can add/edit/delete visitors according to their role

## Troubleshooting

1. **"Permission denied" errors**: Check that custom claims are set correctly
2. **Empty visitor list**: Ensure the user has the correct branchId claim
3. **Can't add visitors**: Verify the user has at least 'staff' role and correct branchId