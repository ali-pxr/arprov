const PLUGIN_ID = 'movizlands';
const baseUrl = typeof manifest !== 'undefined' ? manifest.baseUrl : 'https://movizland.cyou';
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
    const cats = {"أفلام": "/category/movies/", "مسلسلات": "/category/series/"};
    const data = {};
    for (const [name, path] of Object.entries(cats)) {
        try {
            const html = await httpFetch(baseUrl + path);
            const items = [];
            const articles = matchAll(html, /<article[^>]*>([\s\S]*?)<\/article>/gi);
            if (articles.length === 0) {
                // Fallback: try post-item / entry patterns
                const posts = matchAll(html, /<div[^>]*class="[^"]*(?:post-item|entry|movie-item|BlockItem)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>)?/gi);
                for (const post of posts) {
                    const href = (post[1].match(/href="([^"]+)"/) || [])[1] || '';
                    if (!href || href === baseUrl) continue;
                    let title = (post[1].match(/entry-title[^>]*>(?:<a[^>]+>)?([^<]+)/i) || [])[1] || (post[1].match(/alt="([^"]+)"/) || [])[1] || '';
                    title = title.trim();
                    if (!title) continue;
                    const poster = (post[1].match(/data-(?:src|image)="([^"]+)"/) || [])[1] || (post[1].match(/src="([^"]+?(?:poster|thumb|cover)[^"]*)"/i) || [])[1] || '';
                    const isSeries = href.includes('مسلسل') || href.includes('series') || href.includes('anime') || false;
                    items.push({ title, url: fixUrl(href), posterUrl: poster, type: isSeries ? "series" : "movie" });
                }
            } else {
                for (const article of articles) {
                    const href = (article[1].match(/href="([^"]+)"/) || [])[1] || '';
                    if (!href || href === baseUrl) continue;
                    let title = (article[1].match(/entry-title[^>]*>(?:<a[^>]+>)?([^<]+)/i) || [])[1] || (article[1].match(/alt="([^"]+)"/) || [])[1] || '';
                    title = title.trim();
                    if (!title) continue;
                    const poster = (article[1].match(/data-(?:src|image)="([^"]+)"/) || [])[1] || (article[1].match(/src="([^"]+)"/) || [])[1] || '';
                    const isSeries = href.includes('مسلسل') || href.includes('series') || true;
                    items.push({ title, url: fixUrl(href), posterUrl: poster, type: isSeries ? "series" : "movie" });
                }
            }
            if (items.length) data[name] = items;
        } catch (e) {}
    }
    cb({ success: true, data });
}

async function search(query, cb) {
    try {
        const html = await httpFetch(baseUrl + "/?s=" + encodeURIComponent(query));
        const items = [];
        const posts = matchAll(html, /<article[^>]*>([\s\S]*?)<\/article>/gi);
        const src = posts.length > 0 ? posts : matchAll(html, /<div[^>]*class="[^"]*(?:post-item|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>)?/gi);
        for (const post of src) {
            const href = (post[1].match(/href="([^"]+)"/) || [])[1] || '';
            if (!href) continue;
            let title = (post[1].match(/entry-title[^>]*>(?:<a[^>]+>)?([^<]+)/i) || [])[1] || (post[1].match(/alt="([^"]+)"/) || [])[1] || '';
            title = title.trim();
            if (!title) continue;
            const poster = (post[1].match(/data-(?:src|image)="([^"]+)"/) || [])[1] || (post[1].match(/src="([^"]+)"/) || [])[1] || '';
            items.push({ title, url: fixUrl(href), posterUrl: poster, type: "movie" });
        }
        cb({ success: true, data: items });
    } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
}

async function load(url, cb) {
    try {
        const html = await httpFetch(url);
        let title = (html.match(/<h1[^>]*>([^<]*)/i) || [])[1] || (html.match(/property="og:title"\s+content="([^"]+)"/) || [])[1] || "Unknown";
        title = title.replace(/مشاهدة|تحميل|فيلم|مسلسل|انمي|مترجم|مدبلج|كامل|اون لاين/gi, '').trim() || "Unknown";
        const posterUrl = (html.match(/data-(?:src|image)="([^"]+)"/) || [])[1] || (html.match(/property="og:image"\s+content="([^"]+)"/) || [])[1] || '';
        const plot = (html.match(/class="[^"]*(?:story|desc|content|entry-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
        const yearMatch = html.match(/(19|20)\d{2}/);
        const year = yearMatch ? parseInt(yearMatch[0]) : undefined;
        const isSeries = html.includes('episodes-list') || html.includes('Episodes') || html.includes('insert_ep') || url.includes('مسلسل') || true;

        if (isSeries) {
            const episodes = [];
            const epLinks = matchAll(html, /href="([^"]*(?:episode|الحلقة|حلقة)[^"]*)"/gi);
            const seen = new Set();
            for (const ep of epLinks) {
                if (seen.has(ep[1])) continue;
                seen.add(ep[1]);
                const text = ep[0].replace(/<[^>]+>/g, ' ');
                const epNum = (text.match(/(?:الحلقة|episode|ep)\s*[:\-]?\s*(\d{1,4})/i) || ep[1].match(/(\d{1,4})/) || [])[1];
                episodes.push({ name: epNum ? "الحلقة " + epNum : "حلقة", url: fixUrl(ep[1]), episode: epNum ? parseInt(epNum) : episodes.length + 1, season: 1 });
            }
            cb({ success: true, data: { title, url, posterUrl, type: "series", plot: plot.replace(/<[^>]+>/g, '').trim(), year, episodes } });
        } else {
            cb({ success: true, data: { title, url, posterUrl, type: "movie", plot: plot.replace(/<[^>]+>/g, '').trim(), year } });
        }
    } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
}

async function loadStreams(url, cb) {
    try {
        const html = await httpFetch(url);
        const streams = [];
        const visited = new Set();
        async function tryExt(u) {
            if (!u || !u.startsWith("http") || visited.has(u)) return;
            visited.add(u);
            try { if (typeof loadExtractor !== 'undefined') { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } } catch (e) {}
        }
        const iframes = matchAll(html, /<iframe[^>]+src="([^"]+)"/gi);
        await Promise.all(iframes.map(m => tryExt(m[1])));
        const dataSrcs = matchAll(html, /data-(?:url|src)="([^"]+)"/gi);
        await Promise.all(dataSrcs.map(m => tryExt(m[1])));
        cb({ success: true, data: streams });
    } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
}

globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
