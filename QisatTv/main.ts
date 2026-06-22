(function() {
    const BASE = manifest.baseUrl;

    function extractPoster(el: any): string {
        const style = el.querySelector("[style*=background-image]")?.getAttribute("style") || "";
        const m = style.match(/url\(['"]?(.*?)['"]?\)/);
        if (m) return m[1];
        const img = el.querySelector("img");
        return img?.getAttribute("data-src") || img?.getAttribute("src") || "";
    }

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = { "أحدث الحلقات": "/yeni-bolumler/", "المسلسلات التركية": "/diziler/", "افلام تركية": "/category/filmler/" };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(categories)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("div.post-card a, a[href*='-episode-'], a[href*='/series/'], a[href*='/movie/']")).map(el => {
                    const a = el.tagName === "A" ? el : el;
                    const href = a.getAttribute("href"); if (!href) return null;
                    const title = el.querySelector(".title, h3")?.textContent?.trim() || a.getAttribute("title")?.trim() || "";
                    if (!title) return null;
                    const poster = extractPoster(el);
                    const year = title.match(/\d{4}/)?.map(Number)[0];
                    const type = href.includes("/movie") || href.includes("/film") ? "movie" : "series";
                    return new MultimediaItem({ title, url: BASE + (href.startsWith("/") ? "" : "/") + href, posterUrl: poster, type, year });
                }).filter(Boolean).reduce((acc: any[], item) => { if (!acc.find(i => i.url === item.url)) acc.push(item); return acc; }, []);
                if (items.length) data[name] = items;
            } catch (e) {}
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/?s=${encodeURIComponent(query)}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll("div.block-post")).map(el => {
                const a = el.querySelector("a"); if (!a) return null;
                const href = a.getAttribute("href"); if (!href) return null;
                const title = el.querySelector(".title, h3")?.textContent?.trim() || a.getAttribute("title")?.trim() || "";
                if (!title) return null;
                const type = href.includes("/movie") || href.includes("/film") ? "movie" : "series";
                return new MultimediaItem({ title, url: BASE + (href.startsWith("/") ? "" : "/") + href, posterUrl: extractPoster(el), type });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            let html = await fetch(url).then(r => r.text());
            let doc = new DOMParser().parseFromString(html, "text/html");
            const seriesLink = doc.querySelector("div.singleSeries .info h2 a")?.getAttribute("href");
            if (seriesLink && !url.includes("/series/")) {
                html = await fetch(BASE + (seriesLink.startsWith("/") ? "" : "/") + seriesLink).then(r => r.text());
                doc = new DOMParser().parseFromString(html, "text/html");
            }
            const title = (doc.querySelector("h1.title")?.textContent?.trim() || doc.title.split(" - ")[0]).trim();
            const poster = extractPoster(doc.querySelector("div.cover"));
            const plot = doc.querySelector("div.story p")?.textContent?.trim() || "";
            const year = title.match(/\d{4}/)?.map(Number)[0];
            const isSeries = !!doc.querySelector("article.postEp, div.postEp, a.ep-item") || url.includes("/series/");
            if (isSeries) {
                const episodes = Array.from(doc.querySelectorAll("article.postEp a, div.postEp a, a.ep-item")).map(el => {
                    const epUrl = el.getAttribute("href"); if (!epUrl) return null;
                    const epName = el.querySelector(".title")?.textContent?.trim() || el.getAttribute("title")?.trim() || "";
                    const epNum = el.querySelector(".episodeNum span:last-child")?.textContent?.match(/\d+/)?.map(Number)[0]
                        || epName.match(/(?:الحلقة|episode|ep)\s*(\d+)/i)?.map(Number)[0];
                    return new Episode({ name: epNum ? `الحلقة ${epNum}` : epName, url: epUrl, episode: epNum, season: 1, posterUrl: extractPoster(el) });
                }).filter(Boolean);
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "series", plot, year, episodes })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "movie", plot, year })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            const visited = new Set<string>();
            const iframe = doc.querySelector("div.getEmbed iframe, iframe[src*='embed'], iframe[src*='video']");
            if (iframe) { const src = iframe.getAttribute("src"); if (src && !src.includes("facebook")) { visited.add(src); try { const r = await loadExtractor(src); if (r?.length) streams.push(...r); } catch {} } }
            for (const li of doc.querySelectorAll("ul.serversList li")) {
                const codeLink = li.querySelector("code a")?.getAttribute("href");
                if (codeLink) { streams.push(new StreamResult({ url: codeLink })); visited.add(codeLink); }
            }
            const playerUrl = doc.querySelector("iframe[src*='qesen.net/watch'], iframe[src*='qesset.com/watch'], a.watch-btn, a.fullscreen-clickable")?.getAttribute("href");
            if (playerUrl && !visited.has(playerUrl)) {
                try {
                    const pHtml = await fetch(playerUrl).then(r => r.text());
                    const pDoc = new DOMParser().parseFromString(pHtml, "text/html");
                    const pIframe = pDoc.querySelector("div.getEmbed iframe");
                    if (pIframe) { const src = pIframe.getAttribute("src"); if (src) { try { const r = await loadExtractor(src); if (r?.length) streams.push(...r); } catch {} } }
                } catch {}
            }
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
