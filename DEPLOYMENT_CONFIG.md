# Deployment Configuration

This file documents the environment setup needed for deployment. Keep this in git. Actual secrets go in `.env.dev` and `.env.local` (gitignored).

## Development Environment (`dev`)

### Azure Configuration
- **Subscription ID:** `1343ace7-ec1e-4a06-83df-323cf7a56188`
- **Subscription Tenant:** `e6aa0f5f-ec60-485d-8766-f6bcabea9053` (IMPORTANT: Azure subscription is in a different tenant than M365)
- **Resource Group:** `Default-Storage-WestEurope`
- **Resource Suffix:** `73f1aa`

### Microsoft 365 Configuration
- **M365 Tenant ID:** `b4003761-08c8-4847-91b4-47bc01e6031c` (onmicrosoft.com org)
- **Teams App ID:** `39776ca2-579b-4d04-9c79-70a147e17d72`
- **Bot ID:** `57866b10-4540-4432-ab01-8ffc4f1c94ad`
- **Bot Domain:** `bot73f1aa.azurewebsites.net`

### Secrets Required in `.env.dev` (gitignored - ask your team)
```
SECRET_OPENAI_API_KEY=sk-proj-...
SECRET_BOT_PASSWORD=<from aadApp>
MCP_URL=https://...
```

## Setup on New Machine

1. **Clone repo**
2. **Run:** `npm install`
3. **Authenticate to Azure subscription (NOT M365 tenant):**
   ```bash
   az logout
   az login --tenant e6aa0f5f-ec60-485d-8766-f6bcabea9053
   az account set --subscription 1343ace7-ec1e-4a06-83df-323cf7a56188
   az account show  # verify
   ```
4. **Create `.env.dev` with secrets** (get from your team or Azure Key Vault)
5. **Run deploy:**
   ```bash
   atk provision
   atk deploy
   ```

## Important Notes

⚠️ **Cross-tenant setup:** Azure subscription is in a DIFFERENT tenant than M365 org. This is expected. Always authenticate to the Azure subscription's tenant (`e6aa0f5f-ec60-485d-8766-f6bcabea9053`) for deployment, NOT the M365 tenant.

⚠️ **ATK precedence:** The toolkit looks for these in order:
1. Environment variables
2. `.localConfigs` or `.localConfigs.dev`
3. `.env.dev` file

Make sure you're in the right environment before running commands.
