# GitHub Actions → AWS

`.github/workflows/deploy.yml` (called by `checks.yml` after a green run on `main`) deploys the Lambda by assuming the IAM role `vacation-manager-github-deploy`
through GitHub's OIDC provider: each run gets short-lived credentials, and no AWS keys are stored in GitHub.

- `trust-policy.json`: only jobs of `Roni750/Offday` running in the `production` environment can assume the role.
- `deploy-permissions.json`: the role can only read and update the existing `vacation-manager-api` function
  (creating the function, its URL or its execution role stays a one-time manual step, see `backend/scripts/deploy.mjs`).
