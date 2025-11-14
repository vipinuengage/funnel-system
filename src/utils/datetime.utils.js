function getISTDayRange(dateStr) {
    // dateStr = "2025-01-20"
    const IST_OFFSET = 5.5 * 60; // in minutes

    // Parse IST midnight into a date object as if in UTC
    const d = new Date(`${dateStr}T00:00:00.000Z`);

    // Convert IST midnight → UTC (subtract 5:30)
    const startUTC = new Date(d.getTime() - IST_OFFSET * 60 * 1000);

    // End of day IST → +24h - 1 sec
    const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

    return { startUTC, endUTC };
}

// Get IST date string YYYY-MM-DD for N days ago
function getISTDateStr(daysAgo = 0) {
    const now = new Date();

    // Shift to IST (UTC + 5:30)
    const istMillis = now.getTime() + (5.5 * 60 * 60 * 1000);
    const istDate = new Date(istMillis);

    // Move back by daysAgo in IST context
    istDate.setUTCDate(istDate.getUTCDate() - daysAgo);

    const y = istDate.getUTCFullYear();
    const m = String(istDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(istDate.getUTCDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
}


export { getISTDayRange, getISTDateStr }