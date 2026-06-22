(function() {
    const BASE = manifest.baseUrl; const HEADERS = { "Accept-Language": "ar,en-US;q=0.7,en;q=0.3", "Referer": BASE };
    async function getHome(cb: (r: any) => void) {
        const cats = { "جديد سيما فور يو": "/", "أفلام جديدة": "/movies/", "آخر الحلقات": "/episodes/", "مسلسلات جديدة": "/series/" };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(cats)) {
            try {
                const html = await fetch(BASE + path, { headers: HEADERS }).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll(".GridItem")).map(el => {
                    const a = el.querySelector("a"); if (!a) return null;
                    const title = a.querySelector("strong")?.textContent?.trim() || a.getAttribute("title")?.trim() || ""; if (!title) return null;
                    const poster = el.querySelector("img")?.getAttribute("data-src") || el.querySelector("img")?.getAttribute("src") || "";
                    return new MultimediaItem({ title, url: a.getAttribute("href"), posterUrl: poster, type: "movie" });
                }).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }
    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/?s=${encodeURIComponent(query)}`, { headers: HEADERS }).then(r => r.text());
            const items = Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll(".GridItem")).map(el => {
                const a = el.querySelector("a"); if (!a) return null;
                const title = a.querySelector("strong")?.textContent?.trim() || ""; if (!title) return null;
                return new MultimediaItem({ title, url: a.getAttribute("href"), posterUrl: el.querySelector("img")?.getAttribute("data-src") || "", type: "movie" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }
    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url, { headers: HEADERS }).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = doc.querySelector("h1")?.textContent?.trim() || "";
            const isSeries = !!doc.querySelector("a[href*=/series/], div.seasons, .EpisodesList") || url.includes("مسلسل");
            const posterUrl = doc.querySelector("img[data-src], img[src]")?.getAttribute("data-src") || doc.querySelector("img[data-src]")?.getAttribute("src") || "";
            const year = doc.querySelector("a[href*=release-year]")?.textContent?.match(/\d+/)?.map(Number)[0];
            const synopsis = doc.querySelector("div.story p")?.textContent?.trim() || "";
            const genres = Array.from(doc.querySelectorAll("a[href*=/genre/]")).map(a => a.textContent?.trim()).filter(Boolean);
            if (isSeries) {
                const episodes: any[] = [];
                doc.querySelectorAll(".EpisodesList a, div.episodes-list a, a:has(span.episode)").forEach((el: any) => {
                    const href = el.getAttribute("href"); if (!href) return;
                    const epName = el.querySelector("strong")?.textContent || el.textContent?.trim();
                    const epNum = el.querySelector("span.episode, span:contains(حلقة)")?.textContent?.match(/\d+/)?.map(Number)[0];
                    episodes.push(new Episode({ name: epName || `الحلقة ${epNum}`, url: href, episode: epNum }));
                });
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "series", year, plot: synopsis, tags: genres, episodes })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", year, plot: synopsis, tags: genres })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }
    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url, { headers: HEADERS }).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = []; const visited = new Set<string>();
            async function tryExt(u: string) { if (u && !visited.has(u)) { visited.add(u); try { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } catch {} } }
            doc.querySelectorAll(".WatchServersList li[data-id]").forEach(async (li: any) => {
                const id = li.getAttribute("data-id"); if (!id) return;
                try {
                    const r = await fetch(`${BASE}/wp-admin/admin-ajax.php?action=get_player&server=${id}`, { headers: HEADERS });
                    const rDoc = new DOMParser().parseFromString(await r.text(), "text/html");
                    const src = rDoc.querySelector("iframe")?.getAttribute("src"); if (src) tryExt(src);
                } catch {}
            });
            doc.querySelectorAll("iframe[src]").forEach((i: any) => tryExt(i.getAttribute("src")));
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
