# Croc Clash — Final Steps to Ship

Almost everything is now filled in App Store Connect via the API. Here is what is done, and the **3 small things** only your Mac and the ASC web UI can finish.

---

## ✅ Done via API

- App record: `Croc Clash` (id `6767337661`, bundle `com.brycebeck.crocclash`, sku `Crocclashv1`)
- Categories: **Games → Action** (primary), **Games → Arcade** + **Entertainment** (secondary)
- Age rating: **9+** (Mild Cartoon Violence) — every other answer set to None
- Copyright: © 2026 Bryce Beck
- Name: Croc Clash · Subtitle: Branson Pillow Brawl Arcade
- Promotional text, full long description, 14 keywords
- Marketing URL: https://surfguy1985.github.io/crocclash-site/
- Support URL: https://surfguy1985.github.io/crocclash-site/support.html
- Privacy URL: https://surfguy1985.github.io/crocclash-site/privacy.html
- **Screenshots uploaded** (15 total):
  - iPhone 6.7" — 5 shots (2796×1290)
  - iPhone 6.5" — 5 shots (2688×1242)
  - iPad 13" Pro — 5 shots (2752×2064)
- **Pricing: Free** (USA base, automatic prices for all other territories)

---

## ❗ 3 things only you can finish

Apple does not allow the API to do these — they're 5 minutes of clicking total.

### 1. Build & upload the iOS binary (Mac required)
1. Unzip `croc-clash-ios.zip` on your Mac
2. `cd croc-clash-ios && npm install`
3. `npx cap sync ios`
4. Open `ios/App/App.xcworkspace` in **Xcode**
5. Top bar: select **Any iOS Device** (not a simulator)
6. Menu: **Product → Archive**
7. When the Organizer window opens: click **Distribute App → App Store Connect → Upload**
8. Wait ~10 min for the build to appear in App Store Connect under TestFlight, then in the version page click **+** beside Build to attach it.

### 2. App Privacy ("Data Not Collected")
ASC web UI → **App Privacy** (left sidebar) → click **Get Started** → choose **No, we do not collect data from this app** → Publish.

### 3. Submit for Review
On the **1.0** version page in ASC:
- Confirm the build is attached (after step 1 finishes)
- Export Compliance → check **No** for "uses encryption" (only standard HTTPS)
- Click **Add for Review** → **Submit to App Review**

---

## File reference

- `croc-clash-ios.zip` — Capacitor wrapper, ready for Xcode
- `app-store-screenshots/` — original PNGs (already uploaded)
- `app-store-metadata/listing.md` — copy-paste reference (already in ASC)
- `ios-assets/AppIcon.appiconset/` — drop into Xcode if needed
- Public site: https://github.com/Surfguy1985/crocclash-site
