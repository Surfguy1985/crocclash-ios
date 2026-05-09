# Croc Clash — App Store Connect Listing

Copy-paste these fields into App Store Connect → My Apps → Croc Clash → App Information / Pricing / Version.

---

## 1. App Information

**App Name (max 30 chars)**
```
Croc Clash
```

**Subtitle (max 30 chars)**
```
Branson Pillow Brawl Arcade
```

**Bundle ID**
```
com.brycebeck.crocclash
```

**Primary Category**: Games
**Secondary Category**: Entertainment
**Game Sub-categories**: Action, Arcade

**Content Rights**
- Does your app contain, show, or access third-party content? **No**
- Made for Kids? **No**

**Age Rating**: 9+ (Infrequent/Mild Cartoon or Fantasy Violence)

---

## 2. Pricing & Availability
- **Price**: Free
- **Availability**: All territories
- **In-App Purchases**: None (initial launch)

---

## 3. Version Information (1.0.0)

**Promotional Text (max 170 chars — editable without re-review)**
```
Two crocs enter, one leaves with the good pillow! Smash, dash, parry, and unleash 10 epic powers in fast arcade combat. New skins, new arenas, new chaos.
```

**Description (max 4000 chars)**
```
Welcome to CROC CLASH — the wildest pillow-fighting arcade brawler on the App Store!

Step into the neon-lit streets of Branson and pick a side: jade-scaled GATOR GARY or fiery CROC CARL. Then go full chaos with feathers flying, marquees blazing, and 10 absurd special powers at your claws.

⚔️ FAST, INTUITIVE COMBAT
Smack, dash, parry, and rage through best-of-3 round battles. Big-feel hitboxes, satisfying impact, and combo-friendly controls let anyone pull off cinematic knockouts.

⚡ 10 EPIC POWERS
- Lightning ⚡ — sky strike that zaps 1 HP
- Saxophone 🎷 — dizzy blast wave
- Tornado 🌪 — spin dash attack
- Tail Whip 🦎 — heavy crocodilian smash
- Pillow Shotgun 💥 — 5-pillow spread blast
- Pillow Uppercut 🥊 — sky-launch melee
- Boomerang 🪃 — returns to sender
- Rapid Fire 🔥 — pillow minigun burst
- Freeze Ball ❄️ — locks your foe in place
- Mystery Box ❓ — random chaos!

🎮 MULTIPLE GAME MODES
- VS AI — solo arcade ladder against scaling AI
- ARENA — earn wins, climb the ranks, unlock skins
- ONLINE (coming soon) — type a code, brawl your friend live
- COLOSSEUM FINALE — secret powers and a trophy ceremony at the top

🐊 UNLOCKABLE SKINS
Cowboy. Zombie. Golden. Neon. The more you win, the wilder you look.

🏆 RANKS & LEADERBOARD
Climb the Branson Brawl ladder. Show off your win count. Earn the chef's kiss.

🎵 ARCADE FEEL
Authentic arcade audio, satisfying smacks, and zero forced narration. Sound effects on, vibes on max, narration off — the way arcade fighters should be.

📱 BUILT FOR MOBILE
Designed for landscape iPhone and iPad. Fluid touch controls. No lag. No clutter. Just two crocs, two pillows, and one good night's sleep on the line.

Two crocs enter. One leaves with the good pillow.

CROC CLASH. Get smacking.
```

**Keywords (max 100 chars, comma-separated)**
```
croc,fight,pillow,brawler,arcade,fighter,smash,combat,multiplayer,branson,clash,gator,party,2d
```

**Support URL** ✅ LIVE
```
https://surfguy1985.github.io/crocclash-site/support.html
```

**Marketing URL** ✅ LIVE
```
https://surfguy1985.github.io/crocclash-site/
```

**Privacy Policy URL** ✅ LIVE
```
https://surfguy1985.github.io/crocclash-site/privacy.html
```

**Terms of Service URL** ✅ LIVE
```
https://surfguy1985.github.io/crocclash-site/tos.html
```

Repo: https://github.com/Surfguy1985/crocclash-site

**Copyright**
```
© 2026 Bryce Beck
```

---

## 4. App Privacy (Data Collection)

Croc Clash does NOT collect any user data. Use these settings in App Store Connect → App Privacy:

- **Data Used to Track You**: None
- **Data Linked to You**: None
- **Data Not Linked to You**: None

When prompted "Do you or your third-party partners collect data from this app?" select **No**.

---

## 5. App Review Information

**First Name / Last Name**: Bryce Beck
**Phone**: [your phone]
**Email**: brycebeck85@gmail.com
**Demo Account**: Not required (no login)
**Notes**:
```
Croc Clash is a single-player and local-multiplayer arcade pillow-fighting game.
No login or account is required to play. The app does not collect any user data.
All gameplay, scoring, and progress is stored locally on device using UserDefaults
(via Capacitor Preferences plugin). No network calls are made except for fetching
optional MP4 victory videos from the bundled assets folder.

To test:
1. Tap "LET'S BRAWL" on title screen (any name works)
2. Tap "VS AI" to start a single-player match
3. Select 2 powers, tap FIGHT
4. Win 3 rounds to unlock the trophy ceremony
```

---

## 6. Build Submission Notes (TestFlight)

**What to Test (max 4000 chars)**
```
Initial launch build of Croc Clash 1.0.0 — wrapped via Capacitor 6.

Test focus:
1. Title screen loads without crash
2. Name input accepts 2–12 characters
3. VS AI mode starts and AI fights back
4. All 10 special powers fire correctly
5. Round-end MP4 victory video plays for the winner (autoplay, no controls)
6. Touch controls (D-pad, smack, dash, parry, rage, power buttons) all responsive
7. Landscape orientation locks correctly
8. Status bar hidden during gameplay
9. App resumes correctly from background
10. Audio plays (arcade sound effects, no narration)

Known notes:
- Online multiplayer is shimmed for v1.0 (button shown, "coming soon" message)
- Game is landscape only — Apple reviewers should rotate device
```

---

## 7. Screenshots Required

Upload from `/croc-clash-ios/app-store-screenshots/`:

| Device | File pattern | Required count |
|--------|--------------|---------------|
| iPhone 6.9" (or 6.7") | `iphone-6.9_*.png` | 3–10 (we provide 5) |
| iPad 13" (or 12.9") | `ipad-13_*.png` | 3–10 (we provide 5) |

iPhone 6.5" and iPad 12.9" legacy variants are also generated as fallbacks if Apple changes requirements before submission.

---

## 8. App Icon

Upload `/croc-clash-ios/ios-assets/marketing-icon-1024.png` to App Store Connect.
The full AppIcon.appiconset is already wired into the Xcode project — no additional manual upload required for build icons.
