// src/config/index.js
import dotenv from "dotenv";

dotenv.config();

const config = {
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    corsOptions: { origin: ["https://order.theobroma.in", "http://localhost:3000", "https://templestreet.in"], credentials: true },
    fntSecret: process.env.FNT_SECRET,
    mongodbUri: process.env.MONGODB_URI,
    redis: {
        redisHost: process.env.REDIS_HOST,
        redisPort: process.env.REDIS_PORT
    },
    s3: {
        endpoint: process.env.S3_ENDPOINT,
        bucket: process.env.S3_BUCKET,
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    }
};

export default config;
