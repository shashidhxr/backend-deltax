import express from "express"
import { Pool }from "pg"
import bodyParser from "body-parser"
import cors from "cors"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

const userRouter = express.Router()

const pool = new Pool({
    host: "",
    port: "",
    database: "defaultdb",
    user: "avnadmin",
    password: "",
    ssl: {
        rejectUnauthorized: true
    }    
})

userRouter.use(bodyParser.json())
userRouter.use(cors())

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

userRouter.post("/signup", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // Check if user already exists
        const userExists = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );

        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: "User already exists" });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new user
        const result = await pool.query(
            "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
            [email, hashedPassword]
        );

        res.status(201).json({
            message: "User created successfully",
            user: result.rows[0]
        });
    } catch (error) {
        console.error("Error in signup:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Sign In endpoint
userRouter.post("/signin", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // Find user
        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = result.rows[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            message: "Logged in successfully",
            token
        });
    } catch (error) {
        console.error("Error in signin:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default userRouter;