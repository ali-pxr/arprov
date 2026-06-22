
const PLUGIN_ID = 'akwam';
function log(msg, data) { try { console.log(`[${PLUGIN_ID}] ${msg}`, data || ''); } catch (_) {} }

const baseUrl = typeof manifest !== 'undefined' ? manifest.baseUrl : 'https://akwam.co';
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

function fixUrl(u) {
    if (!u) return "";
    if (u.startsWith("http")) return u;
    if (u.startsWith("//")) return "https:" + u;
    return baseUrl + u;
}

async function getHome(cb) {
    const categories = { "أفلام": "/movies?page=1", "مسلسلات": "/series?page=1", "برامج": "/shows?page=1" };
    const data = {};
    for (const [name, path] of Object.entries(categories)) {
        try {
            const html = await httpFetch(baseUrl + path);
            const $ = cheerio.load(html);
            const items = [];
            $("div.entry-box").each((i, el) => {
                const a = $(el).find("a.box").first();
                if (!a.length) return;
                const href = a.attr("href");
                if (!href || href.includes("/games/") || href.includes("/programs/")) return;
                const img = $(el).find("picture > img").first();
                const title = img.attr("alt") || "";
                const poster = img.attr("data-src") || "";
                const yearMatch = $(el).find(".badge-secondary").first().text().match(/\d+/);
                const year = yearMatch ? parseInt(yearMatch[0]) : undefined;
                const isSeries = href.includes("/series/") || href.includes("/episode/");
                items.push(new MultimediaItem({ title, url: fixUrl(href), posterUrl: poster, type: isSeries ? "series" : "movie", year }));
            });
            if (items.length) data[name] = items;
        } catch (e) { log("getHome error", e); }
    }
    cb({ success: true, data });
}

async function search(query, cb) {
    try {
        const html = await httpFetch(`${baseUrl}/search?q=${encodeURIComponent(query)}`);
        const $ = cheerio.load(html);
        const items = [];
        $("div.entry-box").each((i, el) => {
            const a = $(el).find("a.box").first();
            if (!a.length) return;
            const href = a.attr("href");
            if (!href || href.includes("/games/") || href.includes("/programs/")) return;
            const img = $(el).find("picture > img").first();
            items.push(new MultimediaItem({
                title: img.attr("alt") || "", url: fixUrl(href),
                posterUrl: img.attr("data-src") || "", type: "movie"
            }));
        });
        cb({ success: true, data: items });
    } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
}

async function load(url, cb) {
    try {
        const html = await httpFetch(url);
        const $ = cheerio.load(html);
        const isMovie = $("h2 > span").length > 0;
        const title = $("h1.entry-title").first().text().trim() || "";
        const posterUrl = $("picture > img").first().attr("src") || "";
        const yearEl = $("div.font-size-16.text-white.mt-2").filter((i, el) => $(el).text().includes("السنة")).first();
        const year = yearEl.text().match(/\d+/)?.map(Number)[0];
        const synopsis = $("div.widget-body p").first().text().trim() || "";

        if (isMovie) {
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", year, plot: synopsis }) });
        } else {
            const episodes = [];
            $("div.bg-primary2.p-4.col-lg-4").each((i, el) => {
                const a = $(el).find("a.text-white").first();
                if (!a.length) return;
                const epUrl = a.attr("href") || "";
                const epTitle = a.text().trim() || "";
                const epNum = epTitle.match(/\d+/)?.map(Number)[0];
                episodes.push(new Episode({ name: epTitle, url: epUrl, episode: epNum || episodes.length + 1, season: 1 }));
            });
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "series", year, plot: synopsis, episodes }) });
        }
    } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
}

async function loadStreams(url, cb) {
    try {
        const html = await httpFetch(url);
        const $ = cheerio.load(html);
        const streams = [];
        const qMap = { 2: "360p", 3: "480p", 4: "720p", 5: "1080p" };

        $("div.tab-content.quality").each((i, tab) => {
            const qId = parseInt($(tab).attr("id")) || 0;
            const quality = qMap[qId] || "Unknown";
            $(tab).find(".col-lg-6 > a").each((j, linkEl) => {
                const linkText = $(linkEl).text() || "";
                if (!linkText.includes("تحميل")) return;
                let href = $(linkEl).attr("href") || "";
                if (href && !href.includes("/download/")) {
                    const linkParts = href.split("/link");
                    if (linkParts.length > 1) {
                        const dataParts = url.split(/\/movie|\/episode|\/shows/);
                        if (dataParts.length > 1) href = baseUrl + "/download" + linkParts[1] + dataParts[1];
                    }
                }
                if (href) {
                    try {
                        const linkHtml = await httpFetch(href);
                        const $l = cheerio.load(linkHtml);
                        const videoUrl = $l("div.btn-loader > a").first().attr("href");
                        if (videoUrl) streams.push(new StreamResult({ url: videoUrl, quality, headers: { Referer: baseUrl } }));
                    } catch (e) {}
                }
            });
        });
        cb({ success: true, data: streams });
    } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
}

globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
