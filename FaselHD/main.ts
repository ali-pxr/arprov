(function() {
    const BASE = manifest.baseUrl;

    function fixUrl(u: string): string {
        if (!u) return "";
        if (u.startsWith("http")) return u;
        if (u.startsWith("//")) return "https:" + u;
        return BASE + u;
    }

    function toSearch(el: any): any {
        let title = el.querySelector("div.h1, .h1, div.h4, h4, div.h5, h5, .entry-title, h1, h2, h3, h4, h5")?.textContent?.trim()
            || el.querySelector("img")?.getAttribute("alt")?.trim() || "";
        if (!title) return null;
        const a = el.querySelector("a");
        let href = a ? a.getAttribute("href") : null;
        if (!href) return null;
        if (href.startsWith("/")) href = BASE + href;
        const img = el.querySelector("img");
        let poster = img ? (img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src") || img.getAttribute("src") || "") : "";
        if (poster && !poster.startsWith("http")) poster = fixUrl(poster);
        if (poster && poster.includes("blank.gif")) poster = "";

        const isEp = href.includes("/episodes/") || href.includes("/episode/") || href.includes("-episodes/") || href.includes("/tvepisodes/");
        const isSer = href.includes("/series/") || href.includes("/anime/") || href.includes("/tvshows/") || href.includes("/asian-series/");
        const type = (isEp || isSer) ? "series" : "movie";
        return new MultimediaItem({ title, url: fixUrl(href), posterUrl: poster, type });
    }

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "الرئيسية": "/main", "المضاف حديثاً": "/most_recent", "أفلام": "/movies",
            "مسلسلات": "/series", "الأنمي": "/anime", "أفلام مدبلجة": "/dubbed-movies",
            "أفلام هندية": "/hindi", "أفلام آسيوية": "/asian-movies"
        };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(categories)) {
            try {
                const html = await fetch(BASE + path).then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("div.postDiv, article, .entry-box, .blockMovie, .swiper-slide"))
                    .map(toSearch).filter(Boolean);
                const unique = items.reduce((acc, item) => {
                    if (!acc.find(i => i.url === item.url)) acc.push(item);
                    return acc;
                }, [] as any[]);
                if (unique.length) data[name] = unique;
            } catch (e) { console.error("FaselHD:", e); }
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const html = await fetch(`${BASE}/?s=${encodeURIComponent(query)}`).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll("div.postDiv, article, .entry-box, .blockMovie"))
                .map(toSearch).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    const ARABIC_ORDINALS: Record<string, number> = {
        "الأول": 1, "الاول": 1, "أولى": 1, "اولى": 1, "الثاني": 2, "الثالث": 3, "التالت": 3,
        "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7, "الثامن": 8, "التاسع": 9, "العاشر": 10
    };

    function parseSeasonNum(title: string): number {
        for (const [word, num] of Object.entries(ARABIC_ORDINALS)) {
            if (title.includes(word)) return num;
        }
        const m = title.match(/(?:الموسم|موسم|season|s)\s*(\d{1,2})/i);
        return m ? parseInt(m[1]) : 1;
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");

            const title = doc.querySelector("div.title, h1.postTitle, div.h1, .entry-title, h1")?.textContent?.trim() || doc.title || "";
            const poster = doc.querySelector("meta[property=og:image]")?.getAttribute("content")
                || doc.querySelector("div.posterImg img, .entry-thumbnail img")?.getAttribute("data-src")
                || doc.querySelector("div.posterImg img, .entry-thumbnail img")?.getAttribute("src") || "";
            const desc = doc.querySelector("div.singleDesc p, div.singleDesc, .entry-content p")?.textContent?.trim() || "";
            const year = doc.querySelector("a[href*='series_year'], a[href*='movies_year']")?.textContent?.match(/\d+/)?.map(Number)[0];

            const isSeries = url.includes("/series/") || url.includes("/tvshow") || url.includes("/anime/") ||
                !!doc.querySelector("#seasonList, div.seasonLoop, .seasonDiv, #epAll, div.epAll, #DivEpisodesList");

            if (isSeries) {
                const seasonEls = doc.querySelectorAll("#seasonList a, div.seasonLoop a, .seasonDiv");
                const episodes: any[] = [];

                if (seasonEls.length > 0) {
                    for (let i = 0; i < seasonEls.length; i++) {
                        const sEl = seasonEls[i];
                        const sUrl = sEl.tagName === "A" ? sEl.getAttribute("href") : null;
                        if (!sUrl) continue;
                        const sNum = parseSeasonNum(sEl.textContent || "");
                        try {
                            const sHtml = await fetch(fixUrl(sUrl)).then(r => r.text());
                            const sDoc = new DOMParser().parseFromString(sHtml, "text/html");
                            sDoc.querySelectorAll("#epAll a, div.epAll a, #DivEpisodesList a, .episodes-list a").forEach((epA: any) => {
                                const epUrl = fixUrl(epA.getAttribute("href"));
                                const epTitle = epA.textContent?.trim() || "";
                                const epNum = epTitle.match(/\d+/)?.map(Number)[0] || 0;
                                episodes.push(new Episode({ name: epTitle, url: epUrl, episode: epNum, season: sNum }));
                            });
                        } catch (e) {}
                    }
                } else {
                    doc.querySelectorAll("#epAll a, div.epAll a, #DivEpisodesList a, .episodes-list a").forEach((epA: any) => {
                        const epUrl = fixUrl(epA.getAttribute("href"));
                        const epTitle = epA.textContent?.trim() || "";
                        const epNum = epTitle.match(/\d+/)?.map(Number)[0] || 0;
                        episodes.push(new Episode({ name: epTitle, url: epUrl, episode: epNum, season: 1 }));
                    });
                }
                episodes.sort((a: any, b: any) => (a.season - b.season) || (a.episode - b.episode));
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "series", plot: desc, year, episodes })});
            } else {
                cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "movie", plot: desc, year })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            const visited = new Set<string>();

            async function tryExtract(u: string) {
                if (!u || !u.startsWith("http") || visited.has(u)) return;
                visited.add(u);
                try { const r = await loadExtractor(u); if (r?.length) streams.push(...r); } catch {}
            }

            // Iframe
            const iframe = doc.querySelector("iframe[name=playeriframe], iframe[src*=videoplayer], iframe[data-src*=videoplayer]");
            if (iframe) {
                const src = iframe.getAttribute("abs:data-src") || iframe.getAttribute("abs:src") || "";
                if (src) await tryExtract(src);
            }

            // Tab tokens
            for (const li of doc.querySelectorAll("ul.tabs-ul li")) {
                const onclick = li.getAttribute("onclick") || "";
                const tm = onclick.match(/(?:playertoken|player_token)=([^'"]+)/i);
                if (tm) await tryExtract(`${BASE}/videoplayer?playertoken=${tm[1]}`);
            }

            // Regex fallback
            const text = html;
            const patterns = [
                /(?:src|url)\s*[=:]\s*["'](https?:\/\/[^"'\\]*(?:videoplayer|video_player)\?(?:playertoken|player_token)=[^"']+)["']/gi,
                /(https?:\/\/[^\s"'\\]*(?:videoplayer|video_player)\?(?:playertoken|player_token)=[^\s"'\\]+)/gi
            ];
            for (const pat of patterns) {
                let m;
                while ((m = pat.exec(text)) !== null) {
                    let found = m[1];
                    if (found.startsWith("//")) found = "https:" + found;
                    else if (found.startsWith("/")) found = BASE + found;
                    await tryExtract(found);
                }
            }

            // Raw scan fallback
            if (!streams.length) {
                const mediaRe = /(https?:\/\/[^\s"'\\<>]+?\.(?:m3u8|mp4)[^\s"'\\<>]*)/gi;
                let m2;
                while ((m2 = mediaRe.exec(text)) !== null) {
                    const u = m2[1];
                    if (!visited.has(u)) {
                        visited.add(u);
                        streams.push(new StreamResult({ url: u, quality: u.includes("1080") ? "1080p" : u.includes("720") ? "720p" : "Unknown" }));
                    }
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
