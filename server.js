const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Runtime data arrays
let moviesDatabase = [];
let usersDatabase = [
    { id: 1, username: "Ivan_K", phone: "0772123456", plan: "monthly", password: "Password123", registeredAt: new Date() },
    { id: 2, username: "Mary_Namubiru", phone: "0701987654", plan: "weekly", password: "LugandaFan99", registeredAt: new Date() },
    { id: 3, username: "VJ_Meddy_Fan", phone: "0750434712", plan: "daily", password: "UgaStreamPass", registeredAt: new Date() }
];

// 1. Receives clean URL links from frontend without stressing Render's 512MB RAM cap
app.post('/api/upload-movie', (req, res) => {
    try {
        const { title, category, vj, posterUrl, videoUrl } = req.body;

        if (!posterUrl || !videoUrl) {
            return res.status(400).json({ success: false, message: "Missing upload URLs from Cloudinary payload." });
        }

        const newMovie = {
            id: moviesDatabase.length + 1,
            title: title || "Untitled Movie",
            category: category || "trending",
            vj: vj || "Unknown VJ",
            image: posterUrl,
            source: videoUrl // Points directly to watch.html query parameters
        };

        moviesDatabase.push(newMovie);
        console.log("⚡ New Movie Published Successfully:", newMovie);
        
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Database registration error:", error);
        return res.status(500).send('Server Error');
    }
});

app.post('/api/signup', (req, res) => {
    try {
        const { username, phone, plan, password } = req.body;
        if (!username || !phone || !plan || !password) return res.status(400).json({ success: false });
        usersDatabase.push({ id: usersDatabase.length + 1, username, phone, plan, password, registeredAt: new Date() });
        return res.status(201).json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/login', (req, res) => {
    try {
        const { phone, password } = req.body;
        const matchedUser = usersDatabase.find(user => user.phone === phone && user.password === password);
        if (!matchedUser) return res.status(401).json({ success: false });
        return res.json({ success: true, user: matchedUser });
    } catch (error) { res.status(500).json({ success: false }); }
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

app.listen(PORT, () => {
    console.log(`🚀 UGA STREAM Engine running online at port ${PORT}`);
});
