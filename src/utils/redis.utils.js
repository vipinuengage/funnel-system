// utils/redisUtils.js
import { redisClient } from "../services/redis.service.js";

const scanKeysMatching = async (pattern, count = 1000) => {
    let cursor = "0";
    const keys = [];

    do {
        // redisClient.scan returns [nextCursor, keys[]]
        const reply = await redisClient.scan(cursor, {
            MATCH: pattern,
            COUNT: count,
        });
        cursor = reply.cursor;
        keys.push(...reply.keys);
    } while (cursor !== "0");

    return keys;
}

export { scanKeysMatching }