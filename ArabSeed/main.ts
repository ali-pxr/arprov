(function() {
    const BASE = manifest.baseUrl;

    function fixUrl(u: string): string {
        if (!u) return "";
        if (u.startsWith("http")) return u;
        if (u.startsWith("//")) return "https:" + u;
        return BASE + u;
    }

    function cleanTitle(t: string): string {
        return t.replace(/[()]/g, "").replace(/مشاهدة|تحميل|فيلم|مسلسل|مترجم|اون لاين/g, "").trim();
    }

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "Ramadan Series 2026": "/category/مسلسلات-رمضان/ramadan-series-2026/",
            "Foreign Movies": "/category/foreign-movies-10/",
            "Arabic Movies": "/category/arabic-movies-10/",
            "Netflix Movies": "/category/netfilx/افلات-netfilx/",
            "Asian Movies": "/category/asian-movies/",
            "Turkish Movies": "/category/turkish-movies/",
            "Foreign Series": "/category/foreign-series-3/",
            "Arabic Series": "/category/arabic-series-8/",
            "Netflix Series": "/category/netfilx/مسلسلات-netfilx-1/",
            "Turkish Series": "/category/turkish-series-2/",
            "Korean Series": "/category/مسلسلات-كوريه/",
            "Cartoon": "/category/cartoon-series/",
        };
        const data: Record<string, any[]> = {};

        for (const [name, path] of Object.entries(categories)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("a.movie__block")).map(el => {
                    const title = el.getAttribute("title") || el.querySelector("h3")?.textContent || "";
                    if (!title) return null;
                    const href = el.getAttribute("href");
                    const poster = el.querySelector("img.images__loader")?.getAttribute("data-src")
                        || el.querySelector("img.images__loader")?.getAttribute("src") || "";
                    const tvType = (href?.includes("/series/") || title.includes("مسلسل")) ? "series" : "movie";
                    return new MultimediaItem({ title: cleanTitle(title), url: fixUrl(href), posterUrl: poster, type: tvType });
                }).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) { console.error("ArabSeed getHome error:", e); }
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const items: any[] = [];
            for (const type of ["series", "movies"]) {
                const formData = new URLSearchParams();
                formData.append("search", query);
                formData.append("type", type);
                const resp = await fetch(`${BASE}/wp-content/themes/Elshaikh2021/Ajaxat/SearchingTwo.php`, {
                    method: "POST", headers: { Referer: BASE }, body: formData
                });
                const html = await resp.text();
                const doc = new DOMParser().parseFromString(html, "text/html");
                for (const el of doc.querySelectorAll("a.movie__block")) {
                    const title = el.getAttribute("title") || el.querySelector("h3")?.textContent || "";
                    if (!title) continue;
                    const href = el.getAttribute("href");
                    const poster = el.querySelector("img.images__loader")?.getAttribute("data-src")
                        || el.querySelector("img.images__loader")?.getAttribute("src") || "";
                    items.push(new MultimediaItem({
                        title: cleanTitle(title), url: fixUrl(href), posterUrl: poster, type: "movie"
                    }));
                }
            }
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");

            const title = doc.querySelector(".post__name")?.textContent?.trim() || doc.querySelector("h1")?.textContent?.trim() || "";
            const epEls = doc.querySelectorAll(".episodes__list a, .seasons__list a");
            const isMovie = epEls.length === 0;

            const posterUrl = doc.querySelector(".images__loader img")?.getAttribute("data-src")
                || doc.querySelector(".poster__single img")?.getAttribute("src")
                || doc.querySelector("img[data-src]")?.getAttribute("data-src") || "";

            const synopsis = doc.querySelector(".single__contents")?.textContent?.replace("قصة العرض :", "").replace("قصة العرض", "").trim() || "";
            const year = doc.querySelector("a[href*='/release-year/']")?.textContent?.match(/\d+/)?.map(Number)[0];
            const tags = Array.from(doc.querySelectorAll("a[href*='/genre/']")).map(a => a.textContent?.trim()).filter(Boolean);

            if (isMovie) {
                cb({ success: true, data: new MultimediaItem({
                    title, url, posterUrl, type: "movie", plot: synopsis, year, tags
                })});
            } else {
                const episodes = Array.from(epEls).map(el => {
                    const epUrl = el.getAttribute("href");
                    const epName = el.textContent?.trim() || "";
                    const epNum = el.querySelector("b")?.textContent?.match(/\d+/)?.map(Number)[0]
                        || epName.match(/\d+/)?.map(Number)[0];
                    return new Episode({ name: epName, url: epUrl, episode: epNum, season: 1 });
                }).filter(ep => ep.url).sort((a: any, b: any) => (a.episode || 0) - (b.episode || 0));

                cb({ success: true, data: new MultimediaItem({
                    title, url, posterUrl, type: "series", plot: synopsis, year, tags, episodes
                })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const watchHref = doc.querySelector(".watch__btn")?.getAttribute("href") || "";
            const watchDoc = watchHref && watchHref !== url
                ? new DOMParser().parseFromString(await (await fetch(watchHref, { headers: { Referer: url } })).text(), "text/html")
                : doc;
            const streams: any[] = [];
            const visited = new Set<string>();

            async function tryExtract(embedUrl: string, name: string) {
                if (!embedUrl || visited.has(embedUrl)) return;
                visited.add(embedUrl);
                try {
                    const results = await loadExtractor(embedUrl);
                    if (results && results.length) streams.push(...results);
                } catch (e) {}
            }

            for (const li of watchDoc.querySelectorAll(".servers__list li")) {
                let link = li.getAttribute("data-link") || "";
                const name = li.textContent?.trim() || "";
                if (link.includes("url=") || link.includes("id=")) {
                    try {
                        const encoded = link.includes("url=") ? link.split("url=")[1] : link.split("id=")[1];
                        const decoded = atob(encoded);
                        if (decoded) link = decoded;
                    } catch (e) {}
                }
                if (link) await tryExtract(link, name);
            }
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
