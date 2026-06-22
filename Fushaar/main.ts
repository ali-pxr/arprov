(function() {
    const BASE = manifest.baseUrl;

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "Movies | أفلام": "/category/افلام-اون-لاين-online-movies/",
            "Series | مسلسلات": "/category/مسلسلات-اون-لاين-online-series/"
        };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(categories)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("li.video-grid")).map(el => {
                    const a = el.querySelector("div.thumb > a"); if (!a) return null;
                    const img = a.querySelector("img"); if (!img) return null;
                    return new MultimediaItem({
                        title: img.getAttribute("alt"), url: BASE + (a.getAttribute("href")?.startsWith("/") ? "" : "/") + a.getAttribute("href"),
                        posterUrl: BASE + (img.getAttribute("data-src")?.startsWith("/") ? "" : "/") + (img.getAttribute("data-src") || img.getAttribute("src") || ""), type: "movie"
                    });
                }).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/?s=${encodeURIComponent(query.replace(" ", "+"))}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll("article.poster, li.video-grid")).map(el => {
                const a = el.querySelector("div.thumb > a"); if (!a) return null;
                const img = a.querySelector("img"); if (!img) return null;
                return new MultimediaItem({
                    title: img.getAttribute("alt"), url: BASE + (a.getAttribute("href")?.startsWith("/") ? "" : "/") + a.getAttribute("href"),
                    posterUrl: BASE + (img.getAttribute("data-src")?.startsWith("/") ? "" : "/") + (img.getAttribute("data-src") || img.getAttribute("src") || ""), type: "movie"
                });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = doc.querySelector("div.info-warpper h1")?.textContent?.trim() || doc.title || "";
            const posterUrl = doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "";
            const year = (doc.querySelector("div.date, div.year")?.textContent || title).match(/\d+/)?.map(Number)[0];
            const synopsis = doc.querySelector("div.details > p, div.description")?.textContent?.trim() || "";
            const tags = Array.from(doc.querySelectorAll("div.categories a, div.tags a")).map(a => a.textContent?.trim()).filter(Boolean);
            const watchUrl = doc.querySelector("a.video-play-button, a#play-video")?.getAttribute("href") || url;
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", year, plot: synopsis, tags })});
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            const visited = new Set<string>();

            async function tryExtract(u: string) {
                if (!u || visited.has(u)) return; visited.add(u);
                try { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } catch {}
            }

            for (const a of doc.querySelectorAll("a.video-play-button, a#play-video, div#FCplayer a")) {
                const href = a.getAttribute("href");
                if (href && href !== url) await tryExtract(href);
            }

            // Slug fallback for aflamy
            if (!streams.length && url.includes("/video-")) {
                const slug = url.substringAfterLast("/video-").split("-ar-online")[0].split("/")[0].trim();
                if (slug) await tryExtract(`https://w.aflamy.pro/albaplayer/${slug}`);
            }
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }

    String.prototype.substringAfterLast = function(s: string) { const i = this.lastIndexOf(s); return i >= 0 ? this.substring(i + s.length) : this; };
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
