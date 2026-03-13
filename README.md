# WortTrek 🚀

**WortTrek** is a high-performance vocabulary trainer designed for English-to-German language acquisition. The app focuses on **User Experience (UX)** and **Learning Psychology**, moving beyond simple flashcards by implementing a smart, multi-state feedback system.

-----

## 💎 Project Vision

WortTrek is built to create a “Flow-State” learning environment, solving real-world learning frustrations through:

- **Weighted SRS (Spaced Repetition System):** Prioritizes “Hard Words” by increasing their frequency based on performance.
- **Multi-State Feedback (FBK 4.2):** A unique system distinguishing between perfect answers, lenient matches (typos), and errors — planned for v2.6.
- **Native-Feel UX:** Smooth animations and a sliding drawer system designed for mobile-first interaction.

-----

## 🛠 Technical Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, and CSS3.
- **Logic:** Custom weighting algorithms for error tracking and umlaut normalization.
- **Storage:** Persistent data engine using `localStorage`.

-----

## 🚀 Key Features

### 🧠 Smart Checking Logic

- **Lenient Checking:** Auto-forgiveness for capitalization and common typos to keep the user focused on the language, not the keyboard.
- **Dynamic Weighting:** Tracks wrong counts to intelligently resurface difficult words.

### 🎨 Feedback System 

- **The Green Flow:** 1s auto-advance for perfect matches.
- **The Amber Peek:** 1.5s auto-advance for small typos, showing the correction without stopping the session.
- **The Red Drawer:** A sliding modal for errors that requires manual acknowledgement to ensure active learning.

-----

## 📜 Development History

Full history of features, bug fixes, and refactors:

👉 **[View the WortTrek Changelog](./CHANGELOG.md)**

-----

## 📈 Roadmap (FBK Backlog)

The app’s evolution is managed through a structured **Feedback (FBK)** system. Selected upcoming items:

- **FBK 1.5** — Ghost Typos (re-testing lenient words within 3–5 turns)
- **FBK 4.2** — Complete feedback system redesign (green / amber / red states)
- **FBK 4.4** — Offline-First / PWA implementation
- **FBK 4.5** — Input Shake animation
- **FBK 4.6** — Dynamic feedback phrases
- **FBK 5.13** — Audio-Only Surprise mode
- **FBK 5.14** — Trek Mode (30-word session with end-of-trek stats)

👉 **[View the full FBK backlog](./CHANGELOG.md)**

-----

*Built with precision.*
