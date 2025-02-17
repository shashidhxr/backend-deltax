import express from "express";
import userRouter from "./routes/user";
import apiRouter from "./routes/api";

const app = express()

app.route("/api/in/user", userRouter)
app.router("/api/in/api", apiRouter)

app.listen("9000", () => {
    console.log("deltax app is running at 9000");
})