const fetch = require('node-fetch');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const body = JSON.parse(event.body || '{}');
    const { owner, repo, path = 'data.json', content, writeKey } = body;
    if (!owner || !repo || content === undefined) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing owner, repo, or content' }) };
    }

    const SITE_WRITE_KEY = process.env.SITE_WRITE_KEY;
    if (SITE_WRITE_KEY) {
      if (!writeKey || writeKey !== SITE_WRITE_KEY) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Missing or invalid write key' }) };
      }
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return { statusCode: 500, body: JSON.stringify({ message: 'Server misconfigured: missing GITHUB_TOKEN' }) };
    }

    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const headers = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'site-committer'
    };

    // Check whether file exists to get sha
    let sha = null;
    const getRes = await fetch(apiBase, { method: 'GET', headers });
    if (getRes.status === 200) {
      const getJson = await getRes.json();
      sha = getJson.sha;
    } else if (getRes.status !== 404) {
      const txt = await getRes.text();
      return { statusCode: 500, body: JSON.stringify({ message: 'Failed to check file', detail: txt }) };
    }

    const contentStr = JSON.stringify(content, null, 2);
    const bodyPut = {
      message: `Update ${path} via site`,
      content: Buffer.from(contentStr).toString('base64'),
      committer: { name: 'Site Bot', email: 'site-bot@example.com' }
    };
    if (sha) bodyPut.sha = sha;

    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPut)
    });

    const putJson = await putRes.json();
    if (!putRes.ok) {
      return { statusCode: putRes.status, body: JSON.stringify(putJson) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, commit: putJson.commit }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};
