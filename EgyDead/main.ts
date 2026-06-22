(function() {
    const BASE = manifest.baseUrl;
    function cleanTitle(t: string): string { return t.replace(/جميع مواسم مسلسل|مترجم كامل|مشاهدة فيلم|مشاهدة عرض|مترجم|انمي|الموسم.*|مترجمة كاملة|مسلسل|كاملة|برنامج/g, "").trim(); }

    async function getHome(cb: (r: any) => void) {
        const cats = { "احدث الافلام": "/page/movies/?page=", "احدث الحلقات": "/episode/?page=", "احدث المواسم": "/season/?page=", "احدث المسلسلات": "/serie/?page=" };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(cats)) {
            try {
                const url = path.includes("/page/movies/") && false ? path + "1" : path + "1";
                const html = await fetch(BASE + url).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("li.movieItem, div.BlockItem, a[href*='egydead']")).map(el => {
                    const a = el.tagName === "A" ? el : el.querySelector("a");
                    if (!a) return null;
                    const href = a.getAttribute("href"); if (!href || !href.includes("egydead")) return null;
                    const title = cleanTitle(a.querySelector("h1, h2, h3, .BottomTitle")?.textContent || a.getAttribute("title") || "");
                    if (!title) return null;
                    const poster = a.querySelector("img")?.getAttribute("src") || "";
                    const type = href.includes("/serie/") || href.includes("/season/") || href.includes("/episode/") ? "series" : "movie";
                    return new MultimediaItem({ title, url: href, posterUrl: poster, type });
                }).filter(Boolean).reduce((a: any[], i) => { if (!a.find(x => x.url === i.url)) a.push(i); return a; }, []);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/?s=${encodeURIComponent(query)}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll("li.movieItem, div.BlockItem, a[href*='egydead']")).map(el => {
                const a = el.tagName === "A" ? el : el.querySelector("a");
                if (!a) return null;
                const href = a.getAttribute("href"); if (!href || !href.includes("egydead")) return null;
                return new MultimediaItem({ title: cleanTitle(a.querySelector("h1, h2, h3")?.textContent || a.getAttribute("title") || ""), url: href, posterUrl: a.querySelector("img")?.getAttribute("src") || "", type: "movie" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = cleanTitle(doc.querySelector("div.singleTitle em, h1.singleTitle, .breadcrumbs-single li:last-child, h1")?.textContent || "");
            const isMovie = !url.includes("/serie/") && !url.includes("/season/") && !url.includes("/episode/");
            const posterUrl = doc.querySelector("div.single-thumbnail img, div.Poster img")?.getAttribute("data-src") || doc.querySelector("div.single-thumbnail img, div.Poster img")?.getAttribute("src") || "";
            const synopsis = doc.querySelector("div.extra-content:has(:contains(القصه)) p, div.Story p")?.textContent?.trim() || "";
            const year = doc.querySelector("ul > li:contains(السنه) a, li:contains(السنة) a")?.textContent?.match(/\d+/)?.map(Number)[0];
            const tags = Array.from(doc.querySelectorAll("ul > li:contains(النوع) a, li:contains(النوع) a")).map(a => a.textContent?.trim()).filter(Boolean);

            if (isMovie) {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", plot: synopsis, year, tags })});
            } else {
                const seasonLinks = doc.querySelectorAll("div.seasons-list a");
                const episodes: any[] = [];
                if (seasonLinks.length) {
                    for (const sA of seasonLinks) {
                        const sUrl = sA.getAttribute("href"); if (!sUrl) continue;
                        const sNum = (sA.textContent?.match(/\d+/)?.map(Number)[0]) || 1;
                        const sHtml = await fetch(sUrl).then(r => r.text());
                        const sDoc = new DOMParser().parseFromString(sHtml, "text/html");
                        sDoc.querySelectorAll("div.episodes-list a").forEach((epA: any) => {
                            const epUrl = epA.getAttribute("href"); if (!epUrl) return;
                            const epNum = (epA.textContent?.match(/\d+/)?.map(Number)[0]) || 1;
                            episodes.push(new Episode({ name: `Episode ${epNum}`, url: epUrl, episode: epNum, season: sNum, posterUrl }));
                        });
                    }
                } else {
                    const seasonNum = url.match(/-s(\d+)/)?.map(Number)[0] || 1;
                    doc.querySelectorAll("div.episodes-list a").forEach((epA: any) => {
                        const epUrl = epA.getAttribute("href"); if (!epUrl) return;
                        const epNum = (epA.textContent?.match(/\d+/)?.map(Number)[0]) || 1;
                        episodes.push(new Episode({ name: `Episode ${epNum}`, url: epUrl, episode: epNum, season: seasonNum, posterUrl }));
                    });
                }
                episodes.sort((a: any, b: any) => (a.season - b.season) || (a.episode - b.episode));
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "series", plot: synopsis, year, tags, episodes })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const formData = new URLSearchParams(); formData.append("View", "1");
            const resp = await fetch(url, { method: "POST", body: formData });
            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = []; const visited = new Set<string>();
            async function tryExt(u: string) { if (u && !visited.has(u)) { visited.add(u); try { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } catch {} } }
            doc.querySelectorAll(".donwload-servers-list > li a, ul.download a").forEach((a: any) => tryExt(a.getAttribute("href")));
            doc.querySelectorAll("ul.serversList > li, div.ServersList li").forEach((li: any) => tryExt(li.getAttribute("data-link")));
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
