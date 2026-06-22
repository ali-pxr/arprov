(function() {
    const BASE = manifest.baseUrl;
    const HEADERS = { "Referer": BASE + "/" };
    function cleanTitle(t: string): string { return t.replace(/مشاهدة|فيلم|مترجم|مسلسل|اون لاين|كامل|جميع الحلقات|الموسم|الحلقة|انمي|تحميل/g, "").replace(/\(\\d+\)/g, "").replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim(); }
    async function getHome(cb: (r: any) => void) {
        const cats: Record<string, string> = { "الأحدث": "", "مسلسلات رمضان 2026": "70137", "أفلام أجنبية": "1207", "أفلام عربية": "20349", "أفلام أنمي": "1895", "مسلسلات أجنبية": "4", "مسلسلات عربية": "17979", "مسلسلات أنمي": "38", "مسلسلات كورية": "59186" };
        const data: Record<string, any[]> = {};
        for (const [name, catId] of Object.entries(cats)) {
            try {
                const url = catId ? `${BASE}/wp-json/wp/v2/posts?categories=${catId}&per_page=10&_embed` : `${BASE}/wp-json/wp/v2/posts?per_page=10&_embed`;
                const json = await (await fetch(url)).json();
                const items = (json || []).map((p: any) => {
                    const title = cleanTitle(p.title?.rendered?.replace(/&#8211;/g, "-").replace(/&#038;/g, "&").replace(/&#8217;/g, "'") || "");
                    const poster = p._embedded?.wpfeaturedmedia?.[0]?.source_url || "";
                    const href = p.link; if (!href) return null;
                    const isSeries = (p.categories || []).some((c: number) => [70137, 4, 17979].includes(c));
                    return new MultimediaItem({ title, url: href, posterUrl: poster, type: isSeries ? "series" : "movie" });
                }).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }
    async function search(query: string, cb: (r: any) => void) {
        try {
            const json = await (await fetch(`${BASE}/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=10&_embed`)).json();
            const items = (json || []).map((p: any) => {
                const title = cleanTitle(p.title?.rendered || "");
                return new MultimediaItem({ title, url: p.link, posterUrl: p._embedded?.wpfeaturedmedia?.[0]?.source_url || "", type: "movie" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }
    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url, { headers: HEADERS }).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = cleanTitle(doc.querySelector("h1.title, .movie-title, .PostTitle, h1")?.textContent || "");
            const posterUrl = doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "";
            const synopsis = doc.querySelector(".description, .plot, .StoryArea, .Story")?.textContent?.trim() || "";
            const year = doc.querySelector(".year, .release-year, a[href*='/release-year/']")?.textContent?.match(/\d+/)?.map(Number)[0];
            const tags = Array.from(doc.querySelectorAll(".genre a, .categories a")).map(a => a.textContent?.trim()).filter(Boolean);
            const hasEps = !!doc.querySelector(".allepcont, .EpisodesList, .list-episodes");
            if (hasEps) {
                const episodes: any[] = [];
                doc.querySelectorAll(".allepcont .row a, .EpisodesList .row a").forEach((el: any) => {
                    const epUrl = el.getAttribute("href"); if (!epUrl) return;
                    const epTitle = (el.querySelector(".ep-info h2")?.textContent || el.textContent).trim();
                    const epNum = el.querySelector(".epnum")?.textContent?.match(/\d+/)?.map(Number)[0];
                    episodes.push(new Episode({ name: epNum ? `الحلقة ${epNum}` : epTitle, url: epUrl, episode: epNum, season: 1, posterUrl: el.querySelector("img")?.getAttribute("data-src") || posterUrl }));
                });
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "series", plot: synopsis, year, tags, episodes })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", plot: synopsis, year, tags })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }
    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const watchUrl = url.replace(/\/?$/, "/watch/");
            const html = await fetch(watchUrl, { headers: { ...HEADERS, Referer: url } }).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = []; const visited = new Set<string>();
            async function tryExt(u: string) { if (u && !visited.has(u)) { visited.add(u); try { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } catch {} } }
            const iframe = doc.querySelector("div.WatchIframe iframe, .player-embed iframe");
            if (iframe) tryExt(iframe.getAttribute("src"));
            doc.querySelectorAll("ul#watch > li, .servers-list li, [data-watch]").forEach((li: any) => {
                const u = li.getAttribute("data-watch") || li.querySelector("noscript iframe, iframe")?.getAttribute("src") || "";
                if (u && u !== url && u !== watchUrl) tryExt(u);
            });
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
