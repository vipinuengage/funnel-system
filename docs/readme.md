````md
# uEngage Funnel Events

## 🔑 0. Get Tenant Token

Use this API to generate your tenant token:

```bash
curl --location 'https://uengage-funnel-event.uengage.in/api/token' \
--header 'Content-Type: application/json' \
--data '{
    "tenantId": "10",
    "tenantName": "My Business"
}'
````

---

## 📌 1. Add tracker to your website

```html
<script src="./tracker.js"></script> <!-- INJECT SCRIPT -->
<script>
  trackerInit({
    apiUrl: "/api/events",
    batchSize: 10,
    flushInterval: 5000,
    platform: "website",
    tenantToken: "YOUR_TOKEN_HERE",
  });
</script>
```

---

## 📌 2. Track events

Call `trackEvent()` anywhere in frontend:

```js
trackEvent("visit");
trackEvent("menu");
trackEvent("login");
```

Add metadata (optional):

```js
trackEvent("menu_item_click", {
  metadata: { item_id: "55", name: "Burger" }
});
```

---

## 📌 3. Get Visitor ID (optional)

```js
const vid = getVisitorId();
console.log("Visitor ID:", vid);
```

---

## 📌 4. Logged-in user tracking (optional)

```js
window.currentUserId = "user_123"; // set when user logs in
trackEvent("login");               // tracker will auto-attach user_id
```

---

## 📌 5. Dashboard API

Fetch funnel analytics:

```
GET /api/dashboard/:tenant_id
```

Example response:

```json
{
  "date": "2025-11-15",
  "tenant_id": "10",
  "source": "events",
  "funnels": {
    "visit": {
      "count": 6,
      "unique_visitors": 1,
      "hourly": [
        { "hour": 8, "count": 6, "unique_visitors": 1 }
      ],
      "platforms": { "website": { "count": 6, "unique_visitors": 1 } },
      "systems": { "windows": { "count": 6, "unique_visitors": 1 } }
    },
    "menu": {
      "count": 3,
      "unique_visitors": 1,
      "hourly": [
        { "hour": 8, "count": 3, "unique_visitors": 1 }
      ],
      "platforms": { "website": { "count": 3, "unique_visitors": 1 } },
      "systems": { "windows": { "count": 3, "unique_visitors": 1 } }
    },
    "login": {
      "count": 1,
      "unique_visitors": 1,
      "hourly": [
        { "hour": 8, "count": 1, "unique_visitors": 1 }
      ],
      "platforms": { "website": { "count": 1, "unique_visitors": 1 } },
      "systems": { "windows": { "count": 1, "unique_visitors": 1 } }
    }
  }
}
```

---

## 💡 Example minimal usage page

```html
<button onclick="trackEvent('visit')">Track Visit</button>
<button onclick="trackEvent('menu')">Track Menu</button>
```

---

## 🧾 Notes

* Events are sent in batches to reduce network calls.
* Events are flushed automatically before page unload.
* Visitor ID stays consistent using `localStorage`.