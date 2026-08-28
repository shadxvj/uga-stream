const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// 1. Configure Cloudinary variables securely
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Configure dynamic device file storage splits for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isVideo = file.fieldname === 'video';
    if (isVideo) {
      return {
        folder: 'uga-stream-videos',
        resource_type: 'video',
        chunk_size: 6000000, // Preprints chunks to bypass timeouts
        allowed_formats: ['mp4', 'mkv', 'avi', 'mov']
      };
    } else {
      return {
        folder: 'uga-stream-posters',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'jfif']
      };
    }
  }
});

const upload = multer({ storage: storage });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Temporary memory runtime containers
let moviesDatabase = [];
let usersDatabase = [
    { id: 1, username: "Ivan_K", phone: "0772123456", plan: "monthly", password: "Password123", registeredAt: new Date() },
    { id: 2, username: "Mary_Namubiru", phone: "0701987654", plan: "weekly", password: "LugandaFan99", registeredAt: new Date() },
    { id: 3, username: "VJ_Meddy_Fan", phone: "0750434712", plan: "daily", password: "UgaStreamPass", registeredAt: new Date() }
];

/* ==========================================================================
   API ENDPOINTS
   ========================================================================== */

// Unified Device upload router endpoint pipeline mapping to form data arrays
app.post('/api/upload-movie', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]), (req, res) => {
    try {
        const { title, category, vj } = req.body;

        if (!req.files || !req.files['video'] || !req.files['poster']) {
            return res.status(400).send('<h1>Upload Failed!</h1><p>Missing files. Ensure both device slots are populated.</p><a href="/admin.html">Go Back</a>');
        }

        const videoUrl = req.files['video'][0].path;
        const posterUrl = req.files['poster'][0].path;

        const newMovie = {
            id: moviesDatabase.length + 1,
            title: title,
            category: category,
            vj: vj,
            image: posterUrl,
            source: videoUrl
        };

        moviesDatabase.push(newMovie);
        console.log("⚡ New Movie Added Successfully:", newMovie);
        
        res.send('<h1>Upload Successful!</h1><a href="/admin.html">Go Back to Admin Panel</a>');
    } catch (error) {
        console.error("Upload process crashed:", error);
        res.status(500).send('<h1>Upload Failed!</h1><p>Error: ' + error.message + '</p><a href="/admin.html">Go Back</a>');
    }
});

app.post('/api/signup', (req, res) => {
    try {
        const { username, phone, plan, password } = req.body;
        if (!username || !phone || !plan || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }
        const userExists = usersDatabase.find(user => user.phone === phone);
        if (userExists) {
            return res.status(400).json({ success: false, message: 'Phone number already registered.' });
        }
        const newUser = { id: usersDatabase.length + 1, username, phone, plan, password, registeredAt: new Date() };
        usersDatabase.push(newUser);
        return res.status(201).json({ success: true, message: `Account created.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Registration server error.' });
    }
});

app.post('/api/login', (req, res) => {
    try {
        const { phone, password } = req.body;
        const matchedUser = usersDatabase.find(user => user.phone === phone);
        if (!matchedUser || matchedUser.password !== password) {
            return res.status(401).json({ success: false, message: 'Incorrect password or phone details.' });
        }
        return res.json({ success: true, user: { username: matchedUser.username, phone: matchedUser.phone, plan: matchedUser.plan } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Auth pipeline error.' });
    }
});

app.get('/api/movies', (req, res) => { res.json(moviesDatabase); });
app.get('/api/users', (req, res) => { res.json(usersDatabase); });

app.delete('/api/movies/:id', (req, res) => {
    try {
        const movieId = parseInt(req.params.id, 10);
        const movieIndex = moviesDatabase.findIndex(movie => movie.id === movieId);
        if (movieIndex === -1) return res.status(404).json({ success: false });
        moviesDatabase.splice(movieIndex, 1);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 UGA STREAM Server active on port ${PORT}`);
});
