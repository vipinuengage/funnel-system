import { app } from "./app.js";
import { connectMongoDB, disconnectMongoDB } from "./services/mongo.service.js";
import { connectRedis, disconnectRedis } from "./services/redis.service.js";

import config from "./configs/index.js"
import { startDailyFunnelAggregator } from "./crons/dailyFunnelAggregate.cron.js";

(async () => {
    const PORT = config.port;
    
    try {
        // Connect to MongoDB
        await connectMongoDB();

        // Connect to Redis
        await connectRedis();

        // Crons
        startDailyFunnelAggregator(); // run daily at 05:00 by default

        // Start server
        app.listen(PORT, () => {
            console.log("v1.0.0");
            console.log(`🚀 Funnel System POC running on port ${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
            console.log(`🏠 Demo: http://localhost:${PORT}/api`);
            console.log(`💊 Health: http://localhost:${PORT}/api/health`);
        });
    } catch (error) {
        console.log("Error starting server: ", error.message);
    }
})();

// Graceful shutdown
process.on("SIGINT", async () => {
    console.log("\nShutting down gracefully...");
    await disconnectRedis();
    await disconnectMongoDB();
    process.exit(0);
});
