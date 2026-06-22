(function() {
    const BASE = manifest.baseUrl;

    function fixUrl(u: string): string {
        if (!u) return "";
        if (u.startsWith("http")) return u;
        if (u.startsWith("//")) return "https:" + u;
        return BASE + u;
    }

    async function getHome(cb: (r: any) => void) {
        const categories: Record<string, string> = {
            "Movies": "/movies?page=",
            "Series": "/series?page=",
            "Shows": "/shows?page="
        };
        const data: Record<string, any[]> = {};

        for (const [name, path] of Object.entries(categories)) {
            try {
                const html = await fetch(BASE + path + "1").then(r => r.text());
                const doc = new DOMParser().parseFromString(html, "text/html");
                const items = Array.from(doc.querySelectorAll("div.entry-box")).map(el => {
                    const a = el.querySelector("a.box");
                    if (!a) return null;
                    const href = a.getAttribute("href");
                    if (!href || href.includes("/games/") || href.includes("/programs/")) return null;
                    const img = el.querySelector("picture > img");
                    const title = img?.getAttribute("alt") || "";
                    const poster = img?.getAttribute("data-src") || "";
                    const yearMatch = el.querySelector(".badge-secondary")?.textContent?.match(/\d+/);
                    const year = yearMatch ? parseInt(yearMatch[0]) : undefined;
                    return new MultimediaItem({ title, url: fixUrl(href), posterUrl: poster, type: "series", year });
                }).filter(Boolean);
                if (items.length) data[name] = items;
            } catch (e) { console.error("Akwam getHome error:", e); }
        }
        cb({ success: true, data });
    }

    async function search(query: string, cb: (r: any) => void) {
        try {
            const url = `${BASE}/search?q=${encodeURIComponent(query)}`;
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const items = Array.from(doc.querySelectorAll("div.entry-box")).map(el => {
                const a = el.querySelector("a.box");
                if (!a) return null;
                const href = a.getAttribute("href");
                if (!href || href.includes("/games/") || href.includes("/programs/")) return null;
                const img = el.querySelector("picture > img");
                return new MultimediaItem({
                    title: img?.getAttribute("alt") || "", url: fixUrl(href),
                    posterUrl: img?.getAttribute("data-src") || "", type: "series"
                });
            }).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "FETCH_ERROR", message: String(e) }); }
    }

    async function load(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");

            const isMovie = doc.querySelectorAll("#downloads > h2 > span").length > 0;
            const title = doc.querySelector("h1.entry-title")?.textContent?.trim() || "";
            const posterUrl = doc.querySelector("picture > img")?.getAttribute("src") || "";

            const yearEl = Array.from(doc.querySelectorAll("div.font-size-16.text-white.mt-2"))
                .find(el => el.textContent?.includes("السنة"));
            const year = yearEl?.textContent?.match(/\d+/)?.map(Number)[0];

            const durationEl = Array.from(doc.querySelectorAll("div.font-size-16.text-white.mt-2"))
                .find(el => el.textContent?.includes("مدة الفيلم"));
            const duration = durationEl?.textContent?.match(/\d+/)?.map(Number)[0];

            const synopsis = doc.querySelector("div.widget-body p:first-child")?.textContent?.trim() || "";
            const tags = Array.from(doc.querySelectorAll("div.font-size-16.d-flex.align-items-center.mt-3 > a"))
                .map(a => a.textContent?.trim()).filter(Boolean);

            if (isMovie) {
                cb({ success: true, data: new MultimediaItem({
                    title, url, posterUrl, type: "movie", year, duration, plot: synopsis, tags
                })});
            } else {
                const episodes = Array.from(doc.querySelectorAll("div.bg-primary2.p-4.col-lg-4.col-md-6.col-12")).map(el => {
                    const a = el.querySelector("a.text-white");
                    if (!a) return null;
                    const epUrl = a.getAttribute("href") || "";
                    const epTitle = a.textContent?.trim() || "";
                    const thumbUrl = el.querySelector("picture > img")?.getAttribute("src") || "";
                    const epNum = epTitle.match(/\d+/)?.map(Number)[0];
                    return new Episode({
                        name: epTitle, url: epUrl, episode: epNum, posterUrl: thumbUrl, season: 1
                    });
                }).filter(Boolean).sort((a: any, b: any) => (a.episode || 0) - (b.episode || 0));

                cb({ success: true, data: new MultimediaItem({
                    title, url, posterUrl, type: "series", year, duration, plot: synopsis, tags, episodes
                })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) }); }
    }

    function getQualityFromId(id: number | null): string {
        if (id === 2) return "360p";
        if (id === 3) return "480p";
        if (id === 4) return "720p";
        if (id === 5) return "1080p";
        return "Unknown";
    }

    async function loadStreams(url: string, cb: (r: any) => void) {
        try {
            const html = await fetch(url).then(r => r.text());
            const doc = new DOMParser().parseFromString(html, "text/html");
            const streams: any[] = [];

            for (const tab of doc.querySelectorAll("div.tab-content.quality")) {
                const quality = getQualityFromId(parseInt(tab.getAttribute("id") || "") || null);
                for (const linkEl of tab.querySelectorAll(".col-lg-6 > a")) {
                    const linkText = linkEl.textContent || "";
                    if (!linkText.includes("تحميل")) continue;
                    let href = linkEl.getAttribute("href") || "";
                    if (!href.includes("/download/")) {
                        const linkParts = href.split("/link");
                        if (linkParts.length > 1) {
                            const dataParts = url.split(/\/movie|\/episode|\/shows|\/show\/episode/);
                            if (dataParts.length > 1) {
                                href = BASE + "/download" + linkParts[1] + dataParts[1];
                            }
                        }
                    }
                    if (href) {
                        try {
                            const linkHtml = await fetch(href).then(r => r.text());
                            const linkDoc = new DOMParser().parseFromString(linkHtml, "text/html");
                            const btn = linkDoc.querySelector("div.btn-loader > a");
                            const videoUrl = btn?.getAttribute("href");
                            if (videoUrl) {
                                streams.push(new StreamResult({
                                    url: videoUrl, quality, headers: { Referer: BASE }
                                }));
                            }
                        } catch (e) {}
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
