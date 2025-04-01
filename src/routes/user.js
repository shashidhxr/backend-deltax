import express from "express"
import bodyParser from "body-parser"
import cors from "cors"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import pool from "../../config/db.js"

const userRouter = express.Router()

userRouter.use(bodyParser.json())
// userRouter.use(cors())

const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP

            );
        `);
        console.log("Database initialized successfully");
    } catch (error) {
        console.error("Error initializing database:", error);
    }
}

initDb()

userRouter.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT id, email, created_at FROM users");

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No users found" });
        }

        res.status(200).json({
            message: "Users retrieved successfully",
            users: result.rows
        });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

userRouter.post("/signup", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const userExists = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );

        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: "User already exists" });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const result = await pool.query(
            "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
            [email, hashedPassword]
        );

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'secret-key',
            { expiresIn: '24h' }
        );
        
        res.cookie("authToken", token, {
            httpOnly: true, // Prevent client-side JavaScript from accessing the cookie
            secure: process.env.NODE_ENV === "production", // Ensure the cookie is only sent over HTTPS in production
            sameSite: "None",
            // domain: 'deltax0.vercel.app/',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
        });
        
        res.status(201).json({
            message: "User created successfully",
            user: result.rows[0]
        });
    } catch (error) {
        console.error("Error in signup:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

userRouter.post("/signin", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }
        
        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        const user = result.rows[0];
        
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'secret-key',
            { expiresIn: '24h' }
        );
        
        res.cookie("authToken", token, {
            httpOnly: true, // Prevent client-side JavaScript from accessing the cookie
            secure: process.env.NODE_ENV === "production", // Ensure the cookie is only sent over HTTPS in production
            sameSite: "None",
            // domain: 'deltax0.vercel.app',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
        });
        res.json({
            message: "Logged in successfully",
            token
        });
    } catch (error) {
        console.error("Error in signin:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

userRouter.post("/logout", (req, res) => {
    // res.clearCookie("authToken", {
    //     httpOnly: true,
    //     secure: process.env.NODE_ENV === "production",
    //     sameSite: "strict",
    //     path: '/',
    //     expires: 0
    // })
    res.clearCookie("authToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "None",
        // domain: 'deltax0.vercel.app/',
        path: '/'
      });
    // res.cookie("authToken", "", {
    //     httpOnly: true, // Prevent client-side JavaScript from accessing the cookie
    //     secure: process.env.NODE_ENV === "production", // Ensure the cookie is only sent over HTTPS in production
    //     sameSite: "strict", // Prevent CSRF attacks
    //     maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    // });
    res.status(200).json({
        message: "Logged out successfully"
    })
})

userRouter.get("/check-auth", async (req, res) => {
    try {
        // Get the authToken from cookies
        const token = req.cookies.authToken;

        // If no token is found, the user is not authenticated
        if (!token) {
            return res.status(401).json({ isAuthenticated: false, message: "No token provided" });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');

        // Fetch user details from the database
        const userResult = await pool.query(
            "SELECT id, email, created_at FROM users WHERE id = $1",
            [decoded.userId]
        );

        // If user not found, return an error
        if (userResult.rows.length === 0) {
            return res.status(404).json({ isAuthenticated: false, message: "User not found" });
        }

        // Return the authentication state and user details
        res.status(200).json({
            isAuthenticated: true,
            user: userResult.rows[0],
        });
    } catch (error) {
        console.error("Error in check-auth:", error);

        // Handle JWT verification errors (e.g., expired or invalid token)
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return res.status(401).json({ isAuthenticated: false, message: "Invalid or expired token" });
        }

        res.status(500).json({ error: "Internal server error" });
    }
});

export default userRouter;