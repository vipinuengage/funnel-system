// snippet — updated trackerInit (client)
(function (global) {
    let config = {
        apiUrl: "/api/events",
        batchSize: 10,
        flushInterval: 5000,
        platform: "website",
        tenantToken: null,
    };


    let eventQueue = [];
    let visitorId = null;

    function getVisitorId() {
        if (visitorId) return visitorId;
        visitorId = localStorage.getItem("visitor_id");
        if (!visitorId) {
            visitorId = "v_" + Math.random().toString(36).substring(2) + Date.now();
            localStorage.setItem("visitor_id", visitorId);
        }
        return visitorId;
    }

    function getSystemInfo() {
        const ua = navigator.userAgent;

        let system = "unknown";
        if (/Windows NT/i.test(ua)) system = "windows";
        else if (/Macintosh|Mac OS X/i.test(ua)) system = "macos";
        else if (/iPhone|iPad|iPod/i.test(ua)) system = "ios";
        else if (/Android/i.test(ua)) system = "android";
        else if (/Linux/i.test(ua)) system = "linux";

        return { system };
    }

    function flushEvents() {
        if (!eventQueue.length) return;
        const payload = { tenantToken: config.tenantToken, events: eventQueue };
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });

        if (navigator.sendBeacon) {
            // sendBeacon doesn't allow custom headers -> include apiKey in payload or use cookie.
            navigator.sendBeacon(`https://uengage-funnel-event.uengage.in${config.apiUrl}`, blob);
        } else {
            fetch(`https://uengage-funnel-event.uengage.in${config.apiUrl}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(config.tenantToken ? { "x-tenant-token": config.tenantToken } : {})
                },
                body: JSON.stringify(payload),
            }).catch((err) => console.error("Batch send failed", err));
        }
        eventQueue = [];
    }

    function trackEvent(eventName, opts = {}) {
        const sysInfo = getSystemInfo();
        const event = {
            event: eventName,
            visitor_id: getVisitorId(),
            user_id: opts.user_id || null,
            url: window.location.pathname,
            captured_at: new Date().toLocaleString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata', hour12: false }).replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/, '$3-$2-$1 $4:$5:$6'),
            platform: config.platform,
            system: sysInfo.system,
            metadata: opts.metadata || {}
        };
        eventQueue.push(event);
        if (eventQueue.length >= config.batchSize) flushEvents();
    }

    function startFlushTimer() {
        setInterval(flushEvents, config.flushInterval);
        window.addEventListener("beforeunload", flushEvents);
    }

    function trackerInit(options = {}) {
        config = { ...config, ...options };
        console.log({ config })
        if (!config.tenantToken) console.warn("trackerInit: tenantToken missing");
        startFlushTimer();
        global.trackEvent = trackEvent;
    }

    global.trackerInit = trackerInit;
    global.getVisitorId = getVisitorId;
})(window);
