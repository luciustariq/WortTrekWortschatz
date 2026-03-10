# WortTrek – Changelog

-----
## alpha v2.5

*Current release*

### New Features

- **FBK 4.1 — Show Answer Button** — A “Show” button appears next to “Check”. Reveals the correct answer without marking right or wrong. Highlights the correct article button in article mode. Clears any red error state on the input. Card advances normally after showing.
- **FBK 1.3 — Hard Words Weighting** — Words you have gotten wrong now appear more frequently in Mixed mode. 1–2 wrong answers = +2 weight boost. 3+ wrong answers = +4 weight boost. Happens invisibly in the background with no UI change.

### UI Fix

- Check and Show buttons now align correctly with the answer input bar
- Input re-enabled on each new question (fix: Show button was permanently disabling it)

-----

## alpha v2.4

*Previous release*

### Bug Fixes

- Fixed smart/curly quotes throughout `words.js` that prevented Chrome from loading words
- Fixed apostrophe on Kinderzimmer (`children's room`) entry
- Moved `<script src="words.js">` to correct position before main script

### Refactor

- Split monolithic `index.html` into three files: `index.html`, `style.css`, `app.js`

### New Features

- **FBK 4.3 — Sound Effects** — Web Audio API sounds for correct, wrong, and streak events. Toggle in settings panel. No audio files required.
- **FBK 1.2 — Lenient Checking** — Small typos are forgiven automatically. Umlaut alternatives accepted (ae/oe/ue). “to “ prefix stripped for verbs. Amber feedback shown when a typo is forgiven. Tolerance scales with word length.

### App Rename

- Renamed from **Wortschatz** to **WortTrek**

-----

## alpha v2.3

*Previous release*

### Bug Fixes

- Fixed Chrome localStorage compatibility issue
- Fixed smart quote encoding in word data

### New Features

- Hard Words mode with wrongCount tracking
- Strength bar per word (5 dots)
- Haptics toggle in settings
- Theme switcher (system / light / dark / pastel)
- Virtual scroll for word list (300+ words performant)
- Import tool (bulk add words via text)
- About modal
- Save indicator (✓ saved)
- Round complete screen with accuracy stats

-----

## alpha v2.0

*Structured rebuild*

### New Features

- SRS weighted queue
- Article quiz (der/die/das buttons)
- Auto-play toggle
- Add / delete words
- localStorage persistence (v2 format)
- Score tracking (correct / wrong / streak)
- Progress bar

-----

## v1.0

*Initial release*

- Core practice loop (Mixed, DE→EN, EN→DE modes)
- Text-to-speech pronunciation
- Basic word list with 300 entries
- Simple correct / wrong answer checking

-----
