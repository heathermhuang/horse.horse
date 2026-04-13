export default {
    async fetch(request, env) {
        const url = new URL(request.url);

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

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Bad JSON' }, 400);
    }

    const { score, sessionId, maxSpeed, obstaclesPassed, playTime } = body;

    // --- Anti-cheat validation ---

    // Require session ID and play time (game always sends these)
    if (!sessionId || typeof sessionId !== 'string') {
        return jsonResponse({ error: 'Missing session' }, 400);
    }
    if (typeof playTime !== 'number' || playTime <= 0) {
        return jsonResponse({ error: 'Missing play time' }, 400);
    }

    if (typeof score !== 'number' || !Number.isInteger(score) || score < 1) {
        return jsonResponse({ error: 'Invalid score' }, 400);
    }
    if (score > 99999) {
        return jsonResponse({ error: 'Score too high' }, 400);
    }

    // Physics plausibility: max ~15 score/sec at top speed
    const maxPossible = (playTime / 1000) * 15;
    if (score > maxPossible) {
        return jsonResponse({ error: 'Score/time mismatch' }, 400);
    }

    // Max speed sanity (game caps at 12, allow tiny float drift)
    if (typeof maxSpeed === 'number' && maxSpeed > 12.5) {
        return jsonResponse({ error: 'Invalid speed' }, 400);
    }

    // Obstacles sanity: roughly 1 obstacle per 50-100 score points
    if (typeof obstaclesPassed === 'number' && score > 200) {
        if (obstaclesPassed < score / 200) {
            return jsonResponse({ error: 'Invalid obstacles' }, 400);
        }
    }

    // Rate limiting: 1 score per session per 5 seconds
    const recent = await env.DB.prepare(
        'SELECT COUNT(*) as cnt FROM scores WHERE session_id = ? AND created_at > datetime("now", "-5 seconds")'
    ).bind(sessionId).first();
    if (recent && recent.cnt > 0) {
        return jsonResponse({ error: 'Too fast' }, 429);
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
    ).bind(score, country, sessionId || null, maxSpeed || null, obstaclesPassed || null).run();

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
