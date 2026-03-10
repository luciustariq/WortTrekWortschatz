// --- WORD DATA (loaded from words.js) ---
const DEFAULT_WORDS = (typeof WORD_DATA !== 'undefined') ? WORD_DATA : [];
let words = [];

let currentMode = 'mixed';
let currentQuestion = null;
let questionType = null;
let answered = false;
let correct = 0, wrong = 0, streak = 0;
let wordsSeen = new Set();
let sessionQueue = [];

const SCORE_KEY = 'wortschatz-score-v1';
const STORAGE_KEY = 'wortschatz-words-v1';
const THEME_KEY = 'wortschatz-theme-v1';

// --- SCORE & PERSISTENCE ---
function saveScore() {
    try {
        localStorage.setItem(SCORE_KEY, JSON.stringify({
            correct, wrong, streak,
            wordsSeen: [...wordsSeen]
        }));
    } catch(e) {}
}

function loadScore() {
    try {
        const s = JSON.parse(localStorage.getItem(SCORE_KEY));
        if (s) {
            correct = s.correct || 0;
            wrong = s.wrong || 0;
            streak = s.streak || 0;
            wordsSeen = new Set(s.wordsSeen || []);
        }
    } catch(e) {}
}

function resetScore() {
    correct = 0; wrong = 0; streak = 0; wordsSeen = new Set();
    words.forEach(w => { w.strength = 0; w.wrongCount = 0; });
    saveWords();
    saveScore();
    updateStats();
    updateProgress();
    updateHardWordsPill();
}

// --- UTILS ---
function normalizeWord(str) {
    return str.trim().toLowerCase();
}

function normalize(str) {
    return str.trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function normalizeForCheck(str) {
    return str.trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/^to /, '');
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({length: m + 1}, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
            : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
        return dp[m][n];
}

function lenientMatch(userRaw, correctRaw) {
    const user = normalizeForCheck(userRaw);
    const correct = normalizeForCheck(correctRaw);
    if (user === correct) return 'exact';
    const threshold = correct.length <= 4 ? 0 : correct.length <= 8 ? 1 : 2;
    if (threshold > 0 && levenshtein(user, correct) <= threshold) return 'lenient';
    return false;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- QUEUE LOGIC ---
function buildQueue() {
    if (currentMode === 'hard') {
        const hardWords = words.filter(w => (w.wrongCount || 0) > 0)
        .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));
        sessionQueue = shuffle([...hardWords]);
        return;
    }
    const weighted = [];
    words.forEach(w => {
        const baseWeight = Math.max(1, 5 - (w.strength || 0));
        const wc = w.wrongCount || 0;
        const errorBoost = wc >= 3 ? 4 : wc >= 1 ? 2 : 0;
        const weight = baseWeight + errorBoost;
        for (let i = 0; i < weight; i++) weighted.push(w);
    });
        sessionQueue = shuffle(weighted);
}

function updateHardWordsPill() {
    const pill = document.getElementById('hard-words-pill');
    if (!pill) return;
    const count = words.filter(w => (w.wrongCount || 0) > 0).length;
    pill.textContent = count > 0 ? `🔥 Hard Words (${count})` : '🔥 Hard Words';
    pill.disabled = count === 0;
    pill.title = count === 0 ? 'No mistakes yet - keep practising!' : `${count} word${count > 1 ? 's' : ''} you have got wrong`;
}

// --- HAPTICS ---
function vibratePattern(type) {
    if (!('vibrate' in navigator)) return;
    if (localStorage.getItem('wortschatz-haptics') === 'off') return;
    if (type === 'correct') navigator.vibrate(25);
    if (type === 'wrong')   navigator.vibrate([60, 40, 60]);
    if (type === 'tap')     navigator.vibrate(10);
    if (type === 'next')    navigator.vibrate(8);
    if (type === 'preview') navigator.vibrate([30, 30, 30]);
}

// --- SOUND EFFECTS ---
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playSound(type) {
    if (localStorage.getItem('wortschatz-sound') === 'off') return;
    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();

        if (type === 'correct') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine'; osc.frequency.value = 880;
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(); osc.stop(ctx.currentTime + 0.4);
        } else if (type === 'wrong') {
            [0, 0.12].forEach(offset => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sawtooth'; osc.frequency.value = 140;
                gain.gain.setValueAtTime(0.2, ctx.currentTime + offset);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.1);
                osc.start(ctx.currentTime + offset);
                osc.stop(ctx.currentTime + offset + 0.1);
            });
        } else if (type === 'streak') {
            [523, 659, 784, 1047].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sine'; osc.frequency.value = freq;
                const t = ctx.currentTime + i * 0.08;
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                osc.start(t); osc.stop(t + 0.15);
            });
        }
    } catch(e) {}
}

function toggleSound() {
    const isOff = localStorage.getItem('wortschatz-sound') === 'off';
    localStorage.setItem('wortschatz-sound', isOff ? 'on' : 'off');
    updateSoundButton();
    if (isOff) playSound('correct');
}

function updateSoundButton() {
    const el = document.getElementById('sound-state');
    if (!el) return;
    const isOff = localStorage.getItem('wortschatz-sound') === 'off';
    el.textContent = isOff ? 'OFF' : 'ON';
    el.style.color = isOff ? 'var(--red)' : 'var(--green)';
}

// --- PRACTICE LOGIC ---
function updateStrength(word, isCorrect) {
    const idx = words.findIndex(w => w.german === word.german);
    if (idx === -1) return;
    if (isCorrect) {
        words[idx].strength = (words[idx].strength || 0) + 1;
    } else {
        words[idx].strength = 0;
        words[idx].wrongCount = (words[idx].wrongCount || 0) + 1;
    }
    saveWords();
    updateHardWordsPill();
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', ['practice','words'][i] === tab));
    document.getElementById('tab-practice').classList.toggle('active', tab === 'practice');
    document.getElementById('tab-words').classList.toggle('active', tab === 'words');
    if (tab === 'words') { renderWordList(); }
}

function setMode(mode, el) {
    currentMode = mode;
    document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    buildQueue();
    wordsSeen.clear();
    nextQuestion();
}

function updateStrengthBar(word) {
    const s = word.strength || 0;
    const MAX = 5;
    for (let i = 0; i < MAX; i++) {
        const dot = document.getElementById('sd-' + i);
        if (dot) dot.classList.toggle('filled', i < s);
    }
    const labels = ['new', 'learning', 'familiar', 'strong', 'mastered', 'mastered'];
    const lbl = document.getElementById('strength-label');
    if (lbl) lbl.textContent = labels[Math.min(s, labels.length - 1)];
}

function pickQuestionType(word) {
    const hasArticle = word.type === 'noun' && word.article;
    if (word.type === 'verb' || !hasArticle) {
        return Math.random() < 0.5 ? 'de-en' : 'en-de';
    }
    if (currentMode === 'de-en') return 'de-en';
    if (currentMode === 'en-de') return 'en-de';
    if (currentMode === 'article') return 'article';

    const r = Math.random();
    if (r < 0.35) return 'de-en';
    if (r < 0.7) return 'en-de';
    return 'article';
}

function nextQuestion() {
    if (sessionQueue.length === 0) {
        if (currentMode === 'hard') {
            const hardCount = words.filter(w => (w.wrongCount || 0) > 0).length;
            if (hardCount === 0) {
                document.getElementById('q-label').textContent = '';
                document.getElementById('q-word').innerHTML = '🎉';
                document.getElementById('mode-label').textContent = '🔥 Hard Words';
                document.getElementById('feedback').className = 'feedback correct show';
                document.getElementById('feedback').textContent = 'No mistakes yet! Keep practising in Mixed mode to build your hard list.';
                document.getElementById('next-btn').className = 'next-btn';
                document.getElementById('answer-row').style.display = 'none';
                document.getElementById('article-choices').style.display = 'none';
                return;
            }
        }
        wordsSeen.clear();
        buildQueue();
        showRoundComplete();
        return;
    }
    currentQuestion = sessionQueue.pop();
    vibratePattern('next');
    wordsSeen.add(currentQuestion.german);
    questionType = pickQuestionType(currentQuestion);

    answered = false;
    document.getElementById('feedback').className = 'feedback';
    document.getElementById('feedback').textContent = '';
    document.getElementById('next-btn').className = 'next-btn';
    document.getElementById('answer-input').value = '';
    document.getElementById('answer-input').className = 'answer-input';
    document.querySelectorAll('.article-btn').forEach(b => b.className = b.className.replace(/ correct| wrong/g, ''));

    const isArticle = questionType === 'article';
    document.getElementById('article-choices').style.display = isArticle ? 'flex' : 'none';
    document.getElementById('answer-row').style.display = isArticle ? 'none' : 'flex';

    const modeLabels = { 'de-en': '🇩🇪 German → English', 'en-de': '🇬🇧 English → German', 'article': 'Der / Die / Das?', 'hard': '🔥 Hard Words' };
    document.getElementById('mode-label').textContent = currentMode === 'mixed' ? '🎲 Mixed - ' + modeLabels[questionType] : (modeLabels[currentMode] || modeLabels[questionType]);

    let qLabel = '', qWord = '';
    if (questionType === 'de-en') {
        qLabel = 'Translate to English:';
        const art = currentQuestion.article ? `<span class="article">${currentQuestion.article}</span> ` : '';
        qWord = art + currentQuestion.german;
    } else if (questionType === 'en-de') {
        qLabel = 'Translate to German (with article if noun):';
        qWord = currentQuestion.english;
    } else {
        qLabel = 'What is the article for:';
        qWord = currentQuestion.german;
    }

    document.getElementById('q-label').textContent = qLabel;
    document.getElementById('q-word').innerHTML = qWord;

    if (!isArticle) {
        setTimeout(() => document.getElementById('answer-input').focus(), 50);
    }

    updateStats();
    updateProgress();
    updateStrengthBar(currentQuestion);
    autoSpeak();
}

function checkAnswer() {
    if (answered) { nextQuestion(); return; }
    const input = document.getElementById('answer-input');
    const userAnswer = input.value.trim();
    if (!userAnswer) return;

    answered = true;
    let isCorrect = false;
    let wasLenient = false;
    let correctAnswer = '';

    if (questionType === 'de-en') {
        correctAnswer = currentQuestion.english;
        const variants = correctAnswer.split('/').map(v => v.trim());
        let bestMatch = false;
        for (const v of variants) {
            const m = lenientMatch(userAnswer, v);
            if (m === 'exact') { bestMatch = 'exact'; break; }
            if (m === 'lenient') bestMatch = 'lenient';
        }
        isCorrect = bestMatch !== false;
        wasLenient = bestMatch === 'lenient';
    } else {
        const german = currentQuestion.german;
        const art = currentQuestion.article;
        const full = art ? `${art} ${german}` : german;
        correctAnswer = full;
        const m1 = lenientMatch(userAnswer, full);
        const m2 = lenientMatch(userAnswer, german);
        const best = m1 === 'exact' || m2 === 'exact' ? 'exact'
        : m1 === 'lenient' || m2 === 'lenient' ? 'lenient' : false;
        isCorrect = best !== false;
        wasLenient = best === 'lenient';
    }

    showResult(isCorrect, correctAnswer, input, wasLenient);
}

function showAnswer() {
    if (answered) return;
    answered = true;

    const fb = document.getElementById('feedback');
    const input = document.getElementById('answer-input');
    const nextBtn = document.getElementById('next-btn');
    let answer = '';

    if (questionType === 'de-en') {
        answer = currentQuestion.english;
    } else if (questionType === 'en-de') {
        const art = currentQuestion.article;
        answer = art ? `${art} ${currentQuestion.german}` : currentQuestion.german;
    } else if (questionType === 'article') {
        answer = currentQuestion.article;
        document.querySelectorAll('.article-btn').forEach(btn => {
            const btnText = btn.textContent.trim().split('\n')[0].trim().toLowerCase();
            if (btnText === answer.toLowerCase()) btn.classList.add('correct');
        });
    }

    fb.textContent = '👁 Answer: ' + answer;
    fb.className = 'feedback lenient show';

    if (input) {
        input.value = answer;
        input.classList.remove('wrong');
        input.disabled = true;
    }

    nextBtn.classList.add('show');
}

function checkArticle(chosen) {
    vibratePattern('tap');
    if (answered) return;
    if (currentQuestion.type !== 'noun' || !currentQuestion.article) return;
    answered = true;
    const correct_art = currentQuestion.article;
    const isCorrect = chosen === correct_art;

    document.querySelectorAll('.article-btn').forEach(btn => {
        const art = btn.textContent.trim().split('\n')[0].trim();
        if (art === correct_art) btn.classList.add('correct');
        else if (art === chosen && !isCorrect) btn.classList.add('wrong');
    });

        showResult(isCorrect, correct_art, null, false);
        document.getElementById('next-btn').className = 'next-btn show';
}

function showResult(isCorrect, correctAnswer, inputEl, wasLenient) {
    const fb = document.getElementById('feedback');
    updateStrength(currentQuestion, isCorrect);
    vibratePattern(isCorrect ? 'correct' : 'wrong');
    playSound(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) {
        correct++;
        streak++;
        if (streak > 0 && streak % 5 === 0) playSound('streak');
        if (inputEl) {
            inputEl.classList.add('correct');
            const card = document.getElementById('practice-card');
            if (card) {
                card.classList.add('flash-correct');
                setTimeout(() => card.classList.remove('flash-correct'), 800);
            }
        }
        if (wasLenient) {
            fb.textContent = '〜 Accepted – small typo forgiven. Correct answer: ' + correctAnswer;
            fb.className = 'feedback lenient show';
        } else {
            fb.textContent = '✓ Correct! Well done.';
            fb.className = 'feedback correct show';
        }
    } else {
        wrong++;
        streak = 0;
        if (inputEl) {
            inputEl.classList.add('wrong');
            inputEl.classList.add('shake');
            setTimeout(() => inputEl.classList.remove('shake'), 400);
        }
        fb.textContent = `✗ The correct answer is: ${correctAnswer}`;
        fb.className = 'feedback wrong show';
    }
    document.getElementById('next-btn').className = 'next-btn show';
    updateStats();
    saveScore();
}

function showRoundComplete() {
    const card = document.getElementById('practice-card');
    card.innerHTML = ` <div style="text-align:center;padding:20px 0">  <div style="font-family:'Playfair Display',serif;font-size:36px;color:var(--accent);margin-bottom:12px">Round Complete</div>  <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--text-muted);margin-bottom:32px">You've gone through all ${words.length} words. Starting a new round…</div>  <div style="display:flex;justify-content:center;gap:40px;margin-bottom:32px">  <div><div style="font-family:'Playfair Display',serif;font-size:40px;color:var(--green)">${correct}</div><div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase">Correct</div></div>  <div><div style="font-family:'Playfair Display',serif;font-size:40px;color:var(--red)">${wrong}</div><div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase">Wrong</div></div>  <div><div style="font-family:'Playfair Display',serif;font-size:40px;color:var(--accent2)">${correct + wrong > 0 ? Math.round(correct/(correct+wrong)*100) : 0}%</div><div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase">Accuracy</div></div>  </div>  <button onclick="startNextRound()" style="padding:14px 40px;background:var(--accent);color:#0f0e0c;border:none;border-radius:10px;cursor:pointer;font-family:'DM Mono',monospace;font-size:13px;font-weight:500;letter-spacing:0.5px">Start Next Round →</button>  </div>`;
}

function startNextRound() {
    resetScore();
    document.getElementById('practice-card').innerHTML = ` <div class="mode-badge" id="mode-label">Mixed Mode</div>  <div class="strength-bar" id="strength-bar">  <div class="strength-dot" id="sd-0"></div>  <div class="strength-dot" id="sd-1"></div>  <div class="strength-dot" id="sd-2"></div>  <div class="strength-dot" id="sd-3"></div>  <div class="strength-dot" id="sd-4"></div>  <span class="strength-label" id="strength-label">new</span>  </div>  <div class="question-area">  <div class="question-label" id="q-label">Translate to English:</div>  <div class="question-word" id="q-word">Loading...</div>  </div>  <div class="article-choices" id="article-choices" style="display:none">  <button class="article-btn der-btn" onclick="checkArticle('der')">der<span class="article-label">masculine</span></button>  <button class="article-btn die-btn" onclick="checkArticle('die')">die<span class="article-label">feminine</span></button>  <button class="article-btn das-btn" onclick="checkArticle('das')">das<span class="article-label">neuter</span></button>  </div>  <div class="voice-row">  <button class="voice-btn" id="voice-btn" onclick="speakQuestion()"><span class="voice-icon">🔊</span> Pronounce</button>  <label class="auto-speak-toggle"><input type="checkbox" id="auto-speak"> auto-play</label>  </div>  <div class="answer-row" id="answer-row">  <input type="text" class="answer-input" id="answer-input" placeholder="Type your answer..." onkeydown="handleKey(event)" inputmode="latin" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false">  <button class="submit-btn" onclick="checkAnswer()">Check</button>  </div>  <div class="feedback" id="feedback"></div>  <button class="next-btn" id="next-btn" onclick="nextQuestion()">Next Word →</button>  <div class="progress-section">  <div class="progress-text"><strong id="words-done">0</strong> / <strong id="words-total">0</strong> words seen</div>  <div class="progress-text" style="color:var(--text-dim);font-size:11px;">Press Enter to check or continue</div>  </div>`;
    nextQuestion();
}

// --- SETTINGS ---
function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    const btn   = document.getElementById('settings-gear-btn');
    const isOpen = panel.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
    if (isOpen) {
        const rect = btn.getBoundingClientRect();
        panel.style.top  = (rect.bottom + 6) + 'px';
        panel.style.right = (window.innerWidth - rect.right) + 'px';
        updateThemeButtons();
        updateHapticsButton();
        updateSoundButton();
        setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
    } else {
        document.getElementById('theme-submenu').classList.remove('open');
    }
}

function closeSettings() {
    document.getElementById('settings-panel').classList.remove('open');
    document.getElementById('theme-submenu').classList.remove('open');
    document.getElementById('settings-gear-btn').classList.remove('open');
}

function closeOnOutside(e) {
    const wrap = document.querySelector('.settings-wrap');
    if (wrap && !wrap.contains(e.target)) {
        closeSettings();
        document.removeEventListener('click', closeOnOutside);
    }
}

function toggleHaptics() {
    const isOff = localStorage.getItem('wortschatz-haptics') === 'off';
    localStorage.setItem('wortschatz-haptics', isOff ? 'on' : 'off');
    updateHapticsButton();
    if (isOff) vibratePattern('preview');
}

function updateHapticsButton() {
    const el = document.getElementById('haptics-state');
    if (!el) return;
    const isOff = localStorage.getItem('wortschatz-haptics') === 'off';
    el.textContent = isOff ? 'OFF' : 'ON';
    el.style.color = isOff ? 'var(--red)' : 'var(--green)';
}

function toggleThemeSubmenu() {
    document.getElementById('theme-submenu').classList.toggle('open');
}

function openAbout() {
    closeSettings();
    document.getElementById('about-modal').classList.add('open');
}

function closeAbout() {
    document.getElementById('about-modal').classList.remove('open');
}

function closeAboutOnOverlay(e) {
    if (e.target === document.getElementById('about-modal')) closeAbout();
}

function setTheme(theme) {
    if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem(THEME_KEY);
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
    }
    updateThemeButtons();
}

function updateThemeButtons() {
    const current = document.documentElement.getAttribute('data-theme') || 'system';
    ['system', 'light', 'dark', 'pastel'].forEach(t => {
        const btn = document.getElementById('theme-btn-' + t);
        if (btn) btn.classList.toggle('active', current === t);
    });
}

function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) document.documentElement.setAttribute('data-theme', saved);
}

// --- VOICE ---
const synth = window.speechSynthesis;
let voices = [];

function loadVoices() {
    voices = synth.getVoices();
    if (voices.length === 0) {
        synth.onvoiceschanged = () => { voices = synth.getVoices(); };
    }
}

function getBestVoice(lang) {
    const exact = voices.find(v => v.lang === lang);
    const partial = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
    return exact || partial || null;
}

function speakText(text, lang) {
    if (!synth) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.9;
    const voice = getBestVoice(lang);
    if (voice) utter.voice = voice;

    const btn = document.getElementById('voice-btn');
    if (btn) {
        btn.classList.add('speaking');
        utter.onend = () => btn.classList.remove('speaking');
        utter.onerror = () => btn.classList.remove('speaking');
    }
    synth.speak(utter);
}

function speakQuestion() {
    if (!currentQuestion) return;
    if (!synth) {
        document.getElementById('voice-btn')?.classList.add('unsupported');
        return;
    }
    if (questionType === 'de-en' || questionType === 'article') {
        speakText(currentQuestion.german, 'de-DE');
    } else {
        speakText(currentQuestion.english.replace(/^to /, ''), 'en-US');
    }
}

function autoSpeak() {
    const auto = document.getElementById('auto-speak');
    if (auto && auto.checked) speakQuestion();
}

// --- UI & STATS ---
function handleKey(e) {
    if (e.key === 'Enter') {
        if (!answered) checkAnswer();
        else nextQuestion();
    }
}

function updateStats() {
    document.getElementById('score-correct').textContent = correct;
    document.getElementById('score-wrong').textContent = wrong;
    document.getElementById('score-streak').textContent = streak;
}

function updateProgress() {
    const pct = words.length > 0 ? (wordsSeen.size / words.length * 100) : 0;
    const fill = document.getElementById('progress-fill');
    if (fill) fill.style.width = pct + '%';
    document.getElementById('words-done').textContent = wordsSeen.size;
    document.getElementById('words-total').textContent = words.length;
}

// --- WORD LIST & MANAGEMENT ---
const ROW_HEIGHT = 44;
const BUFFER = 4;

function renderWordList() {
    const scroll = document.getElementById('word-list-scroll');
    const spacer = document.getElementById('word-list-spacer');
    const body = document.getElementById('word-list-body');
    if (!scroll || !spacer || !body) return;

    if (words.length === 0) {
        spacer.style.height = '60px';
        body.innerHTML = '<div class="empty-state" style="position:absolute;top:0;left:0;right:0">No words yet. Add some above!</div>';
        scroll.onscroll = null;
        return;
    }

    const totalHeight = words.length * ROW_HEIGHT;
    spacer.style.height = totalHeight + 'px';

    function renderVisible() {
        const scrollTop = scroll.scrollTop;
        const viewHeight = scroll.clientHeight || 420;
        const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
        const end = Math.min(words.length, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + BUFFER);

        body.innerHTML = words.slice(start, end).map((w, rel) => {
            const i = start + rel;
            const artTag = w.type === 'noun'
            ? `<span class="article-tag tag-${w.article}">${w.article}</span>`
            : `<span class="article-tag tag-verb">verb</span>`;
            const display = w.type === 'noun' ? `${w.article} ${w.german}` : w.german;
            const wc = w.wrongCount || 0;
            const errorBadge = wc > 0
            ? `<span class="error-badge">${wc}</span>`
            : `<span style="color:var(--text-dim);font-family:'DM Mono',monospace;font-size:11px">-</span>`;
            return `
            <div class="word-row" style="top:${i * ROW_HEIGHT}px">
            <span style="color:var(--text-dim);font-family:'DM Mono',monospace;font-size:12px">${i+1}</span>
            <span class="german">${display}</span>
            <span class="english">${w.english}</span>
            <span>${artTag}</span>
            <span>${errorBadge}</span>
            <span><button class="delete-btn" onclick="deleteWord(${i})">×</button></span>
            </div>`;
        }).join('');
    }

    scroll.onscroll = renderVisible;
    renderVisible();
}

function toggleArticleField() {
    const type = document.getElementById('word-type').value;
    document.getElementById('article-field').style.display = type === 'noun' ? 'flex' : 'none';
}

function deleteWord(index) {
    words.splice(index, 1);
    saveWords();
    renderWordList();
    buildQueue();
    updateProgress();
}

function addWord() {
    const type = document.getElementById('word-type').value;
    const article = type === 'noun' ? document.getElementById('word-article').value : null;
    const german = document.getElementById('word-german').value.trim();
    const english = document.getElementById('word-english').value.trim();
    if (!german || !english) {
        document.getElementById('word-german').style.borderColor = german ? '' : 'var(--red)';
        document.getElementById('word-english').style.borderColor = english ? '' : 'var(--red)';
        return;
    }
    const germanFinal = type === 'noun' ? german.charAt(0).toUpperCase() + german.slice(1) : german.toLowerCase();
    const dup = words.some(w => normalizeWord(w.german) === normalizeWord(germanFinal));
    if (dup) {
        document.getElementById('word-german').style.borderColor = 'var(--red)';
        return;
    }
    words.push({ type, article, german: germanFinal, english, strength: 0, wrongCount: 0 });
    document.getElementById('word-german').value = '';
    document.getElementById('word-english').value = '';
    document.getElementById('word-german').style.borderColor = '';
    document.getElementById('word-english').style.borderColor = '';
    saveWords();
    renderWordList();
    buildQueue();
    updateProgress();
}

// --- IMPORT ---
function toggleImport() {
    const body = document.getElementById('import-body');
    const arrow = document.getElementById('import-arrow');
    const open = body.classList.toggle('open');
    arrow.textContent = open ? '▼' : '▶';
}

function showImportFb(msg, type) {
    const fb = document.getElementById('import-feedback');
    fb.textContent = msg;
    fb.className = 'import-feedback ' + type;
    setTimeout(() => { fb.className = 'import-feedback'; }, 4000);
}

function importWords() {
    const raw = document.getElementById('import-textarea').value.trim();
    if (!raw) { showImportFb('Nothing to import', 'err'); return; }

    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const articleRegex = /^(der|die|das)\s+/i;
    let added = 0, skipped = 0;

    for (const line of lines) {
        const delimMatch = line.match(/^(.+?)\s*[-=|,]\s*(.+)$/);
        if (!delimMatch) { skipped++; continue; }

        let left = delimMatch[1].trim();
        let right = delimMatch[2].trim();
        let type, article = null, german, english;

        const artMatch = left.match(articleRegex);
        if (artMatch) {
            article = artMatch[1].toLowerCase();
            german = left.slice(artMatch[0].length).trim();
            english = right;
            type = 'noun';
        } else {
            const rightParts = right.split(/\s*,\s*/);
            if (rightParts.length >= 2 && ['der','die','das'].includes(rightParts[0].toLowerCase())) {
                german = left;
                article = rightParts[0].toLowerCase();
                english = rightParts.slice(1).join(', ');
                type = 'noun';
            } else {
                german = left;
                english = right;
                type = 'verb';
                article = null;
            }
        }

        if (type === 'noun') german = german.charAt(0).toUpperCase() + german.slice(1);
        else german = german.toLowerCase();

        const dup = words.some(w => normalizeWord(w.german) === normalizeWord(german));
        if (!dup && german && english) {
            words.push({ type, article, german, english, strength: 0, wrongCount: 0 });
            added++;
        } else {
            skipped++;
        }
    }

    if (added > 0) {
        saveWords();
        renderWordList();
        buildQueue();
        updateProgress();
        showImportFb(`✓ ${added} word${added > 1 ? 's' : ''} imported${skipped ? ' (' + skipped + ' skipped)' : ''}`, 'ok');
        document.getElementById('import-textarea').value = '';
    } else {
        showImportFb('Could not parse any lines. Check format.', 'err');
    }
}

// --- PERSISTENCE ---
function wordKey(w) { return (w.german || '').toLowerCase().trim(); }

function saveWords() {
    try {
        const defaultKeys = new Set(DEFAULT_WORDS.map(wordKey));
        const currentKeys = new Set(words.map(wordKey));
        const deletedKeys = DEFAULT_WORDS.map(wordKey).filter(k => !currentKeys.has(k));
        const userAdded = words.filter(w => !defaultKeys.has(wordKey(w)));
        const strengthMap = {};
        words.forEach(w => {
            if (w.strength > 0 || w.wrongCount > 0)
                strengthMap[wordKey(w)] = { s: w.strength, w: w.wrongCount };
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, deletedKeys, userAdded, strengthMap }));
        showSaveIndicator();
    } catch(e) {
        alert('Storage limit reached. Please remove some words.');
    }
}

function loadWords() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && saved.version === 2) {
            const deletedKeys = new Set(saved.deletedKeys || []);
            const strengthMap = saved.strengthMap || {};
            const userAdded = (saved.userAdded || []).map(w => ({ strength: 0, wrongCount: 0, ...w }));
            const base = DEFAULT_WORDS
            .filter(w => !deletedKeys.has(wordKey(w)))
            .map(w => {
                const sm = strengthMap[wordKey(w)];
                return sm ? { ...w, strength: sm.s || 0, wrongCount: sm.w || 0 } : { ...w };
            });
            const baseKeys = new Set(base.map(wordKey));
            const extras = userAdded.filter(w => !baseKeys.has(wordKey(w)));
            words = [...base, ...extras];
            return true;
        } else if (Array.isArray(saved) && saved.length > 0) {
            words = saved.map(w => ({ strength: 0, wrongCount: 0, ...w }));
            return true;
        }
    } catch(e) {}
    words = DEFAULT_WORDS.map(w => ({ ...w }));
    return false;
}

function showSaveIndicator() {
    const el = document.getElementById('save-indicator');
    if (!el) return;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
}

// --- INIT ---
function init() {
    loadTheme();
    loadWords();
    loadScore();
    loadVoices();
    buildQueue();
    nextQuestion();
    updateHardWordsPill();
    updateHapticsButton();
    updateSoundButton();

    const header = document.querySelector('header');
    if (header) {
        const ind = document.createElement('span');
        ind.id = 'save-indicator';
        ind.style.cssText = 'font-family:"DM Mono",monospace;font-size:10px;color:var(--green);opacity:0;transition:opacity 0.5s;letter-spacing:1px;margin-left:8px;';
        ind.textContent = '✓ saved';
        header.appendChild(ind);
    }
}

init();
