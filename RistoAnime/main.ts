(function() {
    const BASE = manifest.baseUrl;
    function extractPoster(el: any): string {
        const p = el.querySelector(".poster");
        if (p) { const s = p.getAttribute("data-style") || p.getAttribute("style"); const m = s?.match(/url\(['"]?(.*?)['"]?\)/); if (m) return m[1]; }
        const img = el.querySelector("img");
        return img?.getAttribute("data-src") || img?.getAttribute("src") || "";
    }
    async function getHome(cb: (r: any) => void) {
        const cats = { "المضاف حديثاَ": "/", "افلام انمي": "/movies/", "مواعيد الحلقات": "/time/" };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(cats)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll(".MovieItem, article, .item")).map(el => {
                    const a = el.querySelector("a[href]"); if (!a) return null;
                    const href = a.getAttribute("href"); if (!href) return null;
                    const title = (el.querySelector("h4, .title p")?.textContent || a.textContent?.trim()).trim();
                    if (title.length < 3) return null;
                    return new MultimediaItem({ title, url: href, posterUrl: extractPoster(el), type: "anime" });
                }).filter(Boolean).reduce((a: any[], i) => { if (!a.find(x => x.url === i.url)) a.push(i); return a; }, []);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }
    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/search?q=${encodeURIComponent(query.replace(" ", "+"))}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll(".MovieItem, article")).map(el => {
                const a = el.querySelector("a[href]"); if (!a) return null;
                return new MultimediaItem({ title: (el.querySelector("h4, .title p")?.textContent || "").trim(), url: a.getAttribute("href"), posterUrl: extractPoster(el), type: "anime" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }
    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url.replace(/\/watch$/, "").replace(/\/download$/, "")).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = doc.querySelector("h1.PostTitle")?.textContent?.trim() || "";
            const poster = extractPoster(doc);
            const description = doc.querySelector(".StoryArea p")?.textContent?.trim() || "";
            const tags = Array.from(doc.querySelectorAll("a[href*='/genre/']")).map(a => a.textContent?.trim()).filter(Boolean);
            const isSeries = url.includes("/series/") || !!doc.querySelector(".EpisodesList");
            if (isSeries) {
                const episodes: any[] = [];
                const epEls = doc.querySelectorAll(".EpisodesList article, .EpisodesList a");
                epEls.forEach((el: any) => {
                    const a = el.tagName === "A" ? el : el.querySelector("a"); if (!a) return;
                    const epUrl = a.getAttribute("href"); if (!epUrl) return;
                    const rawText = (el.querySelector("h3, h4, .title")?.textContent || el.textContent).trim();
                    if (rawText.includes("المشاهدة الان") || rawText.includes("التحميل الان")) return;
                    const epNum = rawText.match(/\d+/)?.map(Number)[0];
                    const thumb = el.querySelector("img")?.getAttribute("data-src") || el.querySelector("img")?.getAttribute("src") || "";
                    episodes.push(new Episode({ name: epNum ? `الحلقة ${epNum}` : rawText, url: epUrl, episode: epNum, season: 1, posterUrl: thumb }));
                });
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "anime", plot: description, tags, episodes })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "anime", plot: description, tags })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }
    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const postUrl = url.replace(/\/watch$/, "").replace(/\/download$/, "");
            const postHtml = await fetch(postUrl).then(r => r.text());
            const postDoc = new DOMParser().parseFromString(postHtml, "text/html");
            const watchUrl = postDoc.querySelector("a:contains(المشاهدة الان)")?.getAttribute("href");
            const downloadUrl = postDoc.querySelector("a:contains(التحميل الان)")?.getAttribute("href");
            const streams: any[] = []; const visited = new Set<string>();
            async function tryExt(u: string) { if (u && !visited.has(u)) { visited.add(u); try { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } catch {} } }
            for (const actionUrl of [watchUrl, downloadUrl].filter(Boolean)) {
                try {
                    const aHtml = await fetch(actionUrl).then(r => r.text());
                    const aDoc = new DOMParser().parseFromString(aHtml, "text/html");
                    aDoc.querySelectorAll("li[data-watch], button[data-watch], a[data-watch], [data-src]").forEach((el: any) => tryExt(el.getAttribute("data-watch") || el.getAttribute("data-link") || el.getAttribute("data-src")));
                    aDoc.querySelectorAll("iframe[src]").forEach((i: any) => tryExt(i.getAttribute("src")));
                    aDoc.querySelectorAll("source[src], video source").forEach((el: any) => {
                        const src = el.getAttribute("src"); if (src) streams.push(new StreamResult({ url: src, quality: src.includes(".m3u8") ? "HLS" : "Direct" }));
                    });
                } catch {}
            }
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
