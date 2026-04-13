// ═══════════════════════════════════════════════
// Horse Runner — Chrome Dino Game clone with horse
// ═══════════════════════════════════════════════
(function () {
    'use strict';

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    // ── Platform detection ──
    const IS_MOBILE = /Mobi/i.test(navigator.userAgent);
    const IS_TOUCH = 'ontouchstart' in window;

    // ── Dimensions ──
    const DEFAULT_WIDTH = 600;
    const W = DEFAULT_WIDTH;
    const H = 150;
    const GROUND = 127;
    const PX = 2; // each game-pixel = 2×2 screen pixels
    const FPS = 60;
    const BOTTOM_PAD = 10;

    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;

    // ── Physics (matching Chrome Dino exactly) ──
    const GRAVITY = 0.6;
    const JUMP_VEL = -10;
    const DROP_VEL = -5;
    const SPEED_DROP_COEFF = 3;
    const INITIAL_SPEED = 6;
    const MAX_SPEED = 12;
    const SPEED_INC = 0.001;
    const MOBILE_SPEED_COEFF = 1.2;
    const MIN_JUMP_HEIGHT = 35;

    // ── Timing ──
    const NIGHT_CYCLE = 700;
    const CLEAR_TIME = 3000;           // ms before obstacles start
    const GAMEOVER_CLEAR_TIME = 750;
    const ACHIEVEMENT_DISTANCE = 100;
    const FLASH_DURATION = 250;        // ms per flash cycle
    const FLASH_ITERATIONS = 3;
    const BLINK_TIMING = 7000;         // max ms between idle blinks
    const INTRO_DURATION = 400;        // ms for intro slide

    // ── Cloud config ──
    const CLOUD_FREQUENCY = 0.5;
    const MAX_CLOUDS = 6;
    const BG_CLOUD_SPEED = 0.2;
    const MIN_CLOUD_GAP = 100;
    const MAX_CLOUD_GAP = 400;
    const MIN_SKY_LEVEL = 71;
    const MAX_SKY_LEVEL = 30;

    // ── Colors ──
    let isNight = false;
    const fg = () => isNight ? '#e0e0e0' : '#535353';
    const bg = () => isNight ? '#1a1a2e' : '#f7f7f7';
    const jockeyCol = () => isNight ? '#ff5722' : '#ff0000';

    // ── Pixel helpers ──
    function px(x, y, w, h) {
        ctx.fillRect(Math.round(x), Math.round(y), w * PX, h * PX);
    }

    function getRandomNum(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function countryFlag(code) {
        if (!code || code === 'XX' || code.length !== 2) return '\u{1F3F3}\u{FE0F}';
        const base = 0x1F1E6;
        return String.fromCodePoint(base + code.charCodeAt(0) - 65, base + code.charCodeAt(1) - 65);
    }

    // ═══════════════════════════════════
    // SOUND FX — Web Audio API
    // ═══════════════════════════════════

    let audioCtx = null;

    function ensureAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playTone(freq, duration, type, vol) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || 'square';
        osc.frequency.value = freq;
        gain.gain.value = vol || 0.08;
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    function sfxJump() { playTone(200, 0.15, 'square', 0.06); }
    function sfxHit() {
        playTone(100, 0.3, 'sawtooth', 0.1);
        playTone(80, 0.4, 'square', 0.06);
    }
    function sfxScore() {
        playTone(587, 0.1, 'square', 0.06);
        setTimeout(() => playTone(784, 0.15, 'square', 0.06), 100);
    }

    function sfxGhostPass() {
        playTone(440, 0.12, 'sine', 0.05);
        setTimeout(() => playTone(554, 0.12, 'sine', 0.05), 80);
        setTimeout(() => playTone(659, 0.18, 'sine', 0.04), 160);
    }

    // ═══════════════════════════════════════
    // HORSE + JOCKEY SPRITES
    // ═══════════════════════════════════════

    function makeHorse() {
        const torso = [
            [3, 8, 18, 9],     // main barrel
            [18, 6, 6, 7],     // chest / shoulder
            [1, 8, 4, 5],      // rump / hindquarters
            [20, 4, 4, 5],     // neck base
            [22, 2, 3, 4],     // mid neck
            [23, 1, 3, 3],     // neck top
            [24, -1, 8, 3],    // upper head
            [23, 1, 9, 2],     // mid head
            [24, 2, 7, 2],     // lower head
            [31, 0, 2, 2],     // nose tip
            [25, -3, 2, 2],    // ear
            [19, 2, 2, 4],     // low mane
            [21, 0, 2, 3],     // mid mane
            [23, -1, 2, 2],    // top mane
            [0, 8, 3, 3],      // tail root
            [-1, 11, 3, 3],    // tail mid
            [-1, 14, 2, 3],    // tail tip
        ];

        const eye = [29, 0];
        const deadEye = [28, -1];

        // ── Jockey — BIG, unmistakable human rider ──
        const jockeyRun = [
            [8, 3, 6, 6],       // seat + lower back
            [12, 0, 5, 6],      // upper torso + shoulders
            [16, 1, 5, 4],      // arms reaching to reins
            [6, 8, 4, 4],       // thick thigh on barrel
            [5, 12, 3, 4],      // shin + boot
        ];
        const jockeyRunDark = [
            [13, -3, 4, 4],     // big helmet
        ];

        const jockeyJump = [
            [9, 3, 6, 6],
            [13, 0, 5, 6],
            [17, 1, 4, 4],
            [8, 8, 4, 3],
        ];
        const jockeyJumpDark = [
            [14, -3, 4, 4],
        ];

        const jockeyDuck = [
            [6, -1, 16, 5],
            [21, -1, 5, 4],
            [5, 4, 4, 4],
        ];
        const jockeyDuckDark = [
            [25, -3, 4, 3],
        ];

        // ── Collision boxes for each pose (multiple boxes per pose) ──
        const runBoxes = [
            [3, 8, 20, 9],    // barrel
            [20, 2, 12, 10],  // neck + head
            [4, 17, 20, 7],   // legs zone
        ];
        const jumpBoxes = [
            [3, 8, 20, 9],
            [20, 2, 12, 10],
            [5, 17, 20, 3],
        ];
        const duckBoxes = [
            [3, 3, 24, 8],    // stretched barrel
            [25, 0, 12, 6],   // neck + head
            [5, 11, 22, 6],   // legs
        ];

        return {
            run1: {
                body: torso,
                legs: [[4, 17, 2, 7], [9, 17, 2, 5], [17, 17, 2, 5], [22, 17, 2, 7]],
                jockey: jockeyRun, jockeyDark: jockeyRunDark,
                eye, w: 33, h: 24, collisionBoxes: runBoxes
            },
            run2: {
                body: torso,
                legs: [[4, 17, 2, 5], [9, 17, 2, 7], [17, 17, 2, 7], [22, 17, 2, 5]],
                jockey: jockeyRun, jockeyDark: jockeyRunDark,
                eye, w: 33, h: 24, collisionBoxes: runBoxes
            },
            blink: {
                body: torso,
                legs: [[4, 17, 2, 7], [9, 17, 2, 5], [17, 17, 2, 5], [22, 17, 2, 7]],
                jockey: jockeyRun, jockeyDark: jockeyRunDark,
                eye: null, blinkEye: [29, 0], w: 33, h: 24, collisionBoxes: runBoxes
            },
            jump: {
                body: torso,
                legs: [[5, 17, 3, 3], [10, 17, 3, 3], [17, 17, 3, 3], [22, 17, 3, 3]],
                jockey: jockeyJump, jockeyDark: jockeyJumpDark,
                eye, w: 33, h: 20, collisionBoxes: jumpBoxes
            },
            duck: {
                body: [
                    [3, 3, 24, 8],
                    [25, 2, 5, 6],
                    [29, 0, 8, 3],
                    [28, 2, 9, 2],
                    [29, 3, 7, 2],
                    [36, 1, 2, 2],
                    [31, -2, 2, 2],
                    [0, 3, 3, 3],
                    [-1, 6, 3, 3],
                    [-1, 9, 2, 3],
                    [24, 0, 2, 3],
                ],
                legs: [[5, 11, 2, 6], [11, 11, 2, 6], [19, 11, 2, 6], [24, 11, 2, 6]],
                jockey: jockeyDuck, jockeyDark: jockeyDuckDark,
                eye: [34, 1], w: 38, h: 17, collisionBoxes: duckBoxes
            },
            dead: {
                body: torso,
                legs: [[4, 17, 2, 7], [9, 17, 2, 7], [17, 17, 2, 7], [22, 17, 2, 7]],
                jockey: jockeyRun, jockeyDark: jockeyRunDark,
                eye: null, deadEye, w: 33, h: 24, collisionBoxes: runBoxes
            }
        };
    }

    const HORSE = makeHorse();

    function drawHorse(sprite, x, y) {
        ctx.fillStyle = fg();
        for (const [bx, by, bw, bh] of sprite.body) px(x + bx * PX, y + by * PX, bw, bh);
        for (const [lx, ly, lw, lh] of sprite.legs) px(x + lx * PX, y + ly * PX, lw, lh);

        if (sprite.jockey) {
            ctx.fillStyle = jockeyCol();
            for (const [jx, jy, jw, jh] of sprite.jockey) px(x + jx * PX, y + jy * PX, jw, jh);
        }

        if (sprite.jockeyDark) {
            ctx.fillStyle = fg();
            for (const [jx, jy, jw, jh] of sprite.jockeyDark) px(x + jx * PX, y + jy * PX, jw, jh);
        }

        if (sprite.eye) {
            ctx.fillStyle = bg();
            px(x + sprite.eye[0] * PX, y + sprite.eye[1] * PX, 2, 2);
        }
        if (sprite.blinkEye) {
            ctx.fillStyle = bg();
            px(x + sprite.blinkEye[0] * PX, y + sprite.blinkEye[1] * PX, 2, 2);
            ctx.fillStyle = fg();
            px(x + sprite.blinkEye[0] * PX, y + (sprite.blinkEye[1] + 1) * PX, 2, 1);
        }
        if (sprite.deadEye) {
            ctx.fillStyle = bg();
            const dx = x + sprite.deadEye[0] * PX;
            const dy = y + sprite.deadEye[1] * PX;
            px(dx, dy, 1, 1);
            px(dx + 2 * PX, dy, 1, 1);
            px(dx + PX, dy + PX, 1, 1);
            px(dx, dy + 2 * PX, 1, 1);
            px(dx + 2 * PX, dy + 2 * PX, 1, 1);
        }
    }

    // ═══════════════════════════════════
    // OBSTACLE SPRITES — Racing hurdles
    // ═══════════════════════════════════

    const OBS = {
        hurdleLow: {
            parts: [
                [0, 0, 10, 2],
                [0, 4, 10, 2],
                [1, 0, 2, 8],
                [7, 0, 2, 8],
            ],
            collisionBoxes: [[0, 0, 10, 8]],
            w: 10, h: 8, minGap: 120,
            multipleSpeed: 3,   // multiples allowed above this speed
        },
        hurdleTall: {
            parts: [
                [0, 0, 10, 2],
                [0, 5, 10, 2],
                [0, 10, 10, 2],
                [1, 0, 2, 14],
                [7, 0, 2, 14],
            ],
            collisionBoxes: [[1, 0, 8, 14]],
            w: 10, h: 14, minGap: 140,
            multipleSpeed: 6,
        },
        hedge: {
            parts: [
                [0, 0, 12, 3],
                [1, 3, 10, 4],
                [2, 7, 8, 3],
            ],
            collisionBoxes: [[0, 0, 12, 10]],
            w: 12, h: 10, minGap: 130,
            multipleSpeed: 4,
        },
        oxer: {
            parts: [
                [0, 2, 6, 2],
                [0, 6, 6, 2],
                [1, 0, 2, 10],
                [8, 0, 6, 2],
                [8, 4, 6, 2],
                [8, 8, 6, 2],
                [9, 0, 2, 12],
            ],
            collisionBoxes: [[0, 0, 6, 10], [8, 0, 6, 12]],
            w: 14, h: 12, minGap: 160,
            multipleSpeed: 0,  // never multiples (too wide)
        },
        waterJump: {
            parts: [
                [0, 2, 6, 2],
                [1, 0, 2, 6],
                [3, 0, 2, 6],
            ],
            waterRect: [6, 4, 12, 4],
            collisionBoxes: [[0, 0, 6, 6], [6, 4, 12, 4]],
            w: 18, h: 8, minGap: 150,
            multipleSpeed: 0,
        },
    };

    // Bird — seagulls on the racecourse
    const OBS_BIRD = [
        { parts: [[0, 4, 14, 3], [4, 0, 4, 4], [12, 5, 3, 2], [0, 3, 2, 2]], w: 15, h: 10 },
        { parts: [[0, 3, 14, 3], [4, 6, 4, 4], [12, 2, 3, 2], [0, 3, 2, 2]], w: 15, h: 10 },
    ];
    const BIRD_COLLISION_BOXES = [[0, 3, 14, 4]];

    const GROUND_OBS = [OBS.hurdleLow, OBS.hurdleTall, OBS.hedge, OBS.oxer, OBS.waterJump];
    const GAP_COEFFICIENT = 0.6;
    const MAX_GAP_COEFFICIENT = 1.5;
    const MAX_OBSTACLE_LENGTH = 3;  // max grouped obstacles

    function drawObs(sprite, x, y) {
        ctx.fillStyle = fg();
        for (const [bx, by, bw, bh] of sprite.parts) px(x + bx * PX, y + by * PX, bw, bh);
        if (sprite.waterRect) {
            const [wx, wy, ww, wh] = sprite.waterRect;
            ctx.fillStyle = isNight ? '#1a5276' : '#85c1e9';
            px(x + wx * PX, y + wy * PX, ww, wh);
        }
    }

    // ═══════════════════════════════════
    // HORIZON LINE — bumpy ground
    // ═══════════════════════════════════

    const HORIZON_BUMP_THRESHOLD = 0.5;

    function makeGroundSegments() {
        const segs = [];
        let x = 0;
        while (x < W + 60) {
            const isBumpy = Math.random() < HORIZON_BUMP_THRESHOLD;
            const segW = 20 + Math.random() * 40;
            segs.push({ x, w: segW, bumpy: isBumpy });
            x += segW;
        }
        return segs;
    }

    // ═══════════════════════════════════
    // GAME STATE
    // ═══════════════════════════════════

    let state = 'waiting';  // waiting | intro | playing | dead
    let speed, score, runningTime, runFrame;
    let horseY, velY, jumping, ducking;
    let speedDrop, reachedMinHeight;
    let obstacles, clouds, groundDots, groundSegs;
    let lastNightToggle;
    let deathTime, lastTime;
    let blinkTimer, blinkDelay;
    let jumpCount;
    let playCount;

    // Score flash state (Dino-style: 3 iterations × 250ms)
    let flashTimer, flashIterations, flashOn;
    let lastAchievement;

    // Intro state
    let introTimer;
    let introStartX;

    // Cloud gap tracking
    let cloudGap;

    let hiScore = parseInt(localStorage.getItem('horse_hi') || '0');
    let sessionBest = 0;

    // ── Leaderboard state ──
    let leaderboard = [];
    let ghostMarkers = [];
    let ghostNotification = null;
    let sessionId = crypto.randomUUID();
    let obstaclesPassed = 0;
    let playStartTime = 0;
    let maxSpeedReached = 0;

    // Mobile speed adjustment
    let currentSpeed;

    function getAdjustedSpeed() {
        if (IS_MOBILE && canvas.width < DEFAULT_WIDTH) {
            return speed * MOBILE_SPEED_COEFF;
        }
        return speed;
    }

    function reset() {
        speed = INITIAL_SPEED;
        currentSpeed = speed;
        score = 0;
        runningTime = 0;
        runFrame = 0;
        horseY = GROUND;
        velY = 0;
        jumping = false;
        ducking = false;
        speedDrop = false;
        reachedMinHeight = false;
        obstacles = [];
        isNight = false;
        lastNightToggle = 0;
        deathTime = 0;
        lastTime = 0;
        blinkTimer = 0;
        blinkDelay = Math.random() * BLINK_TIMING;
        jumpCount = 0;
        flashTimer = 0;
        flashIterations = 0;
        flashOn = true;
        lastAchievement = 0;
        introTimer = 0;
        introStartX = -70;  // horse starts off-screen left
        cloudGap = getRandomNum(MIN_CLOUD_GAP, MAX_CLOUD_GAP);
        obstaclesPassed = 0;
        playStartTime = performance.now();
        maxSpeedReached = 0;
        ghostNotification = null;
        for (const g of ghostMarkers) {
            g.triggered = false;
            g.x = -100;
            g.passed = false;
        }
        initGround();
        initClouds();
    }

    function initGround() {
        groundDots = [];
        for (let x = 0; x < W + 40; x += 2 + Math.random() * 12) {
            groundDots.push({ x, w: 1 + Math.floor(Math.random() * 3), y: GROUND + 5 + Math.random() * 8 });
        }
        groundSegs = makeGroundSegments();
    }

    function initClouds() {
        clouds = [];
        // Start with a few clouds already on screen
        for (let i = 0; i < 3; i++) {
            clouds.push({
                x: Math.random() * W,
                y: getRandomNum(MAX_SKY_LEVEL, MIN_SKY_LEVEL),
                w: 20 + Math.random() * 25,
                gap: getRandomNum(MIN_CLOUD_GAP, MAX_CLOUD_GAP)
            });
        }
    }

    reset();

    // ═══════════════════════════════════
    // UPDATE — delta-time based
    // ═══════════════════════════════════

    function update(now) {
        // Intro animation
        if (state === 'intro') {
            if (!lastTime) lastTime = now;
            const deltaTime = Math.min(now - lastTime, 50);
            lastTime = now;
            introTimer += deltaTime;

            // Ease-out slide from left to final position (x=40)
            const t = Math.min(introTimer / INTRO_DURATION, 1);
            const easeOut = 1 - (1 - t) * (1 - t);
            introStartX = -70 + (40 + 70) * easeOut;

            if (introTimer >= INTRO_DURATION) {
                state = 'playing';
                introStartX = 40;
                lastTime = 0;
            }
            return;
        }

        if (state !== 'playing') return;

        if (!lastTime) lastTime = now;
        const deltaTime = Math.min(now - lastTime, 50);
        lastTime = now;
        const dtScale = deltaTime / (1000 / FPS);

        runningTime += deltaTime;
        currentSpeed = getAdjustedSpeed();
        speed = Math.min(MAX_SPEED, speed + SPEED_INC * dtScale);
        if (currentSpeed > maxSpeedReached) maxSpeedReached = currentSpeed;
        score += currentSpeed * 0.025 * dtScale;

        // Score milestone flash (Dino-style: 3 flashes × 250ms each)
        const s = Math.floor(score);
        if (s > 0 && s % ACHIEVEMENT_DISTANCE === 0 && s !== lastAchievement) {
            lastAchievement = s;
            flashTimer = 0;
            flashIterations = 0;
            flashOn = false;
            sfxScore();
        }
        if (flashIterations < FLASH_ITERATIONS) {
            flashTimer += deltaTime;
            if (flashTimer >= FLASH_DURATION) {
                flashTimer -= FLASH_DURATION;
                flashOn = !flashOn;
                if (flashOn) flashIterations++;
            }
        } else {
            flashOn = true;
        }

        // Day/night
        if (s - lastNightToggle >= NIGHT_CYCLE) {
            isNight = !isNight;
            lastNightToggle = s;
        }

        // Run animation (toggle every ~83ms = 12fps)
        runFrame = Math.floor(now / 83) % 2;

        // Horse physics
        if (jumping) {
            if (speedDrop) {
                horseY += velY * SPEED_DROP_COEFF * dtScale;
            } else {
                horseY += velY * dtScale;
            }
            velY += GRAVITY * dtScale;

            const minJumpY = GROUND - MIN_JUMP_HEIGHT;
            if (horseY < minJumpY || speedDrop) {
                reachedMinHeight = true;
            }

            if (horseY >= GROUND) {
                horseY = GROUND;
                velY = 0;
                jumping = false;
                speedDrop = false;
                reachedMinHeight = false;
            }
        }

        // Obstacles — only spawn after clear time
        if (runningTime > CLEAR_TIME) {
            if (obstacles.length === 0) {
                spawnObstacle();
            } else {
                const last = obstacles[obstacles.length - 1];
                if (last.spawned && last.x + last.totalW * PX + last.gap < W) {
                    spawnObstacle();
                }
            }

            for (let i = obstacles.length - 1; i >= 0; i--) {
                const o = obstacles[i];
                const moveSpeed = currentSpeed + (o.extraSpeed || 0);
                o.x -= moveSpeed * dtScale;
                if (o.bird) o.birdFrame = (o.birdFrame + 0.06 * dtScale) % 2;
                if (o.x + o.totalW * PX < -30) { obstacles.splice(i, 1); obstaclesPassed++; }
            }

            checkCollision();
        }

        // Ground scroll (including bumpy segments)
        for (const d of groundDots) {
            d.x -= currentSpeed * dtScale;
            if (d.x < -10) d.x += W + 50;
        }
        for (const seg of groundSegs) {
            seg.x -= currentSpeed * dtScale;
            if (seg.x + seg.w < -10) {
                seg.x += groundSegs.reduce((sum, s) => sum + s.w, 0);
                seg.bumpy = Math.random() < HORIZON_BUMP_THRESHOLD;
            }
        }

        // Cloud scroll — dynamic spawning with frequency & gap
        for (let i = clouds.length - 1; i >= 0; i--) {
            clouds[i].x -= BG_CLOUD_SPEED * currentSpeed * dtScale;
            if (clouds[i].x + clouds[i].w < -10) {
                clouds.splice(i, 1);
            }
        }
        // Spawn new clouds from right
        if (clouds.length < MAX_CLOUDS) {
            const lastCloud = clouds.length > 0 ? clouds[clouds.length - 1] : null;
            const rightEdge = lastCloud ? lastCloud.x + lastCloud.w : 0;
            if (!lastCloud || rightEdge < W - cloudGap) {
                if (Math.random() < CLOUD_FREQUENCY) {
                    clouds.push({
                        x: W + 10,
                        y: getRandomNum(MAX_SKY_LEVEL, MIN_SKY_LEVEL),
                        w: 20 + Math.random() * 25,
                        gap: getRandomNum(MIN_CLOUD_GAP, MAX_CLOUD_GAP)
                    });
                    cloudGap = getRandomNum(MIN_CLOUD_GAP, MAX_CLOUD_GAP);
                }
            }
        }

        // Ghost markers — trigger when score crosses leaderboard entries
        const curScore = Math.floor(score);
        for (const g of ghostMarkers) {
            if (!g.triggered && curScore >= g.score) {
                g.triggered = true;
                g.x = W + 20;
            }
            if (g.triggered) {
                g.x -= currentSpeed * dtScale;
                if (!g.passed && g.x + 30 < 40) {
                    g.passed = true;
                    ghostNotification = { flag: countryFlag(g.country), score: g.score, rank: g.rank, timer: 2000 };
                    sfxGhostPass();
                }
            }
        }
        if (ghostNotification) {
            ghostNotification.timer -= deltaTime;
            if (ghostNotification.timer <= 0) ghostNotification = null;
        }
    }

    function spawnObstacle() {
        let obs;
        if (currentSpeed > 8 && Math.random() < 0.2) {
            // Bird
            const heights = [GROUND - 40, GROUND - 50, GROUND - 70];
            const y = heights[Math.floor(Math.random() * heights.length)];
            obs = {
                x: W, y, w: 15, h: 10, totalW: 15,
                bird: true, birdFrame: 0, extraSpeed: 1,
                collisionBoxes: BIRD_COLLISION_BOXES,
                gap: 0, spawned: false, size: 1
            };
        } else {
            const type = GROUND_OBS[Math.floor(Math.random() * GROUND_OBS.length)];

            // Obstacle grouping: 1-3 of the same type, if speed allows
            let size = 1;
            if (type.multipleSpeed > 0 && currentSpeed > type.multipleSpeed) {
                size = getRandomNum(1, MAX_OBSTACLE_LENGTH);
            }

            const totalW = type.w * size + (size - 1) * 2; // 2px gap between multiples
            obs = {
                x: W, y: GROUND - type.h * PX, w: type.w, h: type.h,
                totalW,
                bird: false, sprite: type, size,
                collisionBoxes: type.collisionBoxes || [[0, 0, type.w, type.h]],
                gap: 0, spawned: false
            };
        }

        // Calculate gap (matches Dino formula)
        const baseMinGap = obs.bird ? 150 : (obs.sprite ? obs.sprite.minGap : 120);
        const minGap = Math.round(obs.totalW * PX * currentSpeed + baseMinGap * GAP_COEFFICIENT);
        const maxGap = Math.round(minGap * MAX_GAP_COEFFICIENT);
        obs.gap = minGap + Math.random() * (maxGap - minGap);
        obs.spawned = true;

        obstacles.push(obs);
    }

    // ── Multi-box collision detection (2 levels like Dino) ──
    function boxesOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function checkCollision() {
        const spr = ducking ? HORSE.duck : HORSE.run1;
        const hx = 40;
        const hy = horseY - spr.h * PX;
        const m = 4; // tighter margin for multi-box

        for (const o of obstacles) {
            const ox = o.x;
            const oy = o.y;
            const ow = o.totalW * PX;
            const oh = o.h * PX;

            // Level 1: broad-phase bounding box
            if (!boxesOverlap(hx, hy, spr.w * PX, spr.h * PX, ox, oy, ow, oh)) continue;

            // Level 2: per-box collision
            for (const [hbx, hby, hbw, hbh] of spr.collisionBoxes) {
                const horseBoxX = hx + hbx * PX + m;
                const horseBoxY = hy + hby * PX + m;
                const horseBoxW = hbw * PX - m * 2;
                const horseBoxH = hbh * PX - m * 2;

                // For grouped obstacles, check each instance
                for (let s = 0; s < (o.size || 1); s++) {
                    const instanceX = ox + s * (o.w + 2) * PX;
                    for (const [obx, oby, obw, obh] of o.collisionBoxes) {
                        if (boxesOverlap(
                            horseBoxX, horseBoxY, horseBoxW, horseBoxH,
                            instanceX + obx * PX + m, oy + oby * PX + m,
                            obw * PX - m * 2, obh * PX - m * 2
                        )) {
                            die();
                            return;
                        }
                    }
                }
            }
        }
    }

    function die() {
        state = 'dead';
        deathTime = performance.now();
        sfxHit();
        if (IS_MOBILE && navigator.vibrate) {
            navigator.vibrate(200);
        }
        const s = Math.floor(score);
        if (s > sessionBest) sessionBest = s;
        if (s > hiScore) {
            hiScore = s;
            localStorage.setItem('horse_hi', String(hiScore));
        }
        submitScore(s);
    }

    async function submitScore(s) {
        try {
            const res = await fetch('/api/scores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    score: s,
                    sessionId,
                    maxSpeed: maxSpeedReached,
                    obstaclesPassed,
                    playTime: performance.now() - playStartTime
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.rank && data.rank <= 20) fetchLeaderboard();
            }
        } catch (e) { /* silent */ }
    }

    async function fetchLeaderboard() {
        try {
            const res = await fetch('/api/scores');
            if (res.ok) {
                leaderboard = await res.json();
                buildGhostMarkers();
            }
        } catch (e) { /* silent */ }
    }

    function buildGhostMarkers() {
        ghostMarkers = leaderboard.map((entry, i) => ({
            score: entry.score,
            country: entry.country,
            rank: i + 1,
            triggered: false,
            x: -100,
            passed: false
        }));
    }

    // ═══════════════════════════════════
    // DRAW
    // ═══════════════════════════════════

    function draw(now) {
        ctx.fillStyle = bg();
        ctx.fillRect(0, 0, W, H);

        // Clouds
        ctx.fillStyle = isNight ? 'rgba(224,224,224,0.06)' : 'rgba(83,83,83,0.06)';
        for (const c of clouds) {
            ctx.fillRect(c.x, c.y, c.w, 6);
            ctx.fillRect(c.x + 3, c.y - 3, c.w - 6, 3);
            ctx.fillRect(c.x + c.w * 0.3, c.y - 5, c.w * 0.4, 3);
        }

        // Ground line — bumpy segments
        ctx.fillStyle = fg();
        for (const seg of groundSegs) {
            if (seg.x > W + 10 || seg.x + seg.w < -10) continue;
            if (seg.bumpy) {
                // Bumpy: subtle 1px undulations
                for (let bx = 0; bx < seg.w; bx += 4) {
                    const bumpY = (bx % 8 < 4) ? 0 : -1;
                    ctx.fillRect(seg.x + bx, GROUND + 2 + bumpY, 4, 1);
                }
            } else {
                ctx.fillRect(seg.x, GROUND + 2, seg.w, 1);
            }
        }

        // Ground texture dots
        for (const d of groundDots) {
            ctx.fillRect(d.x, d.y, d.w, 1);
        }

        // Obstacles
        for (const o of obstacles) {
            if (o.bird) {
                drawObs(OBS_BIRD[Math.floor(o.birdFrame)], o.x, o.y);
            } else {
                // Draw grouped obstacles
                for (let s = 0; s < (o.size || 1); s++) {
                    drawObs(o.sprite, o.x + s * (o.w + 2) * PX, o.y);
                }
            }
        }

        // Ghost markers (leaderboard entries)
        for (const g of ghostMarkers) {
            if (!g.triggered || g.x < -40 || g.x > W + 40) continue;
            const gx = g.x;
            const gy = GROUND - 30;
            // Dashed pole
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = isNight ? '#8888ff' : '#aaaacc';
            for (let dy = 0; dy < 30; dy += 4) ctx.fillRect(gx + 6, gy + dy, 2, 2);
            // Pennant
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = isNight ? '#6666cc' : '#9999bb';
            ctx.fillRect(gx + 8, gy, 14, 9);
            // Rank on pennant
            ctx.globalAlpha = 0.85;
            ctx.font = 'bold 7px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isNight ? '#ffffff' : '#333333';
            ctx.fillText('#' + g.rank, gx + 15, gy + 5);
            ctx.globalAlpha = 1.0;
        }

        // Horse
        const hx = (state === 'intro') ? introStartX : 40;
        let spr;
        if (state === 'dead') {
            spr = HORSE.dead;
        } else if (jumping) {
            spr = HORSE.jump;
        } else if (ducking) {
            spr = HORSE.duck;
        } else if (state === 'waiting') {
            // Blinking while waiting
            blinkTimer += 16;
            if (blinkTimer >= blinkDelay && blinkTimer < blinkDelay + 200) {
                spr = HORSE.blink;
            } else if (blinkTimer >= blinkDelay + 200) {
                blinkTimer = 0;
                blinkDelay = Math.random() * BLINK_TIMING;
                spr = HORSE.run1;
            } else {
                spr = HORSE.run1;
            }
        } else if (state === 'intro') {
            spr = HORSE.run1;
        } else {
            spr = runFrame === 0 ? HORSE.run1 : HORSE.run2;
        }
        drawHorse(spr, hx, horseY - spr.h * PX);

        // HUD
        drawHUD();

        // Ghost pass notification
        if (ghostNotification) {
            const alpha = Math.min(1, ghostNotification.timer / 500);
            ctx.globalAlpha = alpha;
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ghostNotification.flag, W / 2 - 40, 25);
            ctx.font = 'bold 11px "Courier New", monospace';
            ctx.fillStyle = isNight ? '#ffcc00' : '#cc8800';
            ctx.fillText('#' + ghostNotification.rank + '  ' + String(ghostNotification.score).padStart(5, '0'), W / 2 + 10, 25);
            ctx.globalAlpha = 1.0;
        }

        // Leaderboard
        drawLeaderboard();

        // Overlays
        if (state === 'dead') drawGameOver();
        if (state === 'waiting') drawIdle();
    }

    function drawHUD() {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';

        const scoreStr = String(Math.floor(score)).padStart(5, '0');
        const hiStr = String(hiScore).padStart(5, '0');

        // Score (flashes at milestones — Dino-style 3 iterations)
        if (flashOn) {
            ctx.font = 'bold 13px "Courier New", monospace';
            ctx.fillStyle = fg();
            ctx.fillText(scoreStr, W - 10, 10);
        }

        // HI score
        ctx.font = '10px "Courier New", monospace';
        ctx.fillStyle = isNight ? 'rgba(224,224,224,0.4)' : 'rgba(83,83,83,0.4)';
        ctx.fillText('HI ' + hiStr, W - 85, 12);
    }

    function drawLeaderboard() {
        if (leaderboard.length === 0) return;
        const isDead = state === 'dead';

        if (isDead) {
            // Death screen: show top 10 below the game-over area
            const count = Math.min(10, leaderboard.length);
            const startY = H / 2 + 28;
            const lineH = 11;
            ctx.globalAlpha = 0.85;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            // Two columns centered
            const colW = 130;
            const totalW = count > 5 ? colW * 2 : colW;
            const baseX = Math.round((W - totalW) / 2);

            for (let i = 0; i < count; i++) {
                const entry = leaderboard[i];
                const flag = countryFlag(entry.country);
                const scoreStr = String(entry.score).padStart(5, '0');
                const rank = String(i + 1).padStart(2, ' ');
                const col = i >= 5 ? 1 : 0;
                const row = i >= 5 ? i - 5 : i;
                const x = baseX + col * colW;
                // Flag at readable size
                ctx.font = '11px sans-serif';
                ctx.fillText(flag, x, startY + row * lineH);
                // Rank + score
                ctx.font = '9px "Courier New", monospace';
                ctx.fillStyle = fg();
                ctx.fillText(rank + '. ' + scoreStr, x + 16, startY + row * lineH + 1);
            }
            ctx.globalAlpha = 1.0;
        } else {
            // During play: faint top 5 in corner
            const count = Math.min(5, leaderboard.length);
            const lineH = 11;
            const startY = 26;
            const startX = 8;
            ctx.globalAlpha = 0.25;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            for (let i = 0; i < count; i++) {
                const entry = leaderboard[i];
                const flag = countryFlag(entry.country);
                const scoreStr = String(entry.score).padStart(5, '0');
                const rank = String(i + 1).padStart(2, ' ');
                ctx.font = '10px sans-serif';
                ctx.fillText(flag, startX, startY + i * lineH);
                ctx.font = '8px "Courier New", monospace';
                ctx.fillStyle = fg();
                ctx.fillText(rank + '. ' + scoreStr, startX + 14, startY + i * lineH + 1);
            }
            ctx.globalAlpha = 1.0;
        }
    }

    function drawGameOver() {
        ctx.fillStyle = fg();
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('G A M E   O V E R', W / 2, H / 2 - 25);

        // Restart icon
        const rx = W / 2, ry = H / 2 - 2;
        ctx.strokeStyle = fg();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rx, ry, 10, -Math.PI * 0.5, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx - 10, ry - 4);
        ctx.lineTo(rx - 10, ry + 4);
        ctx.lineTo(rx - 5, ry);
        ctx.fillStyle = fg();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(rx - 4, ry - 14);
        ctx.lineTo(rx, ry - 10);
        ctx.lineTo(rx + 4, ry - 14);
        ctx.fill();
    }

    function drawIdle() {
        ctx.fillStyle = fg();
        ctx.font = '11px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H / 2 + 15);
    }

    // ═══════════════════════════════════
    // INPUT
    // ═══════════════════════════════════

    function onJump() {
        if (state === 'waiting') {
            ensureAudio();
            jumpCount++;
            // First jump triggers intro animation
            state = 'intro';
            introTimer = 0;
            introStartX = -70;
            lastTime = 0;
            sfxJump();
            return;
        }
        if (state === 'intro') return; // ignore during intro
        if (state === 'dead') {
            if (performance.now() - deathTime < GAMEOVER_CLEAR_TIME) return;
            ensureAudio();
            reset();
            state = 'intro';
            introTimer = 0;
            introStartX = -70;
            lastTime = 0;
            sfxJump();
            return;
        }
        if (state === 'playing' && !jumping && horseY >= GROUND) {
            velY = JUMP_VEL;
            jumping = true;
            ducking = false;
            speedDrop = false;
            reachedMinHeight = false;
            jumpCount++;
            sfxJump();
        }
    }

    function onJumpRelease() {
        if (jumping && reachedMinHeight && velY < DROP_VEL) {
            velY = DROP_VEL;
        }
    }

    function onDuckDown() {
        if (state !== 'playing') return;
        if (jumping) {
            speedDrop = true;
            velY = 1;
        } else {
            ducking = true;
        }
    }

    function onDuckUp() {
        ducking = false;
        speedDrop = false;
    }

    document.addEventListener('keydown', e => {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            onJump();
        }
        if (e.code === 'ArrowDown') {
            e.preventDefault();
            onDuckDown();
        }
    });

    document.addEventListener('keyup', e => {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            onJumpRelease();
        }
        if (e.code === 'ArrowDown') {
            onDuckUp();
        }
    });

    canvas.addEventListener('pointerdown', e => {
        e.preventDefault();
        onJump();
    });

    canvas.addEventListener('pointerup', e => {
        onJumpRelease();
    });

    // ═══════════════════════════════════
    // VISIBILITY — pause when tab hidden
    // ═══════════════════════════════════

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && state === 'playing') {
            lastTime = 0;
        }
    });

    window.addEventListener('blur', () => {
        if (state === 'playing') lastTime = 0;
    });

    window.addEventListener('focus', () => {
        if (state === 'playing') lastTime = 0;
    });

    // ═══════════════════════════════════
    // LOOP
    // ═══════════════════════════════════

    function loop(now) {
        update(now);
        draw(now);
        requestAnimationFrame(loop);
    }

    fetchLeaderboard();
    requestAnimationFrame(loop);
})();
