(function() {
    const BASE = manifest.baseUrl; const HEADERS = { "Accept-Language": "ar,en-US;q=0.8" };
    function extractNextData(html: string): any { const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s); return m ? JSON.parse(m[1]) : null; }
    function parseRails(node: any): any[] { return node?.props?.pageProps?.initialState?.content?.rails || []; }

    async function getHome(cb: (r: any) => void) {
        const cats = { "أفلام شاهد": "/ar/movies", "مسلسلات شاهد": "/ar/series", "أنمي": "/ar/anime" };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(cats)) {
            try {
                const html = await fetch(BASE + path, { headers: HEADERS }).then(r => r.text());
                const json = extractNextData(html); if (!json) continue;
                const items: any[] = [];
                for (const rail of parseRails(json)) {
                    for (const item of (rail?.items || [])) {
                        const title = item.title; if (!title) continue;
                        const url = item.url; if (!url) continue;
                        items.push(new MultimediaItem({ title, url, posterUrl: item.image?.path || "", type: url.includes("/series/") ? "series" : "movie" }));
                    }
                }
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }
    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/ar/search?term=${encodeURIComponent(query)}`, { headers: HEADERS }).then(r => r.text());
            const json = extractNextData(html); if (!json) return cb({ success: true, data: [] });
            const items: any[] = [];
            for (const rail of parseRails(json)) {
                for (const item of (rail?.items || [])) {
                    if (!item.title || !item.url) continue;
                    items.push(new MultimediaItem({ title: item.title, url: item.url, posterUrl: item.image?.path || "", type: "movie" }));
                }
            }
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }
    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url, { headers: HEADERS }).then(r => r.text());
            const json = extractNextData(html); if (!json) return cb({ success: false, errorCode: "NOT_FOUND" });
            const meta = json?.props?.pageProps?.initialState?.content?.metadata; if (!meta) return cb({ success: false, errorCode: "NOT_FOUND" });
            const title = meta.title || ""; const poster = meta.image?.path || ""; const plot = meta.description; const year = meta.releaseYear;
            const isSeries = url.includes("/series/");
            if (isSeries) {
                const episodes: any[] = [];
                for (const ep of (json?.props?.pageProps?.initialState?.content?.episodes || [])) {
                    if (!ep.url) continue;
                    episodes.push(new Episode({ name: ep.title || `Episode ${ep.episodeNumber}`, url: ep.url, episode: ep.episodeNumber }));
                }
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "series", plot, year, episodes })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "movie", plot, year })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }
    async function loadStreams(url: string, cb: (r: any) => void) { cb({ success: false, errorCode: "DRM_PROTECTED", message: "This content is DRM protected (Widevine) and cannot be played." }); }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
