(function() {
    const BASE = manifest.baseUrl;

    function fixUrl(u: string): string {
        if (!u) return "";
        if (u.startsWith("http")) return u;
        if (u.startsWith("//")) return "https:" + u;
        return BASE + u;
    }
    function decode(u: string): string { try { return decodeURIComponent(u); } catch { return u; } }
    function cleanName(t: string): string {
        return t.replace(/مشاهدة|فيلم|مسلسل|اون لاين|مترجم|مترجمة|مدبلج|مدبلجة|اونلاين|بجودة|تحميل|كامل|HD|BRRip|WEB-DL|BluRay|720p|1080p|480p|Series|Movie|Full/gi, "").replace(/\s+/g, " ").trim();
    }
    function isMovie(url: string): boolean {
        const d = decode(url);
        return (d.includes("فيلم") || d.includes("movie") || d.includes("masrahiya") || d.includes("مسرحية"))
            && !d.includes("الحلقة") && !d.includes("episode");
    }
    function getYear(title: string): number | undefined { const m = title.match(/\((\d{4})\)/); return m ? parseInt(m[1]) : undefined; }

    function toSearch(el: any): any {
        const href = el.getAttribute("href");
        if (!href) return null;
        const poster = el.querySelector("img")?.getAttribute("data-img")
            || el.querySelector("img")?.getAttribute("data-src")
            || el.querySelector("img")?.getAttribute("src") || "";
        let title = el.querySelector(".title")?.textContent || el.getAttribute("title") || "";
        title = cleanName(title);
        const year = getYear(el.querySelector(".title")?.textContent || "");
        const tvType = isMovie(decode(href)) ? "movie" : "series";
        return new MultimediaItem({ title, url: fixUrl(href), posterUrl: fixUrl(poster), type: tvType, year });
    }

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "أحدث الاضافات": "/recent",
            "أفلام": "/category/movies/",
            "مسلسلات": "/series/",
            "انمي": "/category/anime/"
        };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(categories)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll(".postBlock, .postBlockCol"))
                    .filter(el => !el.closest("#postSlider"))
                    .map(toSearch).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/?s=${encodeURIComponent(query)}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll(".postBlock")).map(toSearch).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");

            const posterEl = doc.querySelector(".postImg, .postCover, .postBlockColImg, .poster");
            const posterUrl = posterEl?.querySelector("img")?.getAttribute("data-img")
                || posterEl?.querySelector("img")?.getAttribute("data-src")
                || posterEl?.querySelector("img")?.getAttribute("src") || "";
            const title = (doc.querySelector(".postTitle h1, h1.title, h1")?.textContent || "").trim();
            const yearFromTable = Array.from(doc.querySelectorAll("table.postTable tr, table.full tr"))
                .find(tr => tr.textContent?.includes("سنة الإنتاج"))
                ?.querySelectorAll("td").item(tr.querySelectorAll("td").length - 1)?.textContent?.match(/\d+/)?.map(Number)[0];
            const year = yearFromTable || getYear(title);
            const tags = Array.from(doc.querySelectorAll("table tr"))
                .find(tr => tr.textContent?.includes("النوع"))?.querySelectorAll("a")
                .toArray().map((a: any) => a.textContent?.trim()).filter(Boolean) || [];
            const synopsis = doc.querySelector("p.description, .postStory, .story")?.textContent?.trim() || "";

            if (isMovie(url)) {
                cb({ success: true, data: new MultimediaItem({
                    title, url, posterUrl, type: "movie", year, plot: synopsis, tags
                })});
            } else {
                const episodes: any[] = [];
                const epLinks = doc.querySelectorAll(".all-episodes a, .episodes a, .season-episodes a");
                for (const epLink of epLinks) {
                    const epHref = epLink.getAttribute("href");
                    if (!epHref) continue;
                    const epText = epLink.textContent?.trim() || "";
                    const epNum = (epText.match(/(?:الحلقة|ep|episode)[\s._-]*(\d+)/i) || [])[1]?.replace(/[^\d]/g, "")?.match(/\d+/)?.map(Number)[0];
                    if (epNum) {
                        episodes.push(new Episode({
                            name: `الحلقة ${epNum}`, url: fixUrl(epHref), episode: epNum, season: 1
                        }));
                    }
                }
                episodes.sort((a: any, b: any) => (a.episode || 0) - (b.episode || 0));
                cb({ success: true, data: new MultimediaItem({
                    title, url, posterUrl, type: "series", year, plot: synopsis, tags, episodes
                })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            const visited = new Set<string>();

            const extractorUrls: string[] = [];
            for (const li of doc.querySelectorAll("ul#watch-servers-list li, .servList li")) {
                const m = (li.getAttribute("onclick") || "").match(/loadIframe\(this, '(.*?)'\)/);
                if (m) extractorUrls.push(m[1]);
            }
            for (const iframe of doc.querySelectorAll("iframe#videoPlayer")) {
                const src = iframe.getAttribute("src");
                if (src) extractorUrls.push(src);
            }

            for (const u of [...new Set(extractorUrls)]) {
                if (!visited.has(u)) {
                    visited.add(u);
                    try { const r = await loadExtractor(fixUrl(u)); if (r?.length) streams.push(...r); } catch (e) {}
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
