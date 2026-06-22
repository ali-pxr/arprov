(function() {
    const BASE = manifest.baseUrl;
    function cleanTitle(t: string): string {
        return t.replace(/مشاهدة فيلم|مشاهدة وتحميل فيلم|تحميل|فيلم|انمي|مسلسل|برنامج|مدبلج للعربية|اون لاين|مترجم/g, "").trim();
    }

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "الرئيسية": "/home13/", "أضيف حديثا": "/last/",
            "مسلسلات اسيوية": "/category/مسلسلات-اسيوية/",
            "مسلسلات اجنبي": "/category/مسلسلات-اجنبي/",
            "مسلسلات انمي": "/category/مسلسلات-انمي/",
            "افلام اجنبي": "/category/افلام-اجنبي-2/",
            "افلام اسيوي": "/category/افلام-اسيوي/"
        };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(categories)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("div.Small--Box, .BlockItem")).map(el => {
                    const a = el.querySelector("a");
                    if (!a) return null;
                    const href = a.getAttribute("href") || "";
                    const title = (el.querySelector("h3, .BlockTitle")?.textContent || "").trim();
                    const img = el.querySelector("img");
                    const poster = img?.getAttribute("data-src") || img?.getAttribute("src") || "";
                    const year = (el.querySelector(".WatchTime, .InfoEndBlock li:last-child")?.textContent || "").match(/\d+/)?.map(Number)[0];
                    const type = title.includes("فيلم") ? "movie" : "series";
                    return new MultimediaItem({ title: cleanTitle(title), url: href, posterUrl: poster, type, year });
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
            const items = Array.from(doc.querySelectorAll("div.Small--Box")).map(el => {
                const a = el.querySelector("a");
                if (!a) return null;
                const title = (el.querySelector("h3, .BlockTitle")?.textContent || "").trim();
                return new MultimediaItem({ title: cleanTitle(title), url: a.getAttribute("href"), posterUrl: el.querySelector("img")?.getAttribute("data-src") || "", type: "movie" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const posterUrl = doc.querySelector(".MainSingle .image img")?.getAttribute("data-src")
                || doc.querySelector(".MainSingle .image img")?.getAttribute("src") || "";
            const title = cleanTitle(doc.querySelector("h1.PostTitle")?.textContent || "");
            const year = doc.querySelector(".RightTaxContent li:has(.fa-calendar) a")?.textContent?.match(/\d+/)?.map(Number)[0];
            const synopsis = doc.querySelector(".StoryArea")?.textContent?.trim() || "";
            const tags = Array.from(doc.querySelectorAll(".RightTaxContent li:has(.fa-bars) a")).map(a => a.textContent?.trim()).filter(Boolean);
            const isMovie = title.includes("عرض|فيلم") || !doc.querySelector(".mitatagall");

            if (isMovie) {
                const watchUrl = doc.querySelector(".BTNSDownWatch a.watch")?.getAttribute("href") || url;
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", year, plot: synopsis, tags })});
            } else {
                const episodes: any[] = [];
                const epEls = doc.querySelectorAll(".allepcont a");
                if (epEls.length) {
                    epEls.forEach((el: any) => {
                        const epUrl = el.getAttribute("href");
                        if (!epUrl) return;
                        const epNum = el.querySelector(".epnum")?.textContent?.match(/\d+/)?.map(Number)[0];
                        const epName = el.querySelector("div.ep-info h2")?.textContent || el.textContent?.trim();
                        episodes.push(new Episode({ name: epName || `Episode ${epNum}`, url: epUrl, episode: epNum, season: 1, posterUrl: el.querySelector("img")?.getAttribute("data-src") || "" }));
                    });
                }
                episodes.sort((a: any, b: any) => (a.episode || 0) - (b.episode || 0));
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "series", year, plot: synopsis, tags, episodes })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            const visited = new Set<string>();

            let watchUrl = url;
            if (!doc.querySelector("ul#watch li")) {
                const w = doc.querySelector(".BTNSDownWatch a.watch, .WatchBar a, a[href*='/watch/']");
                if (w) watchUrl = w.getAttribute("href") || url;
                else if (!url.endsWith("/watch/")) watchUrl = url.replace(/\/?$/, "/watch/");
            }

            const watchHtml = watchUrl !== url ? await (await fetch(watchUrl)).text() : html;
            const watchDoc = new DOMParser().parseFromString(watchHtml, "text/html");

            for (const li of watchDoc.querySelectorAll("ul#watch li")) {
                const serverUrl = li.getAttribute("data-watch");
                if (serverUrl && serverUrl.startsWith("http") && !visited.has(serverUrl)) {
                    visited.add(serverUrl);
                    try { const r = await loadExtractor(serverUrl); if (r?.length) streams.push(...r); } catch {}
                }
            }
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
