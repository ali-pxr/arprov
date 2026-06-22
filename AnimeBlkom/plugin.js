
const PLUGIN_ID = 'animeblkom';
function log(msg, data) { try { console.log(`[${PLUGIN_ID}] ${msg}`, data || ''); } catch (_) {} }

const baseUrl = typeof manifest !== 'undefined' ? manifest.baseUrl : 'https://animeblkom.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

async function httpFetch(url, extraHeaders = {}) {
    const h = { 'User-Agent': UA, ...extraHeaders };
    if (typeof http_get !== 'undefined') {
        let r;
        try { r = await http_get(url, h); } catch (e) { r = { status: 403, body: 'cloudflare' }; }
        if (r.status === 403 || r.status === 503 || (typeof r.body === 'string' && r.body.includes('Just a moment'))) {
            if (typeof solveCaptcha !== 'undefined') {
                await solveCaptcha('cloudflare', url);
                try { r = await http_get(url, h); } catch (e) { r = { status: 500, body: '' }; }
            }
        }
        return r.body || '';
    }
    return '';
}

import cheerio from 'cheerio';

async function getHome(cb) { cb({ success: true, data: {} }); }

async function search(query, cb) {
    try {
        const html = await httpFetch(`${baseUrl}/?search=${encodeURIComponent(query)}`);
        const $ = cheerio.load(html);
        const items = [];
        $(".content .item").each((i, el) => {
            const name = $(el).find(".name").first().text().trim();
            const a = $(el).find("a").first();
            const href = a.attr("href") || "";
            const poster = $(el).find("img").first().attr("data-original") || $(el).find("img").first().attr("src") || "";
            if (name && href) items.push(new MultimediaItem({ title: name, url: href, posterUrl: poster, type: "anime" }));
        });
        cb({ success: true, data: items });
    } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
}

async function load(url, cb) {
    cb({ success: false, errorCode: "BLOCKED", message: "This source is blocked by Cloudflare." });
}

async function loadStreams(url, cb) {
    try {
        const html = await httpFetch(url);
        const $ = cheerio.load(html);
        const streams = [];
        const visited = new Set();
        async function tryExt(u) {
            if (!u || !u.startsWith("http") || visited.has(u)) return;
            visited.add(u);
            try { if (typeof loadExtractor !== 'undefined') { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } } catch (e) {}
        }
        $("#download a.btn").each((i, el) => {
            const link = $(el).attr("href") || "";
            const q = ($(el).text().match(/\d+/) || [0])[0];
            if (link) streams.push(new StreamResult({ url: link, quality: q ? q + "p" : "unknown" }));
        });
        $(".servers a[data-src]").each((i, el) => tryExt($(el).attr("data-src")));
        cb({ success: true, data: streams });
    } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
}

globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
