(function() {
    const BASE = manifest.baseUrl;

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "أفلام": "/category/movies/", "مسلسلات": "/category/series/", "أنمي": "/category/anime/"
        };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(categories)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll(".Small--Box, .BlockItem, .GridItem")).map(el => {
                    const a = el.querySelector("a"); if (!a) return null;
                    const title = (el.querySelector("h2, h3, .title")?.textContent || "").trim();
                    if (!title) return null;
                    const img = el.querySelector("img");
                    const poster = img?.getAttribute("data-src") || img?.getAttribute("src") || "";
                    const type = path.includes("movies") ? "movie" : "series";
                    return new MultimediaItem({ title, url: a.getAttribute("href"), posterUrl: poster, type });
                }).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/?s=${encodeURIComponent(query)}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll(".Small--Box, .BlockItem")).map(el => {
                const a = el.querySelector("a"); if (!a) return null;
                const title = (el.querySelector("h2, h3, .title")?.textContent || "").trim();
                if (!title) return null;
                return new MultimediaItem({ title, url: a.getAttribute("href"), posterUrl: el.querySelector("img")?.getAttribute("data-src") || "", type: "movie" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = (doc.querySelector("h1, .PostTitle")?.textContent || "").trim();
            const poster = doc.querySelector(".image img, .poster img")?.getAttribute("data-src") || doc.querySelector(".image img")?.getAttribute("src") || "";
            const synopsis = doc.querySelector(".Story, .story")?.textContent?.trim() || "";
            const isSeries = !!doc.querySelector(".allepcont, .EpisodesList");

            if (isSeries) {
                const episodes = Array.from(doc.querySelectorAll(".allepcont a, .EpisodesList a")).map(el => {
                    const epUrl = el.getAttribute("href"); if (!epUrl) return null;
                    const epText = el.textContent?.trim() || "";
                    const epNum = epText.match(/\d+/)?.map(Number)[0];
                    return new Episode({ name: epText || `الحلقة ${epNum}`, url: epUrl, episode: epNum || 1, season: 1, posterUrl: el.querySelector("img")?.getAttribute("data-src") || "" });
                }).filter(Boolean);
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "series", plot: synopsis, episodes })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "movie", plot: synopsis })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const watchUrl = url.endsWith("/watch") ? url : url.replace(/\/?$/, "/watch");
            const html = await fetch(watchUrl).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            const visited = new Set<string>();
            for (const li of doc.querySelectorAll("#watch li, .servers-list li")) {
                const u = li.getAttribute("data-watch") || li.getAttribute("data-link") || "";
                if (u && !visited.has(u)) { visited.add(u); try { const r = await loadExtractor(u.startsWith("http") ? u : BASE + u); if (r?.length) streams.push(...r); } catch {} }
            }
            for (const iframe of doc.querySelectorAll("iframe")) {
                const src = iframe.getAttribute("src");
                if (src && !visited.has(src)) { visited.add(src); try { const r = await loadExtractor(src); if (r?.length) streams.push(...r); } catch {} }
            }
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
