
const PLUGIN_ID = 'mycima';
function log(msg, data) { try { console.log(`[${PLUGIN_ID}] ${msg}`, data || ''); } catch (_) {} }

const baseUrl = typeof manifest !== 'undefined' ? manifest.baseUrl : 'https://mycima.fun';
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

import * as cheerio from 'cheerio';

async function getHome(cb) {
    const data = {};
    try {
        const html = await httpFetch(baseUrl + "/category/افلام/");
        const $ = cheerio.load(html);
        const items = [];
        $(".post-item, .entry").each((i, el) => {
            const a = $(el).find("a").first();
            if (!a.length) return;
            const href = a.attr("href") || "";
            if (!href || href === baseUrl || href === baseUrl + "/") return;
            const title = $(el).find(".entry-title a, a").first().text().trim() || a.attr("title") || a.text().trim();
            if (!title) return;
            const poster = $(el).find("img").first().attr("data-src") || $(el).find("img").first().attr("data-image") || $(el).find("img").first().attr("src") || "";
            const type = href.includes("مسلسل") ? "series" : "movie";
            items.push(new MultimediaItem({ title, url: href.startsWith("http") ? href : baseUrl + href, posterUrl: poster, type }));
        });
        if (items.length) data["أفلام"] = items;
    } catch (e) { log("getHome error", e); }
    try {
        const html = await httpFetch(baseUrl + "/category/مسلسلات/");
        const $ = cheerio.load(html);
        const items = [];
        $(".post-item, .entry").each((i, el) => {
            const a = $(el).find("a").first();
            if (!a.length) return;
            const href = a.attr("href") || "";
            if (!href || href === baseUrl || href === baseUrl + "/") return;
            const title = $(el).find(".entry-title a, a").first().text().trim() || a.attr("title") || a.text().trim();
            if (!title) return;
            const poster = $(el).find("img").first().attr("data-src") || $(el).find("img").first().attr("data-image") || $(el).find("img").first().attr("src") || "";
            const type = href.includes("مسلسل") ? "series" : "movie";
            items.push(new MultimediaItem({ title, url: href.startsWith("http") ? href : baseUrl + href, posterUrl: poster, type }));
        });
        if (items.length) data["مسلسلات"] = items;
    } catch (e) { log("getHome error", e); }

    cb({ success: true, data });
}

async function search(query, cb) {
    try {
        const html = await httpFetch(`{baseUrl}/?s={{QUERY}}`.replace("{QUERY}", encodeURIComponent(query)));
        const $ = cheerio.load(html);
        const items = [];
        $(".post-item, .entry").each((i, el) => {
            const a = $(el).find("a").first();
            if (!a.length) return;
            const href = a.attr("href") || "";
            if (!href) return;
            const title = $(el).find(".entry-title, a").first().text().trim() || a.attr("title") || a.text().trim();
            if (!title) return;
            const poster = $(el).find("img").first().attr("data-src") || $(el).find("img").first().attr("src") || "";
            items.push(new MultimediaItem({ title, url: href.startsWith("http") ? href : baseUrl + href, posterUrl: poster, type: "movie" }));
        });
        cb({ success: true, data: items });
    } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
}

async function load(url, cb) {
    try {
        const html = await httpFetch(url);
        const $ = cheerio.load(html);
        const title = $("h1, .entry-title").first().text().trim() || $("title").text() || "Unknown";
        const posterUrl = $("img").first().attr("data-src") || $("img").first().attr("data-image") || $("img").first().attr("src") || "";
        const plot = $(".entry-content p").first().text().trim() || "";
        const yearMatch = $("body").text().match(/(19|20)\d{2}/);
        const year = yearMatch ? parseInt(yearMatch[0]) : undefined;
        const isSeries = $("ul.Episodes, ul.insert_ep, div.Episodes, .episodes-list a, a[href*='episode']").length > 0;
        const episodes = [];
        $(".episodes-list a, a[href*='episode']").each((i, el) => {
            const a = $(el).find("a").first();
            if (!a.length) return;
            const href = a.attr("href") || "";
            if (!href) return;
            const name = $(el).find("a").first().text().trim() || a.text().trim();
            const epNum = name.match(/(\d+)/)?.map(Number)[0] || episodes.length + 1;
            episodes.push(new Episode({ name, url: href.startsWith("http") ? href : baseUrl + href, episode: epNum, season: 1 }));
        });
        if (isSeries && episodes?.length > 0) {
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "series", plot, year, episodes }) });
        } else {
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", plot, year }) });
        }
    } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
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
        $("iframe[src], .servers-list li").each((i, el) => tryExt($(el).attr("src")));
        $("iframe[src], .servers-list li").each((i, el) => tryExt($(el).attr("data-src")));
        $(".servers-list li").each((i, el) => {
            const u = $(el).attr("data-url") || $(el).attr("data-src") || $(el).attr("href") || "";
            if (u) tryExt(u);
        });
        cb({ success: true, data: streams });
    } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
}

globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
