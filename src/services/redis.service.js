import redis from "redis";
import config from "../configs/index.js";

// Redis connection
const redisUrl = `redis://${config.redis.redisHost}:${config.redis.redisPort}`;

let redisClient;

async function connectRedis() {
    try {
        redisClient = redis.createClient({
            url: redisUrl,
            family: 4, // Force IPv4
        });
        await redisClient.connect();
    } catch (error) {
        console.log("Error connecting redis:", error.message);
    }
}

async function disconnectRedis() {
    if (redisClient.isOpen) await redisClient.quit();
    console.log("Disconnected Redis");
}

redisClient.on("error", (err) => {
    console.error("Redis Client Error:", err);
});

redisClient.on("connect", () => {
    console.log("Connected to Redis");
});

export { redisClient, connectRedis, disconnectRedis };
