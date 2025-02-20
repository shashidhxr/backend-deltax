import express from "express";
import userRouter from "./routes/user.js";
import apiRouter from "./routes/api.js";
import cors from "cors"

const app = express()
app.use(cors())
app.use(express.json())

app.use("/api/in/user", userRouter)
app.use("/api/in/api", apiRouter)

app.listen("5000", () => {
    console.log("deltax app is running at 5000");
})