(function() {
    const BASE = manifest.baseUrl;
    function fixUrl(u: string): string { if (u.startsWith("http")) return u; if (u.startsWith("//")) return "https:" + u; return BASE + u; }
    function cleanTitle(t: string): string { return t.replace(/مشاهدة|مترجم|مسلسل|فيلم|كامل|جميع الحلقات|الموسم|الحلقة|انمي/g, "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim(); }
    function isTv(u: string): boolean { return u.includes("/series/") || u.includes("/seasons/") || u.includes("/episodes/"); }
    function isMovieUrl(u: string): boolean { return u.includes("/movies/"); }
    function ensureWatchUrl(u: string): string { return u.includes("/watch/") ? u : u.replace(/\/?$/, "/watch/"); }

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "المضاف حديثاً": "/recent-89541/", "أحدث الأفلام": "/movies-list/", "أحدث المسلسلات": "/series-list/"
        };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(categories)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll(".data .title, .title, a[href]")).slice(0, 20).map((el: any) => {
                    const a = el.closest("a") || el;
                    const href = fixUrl(a.getAttribute("href"));
                    const title = cleanTitle(el.querySelector(".data .title, .title")?.textContent || a.getAttribute("title") || a.textContent?.trim() || "");
                    if (!title) return null;
                    const img = el.querySelector(".poster img, img");
                    const poster = img?.getAttribute("data-src") || img?.getAttribute("src") || "";
                    const type = isMovieUrl(href) ? "movie" : "series";
                    return new MultimediaItem({ title, url: href, posterUrl: poster, type });
                }).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll("a[href]")).slice(0, 20).map((a: any) => {
                const href = fixUrl(a.getAttribute("href"));
                const title = cleanTitle(a.querySelector(".data .title, .title")?.textContent || a.getAttribute("title") || a.textContent?.trim() || "");
                if (!title) return null;
                const img = a.querySelector(".poster img, img");
                return new MultimediaItem({ title, url: href, posterUrl: img?.getAttribute("data-src") || img?.getAttribute("src") || "", type: isMovieUrl(href) ? "movie" : "series" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = cleanTitle(doc.querySelector("h1, .single-title, .page-title")?.textContent || doc.title || "");
            const img = doc.querySelector(".single-poster img, .poster img, img");
            const poster = img?.getAttribute("data-src") || img?.getAttribute("src") || "";
            const desc = doc.querySelector(".story, .entry-content, .single-content")?.textContent?.trim() || "";
            const type = isTv(url) ? "series" : "movie";
            const isSeries = type === "series";

            if (isSeries) {
                const episodes: any[] = [];
                const epEls = doc.querySelectorAll(".episodes-list a, .server-episode-item a, a[href*='/episodes/']");
                epEls.forEach((el: any) => {
                    const href = fixUrl(el.getAttribute("href"));
                    const epTitle = el.querySelector(".episode-title, .name, h3")?.textContent || el.textContent?.trim() || "";
                    const epNum = epTitle.match(/\d+/)?.map(Number)[0];
                    episodes.push(new Episode({ name: epTitle || `الحلقة ${epNum}`, url: href, episode: epNum || 1, season: 1 }));
                });
                if (!episodes.length) episodes.push(new Episode({ name: title, url, episode: 1, season: 1 }));
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "series", plot: desc, episodes })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "movie", plot: desc })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const watchUrl = ensureWatchUrl(url);
            const html = await fetch(watchUrl, { headers: { Referer: url } }).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            const visited = new Set<string>();

            for (const li of doc.querySelectorAll(".servers-list li, #watch li, [data-link]")) {
                const u = li.getAttribute("data-link") || li.getAttribute("data-source") || li.getAttribute("data-url") || "";
                if (u && !visited.has(u)) { visited.add(u); try { const r = await loadExtractor(fixUrl(u)); if (r?.length) streams.push(...r); } catch {} }
            }
            for (const iframe of doc.querySelectorAll("iframe")) {
                const src = iframe.getAttribute("src");
                if (src && !visited.has(src)) { visited.add(src); try { const r = await loadExtractor(fixUrl(src)); if (r?.length) streams.push(...r); } catch {} }
            }
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
