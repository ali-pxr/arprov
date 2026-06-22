(function() {
    const BASE = manifest.baseUrl;

    function fixUrl(u: string): string {
        if (!u) return "";
        if (u.startsWith("http")) return u;
        if (u.startsWith("//")) return "https:" + u;
        if (u.startsWith("/")) return BASE + u;
        return BASE + "/" + u;
    }

    function getPoster(el: any): string {
        const img = el.querySelector("img");
        if (!img) return "";
        return (img.getAttribute("data-image") ||
                img.getAttribute("data-src") ||
                img.getAttribute("data-lazy-src") ||
                img.getAttribute("src") || "").trim();
    }

    function toSearchResult(el: any): any {
        const a = el.tagName === "A" ? el : el.querySelector("a");
        if (!a) return null;
        const href = fixUrl(a.getAttribute("href"));
        if (!href || href === BASE || href === BASE + "/") return null;

        let title = "";
        const boxTitle = el.querySelector(".BoxTitle, .Title");
        if (boxTitle) title = boxTitle.textContent.trim();
        if (!title || title.toLowerCase() === "cima4u") title = a.getAttribute("title")?.trim() || "";
        if (!title || title.toLowerCase() === "cima4u") {
            const img = el.querySelector("img");
            title = img ? (img.getAttribute("alt")?.trim() || "") : "";
        }
        if (!title || title.toLowerCase() === "cima4u") return null;

        const poster = getPoster(el);
        const isSeries = !!el.querySelector("ul.Episodes, ul.insert_ep, div.Episodes") ||
            href.includes("-الحلقة-") || href.includes("مسلسل");

        return new MultimediaItem({
            title, url: href, posterUrl: poster,
            type: isSeries ? "series" : "movie"
        });
    }

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "جديد السينما": "/#new-cinema",
            "أفلام أجنبي": "/category/افلام-اجنبي/",
            "أفلام أسيوي": "/category/افلام-اسيوي/",
            "أفلام أنمي": "/category/افلام-انمي/",
            "مسلسلات أنمي": "/category/مسلسلات-انمي/",
            "مسلسلات أجنبي": "/category/مسلسلات-اجنبي/",
            "مسلسلات أسيوية": "/category/مسلسلات-اسيوية/"
        };
        const data: Record<string, any[]> = {};

        for (const [name, path] of Object.entries(categories)) {
            try {
                const url = path.includes("#new-cinema") ? BASE : BASE + path;
                const html = await fetch(url).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("li.MovieBlock, a[href*='مشاهدة-']"))
                    .map(toSearchResult).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) { console.error("Cima4U getHome error:", e); }
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const url = `${BASE}/?s=${encodeURIComponent(query)}`;
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll("li.MovieBlock, a[href*='مشاهدة-']"))
                .map(toSearchResult).filter(Boolean)
                .reduce((acc, item) => { if (!acc.find(i => i.url === item.url)) acc.push(item); return acc; }, [] as any[]);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    function extractEpNum(text: string): number | null {
        const m = text.match(/(?:الحلقة|episode|ep)\s*[:\-]?\s*(\d{1,4})/i);
        return m ? parseInt(m[1]) : null;
    }
    function extractSeasonNum(text: string): number | null {
        const m = text.match(/(?:الموسم|season|s)\s*[:\-]?\s*(\d{1,2})/i);
        return m ? parseInt(m[1]) : null;
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");

            let rawTitle = (doc.querySelector(".SingleContent h1, h1.Title, .PageTitle h1, .Title")?.textContent || "").trim()
                || doc.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim()
                || doc.title || "Unknown Title";
            const title = rawTitle.replace(/مشاهدة|تحميل|فيلم|مسلسل|انمي|مترجم|مدبلج|كامل|اون لاين/g, "")
                .replace(/ - Cima4u/gi, "").replace(/Cima4u/gi, "").trim() || "Unknown Title";

            const posterEl = doc.querySelector(".SinglePoster img, .Thumb img, figure img");
            let posterUrl = "";
            if (posterEl) {
                posterUrl = posterEl.getAttribute("data-image") || posterEl.getAttribute("data-src")
                    || posterEl.getAttribute("src") || "";
            }

            const plot = doc.querySelector(".Story, .story, div[class*='story'], p")?.textContent?.trim() || "";
            const yearMatch = doc.body?.textContent?.match(/(19|20)\d{2}/);
            const year = yearMatch ? parseInt(yearMatch[0]) : undefined;

            const episodeEls = doc.querySelectorAll("#related a, div#related a");
            const isSeries = episodeEls.length > 0 ||
                !!doc.querySelector("ul.insert_ep, ul.Episodes, div.Episodes") ||
                url.includes("مسلسل");

            if (isSeries) {
                const episodes = Array.from(episodeEls).map(el => {
                    const href = fixUrl(el.getAttribute("href"));
                    if (!href) return null;
                    const text = el.textContent || "";
                    const epNum = extractEpNum(text) || extractEpNum(href);
                    const season = extractSeasonNum(text) || extractSeasonNum(href) || 1;
                    const epPoster = el.querySelector("img")?.getAttribute("data-src") || posterUrl;
                    return new Episode({
                        name: epNum ? `الحلقة ${epNum}` : "حلقة",
                        url: href, episode: epNum || 1, season, posterUrl: epPoster
                    });
                }).filter(Boolean).sort((a: any, b: any) => (a.season - b.season) || (a.episode - b.episode));

                cb({ success: true, data: new MultimediaItem({
                    title, url, posterUrl, type: "series", plot, year, episodes
                })});
            } else {
                cb({ success: true, data: new MultimediaItem({
                    title, url, posterUrl, type: "movie", plot, year
                })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        const watchUrl = url.endsWith("/watch/") ? url :
            url.endsWith("/watch") ? url + "/" :
            url.endsWith("/") ? url + "watch/" : url + "/watch/";

        try {
            const html = await fetch(watchUrl).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            const visited = new Set<string>();

            async function tryExtract(embedUrl: string) {
                if (!embedUrl.startsWith("http") || visited.has(embedUrl)) return;
                visited.add(embedUrl);
                try {
                    const results = await loadExtractor(embedUrl);
                    if (results && results.length) streams.push(...results);
                } catch (e) {}
            }

            for (const iframe of doc.querySelectorAll("iframe[src]")) {
                await tryExtract(iframe.getAttribute("src"));
            }
            for (const li of doc.querySelectorAll(".serversWatchSide li")) {
                const u = li.getAttribute("data-url") || li.getAttribute("url") || li.getAttribute("data-src") || "";
                if (u) await tryExtract(u);
            }
            for (const a of doc.querySelectorAll(".DownloadServers a, a.DownloadLink")) {
                const href = a.getAttribute("href") || "";
                if (href && !href.includes("midgerelativelyhoax")) await tryExtract(href);
            }

            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
