const PLUGIN_ID = 'akwam';
const baseUrl = typeof manifest !== 'undefined' ? manifest.baseUrl : 'https://akwam.co';
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

async function getHome(page, cb) {
    const cats = { "أفلام": "/movies?page=1", "مسلسلات": "/series?page=1" };
    const data = {};
    for (const [name, path] of Object.entries(cats)) {
        try {
            const html = await httpFetch(baseUrl + path);
            const items = [];
            const blocks = matchAll(html, /<div[^>]*class="[^"]*entry-box[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi);
            for (const block of blocks) {
                const aMatch = block[1].match(/class="[^"]*box[^"]*"[^>]+href="([^"]+)"/);
                if (!aMatch) continue;
                const href = aMatch[1];
                if (href.includes("/games/")) continue;
                const alt = (block[1].match(/alt="([^"]+)"/) || [])[1] || '';
                const poster = (block[1].match(/data-src="([^"]+)"/) || [])[1] || '';
                const yearM = block[1].match(/badge-secondary[^>]*>(\d{4})/);
                const isSeries = href.includes("/series/") || href.includes("/episode/");
                items.push({ title: alt, url: fixUrl(href), posterUrl: poster, type: isSeries ? "series" : "movie", year: yearM ? parseInt(yearM[1]) : undefined });
            }
            if (items.length) data[name] = items;
        } catch (e) {}
    }
    cb({ success: true, data });
}

async function search(query, cb) {
    try {
        const html = await httpFetch(baseUrl + "/search?q=" + encodeURIComponent(query));
        const items = [];
        const blocks = matchAll(html, /<div[^>]*class="[^"]*entry-box[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi);
        for (const block of blocks) {
            const aMatch = block[1].match(/class="[^"]*box[^"]*"[^>]+href="([^"]+)"/);
            if (!aMatch) continue;
            const href = aMatch[1];
            if (href.includes("/games/")) continue;
            const alt = (block[1].match(/alt="([^"]+)"/) || [])[1] || '';
            const poster = (block[1].match(/data-src="([^"]+)"/) || [])[1] || '';
            items.push({ title: alt, url: fixUrl(href), posterUrl: poster, type: "movie" });
        }
        cb({ success: true, data: items });
    } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
}

async function load(url, cb) {
    try {
        const html = await httpFetch(url);
        const title = (html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]*)/i) || [])[1] || '';
        const posterUrl = (html.match(/<picture[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/) || [])[1] || '';
        const isMovie = html.includes('"tab-content quality"');
        const synopsis = (html.match(/widget-body[^>]*><p[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '';
        
        if (isMovie) {
            const streams = [];
            const tabs = matchAll(html, /id="(\d+)"[^>]*class="[^"]*tab-content[^"]*quality[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
            const qMap = {2:"360p", 3:"480p", 4:"720p", 5:"1080p"};
            for (const tab of tabs) {
                const quality = qMap[tab[1]] || "Unknown";
                const links = matchAll(tab[2], /href="([^"]+)">[\s\S]*?تحميل/gi);
                for (const link of links) {
                    try {
                        const linkHtml = await httpFetch(link[1]);
                        const videoUrl = (linkHtml.match(/btn-loader[^>]*><a[^>]+href="([^"]+)"/) || [])[1];
                        if (videoUrl) streams.push({ url: videoUrl, quality, headers: { Referer: baseUrl } });
                    } catch (e) {}
                }
            }
            cb({ success: true, data: { title, url, posterUrl, type: "movie", plot: synopsis.replace(/<[^>]+>/g, '').trim() } });
        } else {
            const episodes = [];
            const epBlocks = matchAll(html, /text-white[^>]+href="([^"]+)"[^>]*>([^<]*)/gi);
            for (const ep of epBlocks) {
                const epNum = (ep[2].match(/\d+/) || [])[0];
                episodes.push({ name: ep[2].trim(), url: ep[1], episode: epNum ? parseInt(epNum) : episodes.length + 1, season: 1 });
            }
            cb({ success: true, data: { title, url, posterUrl, type: "series", plot: synopsis.replace(/<[^>]+>/g, '').trim(), episodes } });
        }
    } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
}

async function loadStreams(url, cb) {
    try {
        const html = await httpFetch(url);
        const streams = [];
        const qMap = {2:"360p", 3:"480p", 4:"720p", 5:"1080p"};
        const tabs = matchAll(html, /id="(\d+)"[^>]*class="[^"]*tab-content[^"]*quality[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
        for (const tab of tabs) {
            const quality = qMap[tab[1]] || "Unknown";
            const links = matchAll(tab[2], /href="([^"]+)">[\s\S]*?تحميل/gi);
            for (const link of links) {
                try {
                    const linkHtml = await httpFetch(link[1]);
                    const videoUrl = (linkHtml.match(/btn-loader[^>]*><a[^>]+href="([^"]+)"/) || [])[1];
                    if (videoUrl) streams.push({ url: videoUrl, quality, headers: { Referer: baseUrl } });
                } catch (e) {}
            }
        }
        cb({ success: true, data: streams });
    } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
}

globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
