(function() {
    const BASE = manifest.baseUrl;
    const HEADERS = { "Accept-Language": "ar-SA,ar;q=0.9,en;q=0.8", "Referer": BASE };

    function cleanTitle(t: string): string {
        return t.replace(/الحلقة\s*\d+/g, "").replace(/الموسم\s*\d+/g, "").replace(/الحلقة\s*\d+\s*مترجمة/g, "")
            .replace(/الحلقة\s*\d+\s*مدبلجة/g, "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
    }
    function detectType(cat: string, url: string, title: string): string {
        if (cat.includes("انمي") || title.includes("انمي") || url.includes("anime")) return "anime";
        if (url.includes("/series/") || title.includes("مسلسل") || title.includes("الحلقة")) return "series";
        return "movie";
    }

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "الرئيسية": "/", "أحدث الأفلام": "/movies/", "أحدث المسلسلات": "/series/"
        };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(categories)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll(".Small--Box, .small--box, .MovieItem")).map(el => {
                    const a = el.querySelector("a"); if (!a) return null;
                    const href = a.getAttribute("href"); if (!href) return null;
                    const rawTitle = el.querySelector("h2, .inner--title h2, .title")?.textContent || ""; if (!rawTitle) return null;
                    const title = cleanTitle(rawTitle);
                    const cat = el.querySelector(".category, .cat")?.textContent || "";
                    const type = detectType(cat, href, rawTitle);
                    const img = el.querySelector("img");
                    const poster = img ? (img.getAttribute("data-src") || img.getAttribute("src")) : "";
                    return new MultimediaItem({ title, url: href, posterUrl: poster, type });
                }).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/search?s=${encodeURIComponent(query.replace(" ", "+"))}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll(".Small--Box, .MovieItem")).map(el => {
                const a = el.querySelector("a"); if (!a) return null;
                const title = cleanTitle(el.querySelector("h2, .inner--title h2, .title")?.textContent || "");
                if (!title) return null;
                const img = el.querySelector("img");
                return new MultimediaItem({ title, url: a.getAttribute("href"), posterUrl: img?.getAttribute("data-src") || img?.getAttribute("src") || "", type: "movie" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url, { headers: HEADERS }).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const rawTitle = doc.querySelector("h1, .TitleArea h1, .PageTitle")?.textContent || "";
            const title = cleanTitle(rawTitle);
            const cat = doc.querySelector(".category, .cat")?.textContent || "";
            const type = detectType(cat, url, rawTitle);
            const img = doc.querySelector(".Poster img, .image img, .Thumb img, .SingleContent img, .PostThumb img");
            const poster = img ? (img.getAttribute("data-src") || img.getAttribute("src")) : "";
            const description = doc.querySelector(".Story, .StoryArea, .description, .PostContent, .SinglePost p")?.textContent?.trim() || "";

            const epContainer = doc.querySelector(".allepcont, .Episodes--Seasons--Episodes");
            if (epContainer) {
                const episodes = Array.from(epContainer.querySelectorAll("a")).map(epA => {
                    const href = epA.getAttribute("href"); if (!href) return null;
                    const epTitle = epA.textContent?.trim() || "";
                    const epNum = epTitle.match(/الحلقة\s*(\d+)/)?.map(Number)[0];
                    return new Episode({ name: epTitle || `الحلقة ${epNum}`, url: href, episode: epNum || 1, season: 1 });
                }).filter(Boolean).reverse();
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type, plot: description, episodes })});
            } else if (type === "series" || url.includes("episode") || rawTitle.includes("الحلقة")) {
                const epNum = rawTitle.match(/الحلقة\s*(\d+)/)?.map(Number)[0];
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type, plot: description, episodes: [new Episode({ name: rawTitle, url, episode: epNum })] })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "movie", plot: description })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url, { headers: HEADERS }).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            const visited = new Set<string>();
            const KNOWN_HOSTS = ["peytonepre", "iplayerhls", "mxdrop", "filemoon", "mixdrop", "vudeo", "uqload", "streamtape", "dood", "fembed", "govad", "voe"];

            async function tryExtract(u: string, name: string) {
                const fixed = u.startsWith("http") ? u : BASE + u;
                if (!fixed || visited.has(fixed)) return; visited.add(fixed);
                const isKnown = KNOWN_HOSTS.some(h => fixed.toLowerCase().includes(h));
                if (isKnown) {
                    try { const r = await loadExtractor(fixed); if (r?.length) streams.push(...r); } catch {}
                } else {
                    try {
                        const rHtml = await fetch(fixed, { headers: { Referer: url } }).then(r => r.text());
                        const m3u8 = rHtml.match(/(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>]*)/i);
                        if (m3u8) streams.push(new StreamResult({ url: m3u8[1], quality: "Unknown" }));
                        else { const r = await loadExtractor(fixed); if (r?.length) streams.push(...r); }
                    } catch {}
                }
            }

            let watchDoc = doc;
            const watchBtn = doc.querySelector("a.watch, a:contains(مشاهدة وتحميل), .watch-btn");
            if (watchBtn) {
                const wHref = watchBtn.getAttribute("href");
                if (wHref) { const r = await fetch(wHref, { headers: { Referer: url } }); watchDoc = new DOMParser().parseFromString(await r.text(), "text/html"); }
            }

            for (const li of watchDoc.querySelectorAll("#watch li, .ServersList li")) {
                const u = li.getAttribute("data-watch") || li.getAttribute("data-source") || li.getAttribute("data-url") || "";
                if (u) await tryExtract(u, li.textContent?.trim() || "Server");
            }
            for (const a of watchDoc.querySelectorAll(".DownloadArea a[href], .download-area a[href]")) {
                const href = a.getAttribute("href");
                if (href && href.startsWith("http")) await tryExtract(href, "Download");
            }
            for (const iframe of watchDoc.querySelectorAll("iframe")) {
                if (iframe.getAttribute("src")) await tryExtract(iframe.getAttribute("src"), "Iframe");
            }
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
