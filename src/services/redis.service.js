import redis from "redis";
import config from "../configs/index.js";

// Redis connection
const redisUrl = `redis://${config.redis.redisHost}:${config.redis.redisPort}`;

const redisClient = redis.createClient({
    url: redisUrl,
    family: 4, // Force IPv4
});

async function connectRedis() {
    await redisClient.connect();
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
