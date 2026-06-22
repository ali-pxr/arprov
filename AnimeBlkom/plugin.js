const PLUGIN_ID = 'animeblkom';
const baseUrl = typeof manifest !== 'undefined' ? manifest.baseUrl : 'https://animeblkom.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

async function httpFetch(url, extraHeaders) {
    const h = { 'User-Agent': UA };
    if (extraHeaders) Object.assign(h, extraHeaders);
    if (typeof http_get !== 'undefined') {
        let r;
        try { r = await http_get(url, h); } catch (e) { r = { status: 403, body: '' }; }
        if (r.status === 403 || r.status === 503 || (r.body && r.body.includes('Just a moment'))) {
            if (typeof solveCaptcha !== 'undefined') {
                await solveCaptcha('cloudflare', url);
                try { r = await http_get(url, h); } catch (e) { r = { status: 500, body: '' }; }
            }
        }
        return r.body || '';
    }
    return '';
}

// Simple HTML helper: get attribute of first element matching selector
function getAttr(html, sel, attr) {
    if (typeof parse_html !== 'undefined') {
        return parse_html(html, sel, attr) || '';
    }
    return '';
}

// Extract all matches of regex from html
function matchAll(html, regex) {
    const results = [];
    let m;
    while ((m = regex.exec(html)) !== null) results.push(m);
    return results;
}

// Fix relative URLs
function fixUrl(u) {
    if (!u) return "";
    if (u.startsWith("http")) return u;
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("/")) return baseUrl + u;
    return baseUrl + "/" + u;
}

async function getHome(cb) { cb({ success: true, data: {} }); }

async function search(query, cb) {
    try {
        const html = await httpFetch(baseUrl + "/?search=" + encodeURIComponent(query));
        const items = [];
        const blocks = matchAll(html, /class="item"[^>]*>([\s\S]*?)<\/div>/gi);
        for (const block of blocks) {
            const name = (block[1].match(/class="name"[^>]*>([^<]*)/i) || [])[1] || '';
            const href = (block[1].match(/href="([^"]+)"/) || [])[1] || '';
            const poster = (block[1].match(/data-original="([^"]+)"/) || [])[1] || (block[1].match(/src="([^"]+)"/) || [])[1] || '';
            if (name && href) items.push(new MultimediaItem({ title: name.trim(), url: fixUrl(href), posterUrl: poster, type: "anime" }));
        }
        cb({ success: true, data: items });
    } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
}

async function load(url, cb) { cb({ success: false, errorCode: "BLOCKED", message: "Blocked by Cloudflare" }); }

async function loadStreams(url, cb) {
    try {
        const html = await httpFetch(url);
        const streams = [];
        const btns = matchAll(html, /id="download"[^>]*>[\s\S]*?<a[^>]*class="btn"[^>]*href="([^"]+)"/i);
        for (const btn of btns) {
            const q = (btn[0].match(/(\d+)/) || [])[0] || '0';
            if (btn[1]) streams.push(new StreamResult({ url: btn[1], quality: q + "p" }));
        }
        const servers = matchAll(html, /data-src="([^"]+)"/g);
        const visited = new Set();
        async function tryExt(u) {
            if (!u || visited.has(u)) return;
            visited.add(u);
            try { if (typeof loadExtractor !== 'undefined') { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } } catch (e) {}
        }
        await Promise.all(servers.map(m => tryExt(m[1])));
        cb({ success: true, data: streams });
    } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
}

globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
