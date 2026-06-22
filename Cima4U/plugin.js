
const PLUGIN_ID = 'cima4u';
function log(msg, data) { try { console.log(`[${PLUGIN_ID}] ${msg}`, data || ''); } catch (_) {} }

const baseUrl = typeof manifest !== 'undefined' ? manifest.baseUrl : 'https://cfu.cam';
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
    if (u.startsWith("/")) return baseUrl + u;
    return baseUrl + "/" + u;
}

async function getHome(cb) {
    const categories = {
        "أفلام أجنبي": "/category/افلام-اجنبي/",
        "أفلام أسيوي": "/category/افلام-اسيوي/",
        "أفلام أنمي": "/category/افلام-انمي/",
        "مسلسلات أجنبي": "/category/مسلسلات-اجنبي/",
        "مسلسلات أسيوية": "/category/مسلسلات-اسيوية/"
    };
    const data = {};
    for (const [name, path] of Object.entries(categories)) {
        try {
            const html = await httpFetch(baseUrl + path);
            const $ = cheerio.load(html);
            const items = [];
            $("li.MovieBlock, a[href*='مشاهدة-']").each((i, el) => {
                const a = $(el).find("a").first();
                if (!a.length) return;
                const href = fixUrl(a.attr("href"));
                if (!href || href === baseUrl || href === baseUrl + "/") return;
                let title = $(el).find(".BoxTitle, .Title").first().text().trim();
                if (!title) title = a.attr("title") || "";
                if (!title) title = $(el).find("img").first().attr("alt") || "";
                if (!title) return;
                const poster = $(el).find("img").first().attr("data-image") ||
                               $(el).find("img").first().attr("data-src") ||
                               $(el).find("img").first().attr("src") || "";
                const isSeries = $(el).find("ul.Episodes, ul.insert_ep, div.Episodes").length > 0 ||
                                 href.includes("مسلسل");
                items.push(new MultimediaItem({ title, url: href, posterUrl: poster, type: isSeries ? "series" : "movie" }));
            });
            if (items.length) data[name] = items;
        } catch (e) { log("getHome error", e); }
    }
    cb({ success: true, data });
}

async function search(query, cb) {
    try {
        const html = await httpFetch(`${baseUrl}/?s=${encodeURIComponent(query)}`);
        const $ = cheerio.load(html);
        const items = [];
        const seen = new Set();
        $("li.MovieBlock, a[href*='مشاهدة-']").each((i, el) => {
            const a = $(el).find("a").first();
            const href = fixUrl(a.attr("href"));
            if (!href || seen.has(href)) return;
            seen.add(href);
            let title = $(el).find(".BoxTitle, .Title").first().text().trim() || a.attr("title") || "";
            if (!title) return;
            const poster = $(el).find("img").first().attr("data-src") || $(el).find("img").first().attr("src") || "";
            items.push(new MultimediaItem({ title, url: href, posterUrl: poster, type: "movie" }));
        });
        cb({ success: true, data: items });
    } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
}

async function load(url, cb) {
    try {
        const html = await httpFetch(url);
        const $ = cheerio.load(html);
        let title = $(".SingleContent h1, h1.Title, .PageTitle h1, .Title").first().text().trim()
            || $('meta[property="og:title"]').attr("content") || $("title").text() || "Unknown";
        title = title.replace(/مشاهدة|تحميل|فيلم|مسلسل|انمي|مترجم|مدبلج|كامل|اون لاين/gi, "").replace(/- Cima4u/gi, "").trim() || "Unknown";
        const posterUrl = $(".SinglePoster img, .Thumb img, figure img").first().attr("data-image") ||
                          $(".SinglePoster img, .Thumb img, figure img").first().attr("data-src") ||
                          $(".SinglePoster img, .Thumb img, figure img").first().attr("src") || "";
        const plot = $(".Story, .story, div[class*='story'], .wp-content p").first().text().trim() || "";
        const yearMatch = $("body").text().match(/(19|20)\d{2}/);
        const year = yearMatch ? parseInt(yearMatch[0]) : undefined;

        const epEls = $("#related a, div#related a");
        const isSeries = epEls.length > 0 || $("ul.insert_ep, ul.Episodes, div.Episodes").length > 0 || url.includes("مسلسل");

        if (isSeries) {
            const episodes = [];
            epEls.each((i, el) => {
                const href = fixUrl($(el).attr("href"));
                if (!href) return;
                const text = $(el).text() || "";
                const epM = text.match(/(?:الحلقة|episode|ep)\s*[:\-]?\s*(\d{1,4})/i) || href.match(/(?:الحلقة|episode|ep)\s*[:\-]?\s*(\d{1,4})/i);
                const sM = text.match(/(?:الموسم|season|s)\s*[:\-]?\s*(\d{1,2})/i) || href.match(/(?:الموسم|season|s)\s*[:\-]?\s*(\d{1,2})/i);
                const epNum = epM ? parseInt(epM[1]) : episodes.length + 1;
                const season = sM ? parseInt(sM[1]) : 1;
                const epPoster = $(el).find("img").first().attr("data-src") || posterUrl;
                episodes.push(new Episode({ name: `الحلقة ${epNum}`, url: href, episode: epNum, season, posterUrl: epPoster }));
            });
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "series", plot, year, episodes }) });
        } else {
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", plot, year }) });
        }
    } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
}

async function loadStreams(url, cb) {
    const watchUrl = url.replace(/\/?$/, "") + "/watch/";
    try {
        const html = await httpFetch(watchUrl);
        const $ = cheerio.load(html);
        const streams = [];
        const visited = new Set();

        async function tryExtract(embedUrl) {
            if (!embedUrl || !embedUrl.startsWith("http") || visited.has(embedUrl)) return;
            visited.add(embedUrl);
            try {
                if (typeof loadExtractor !== 'undefined') {
                    const results = await loadExtractor(embedUrl);
                    if (results && results.length) streams.push(...results);
                }
            } catch (e) {}
        }

        await Promise.all([
        ...$("iframe[src]").map((i, el) => tryExtract($(el).attr("src"))).get(),
        ...$(".serversWatchSide li").map((i, el) => {
            const u = $(el).attr("data-url") || $(el).attr("url") || $(el).attr("data-src") || "";
            return u ? tryExtract(u) : Promise.resolve();
        }).get(),
        ...$(".DownloadServers a, a.DownloadLink").map((i, el) => {
            const href = $(el).attr("href") || "";
            return (href && !href.includes("midgerelativelyhoax")) ? tryExtract(href) : Promise.resolve();
        }).get()
    ]);

        cb({ success: true, data: streams });
    } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
}

globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
