# Secrets Management Guide

## ⚠️ Why NOT to Commit Secrets to Git

**Never commit files containing secrets (API keys, passwords, tokens) to Git.**

### Security Risks:
1. **Public Exposure**: If your repo is public (or becomes public), anyone can see your secrets
2. **Git History**: Even if you remove a file later, it remains in Git history forever
3. **Accidental Sharing**: Secrets in Git can be accidentally shared via forks, clones, or exports
4. **Compliance Issues**: Many security standards (PCI-DSS, HIPAA, etc.) prohibit storing secrets in version control

### Your Project's Secret Files:
- ❌ `worker/local.env` - Contains `VIDEO_WORKER_SECRET`, Cloudinary credentials
- ❌ `.env` - Contains MongoDB URI, JWT secrets (if used locally)
- ✅ `worker/local.env.example` - Template file (safe to commit - no real secrets)

---

## ✅ Recommended Solutions

### Option 1: Password Manager (Best Practice)
**Recommended tools:**
- 1Password
- LastPass
- Bitwarden
- macOS Keychain (built-in)

**Steps:**
1. Create a secure note/item in your password manager
2. Name it: "Echo Catering - Worker Local.env"
3. Store the entire contents of `worker/local.env`
4. Tag it with: `echo-catering`, `secrets`, `env`

**When you need it again:**
- Search your password manager
- Copy the contents
- Paste into `worker/local.env`

---

### Option 2: Encrypted File Storage
**Tools:**
- macOS: Use Disk Utility to create an encrypted disk image
- Or use `gpg` to encrypt the file:

```bash
# Encrypt the file
gpg -c worker/local.env
# This creates worker/local.env.gpg (encrypted)
# Store worker/local.env.gpg safely (can be in Git if you want)
# Delete worker/local.env after encrypting

# Later, decrypt it:
gpg -d worker/local.env.gpg > worker/local.env
```

---

### Option 3: Secure Cloud Storage
**Options:**
- iCloud Keychain (encrypted, synced)
- Dropbox (with encryption)
- Google Drive (encrypted)

**⚠️ Warning**: Make sure you trust the service and use strong account passwords + 2FA

---

### Option 4: Environment Variable Manager (Advanced)
**Tools:**
- `direnv` - Auto-loads `.env` files (keeps secrets local)
- `dotenv-vault` - Encrypted env file storage
- Render's built-in env var management (already using this for production)

---

## 📋 Template File Approach

We've created `worker/local.env.example` as a template that shows the structure without secrets. This file:
- ✅ **Can be committed to Git** (contains no secrets)
- ✅ **Helps other developers** understand what env vars are needed
- ✅ **Documents the structure** for future reference

**To use:**
```bash
# Copy the template
cp worker/local.env.example worker/local.env

# Edit with your actual secrets
nano worker/local.env  # or use any text editor
```

---

## 🔐 Current Setup Status

**Files that should NEVER be in Git:**
- ✅ `worker/local.env` - Already in `.gitignore`
- ✅ `.env` - Already in `.gitignore`
- ✅ `worker/uploads/` - Already in `.gitignore` (temporary files)

**Files that CAN be in Git:**
- ✅ `worker/local.env.example` - Template (no secrets)
- ✅ All code files (`.js`, `.json`, `.md`, etc.)
- ✅ Documentation files

---

## ✅ Quick Checklist

Before deleting your local project folder:
- [ ] Save `worker/local.env` contents to password manager or encrypted storage
- [ ] Verify the template file (`worker/local.env.example`) is in Git
- [ ] Test that you can recreate the file from your saved backup

After cloning the repo again:
- [ ] Copy `worker/local.env.example` to `worker/local.env`
- [ ] Fill in your actual secrets from your secure storage
- [ ] Verify `worker/local.env` is NOT tracked by Git: `git status worker/local.env` (should show nothing or "untracked")

---

## 🚨 If You Accidentally Committed Secrets

**If you've already committed secrets to Git:**

1. **Remove from Git history** (advanced, requires force push):
   ```bash
   # Use git-filter-repo or BFG Repo-Cleaner
   # ⚠️ This rewrites Git history - coordinate with team first
   ```

2. **Rotate all secrets immediately**:
   - Generate new `VIDEO_WORKER_SECRET`
   - Rotate Cloudinary API keys (if exposed)
   - Update Render environment variables
   - Update `worker/local.env` with new values

3. **Verify .gitignore** includes the file:
   ```bash
   git check-ignore worker/local.env
   # Should output: worker/local.env
   ```

**Best Practice**: If secrets were exposed, assume they're compromised and rotate them immediately.


