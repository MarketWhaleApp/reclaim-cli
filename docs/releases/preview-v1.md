# Preview v1 release notes — draft, not published

Proposed source release: v0.2.0. The API schema is separately versioned 1.0. No tag exists for this proposed release; package.json remains at 0.1.0 until release preparation is approved and the production service is verified.

## Changes

- Explicit public-address previews without signer or dotenv access.
- JSON output with integer lamport strings, itemized service/referral/subsidy/account-rent deductions, unknown network fees, provisional eligibility and 30-second observation freshness.
- Validation of response identity, schema, amount arithmetic, timestamps and size. No silent legacy fallback.
- Exit codes: 0 eligible, 3 empty/blocked, 2 invalid input, 4 throttled, 1 service/network/stale/build failure.
- Framework-neutral tool handler, offline demonstration, versioned agent guide and dependency-free HTTP example.

## Compatibility and requirements

Node.js 20+, npm and the matching production GET /api/v1/preview deployment. This repository is private:true in package.json: distribute a tested GitHub source release, not an npm install claim. Checkout main only after the matching source has been pushed; pin a verified tag once the release exists.

Public preview never executes. Advanced execution still signs server-prepared transactions locally and lacks a complete independent transaction instruction/destination/fee policy. This release does not expand unattended execution.

## Maintainer release sequence

1. Deploy and verify the matching web code plus DynamoDB quota configuration. Check /developers, OpenAPI, the corrected study and its downloads. Run the public-address CLI against the production service and verify fresh output.
2. From a clean CLI checkout, run npm ci, npm test and npm run demo:preview. Confirm no .env/signer setup is needed for the public workflow. Validate a fresh clone, not just a developer's existing node_modules.
3. Use npm version 0.2.0 --no-git-tag-version to update package.json and package-lock.json together. Remove the README's deployment-pending notice only after verification; commit, rerun checks, and push from an account with write access.
4. Create v0.2.0 at the exact tested commit, push that tag, then create a GitHub release using these reviewed notes. Confirm remote tag and source archive before publishing install instructions. Do not mark the release as published before it exists.
5. Recheck the tagged checkout's production preview, then use the distribution pack's release announcement and targeted pitches.

Current GitHub session reported READ permission on 9 September 2026. Repository metadata, push/tag and release publication need an owner/write-capable session. Deployment is being handled separately by the user.
