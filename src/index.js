import express from "express";
import userRouter from "./routes/user.js";
import apiRouter from "./routes/api.js";
import cors from "cors"
import cookieParser from "cookie-parser";

const app = express()
app.use(
    cors({
        origin: "http://localhost:5173", // Explicitly allow this origin
        credentials: true, // Allow credentials (cookies)
        // "Access-Control-Allow-Origin": "http://localhost:5173",
        // "Access-Control-Allow-Credentials": true
    })
);

app.use(cookieParser())
app.use(express.json())

app.use("/api/in/user", userRouter)
app.use("/api/in/api", apiRouter)

app.listen("5000", () => {
    console.log("deltax app is running at 5000");
})