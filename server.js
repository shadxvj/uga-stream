const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const http = require('http');       
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Lightweight health route for the self-pinger to hit
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "alive" });
});

let moviesDatabase = [];
let usersDatabase = [
    { id: 1, username: "Ivan_K", phone: "0772123456", plan: "MONTHLY", password: "Password123" },
    { id: 2, username: "Mary_Namubiru", phone: "0701987654", plan: "WEEKLY", password: "LugandaFan99" },
    { id: 3, username: "VJ_Meddy_Fan", phone: "0750434712", plan: "DAILY", password: "UgaStreamPass" }
];

// NEW ADDITION: Live Dynamic API endpoint to process incoming new registrations
// API Endpoint to process and save new user registrations (With unique phone checks)
app.post('/api/register-user', (req, res) => {
    try {
        const { username, phone, plan, password } = req.body;
        
        if (!username || !phone || !password) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // 1. Check if Username already exists
        const userExists = usersDatabase.some(u => u.username.toLowerCase() === username.toLowerCase());
        if (userExists) {
            return res.status(400).json({ success: false, message: "Username is already taken." });
        }

        // 2. FIXED: Check if Phone Number already exists in the database metrics
        const phoneExists = usersDatabase.some(u => u.phone === phone.trim());
        if (phoneExists) {
            return res.status(400).json({ success: false, message: "This phone number is already registered!" });
        }

        // Structure the verified new subscriber object record
        const newUser = {
            id: usersDatabase.length + 1,
            username: username,
            phone: phone.trim(),
            plan: plan || "DAILY", 
            password: password
        };

        usersDatabase.push(newUser);
        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
});


app.post('/api/upload-movie', (req, res) => {
    try {
        const { title, category, vj, posterUrl, videoUrl } = req.body;
        if (!posterUrl || !videoUrl) {
            return res.status(400).json({ success: false });
        }
        const newMovie = {
            id: moviesDatabase.length + 1,
            title: title || "Untitled Movie",
            category: category || "trending",
            vj: vj || "Unknown VJ",
            image: posterUrl,
            source: videoUrl
        };
        moviesDatabase.push(newMovie);
        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).send('Server Error');
    }
});

app.get('/api/movies', (req, res) => { res.json(moviesDatabase); });
app.get('/api/users', (req, res) => { res.json(usersDatabase); });

app.delete('/api/movies/:id', (req, res) => {
    try {
        const movieId = parseInt(req.params.id, 10);
        moviesDatabase = moviesDatabase.filter(movie => movie.id !== movieId);
        return res.json({ success: true });
    } catch (error) { return res.status(500).json({ success: false }); }
});

// Automatically pings your live app every 10 minutes to prevent Render from sleeping
cron.schedule('*/10 * * * *', () => {
    const liveAppUrl = 'https://onrender.com'; 
    
    console.log('Sending keep-alive ping to Render server...');
    http.get(liveAppUrl, (res) => {
        console.log(`Keep-alive successful. Status Code: ${res.statusCode}`);
    }).on('error', (err) => {
        console.error('Keep-alive ping failed:', err.message);
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server active on port ${PORT}`);
});
