# Croc Clash — Apple App Store Submission Guide

Complete step-by-step playbook for submitting **Croc Clash 1.0.0** to the Apple App Store via Capacitor + Xcode.

---

## Prerequisites (one-time setup)

1. **Apple Developer Program membership** — $99/year. Enroll at [developer.apple.com/programs](https://developer.apple.com/programs/).
2. **Mac with Xcode 15+** installed (free from Mac App Store).
3. **Node 18+** and **CocoaPods** (`sudo gem install cocoapods`).
4. **Apple ID signed into Xcode** → Xcode → Settings → Accounts → +.

---

## Step 1 — Open the project on your Mac

You'll receive `croc-clash-ios.zip` from this session. Unzip it and open Terminal at the project root.

```bash
cd ~/Downloads/croc-clash-ios
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

`npx cap open ios` launches Xcode at `/croc-clash-ios/ios/App/App.xcworkspace`. If you ever modify files in `www/`, run `npx cap sync ios` again before rebuilding.

---

## Step 2 — Wire up the App Icon and Splash

In Xcode's left sidebar:

1. Click `App` → `App` → `Assets.xcassets`.
2. Right-click `AppIcon` → **Show in Finder** → drag the entire contents of `/ios-assets/AppIcon.appiconset/` into that folder, replacing the placeholder.
3. Drag `/ios-assets/Splash.imageset/` into `Assets.xcassets` to create a Splash image set.
4. The Capacitor splash plugin auto-detects `Splash.imageset`. Verify in `Info.plist`:
   - `UILaunchStoryboardName` = `LaunchScreen`
   - Open `LaunchScreen.storyboard` → embed an Image View with image `Splash`, set content mode to **Aspect Fill**, pin to all 4 edges.

---

## Step 3 — Configure Signing & Bundle ID

In Xcode → click the `App` project → select `App` target → **Signing & Capabilities** tab:

1. **Team**: Select your Apple Developer team.
2. **Bundle Identifier**: confirm `com.brycebeck.crocclash` (matches App Store Connect).
3. **Automatically manage signing**: ✅ checked.
4. **Capabilities** to add (click `+ Capability`):
   - *None required for launch v1.* (no Push, no In-App Purchase, no GameKit yet).

---

## Step 4 — Set device support & orientation

In Xcode → target `App` → **General** tab:

- **Display Name**: `Croc Clash`
- **Deployment Target**: iOS 15.0 (Capacitor 6 minimum)
- **Devices**: iPhone, iPad
- **Device Orientation**:
  - iPhone: ✅ Landscape Left, ✅ Landscape Right (uncheck Portrait + Upside Down)
  - iPad: same
- **Status Bar Style**: Light Content
- **Hide status bar**: ✅
- **Requires full screen**: ✅

---

## Step 5 — Test on simulator

1. Top of Xcode → device dropdown → choose `iPhone 16 Pro Max` simulator.
2. Click ▶︎ Run. The simulator launches, shows splash, then game title screen.
3. Test:
   - Tap "LET'S BRAWL"
   - Pick a name, tap VS AI
   - Select 2 powers, tap FIGHT
   - Use the on-screen D-pad and action buttons
4. Rotate the simulator to landscape (Cmd+→).

If anything fails, check Xcode's debug console for JS errors. Most common: missing asset path → re-run `npx cap sync ios`.

---

## Step 6 — Test on a real device

1. Plug in iPhone via USB → unlock it → Trust This Computer.
2. Top of Xcode → device dropdown → select your iPhone.
3. Click ▶︎ Run. First time, iPhone will ask you to trust the developer certificate:
   - On iPhone: **Settings → General → VPN & Device Management → [Your Apple ID] → Trust**.
4. Re-run. Game installs and launches natively.

---

## Step 7 — Create the App Store Connect listing

Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com).

1. **My Apps** → **+ New App**
   - Platform: iOS
   - Name: `Croc Clash`
   - Primary Language: English (U.S.)
   - Bundle ID: `com.brycebeck.crocclash` (must match Xcode exactly)
   - SKU: `crocclash-ios-v1`
   - User Access: Full Access

2. Open the new app → **App Information**:
   - Copy fields from `/app-store-metadata/listing.md` Section 1.
   - Set Primary Category = **Games**, Secondary = **Entertainment**.

3. **Pricing and Availability** → Free, all territories.

4. **App Privacy**:
   - "Data Types" → **No data collected** (per listing.md Section 4).
   - Submit privacy answers.

5. **Age Rating**: Click set → answer questionnaire:
   - Cartoon or Fantasy Violence: **Infrequent/Mild**
   - All other questions: **None**
   - Result: **9+**

---

## Step 8 — Upload screenshots

In App Store Connect → version `1.0.0` → scroll to **Screenshots**:

- **iPhone 6.9" Display**: drag all 5 files matching `iphone-6.9_*.png`
- **iPad 13" Display**: drag all 5 files matching `ipad-13_*.png`

If Apple's UI shows different size buckets:
- 6.7" → use `iphone-6.5_*.png` (compatible aspect)
- 12.9" → use `ipad-12.9_*.png`

---

## Step 9 — Fill version info & metadata

Still in version `1.0.0`, copy from `listing.md`:
- **Description** (Section 3)
- **Promotional Text**
- **Keywords**
- **Support URL** (must be live — see Step 10)
- **Marketing URL** (optional)
- **Copyright**

**App Review Information**: paste the demo notes from listing.md Section 5.

---

## Step 10 — Set up Support & Privacy URLs

Apple requires both URLs to be live before submission. Two easy options:

### Option A — GitHub Pages (free, fastest)

1. Create repo `crocclash-app-site` with `index.html`, `support.html`, `privacy.html`.
2. Push, then Settings → Pages → Branch: main → /(root) → Save.
3. Use `https://[username].github.io/crocclash-app-site/support.html` etc.
4. Reuse the `tos.html` + `privacy.html` already in the workspace from the TikTok prep.

### Option B — Custom domain `crocclash.app`

Register, point DNS at GitHub Pages or Vercel, deploy the HTML files.

---

## Step 11 — Archive and upload the build

Back in Xcode:

1. Top menu → **Product** → **Destination** → **Any iOS Device (arm64)**.
2. Top menu → **Product** → **Archive**.
3. Wait ~2–5 minutes for the archive to build.
4. Organizer window opens → select the new archive → **Distribute App**.
5. Choose **App Store Connect** → **Upload**.
6. Use automatic signing → **Upload**.
7. Wait ~5–15 minutes for Apple to process. You'll get an email when done.

---

## Step 12 — Attach the build to your version

In App Store Connect → version `1.0.0`:

1. Scroll to **Build** section → click **+** → select the build that just uploaded.
2. **Encryption compliance**: answer **No** (we don't use custom encryption — only standard HTTPS).
3. Click **Save**.

---

## Step 13 — Submit for review

1. Top of version page → **Add for Review** → **Submit to App Review**.
2. Apple typically responds within **24–48 hours**.
3. If rejected, fix issues per Resolution Center notes and resubmit.

---

## Step 14 — Release

When approved:
- **Manual release**: click **Release This Version** when you're ready (recommended for launch day coordination).
- **Automatic release**: immediately goes live.

---

## Common Rejection Reasons & Fixes

| Issue | Fix |
|------|-----|
| Crash on launch | Test on real device with low memory, check `npx cap sync ios` ran |
| "App is too similar to web view" | Add native features: haptics on smack (already wired), share sheet, Game Center |
| Privacy URL broken | Make sure GitHub Pages is published before submitting |
| Screenshots show device frames | Apple no longer requires removal — but make sure no status bar with carrier name |
| Misleading metadata | Don't claim "online multiplayer" if v1 is shim — say "coming soon" |

---

## What's in this package

```
croc-clash-ios/
├── package.json                        # Capacitor 6 + plugins
├── capacitor.config.ts                 # App ID, splash, orientation, theme
├── www/                                # 49 MB game bundle (HTML/JS/CSS/audio/video)
│   ├── index.html                      # iOS bootstrap + TT shim
│   ├── game.js                         # Main game logic
│   └── ...                             # All assets, audio, MP4 videos
├── ios-assets/
│   ├── AppIcon.appiconset/             # 18 icon sizes + Contents.json
│   ├── Splash.imageset/                # Universal launch image
│   └── marketing-icon-1024.png         # App Store Connect upload
├── app-store-screenshots/              # 20 PNGs (5 slides × 4 devices)
├── app-store-metadata/
│   └── listing.md                      # All copy fields
├── scripts/                            # Icon + screenshot builders
└── SUBMISSION_GUIDE.md                 # This file
```

---

## Need help?

- Capacitor docs: https://capacitorjs.com/docs/ios
- App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- App Store Connect Help: https://developer.apple.com/help/app-store-connect/

Good luck with the launch. Two crocs enter. One leaves with the App Store featured slot. 🐊
