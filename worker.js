export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === '/api/session' && request.method === 'POST') {
            return handleCreateSession(request, env);
        }
        if (url.pathname === '/api/scores' && request.method === 'GET') {
            return handleGetScores(env);
        }
        if (url.pathname === '/api/scores' && request.method === 'POST') {
            return handlePostScore(request, env);
        }
        if (url.pathname === '/api/stats' && request.method === 'GET') {
            return handleGetStats(env);
        }

        // Everything else: serve static assets
        return env.ASSETS.fetch(request);
    }
};

// ── Session token issuance ──
//
// The client cannot be trusted to pick its own session id. We issue a
// server-tracked UUID, record (ip, iat), and require it back on /api/scores.
// On submit we check: exists, not consumed, age plausible, then mark consumed.
// This kills replay attacks and caps play-time inflation at the server clock.
async function handleCreateSession(request, env) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const now = Date.now();

    // Rate limit: at most 30 session issuances per IP per minute.
    const recent = await env.DB.prepare(
        'SELECT COUNT(*) AS cnt FROM sessions WHERE ip = ? AND iat > ?'
    ).bind(ip, now - 60_000).first();
    if (recent && recent.cnt >= 30) {
        return jsonResponse({ error: 'Too many sessions' }, 429);
    }

    const sid = crypto.randomUUID();
    await env.DB.prepare(
        'INSERT INTO sessions (sid, ip, iat, consumed) VALUES (?, ?, ?, 0)'
    ).bind(sid, ip, now).run();

    // Best-effort cleanup: drop sessions older than 2h. Cheap with index.
    await env.DB.prepare(
        'DELETE FROM sessions WHERE iat < ?'
    ).bind(now - 2 * 60 * 60 * 1000).run();

    return jsonResponse({ sessionId: sid, issuedAt: now });
}

async function handleGetScores(env) {
    const { results } = await env.DB.prepare(
        'SELECT score, country FROM scores ORDER BY score DESC LIMIT 100'
    ).all();

    return new Response(JSON.stringify(results), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

async function handlePostScore(request, env) {
    const country = request.headers.get('CF-IPCountry') || 'XX';
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Bad JSON' }, 400);
    }

    const { score, sessionId, maxSpeed, obstaclesPassed, playTime } = body;

    // --- Session token: must be server-issued, unconsumed, fresh ---
    if (!sessionId || typeof sessionId !== 'string') {
        return jsonResponse({ error: 'Missing session' }, 400);
    }
    if (typeof playTime !== 'number' || playTime <= 0) {
        return jsonResponse({ error: 'Missing play time' }, 400);
    }

    const session = await env.DB.prepare(
        'SELECT sid, ip, iat, consumed FROM sessions WHERE sid = ?'
    ).bind(sessionId).first();

    if (!session) {
        return jsonResponse({ error: 'Unknown session' }, 400);
    }
    if (session.consumed) {
        return jsonResponse({ error: 'Session already used' }, 400);
    }

    const now = Date.now();
    const sessionAge = now - session.iat;
    // Real game play is at least a couple seconds; anything faster is a bot.
    if (sessionAge < 3000) {
        return jsonResponse({ error: 'Session too young' }, 400);
    }
    // Sessions expire after 30 minutes.
    if (sessionAge > 30 * 60 * 1000) {
        return jsonResponse({ error: 'Session expired' }, 400);
    }

    // The client's claimed playTime has to be plausible vs. the server-known
    // session age. Client playTime counts only frames during active play; it
    // must be <= sessionAge + a small tolerance, and it should not be
    // drastically smaller either (that'd mean they stalled the session to
    // inflate the /api/scores physics check).
    if (playTime > sessionAge + 2000) {
        return jsonResponse({ error: 'Play time mismatch' }, 400);
    }
    // playTime can't claim the entire session age if the page was idle;
    // allow it to be up to sessionAge (plus small fudge). Anything vastly
    // greater is already rejected above.

    // --- Score shape / physics validation (defense in depth) ---
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 1) {
        return jsonResponse({ error: 'Invalid score' }, 400);
    }
    if (score > 99999) {
        return jsonResponse({ error: 'Score too high' }, 400);
    }

    // Physics plausibility: score rate is capped against SERVER-known age now,
    // not just the client-reported playTime. This is the real cheat-killer.
    const serverMaxPossible = (sessionAge / 1000) * 20;
    if (score > serverMaxPossible) {
        return jsonResponse({ error: 'Score/session mismatch' }, 400);
    }
    // Keep the client-playTime check too so anomalous client reports fail.
    const clientMaxPossible = (playTime / 1000) * 20;
    if (score > clientMaxPossible) {
        return jsonResponse({ error: 'Score/time mismatch' }, 400);
    }

    // Max speed sanity (game caps at 12, allow tiny float drift)
    if (typeof maxSpeed === 'number' && maxSpeed > 12.5) {
        return jsonResponse({ error: 'Invalid speed' }, 400);
    }
    // Real games always have maxSpeed as a drifting float; an exact integer
    // 10.0 with a 80k score is the attacker's signature. Require that any
    // scoring game reports a maxSpeed above the starting speed.
    if (score > 200 && (typeof maxSpeed !== 'number' || maxSpeed < 7)) {
        return jsonResponse({ error: 'Invalid speed' }, 400);
    }

    // Obstacles sanity: roughly 1 obstacle per 50-100 score points
    if (typeof obstaclesPassed === 'number' && score > 200) {
        if (obstaclesPassed < score / 200) {
            return jsonResponse({ error: 'Invalid obstacles' }, 400);
        }
        // Also: can't pass more obstacles than physics allows. Obstacles
        // spawn ~every 60 score points at most.
        if (obstaclesPassed > score) {
            return jsonResponse({ error: 'Invalid obstacles' }, 400);
        }
    }

    // --- Atomically consume the session so a retry can't double-submit. ---
    const consume = await env.DB.prepare(
        'UPDATE sessions SET consumed = 1 WHERE sid = ? AND consumed = 0'
    ).bind(sessionId).run();
    if (!consume.meta || consume.meta.changes !== 1) {
        return jsonResponse({ error: 'Session already used' }, 400);
    }

    // Increment total play count (every valid game)
    await env.DB.prepare(
        "UPDATE stats SET value = value + 1 WHERE key = 'total_plays'"
    ).run();

    // Only insert if score qualifies for top 100
    const { results: top } = await env.DB.prepare(
        'SELECT score FROM scores ORDER BY score DESC LIMIT 100'
    ).all();

    if (top.length >= 100 && score <= top[top.length - 1].score) {
        return jsonResponse({ rank: null });
    }

    // Insert
    await env.DB.prepare(
        'INSERT INTO scores (score, country, session_id, max_speed, obstacles_passed) VALUES (?, ?, ?, ?, ?)'
    ).bind(score, country, sessionId, maxSpeed || null, obstaclesPassed || null).run();

    // Prune to top 100
    await env.DB.prepare(
        'DELETE FROM scores WHERE id NOT IN (SELECT id FROM scores ORDER BY score DESC LIMIT 100)'
    ).run();

    // Calculate rank
    const rankResult = await env.DB.prepare(
        'SELECT COUNT(*) as rank FROM scores WHERE score > ?'
    ).bind(score).first();

    return jsonResponse({
        rank: (rankResult?.rank || 0) + 1,
        country
    });
}

async function handleGetStats(env) {
    const row = await env.DB.prepare(
        "SELECT value FROM stats WHERE key = 'total_plays'"
    ).first();
    return new Response(JSON.stringify({ totalPlays: row?.value || 0 }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=10',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
