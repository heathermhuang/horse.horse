export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === '/api/scores' && request.method === 'GET') {
            return handleGetScores(env);
        }
        if (url.pathname === '/api/scores' && request.method === 'POST') {
            return handlePostScore(request, env);
        }

        // Everything else: serve static assets
        return env.ASSETS.fetch(request);
    }
};

async function handleGetScores(env) {
    const { results } = await env.DB.prepare(
        'SELECT score, country FROM scores ORDER BY score DESC LIMIT 20'
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

    if (typeof score !== 'number' || !Number.isInteger(score) || score < 1) {
        return jsonResponse({ error: 'Invalid score' }, 400);
    }
    if (score > 99999) {
        return jsonResponse({ error: 'Score too high' }, 400);
    }

    // Physics plausibility: max ~18 score/sec, allow generous 20
    if (typeof playTime === 'number' && playTime > 0) {
        const maxPossible = (playTime / 1000) * 20;
        if (score > maxPossible) {
            return jsonResponse({ error: 'Score/time mismatch' }, 400);
        }
    }

    // Max speed sanity (game caps at 12)
    if (typeof maxSpeed === 'number' && maxSpeed > 15) {
        return jsonResponse({ error: 'Invalid speed' }, 400);
    }

    // Rate limiting: 1 score per session per 5 seconds
    if (sessionId) {
        const recent = await env.DB.prepare(
            'SELECT COUNT(*) as cnt FROM scores WHERE session_id = ? AND created_at > datetime("now", "-5 seconds")'
        ).bind(sessionId).first();
        if (recent && recent.cnt > 0) {
            return jsonResponse({ error: 'Too fast' }, 429);
        }
    }

    // Only insert if score qualifies for top 20
    const { results: top } = await env.DB.prepare(
        'SELECT score FROM scores ORDER BY score DESC LIMIT 20'
    ).all();

    if (top.length >= 20 && score <= top[top.length - 1].score) {
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

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
