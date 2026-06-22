(function() {
    const BASE = manifest.baseUrl;

    function extractPoster(el: any): string {
        const style = el?.querySelector(".postImgBg")?.getAttribute("style") || "";
        const m = style.match(/url\(["']?(.*?)["']?\)/);
        if (m) return m[1];
        const img = el?.querySelector("img");
        return img?.getAttribute("data-src") || img?.getAttribute("data-image") || img?.getAttribute("src") || "";
    }

    async function getHome(cb: (r: any) => void) {
        const cats = { "جديد الموقع": "/home1", "أحدث الأفلام": "/movies.php?&page=", "أحدث المسلسلات": "/all-series.php?&page=" };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(cats)) {
            try {
                const html = await fetch(BASE + path + "1").then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("li.col-xs-6, div.content-box")).map(el => {
                    const urlEl = el.querySelector("a.fullClick, a.ellipsis, .caption h3 a"); if (!urlEl) return null;
                    const title = (urlEl.getAttribute("title") || urlEl.textContent || "").replace(/برنامج|فيلم|مترجم|اون لاين|مسلسل|مشاهدة|انمي|أنمي/g, "").trim();
                    const href = urlEl.getAttribute("href"); if (!href) return null;
                    const type = el.querySelector(".category")?.textContent?.includes("افلام") ? "movie" : "series";
                    return new MultimediaItem({ title, url: href, posterUrl: extractPoster(el), type });
                }).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const items: any[] = [];
            for (const type of ["movie", "series"]) {
                const html = await fetch(`${BASE}/?s=${encodeURIComponent(query)}&category=&type=${type}`).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                Array.from(doc.querySelectorAll("li.col-xs-6, div.content-box")).forEach(el => {
                    const urlEl = el.querySelector("a.fullClick, a.ellipsis, .caption h3 a"); if (!urlEl) return;
                    items.push(new MultimediaItem({
                        title: (urlEl.getAttribute("title") || urlEl.textContent || "").replace(/برنامج|فيلم|مترجم|اون لاين|مسلسل|مشاهدة|انمي|أنمي/g, "").trim(),
                        url: urlEl.getAttribute("href"), posterUrl: extractPoster(el), type
                    }));
                });
            }
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const isMovie = doc.querySelector("ul.breadcrumbNav")?.textContent?.includes("افلام") || false;
            const title = (doc.querySelector("h1.post-title, h1")?.textContent || "").replace(/الموسم الأول|برنامج|فيلم|مترجم|اون لاين|مسلسل|مشاهدة|انمي|أنمي/g, "").trim();
            const poster = doc.querySelector(".video-bibplayer-poster, .poster-image")?.getAttribute("style")?.match(/url\(["']?(.*?)["']?\)/)?.[1] || doc.querySelector(".poster img")?.getAttribute("src") || "";
            const year = (doc.querySelector("h1")?.textContent || "").match(/\d{4}/)?.map(Number)[0];
            const tags = Array.from(doc.querySelectorAll("dl.dl-horizontal dd a")).map(a => a.textContent?.trim()).filter(Boolean);
            const synopsis = doc.querySelector("div.description p, div.post-story p")?.textContent?.trim() || "";

            if (isMovie) {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "movie", year, plot: synopsis, tags })});
            } else {
                const episodes: any[] = [];
                const seasonTabs = doc.querySelectorAll(".Tab .tablinks");
                if (seasonTabs.length) {
                    for (const tab of seasonTabs) {
                        const sNum = (tab.textContent?.match(/\d+/)?.map(Number)[0]) || 1;
                        const tabId = (tab.getAttribute("onclick") || "").match(/'([^']+)'/)?.[1];
                        if (tabId) {
                            doc.querySelectorAll(`#${tabId} a`).forEach((epA: any) => {
                                const epUrl = epA.getAttribute("href"); if (!epUrl) return;
                                episodes.push(new Episode({ name: epA.getAttribute("title") || epA.textContent?.trim(), url: epUrl, season: sNum, episode: (epA.getAttribute("title") || epA.textContent).match(/\d+/)?.map(Number)[0] }));
                            });
                        }
                    }
                }
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "series", year, plot: synopsis, tags, episodes: episodes.filter(e => e.url).sort((a: any, b: any) => (a.episode || 0) - (b.episode || 0)) })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = []; const visited = new Set<string>();
            const allUrls = new Set<string>();
            function collectFromDoc(d: Document) {
                d.querySelectorAll("ul.list_servers li, ul.list_embedded li, .download-sec a, li[id^='server_'], a[data-embed], a[data-url]").forEach((el: any) => {
                    const embed = el.getAttribute("data-embed") || ""; if (embed) allUrls.add(embed);
                    const dUrl = el.getAttribute("data-url") || ""; if (dUrl) allUrls.add(dUrl);
                    const dLink = el.getAttribute("data-link") || ""; if (dLink) allUrls.add(dLink);
                    const href = (el.getAttribute("href") || "").replace(/^\/\//, "https://"); if (href.startsWith("http")) allUrls.add(href);
                });
                d.querySelectorAll("iframe").forEach((i: any) => { const s = i.getAttribute("src"); if (s && !s.includes("ads")) allUrls.add(s); });
            }
            collectFromDoc(doc);
            // Sub-pages
            const subUrls: string[] = [];
            const playPhp = doc.querySelector("a[href*='play.php']")?.getAttribute("href");
            if (playPhp) subUrls.push(playPhp);
            for (const a of doc.querySelectorAll("a.xtgo, a:contains(سيرفرات المشاهدة)")) { const h = a.getAttribute("href"); if (h && !h.includes("topvideos")) subUrls.push(h); }

            for (const subUrl of subUrls) {
                try {
                    const subHtml = await fetch(subUrl, { headers: { Referer: url } }).then(r => r.text());
                    collectFromDoc(new DOMParser().parseFromString(subHtml, "text/html"));
                } catch {}
            }

            const blocked = ["google.com", "mediafire.com", "mega.nz", "facebook.com", "ads"];
            for (const u of allUrls) {
                if (u.startsWith("http") && !blocked.some(b => u.includes(b)) && !visited.has(u)) {
                    visited.add(u);
                    try { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } catch {}
                }
            }
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
