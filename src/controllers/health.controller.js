import moment from "moment";
import mongoose from "mongoose";

import { redisClient } from "../services/redis.service.js";

const healthController = async (req, res) => {
    try {
        const health = {
            status: "healthy",
            mongodb: "disconnected",
            redis: "disconnected",
            timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
        };

        // Check MongoDB connection
        try {
            await mongoose.connection.db.admin().ping();
            health.mongodb = "connected";
        } catch (err) {
            console.error("MongoDB health check failed:", err.message);
            health.mongodb = `error: ${err.message}`;
        }

        // Check Redis connection
        try {
            if (redisClient?.isOpen) {
                await redisClient.ping();
                health.redis = "connected";
            } else {
                health.redis = "disconnected";
            }
        } catch (err) {
            console.error("Redis health check failed:", err.message);
            health.redis = `error: ${err.message}`;
        }

        // Determine overall status
        if (health.mongodb.startsWith("error") || health.redis.startsWith("error")) {
            health.status = "unhealthy";
            res.status(500).json(health);
        } else {
            res.json(health);
        }
    } catch (error) {
        res.status(500).json({
            status: "unhealthy",
            error: "Internal Server Error: " + error.message,
            timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
        });
    }
}

export { healthController }