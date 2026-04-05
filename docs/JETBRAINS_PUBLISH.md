# Publishing SigMap Plugin to JetBrains Marketplace

Complete guide to publishing the SigMap JetBrains plugin to the IntelliJ Marketplace.

---

## Prerequisites

### 1. JetBrains Account
- Create account at [JetBrains Marketplace](https://plugins.jetbrains.com/)
- Verify email address
- Complete vendor profile

### 2. Generate Plugin Repository Token
1. Go to https://plugins.jetbrains.com/author/me/tokens
2. Click **"Generate New Token"**
3. Name: `SigMap Plugin Publishing`
4. Scope: **Plugin Repository** (full access)
5. Copy the token (save securely — shown only once)

### 3. Development Environment
- **JDK 17** or newer
- **Gradle 8.0+** (included via wrapper)
- **IntelliJ IDEA 2024.1+** (recommended for testing)

---

## One-Time Setup

### Step 1: Add Token to GitHub Secrets

```bash
# Navigate to GitHub repo
open https://github.com/manojmallick/sigmap/settings/secrets/actions

# Add new repository secret:
Name: JETBRAINS_PUBLISH_TOKEN
Value: <paste your token from JetBrains>
```

### Step 2: Verify Plugin Metadata

Ensure `jetbrains-plugin/src/main/resources/META-INF/plugin.xml` contains:
- ✅ Unique plugin ID: `com.sigmap.plugin`
- ✅ Vendor information with support email
- ✅ Comprehensive description with HTML formatting
- ✅ Change notes for current version (auto-generated from CHANGELOG.md)

### Step 3: Build Plugin Locally (Test)

```bash
cd jetbrains-plugin
./gradlew buildPlugin

# Output: build/distributions/SigMap-2.9.0.zip
# Test installation: Preferences → Plugins → Install from Disk → select .zip
```

---

## Publishing Methods

### Method A: Automated via GitHub Actions (Recommended)

The release pipeline automatically publishes to JetBrains Marketplace when you create a git tag.

**Workflow:**
1. Merge feature branch to `main`
2. Create git tag: `git tag v2.9.0 -m "Release v2.9.0"`
3. Push tag: `git push origin v2.9.0`
4. GitHub Actions runs:
   - Builds plugin
   - Runs tests
   - Publishes to npm, GitHub Packages, VS Code Marketplace, **and JetBrains Marketplace**
   - Creates GitHub Release

**Required GitHub Secrets:**
- `JETBRAINS_PUBLISH_TOKEN` — from Step 1 above
- `NPM_TOKEN` — for npm publishing
- `VSCE_PAT` — for VS Code Marketplace
- `OPEN_VSX_TOKEN` — for Open VSX Registry

---

### Method B: Manual Publishing

#### Step 1: Update Version

```bash
# Update version in package.json (triggers all other version updates)
npm version 2.9.0 --no-git-tag-version

# Verify jetbrains-plugin/build.gradle.kts shows correct version
grep "version = " jetbrains-plugin/build.gradle.kts
```

#### Step 2: Build Plugin

```bash
cd jetbrains-plugin
./gradlew buildPlugin

# Verify output
ls -lh build/distributions/SigMap-*.zip
```

#### Step 3: Publish to Marketplace

```bash
# Set token as environment variable
export PUBLISH_TOKEN="perm:your-token-here"

# Publish plugin
./gradlew publishPlugin

# Expected output:
# > Task :publishPlugin
# Uploading plugin SigMap version 2.9.0 to https://plugins.jetbrains.com
# Plugin published successfully! 
# Review URL: https://plugins.jetbrains.com/plugin/verify/...
```

#### Step 4: Plugin Review Process

1. **Automatic upload**: Plugin uploaded to JetBrains servers
2. **Pending review**: Manual review by JetBrains team (1-3 business days)
3. **Email notification**: Approval or rejection email
4. **Public listing**: If approved, plugin appears in marketplace

---

## Plugin Signing (Optional but Recommended)

Signed plugins display a "Verified" badge in the marketplace.

### Generate Certificate Chain

```bash
# Use JetBrains Marketplace Plugin Signing service
# OR generate your own certificate:

# Generate private key
openssl genpkey -algorithm RSA -out private-key.pem -pkeyopt rsa_keygen_bits:2048

# Generate certificate
openssl req -new -x509 -key private-key.pem -out certificate.pem -days 365

# Create certificate chain (if using intermediate CAs)
cat certificate.pem intermediate.pem root.pem > chain.pem
```

### Add Signing Secrets to GitHub

```bash
# Add these as GitHub Secrets:
JETBRAINS_CERTIFICATE_CHAIN  # Contents of chain.pem
JETBRAINS_PRIVATE_KEY        # Contents of private-key.pem  
JETBRAINS_PRIVATE_KEY_PASSWORD  # Password for private key (if encrypted)
```

### Sign Plugin Locally

```bash
export CERTIFICATE_CHAIN="$(cat chain.pem)"
export PRIVATE_KEY="$(cat private-key.pem)"
export PRIVATE_KEY_PASSWORD="your-password"

cd jetbrains-plugin
./gradlew signPlugin
./gradlew publishPlugin
```

---

## Verification & Testing

### Test Plugin Installation from Marketplace

1. Open IntelliJ IDEA
2. **Preferences** → **Plugins** → **Marketplace**
3. Search: `SigMap`
4. Click **Install**
5. Restart IDE
6. Verify: **Tools** → **SigMap** menu appears
7. Test: **Ctrl+Alt+G** regenerates context

### Verify Marketplace Listing

```bash
# Check plugin page (replace PLUGIN_ID with actual ID)
open https://plugins.jetbrains.com/plugin/PLUGIN_ID-sigmap

# Verify:
✅ Plugin name: "SigMap — AI Context Engine"
✅ Version: 2.9.0
✅ Description renders correctly
✅ Change notes display
✅ Compatible IDE versions listed (2024.1 - 2024.3)
✅ Download count visible
```

---

## Troubleshooting

### Error: "Plugin verification failed"

**Cause**: Plugin structure or metadata invalid

**Solution**:
```bash
cd jetbrains-plugin
./gradlew verifyPlugin

# Fix any reported issues in plugin.xml or build.gradle.kts
```

---

### Error: "Invalid authentication token"

**Cause**: `PUBLISH_TOKEN` expired or incorrect

**Solution**:
1. Regenerate token at https://plugins.jetbrains.com/author/me/tokens
2. Update GitHub Secret: `JETBRAINS_PUBLISH_TOKEN`
3. Retry publishing

---

### Error: "Version 2.9.0 already published"

**Cause**: Version number already exists in marketplace

**Solution**:
```bash
# Increment version
npm version 2.9.1 --no-git-tag-version

# Rebuild and republish
cd jetbrains-plugin
./gradlew buildPlugin publishPlugin
```

---

### Plugin Rejected by Review

**Common reasons**:
- Missing or incomplete description
- Broken links in plugin.xml
- Security issues in code
- Missing change notes
- Incompatible IDE version ranges

**Solution**:
1. Read rejection email carefully
2. Fix reported issues
3. Increment version patch number (2.9.0 → 2.9.1)
4. Resubmit

---

## Update Existing Plugin

### Patch Release (2.9.0 → 2.9.1)

```bash
# Bug fixes only, no new features
npm version patch --no-git-tag-version
git add -A
git commit -m "fix: bug fixes for plugin"
git tag v2.9.1 -m "Release v2.9.1"
git push origin v2.9.1
```

### Minor Release (2.9.0 → 2.10.0)

```bash
# New features, backward compatible
npm version minor --no-git-tag-version
git add -A
git commit -m "feat: new features"
git tag v2.10.0 -m "Release v2.10.0"
git push origin v2.10.0
```

### Major Release (2.9.0 → 3.0.0)

```bash
# Breaking changes
npm version major --no-git-tag-version
git add -A
git commit -m "feat!: breaking changes"
git tag v3.0.0 -m "Release v3.0.0"
git push origin v3.0.0
```

---

## Monitoring & Analytics

### View Plugin Statistics

```bash
# Plugin dashboard
open https://plugins.jetbrains.com/plugin/PLUGIN_ID-sigmap/edit

# Metrics available:
- Downloads (total, by version, by IDE)
- Active installations
- User ratings & reviews
- Geographic distribution
- IDE version breakdown
```

### Monitor Issues

```bash
# GitHub issues for plugin-specific bugs
open https://github.com/manojmallick/sigmap/issues?q=label:jetbrains-plugin

# JetBrains plugin issues (if users report via marketplace)
# Check email notifications from plugins.jetbrains.com
```

---

## Automated Publishing Checklist

Before creating a release tag:

- [ ] All tests passing: `npm test`
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated with release notes
- [ ] Plugin builds successfully: `cd jetbrains-plugin && ./gradlew buildPlugin`
- [ ] Plugin verifies: `./gradlew verifyPlugin`
- [ ] GitHub Secret `JETBRAINS_PUBLISH_TOKEN` is valid
- [ ] No breaking changes to plugin API
- [ ] IDE compatibility range updated in plugin.xml (if needed)

Create release:
```bash
git tag v2.9.0 -m "Release v2.9.0: JetBrains Plugin"
git push origin v2.9.0
```

Monitor workflow:
```bash
gh run list --repo manojmallick/sigmap --limit 1 --workflow=Release
gh run watch <run-id>
```

---

## Resources

- **JetBrains Plugin SDK**: https://plugins.jetbrains.com/docs/intellij/
- **Marketplace Upload**: https://plugins.jetbrains.com/author/me/plugins
- **Plugin Repository API**: https://plugins.jetbrains.com/docs/marketplace/
- **Gradle IntelliJ Plugin**: https://github.com/JetBrains/gradle-intellij-plugin
- **Plugin Signing**: https://plugins.jetbrains.com/docs/intellij/plugin-signing.html
- **Support**: support@jetbrains.com

---

## Quick Reference

```bash
# Build plugin
cd jetbrains-plugin && ./gradlew buildPlugin

# Verify plugin structure
./gradlew verifyPlugin

# Run plugin in IDE sandbox (for testing)
./gradlew runIde

# Publish to marketplace
export PUBLISH_TOKEN="perm:..."
./gradlew publishPlugin

# Sign plugin (if certificate configured)
./gradlew signPlugin

# Clean build
./gradlew clean

# List all tasks
./gradlew tasks --all
```

---

## Next Steps After First Publication

1. **Monitor first reviews** — Respond to user feedback within 48 hours
2. **Document known issues** — Update README.md with limitations
3. **Plan next release** — Based on user feature requests
4. **Set up analytics** — Track most-used features via telemetry (opt-in)
5. **Cross-promote** — Link to VS Code extension in plugin description

---

**Last Updated**: v2.9.0 (April 2026)
