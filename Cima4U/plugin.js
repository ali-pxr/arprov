const PLUGIN_ID = 'cima4u';
const baseUrl = typeof manifest !== 'undefined' ? manifest.baseUrl : 'https://cfu.cam';
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

async function getHome(cb) {
    const cats = {
        "أفلام أجنبي": "/category/افلام-اجنبي/",
        "أفلام أسيوي": "/category/افلام-اسيوي/",
        "أفلام أنمي": "/category/افلام-انمي/",
        "مسلسلات أجنبي": "/category/مسلسلات-اجنبي/",
        "مسلسلات أسيوية": "/category/مسلسلات-اسيوية/"
    };
    const data = {};
    for (const [name, path] of Object.entries(cats)) {
        try {
            const html = await httpFetch(baseUrl + path);
            const items = [];
            const blocks = matchAll(html, /<li[^>]*class="[^"]*MovieBlock[^"]*"[^>]*>([\s\S]*?)<\/li>/gi);
            for (const block of blocks) {
                const href = (block[1].match(/href="([^"]+)"/) || [])[1] || '';
                if (!href || href === baseUrl) continue;
                let title = (block[1].match(/class="[^"]*(?:BoxTitle|Title)[^"]*"[^>]*>([^<]*)/i) || [])[1] || '';
                if (!title) title = (block[1].match(/title="([^"]+)"/) || [])[1] || '';
                if (!title) title = (block[1].match(/alt="([^"]+)"/) || [])[1] || '';
                if (!title || title.toLowerCase() === 'cima4u') continue;
                const poster = (block[1].match(/data-(?:image|src)="([^"]+)"/) || [])[1] || (block[1].match(/src="([^"]+)"/) || [])[1] || '';
                const isSeries = block[1].includes(' Episodes') || block[1].includes('insert_ep') || href.includes('مسلسل');
                items.push(new MultimediaItem({ title: title.trim(), url: fixUrl(href), posterUrl: poster, type: isSeries ? "series" : "movie" }));
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
        const seen = new Set();
        const blocks = matchAll(html, /<li[^>]*class="[^"]*MovieBlock[^"]*"[^>]*>([\s\S]*?)<\/li>/gi);
        for (const block of blocks) {
            const href = (block[1].match(/href="([^"]+)"/) || [])[1] || '';
            if (!href || seen.has(href)) continue;
            seen.add(href);
            let title = (block[1].match(/class="[^"]*(?:BoxTitle|Title)[^"]*"[^>]*>([^<]*)/i) || [])[1] || (block[1].match(/alt="([^"]+)"/) || [])[1] || '';
            if (!title) continue;
            const poster = (block[1].match(/data-(?:image|src)="([^"]+)"/) || [])[1] || '';
            items.push(new MultimediaItem({ title: title.trim(), url: fixUrl(href), posterUrl: poster, type: "movie" }));
        }
        cb({ success: true, data: items });
    } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
}

async function load(url, cb) {
    try {
        const html = await httpFetch(url);
        let title = (html.match(/<h1[^>]*class="[^"]*(?:SingleContent|Title|PageTitle)[^"]*"[^>]*>([^<]*)/i) || [])[1] || (html.match(/property="og:title"\s+content="([^"]+)"/) || [])[1] || '';
        title = title.replace(/مشاهدة|تحميل|فيلم|مسلسل|انمي|مترجم|مدبلج|كامل|اون لاين/gi, '').trim() || "Unknown";
        const posterUrl = (html.match(/class="[^"]*(?:SinglePoster|Thumb)[^"]*"[^>]*>[\s\S]*?<img[^>]+data-(?:image|src)="([^"]+)"/) || [])[1] || (html.match(/<figure[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/) || [])[1] || '';
        const plot = (html.match(/class="[^"]*(?:Story|story)[^"]*"[^>]*>([\s\S]*?)(?:<\/div>|<\/p>)/i) || [])[1] || '';
        const yearMatch = html.match(/(19|20)\d{2}/);
        const year = yearMatch ? parseInt(yearMatch[0]) : undefined;
        const isSeries = html.includes('insert_ep') || html.includes('"Episodes"') || url.includes('مسلسل');

        if (isSeries) {
            const episodes = [];
            const epBlocks = matchAll(html, /id="related"[\s\S]*?<a[^>]+href="([^"]+)"/g);
            for (const ep of epBlocks) {
                const epUrl = fixUrl(ep[1]);
                if (!epUrl) continue;
                const text = ep[0].replace(/<[^>]+>/g, ' ');
                const epM = text.match(/(?:الحلقة|episode|ep)\s*[:\-]?\s*(\d{1,4})/i) || epUrl.match(/(?:الحلقة|episode|ep)\s*[:\-]?\s*(\d{1,4})/i);
                const sM = text.match(/(?:الموسم|season|s)\s*[:\-]?\s*(\d{1,2})/i);
                episodes.push(new Episode({ name: epM ? "الحلقة " + epM[1] : "حلقة", url: epUrl, episode: epM ? parseInt(epM[1]) : episodes.length + 1, season: sM ? parseInt(sM[1]) : 1 }));
            }
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "series", plot: plot.replace(/<[^>]+>/g, '').trim(), year, episodes }) });
        } else {
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", plot: plot.replace(/<[^>]+>/g, '').trim(), year }) });
        }
    } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
}

async function loadStreams(url, cb) {
    try {
        const watchUrl = url.replace(/\/?$/, "") + "/watch/";
        const html = await httpFetch(watchUrl);
        const streams = [];
        const visited = new Set();
        async function tryExt(u) {
            if (!u || !u.startsWith("http") || visited.has(u)) return;
            visited.add(u);
            try { if (typeof loadExtractor !== 'undefined') { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } } catch (e) {}
        }
        const iframes = matchAll(html, /<iframe[^>]+src="([^"]+)"/gi);
        await Promise.all(iframes.map(m => tryExt(m[1])));
        const servers = matchAll(html, /data-(?:url|src)="([^"]+)"/gi);
        await Promise.all(servers.map(m => tryExt(m[1])));
        const dlLinks = matchAll(html, /class="[^"]*(?:DownloadLink|DownloadServers)[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"/gi);
        await Promise.all(dlLinks.map(m => tryExt(m[1])));
        cb({ success: true, data: streams });
    } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
}

globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
