import express from "express";
import userRouter from "./routes/user.js";
import apiRouter from "./routes/api.js";
import configRouter from "./routes/config.js";
import cors from "cors"
import cookieParser from "cookie-parser";
import http from 'http'
import { initWS } from '../config/ws.js'

const app = express()

app.use(
    cors({
        origin: `${process.env.FRONTEND_URL}`,
        credentials: true,
    })
);

app.use(cookieParser())
app.use(express.json())

app.use("/api/in/user", userRouter)
app.use("/api/in/api", apiRouter)
app.use("/api/gateway/config", configRouter)

const server = http.createServer(app)
const wss = initWS(server)

server.listen("5000", () => {
    console.log("deltax app is running at 5000");
})

export default wss