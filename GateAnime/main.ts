(function() {
    const BASE = manifest.baseUrl;
    async function getHome(cb: (r: any) => void) {
        const cats = { "أحدث الحلقات": "/episode/page/", "أحدث الأفلام": "/movies/page/", "أحدث المسلسلات": "/series/page/", "مدبلج": "/category/مدبلج/page/" };
        const data: Record<string, any[]> = {};
        for (const [name, path] of Object.entries(cats)) {
            try {
                const html = await fetch(BASE + path + "1").then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("ul li.TPostMv")).map(el => {
                    const a = el.querySelector("a"); if (!a) return null;
                    const title = el.querySelector("h3.Title")?.textContent || "";
                    const poster = el.querySelector("img")?.getAttribute("src") || "";
                    const year = el.querySelector("span.Year")?.textContent?.match(/\d+/)?.map(Number)[0];
                    const type = el.querySelector("span.TpTv.BgA") ? "anime" : "anime";
                    const isDub = title.includes("مدبلج") || /^[A-Za-z]+$/.test(title);
                    return new MultimediaItem({ title, url: a.getAttribute("href"), posterUrl: poster, type, year, dubStatus: isDub ? "dubbed" : "subbed" });
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
            const items = Array.from(doc.querySelectorAll("ul li.TPostMv")).map(el => {
                const a = el.querySelector("a"); if (!a) return null;
                return new MultimediaItem({ title: el.querySelector("h3.Title")?.textContent || "", url: a.getAttribute("href"), posterUrl: el.querySelector("img")?.getAttribute("src") || "", type: "anime" });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }
    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const title = doc.querySelector("h1.Title")?.textContent || "";
            const poster = doc.querySelector("div.Image img")?.getAttribute("src") || "";
            const description = doc.querySelector("p:contains(قصة)")?.textContent || "";
            const year = doc.querySelector(".Date")?.textContent?.match(/\d+/)?.map(Number)[0];
            const episodes: any[] = [];
            const seasons = doc.querySelectorAll("div.Wdgt.AABox");
            if (!seasons.length) { episodes.push(new Episode({ name: "Watch", url, posterUrl: doc.querySelector("img.TPostBg")?.getAttribute("src") || "" })); }
            else seasons.forEach((season: any) => {
                const sNum = parseInt(season.querySelector("div.Title")?.getAttribute("data-tab") || "1");
                season.querySelectorAll("tr").forEach((tr: any) => {
                    const td = tr.querySelector("td.MvTbTtl a"); if (!td) return;
                    episodes.push(new Episode({ name: td.textContent, url: td.getAttribute("href"), season: sNum, episode: tr.querySelector("span.Num")?.textContent?.match(/\d+/)?.map(Number)[0] }));
                });
            });
            cb({ success: true, data: new MultimediaItem({ title, url, posterUrl: poster, type: "anime", year, plot: description, episodes })});
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }
    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];
            const visited = new Set<string>();
            doc.querySelectorAll("li:contains(Fembed), li:contains(Dood), li:contains(Uptostream), li:contains(Uqload), li:contains(Drive)").forEach((li: any) => {
                const id = li.getAttribute("data-tplayernv"); if (!id) return;
                const div = doc.querySelector(`div#${id}`); if (!div) return;
                let src = div.innerHTML.replace(/.*src="|".*|#038;|amp;/g, "").replace(/<noscript>.*/g, "").trim();
                if (src.includes("ok.ru")) src = "https:" + src;
                if (src.includes("drive.google.com")) src = `https://gdriveplayer.to/embed2.php?link=${src}`;
                if (src && !visited.has(src)) { visited.add(src); try { const r = await loadExtractor(src); if (r?.length) streams.push(...r); } catch {} }
            });
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) }); }
    }
    globalThis.getHome = getHome; globalThis.search = search; globalThis.load = load; globalThis.loadStreams = loadStreams;
})();
