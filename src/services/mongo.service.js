// db.js
import mongoose from "mongoose";
import config from "../configs/index.js";

let isConnected = false;

async function connectMongoDB() {
    if (isConnected) return mongoose.connection;

    await mongoose.connect(config.mongodbUri);
    isConnected = true;
    console.log("Connected to MongoDB");
    return mongoose.connection;
}

async function disconnectMongoDB() {
    if (!isConnected) return console.log("MongoDB already Disconnected.");

    await mongoose.disconnect();
    isConnected = false;
    console.log("Disconnected MongoDB.")
}

export { connectMongoDB, disconnectMongoDB };
