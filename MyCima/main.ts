(function() {
    const BASE = manifest.baseUrl;
    function extractPoster(el: any): string {
        const style = el?.getAttribute("style") || "";
        const cssVar = style.match(/--image:\s*url\(['"]?([^')"]+)['"]?\)/);
        if (cssVar) return cssVar[1].startsWith("//") ? "https:" + cssVar[1] : cssVar[1];
        const cssUrl = style.match(/url\(['"]?([^')"]+)['"]?\)/);
        if (cssUrl) return cssUrl[1];
        const img = el?.querySelector("img[data-src], img[data-lazy-src], img[src]");
        return img?.getAttribute("data-src") || img?.getAttribute("src") || "";
    }

    async function getHome(cb: (r: any) => void) {
        const cats = { "الرئيسية": "/", "أفلام": "/movies/", "مسلسلات": "/episodes/" };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(cats)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("div.GridItem")).filter(el => !el.closest(".Slider--Grid, wecimabegin")).map(el => {
                    const a = el.querySelector("a"); if (!a) return null;
                    const title = a.querySelector("strong")?.textContent?.trim() || a.getAttribute("title")?.trim() || "";
                    if (!title) return null;
                    let href = a.getAttribute("href") || "";
                    if (href.startsWith("//")) href = "https:" + href;
                    else if (!href.startsWith("http")) href = BASE + (href.startsWith("/") ? "" : "/") + href;
                    const type = href.includes("/series/") ? "series" : "movie";
                    return new MultimediaItem({ title, url: href, posterUrl: extractPoster(el), type });
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
            const items = Array.from(doc.querySelectorAll("div.GridItem")).map(el => {
                const a = el.querySelector("a"); if (!a) return null;
                const title = a.querySelector("strong")?.textContent?.trim() || ""; if (!title) return null;
                return new MultimediaItem({ title, url: a.getAttribute("href"), posterUrl: extractPoster(el), type: "movie" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = (doc.querySelector("h1[itemprop=name], h1, h2, .Title")?.textContent || doc.querySelector("meta[property=og:title]")?.getAttribute("content") || "").trim();
            if (!title) return cb({ success: false, errorCode: "NOT_FOUND" });
            const posterUrl = extractPoster(doc.querySelector(".Img--Poster--Single-begin") || doc.querySelector(".Poster--Single-begin") || doc);
            const year = doc.querySelector("a[href*=release-year]")?.textContent?.match(/\d+/)?.map(Number)[0];
            const plot = doc.querySelector("div.story p, .AsideContext")?.textContent?.trim() || "";
            const tags = Array.from(doc.querySelectorAll("a[href*=/genre/]")).map(a => a.textContent?.trim()).filter(Boolean);
            const genres = doc.querySelector(".breadcrumb, .category")?.textContent || "";
            const isSeries = url.includes("/series/") || !!doc.querySelector(".EpisodesList, .episodes-list, .season-episodes") || genres.includes("مسلسلات") || genres.includes("انمي");

            if (isSeries) {
                const episodes: any[] = [];
                const epEls = doc.querySelectorAll(".EpisodesList a, div.episodes-list a, div.season-episodes a");
                epEls.forEach((ep: any) => {
                    let href = ep.getAttribute("href"); if (!href) return;
                    if (href.startsWith("//")) href = "https:" + href;
                    else if (!href.startsWith("http")) href = BASE + (href.startsWith("/") ? "" : "/") + href;
                    const epText = ep.textContent?.trim() || "";
                    const epNum = epText.match(/\d+/)?.map(Number)[0];
                    episodes.push(new Episode({ name: `Episode ${epNum}`, url: href, episode: epNum || 1, season: 1, posterUrl }));
                });
                episodes.sort((a: any, b: any) => (a.episode || 0) - (b.episode || 0));
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "series", year, plot, tags: genres ? tags : [], episodes })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", year, plot, tags })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = []; const visited = new Set<string>();
            async function tryExt(u: string) {
                if (!u || visited.has(u)) return; visited.add(u);
                try { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } catch {}
            }
            // Regex extraction from page
            for (const m of html.matchAll(/\/e\/(\d+)\/?/g)) tryExt(`${BASE}/e/${m[1]}/`);
            for (const m of html.matchAll(/\/play\/([A-Za-z0-9+/=_-]+)/g)) {
                try { const decoded = atob(m[1].replace(/_/g, "/").replace(/-/g, "+")); tryExt(decoded); } catch {}
            }
            // Script data-watch
            for (const script of doc.querySelectorAll("script")) {
                const sHtml = script.textContent || "";
                for (const dm of sHtml.matchAll(/data-watch\s*[=:]\s*["']([^"']+)["']/g)) tryExt(dm[1]);
                for (const dm of sHtml.matchAll(/data-id\s*[=:]\s*["']([^"']+)["']/g)) {
                    try {
                        const resp = await fetch(`${BASE}/wp-admin/admin-ajax.php`, {
                            method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" },
                            body: `action=get_player&server=${dm[1]}`
                        });
                        const rDoc = new DOMParser().parseFromString(await resp.text(), "text/html");
                        const iframe = rDoc.querySelector("iframe"); if (iframe) tryExt(iframe.getAttribute("src"));
                    } catch {}
                }
            }
            // Direct links
            doc.querySelectorAll("a[href]").forEach((a: any) => {
                const href = a.getAttribute("href") || "";
                const lower = href.toLowerCase();
                if (["hglink", "vinovo", "mxdrop", "filemoon", "govid", "dood", "uqload", "voe", "streamhg"].some(h => lower.includes(h)))
                    tryExt(href);
            });
            // Iframes
            doc.querySelectorAll("iframe[src]").forEach((i: any) => tryExt(i.getAttribute("src")));
            // Server list
            doc.querySelectorAll(".WatchServersList li, #watch li").forEach((li: any) => {
                const id = li.getAttribute("data-id"); if (id) tryExt(id);
                const w = li.getAttribute("data-watch"); if (w) tryExt(w);
            });
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
