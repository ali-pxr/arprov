(function() {
    const BASE = manifest.baseUrl;
    async function getHome(cb: (r: any) => void) {
        const data: Record<string, any[]> = {};
        try {
            const epHtml = await fetch(`${BASE}/episode/`).then(r => r.text());
            const epDoc = new DOMParser().parseFromString(epHtml, "text/html");
            data["أخر الحلقات المضافة"] = Array.from(epDoc.querySelectorAll("div.anime-card-container")).map(el => {
                const hover = el.querySelector("div.hover"); if (!hover) return null;
                const a = hover.querySelector("a"); if (!a) return null;
                const img = hover.querySelector("img");
                const title = img?.getAttribute("alt") || ""; if (!title) return null;
                let url = a.getAttribute("href").replace(/-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-.*$/, "").replace("episode", "anime");
                return new MultimediaItem({ title, url, posterUrl: img?.getAttribute("data-image") || img?.getAttribute("data-original") || img?.getAttribute("data-src") || img?.getAttribute("src") || "", type: "anime" });
            }).filter(Boolean);
        } catch (e) {}
        cb({ success: true, data });
    }
    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/?search_param=animes&s=${encodeURIComponent(query)}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll("div.row.display-flex > div")).map(el => {
                const hover = el.querySelector("div.hover"); if (!hover) return null;
                const a = hover.querySelector("a"); if (!a) return null;
                const img = hover.querySelector("img");
                const title = img?.getAttribute("alt") || ""; if (!title) return null;
                return new MultimediaItem({ title, url: a.getAttribute("href").replace(/-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-.*$/, "").replace("episode", "anime"), posterUrl: img?.getAttribute("data-image") || img?.getAttribute("data-src") || img?.getAttribute("src") || "", type: "anime" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }
    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = doc.querySelector("h1.anime-details-title")?.textContent || "";
            const poster = doc.querySelector("div.anime-thumbnail img")?.getAttribute("src") || "";
            const description = doc.querySelector("p.anime-story")?.textContent || "";
            const episodes = Array.from(doc.querySelectorAll("#episodesList .themexblock")).map(el => {
                const a = el.querySelector(".pinned-card > a"); if (!a) return null;
                const epUrl = a.getAttribute("href"); if (!epUrl) return null;
                const style = a.getAttribute("style") || "";
                const epPoster = style.match(/url\(["'])(.*?)\)/)?.[2] || "";
                const info = el.querySelector(".pinned-card .info");
                const epName = info?.querySelector("h3")?.textContent || "Episode";
                const epNum = info?.querySelector(".badge.light-soft span")?.textContent?.match(/\d+/)?.map(Number)[0];
                return new Episode({ name: epName, url: epUrl, episode: epNum, posterUrl: epPoster });
            }).filter(Boolean);
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "anime", plot: description, episodes })});
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }
    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = []; const visited = new Set<string>();
            for (const li of doc.querySelectorAll("ul#episode-servers li[data-watch]")) {
                const link = li.getAttribute("data-watch"); if (link && !visited.has(link)) { visited.add(link); try { const r = await loadExtractor(link); if (r?.length) streams.push(...r); } catch {} }
            }
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
