(function() {
    const BASE = manifest.baseUrl;
    async function getHome(cb: (r: any) => void) {
        const cats = { "المضاف حديثاً": "/recent/", "أفلام": "/category/movies/", "مسلسلات": "/category/series/", "أنمي": "/category/anime/" };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(cats)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll(".Block--Item")).map(el => {
                    const a = el.querySelector("a"); if (!a) return null;
                    const href = a.getAttribute("href"); if (!href) return null;
                    const title = el.querySelector(".Block--Info h3")?.textContent?.trim(); if (!title) return null;
                    const poster = el.querySelector(".Poster--Block img"); if (!poster) return null;
                    const type = href.includes("episode") || href.includes("series") ? "series" : "movie";
                    return new MultimediaItem({ title, url: href, posterUrl: poster.getAttribute("data-src") || poster.getAttribute("src") || "", type });
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
            const items = Array.from(doc.querySelectorAll(".Block--Item")).map(el => {
                const a = el.querySelector("a"); if (!a) return null;
                return new MultimediaItem({ title: el.querySelector(".Block--Info h3")?.textContent?.trim() || "", url: a.getAttribute("href"), posterUrl: el.querySelector(".Poster--Block img")?.getAttribute("data-src") || "", type: "movie" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }
    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = doc.querySelector("h1.post-title")?.textContent?.trim() || "";
            const posterUrl = doc.querySelector(".MainSingle .image img")?.getAttribute("data-src") || doc.querySelector(".MainSingle .image img")?.getAttribute("src") || "";
            const plot = doc.querySelector(".story p")?.textContent?.trim() || "";
            const year = doc.querySelector(".RightTaxContent a[href*='release-year']")?.textContent?.match(/\d+/)?.map(Number)[0];
            const isSeries = !!doc.querySelector(".Episodes--Box, .Episodes--List") || url.includes("series");
            if (isSeries) {
                const episodes: any[] = [];
                doc.querySelectorAll(".allepcont .row a").forEach((el: any) => {
                    const href = el.getAttribute("href"); if (!href) return;
                    const epTitle = el.querySelector(".ep-info h2")?.textContent?.trim() || el.textContent?.trim();
                    const epNum = el.querySelector(".epnum")?.textContent?.match(/\d+/)?.map(Number)[0] || epTitle.match(/\d+/)?.map(Number)[0];
                    episodes.push(new Episode({ name: epNum ? `Episode ${epNum}` : epTitle, url: href, episode: epNum, posterUrl: el.querySelector(".image img")?.getAttribute("data-src") || el.querySelector(".image img")?.getAttribute("src") || "" }));
                });
                if (!episodes.length) episodes.push(new Episode({ name: title, url, episode: title.match(/\d+/)?.map(Number)[0], posterUrl }));
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "series", plot, year, episodes: episodes.filter(e => e.url).sort((a: any, b: any) => (a.episode || 0) - (b.episode || 0)) })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl, type: "movie", plot, year })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }
    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const watchUrl = url.endsWith("/watch/") ? url : url.replace(/\/?$/, "/watch/");
            const html = await fetch(watchUrl, { headers: { Referer: BASE + "/" } }).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = []; const visited = new Set<string>();
            async function tryExt(u: string) { if (u && !visited.has(u)) { visited.add(u); try { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } catch {} } }
            doc.querySelectorAll(".watch--servers--list .server--item").forEach((li: any) => {
                const b64 = li.getAttribute("data-linkbase64");
                const link = b64 ? atob(b64) : li.getAttribute("data-link") || "";
                if (link) tryExt(link);
            });
            doc.querySelectorAll("iframe").forEach((i: any) => { const src = i.getAttribute("src"); if (src && !src.includes("ads")) tryExt(src); });
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
