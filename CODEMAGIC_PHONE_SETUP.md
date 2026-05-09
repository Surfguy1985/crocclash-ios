# Croc Clash — Build & Submit From Your iPhone

Everything below works in Safari on your phone. ~10 minutes of setup, then forever after, builds are one tap.

---

## ① Sign in to Codemagic (free)

1. Open [codemagic.io](https://codemagic.io/signup) on your iPhone
2. Tap **Sign up with GitHub**
3. When prompted, allow access to **Surfguy1985/crocclash-ios**

---

## ② Connect your Apple App Store Connect API key

1. In Codemagic: **Teams → Personal Account → Integrations**
2. Tap **App Store Connect → Connect**
3. Fill in EXACTLY:
   - **Name**: `CrocClashASC`  ← must be this name, the YAML references it
   - **Issuer ID**: `67eaac88-1eb7-4b0c-8be2-5297ccb1df76`
   - **Key ID**: `6F338ZZCFH`
   - **API key (.p8)**: paste the contents of the `.p8` file you sent me earlier
     - If you don't have it handy: go to [App Store Connect → Users and Access → Integrations → Keys](https://appstoreconnect.apple.com/access/integrations/api), revoke the old key, create a new one named "Codemagic", download the new .p8, and paste it here.
4. Tap **Save**.

---

## ③ Add the app to Codemagic

1. **Applications → Add application → GitHub → Surfguy1985/crocclash-ios**
2. Pick **YAML** (not the visual editor) — the `codemagic.yaml` is already in the repo.
3. The workflow **"Croc Clash – iOS App Store"** appears.

---

## ④ Tap "Start new build"

1. Workflow: **Croc Clash – iOS App Store**
2. Branch: **master**
3. Tap **Start new build**

That's it. Walk away. Build takes ~15-20 min.

---

## What happens automatically

- Codemagic spins up a Mac mini
- `npm install`, `npx cap add ios`, `npx cap sync ios`
- Drops your AppIcon and Splash into the generated Xcode project
- Auto-creates a Distribution certificate + Provisioning profile (using your API key)
- Auto-bumps the build number from whatever's already in App Store Connect
- Builds the .ipa
- Uploads it to App Store Connect

You'll get an **email when it's done.**

---

## ⑤ Finish in App Store Connect (also doable from your phone)

After the email arrives:

1. Open [App Store Connect → Croc Clash → 1.0 Prepare for Submission](https://appstoreconnect.apple.com/apps/6767337661/distribution)
2. Scroll to **Build** → tap **+** → pick the build that just uploaded
3. Answer **Export Compliance**: "Does your app use encryption?" → **No** (only standard HTTPS)
4. Tap **Add for Review** → **Submit to App Review**

App is in review. Apple usually approves in 24-48 hours.

---

## If a build fails

- Tap the failed build in Codemagic → see the log
- Most common issue: API key not connected correctly. Double-check Key ID + Issuer ID exactly matches step ②
- Forward the build URL to me and I can debug

---

## Cost

- Codemagic free tier: **500 build minutes/month** (each build = ~20 min, so ~25 builds/month free)
- Apple Developer Program: $99/year (you already have this since the app exists in ASC)
