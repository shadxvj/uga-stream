const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// 1. Configure Cloudinary using your Render Environment Variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Configure Multer to ONLY handle the image poster upload stream securely
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isVideo = file.fieldname === 'video';
    if (isVideo) {
      return {
        folder: 'uga-stream-videos',
        resource_type: 'video',
        chunk_size: 6000000,
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
const PORT = process.env.PORT || 5000; // Dynamic port tracking for Render configurations

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Local temporary database arrays to preserve system state metrics
let moviesDatabase = [];
let usersDatabase = [
    { id: 1, username: "Ivan_K", phone: "0772123456", plan: "monthly", password: "Password123", registeredAt: new Date() },
    { id: 2, username: "Mary_Namubiru", phone: "0701987654", plan: "weekly", password: "LugandaFan99", registeredAt: new Date() },
    { id: 3, username: "VJ_Meddy_Fan", phone: "0750434712", plan: "daily", password: "UgaStreamPass", registeredAt: new Date() }
];

/* ==========================================================================
   API ENDPOINTS
   ========================================================================== */

// API Endpoint to process the upload form from Admin Panel
app.post('/api/upload-movie', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]), (req, res) => {
    try {
        const { title, category, vj } = req.body;

        if (!req.files || !req.files['video'] || !req.files['poster']) {
            return res.status(400).send('<h1>Upload Failed!</h1><p>Please select both a video file and a poster image from your device.</p><a href="/admin.html">Go Back</a>');
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
        console.log("⚡ New Device Movie Added Successfully:", newMovie);
        
        res.send('<h1>Upload Successful!</h1><p>Your media has been uploaded directly from your device.</p><a href="/admin.html">Go Back to Admin Panel</a>');
    } catch (error) {
        console.error("Upload process crashed:", error);
        res.status(500).send('<h1>Upload Failed!</h1><p>Error Details: ' + error.message + '</p><a href="/admin.html">Go Back</a>');
    }
});


        moviesDatabase.push(newMovie);
        console.log("⚡ New Movie Published Successfully:", newMovie);
        
        // Redirect back to admin panel after success
        res.send('<h1>Upload Successful!</h1><p>Your movie was published to the platform catalog.</p><a href="/admin.html">Go Back to Admin Panel</a>');
    } catch (error) {
        console.error("Management console upload error:", error);
        res.status(500).send('<h1>Internal Server Error!</h1><p>Details: ' + error.message + '</p><a href="/admin.html">Go Back</a>');
    }
});

// API Endpoint to process User Registration
app.post('/api/signup', (req, res) => {
    try {
        const { username, phone, plan, password } = req.body;

        if (!username || !phone || !plan || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        const userExists = usersDatabase.find(user => user.phone === phone);
        if (userExists) {
            return res.status(400).json({ success: false, message: 'This phone number is already registered.' });
        }

        const newUser = {
            id: usersDatabase.length + 1,
            username,
            phone,
            plan,
            password,
            registeredAt: new Date()
        };

        usersDatabase.push(newUser);
        return res.status(201).json({ success: true, message: `Welcome ${username}! Account created.` });
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ success: false, message: 'Server error processing registration.' });
    }
});

// API Endpoint to process User Login verification
app.post('/api/login', (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ success: false, message: 'Phone number and password are required.' });
        }

        const matchedUser = usersDatabase.find(user => user.phone === phone);

        if (!matchedUser || matchedUser.password !== password) {
            return res.status(401).json({ success: false, message: 'Incorrect credentials or account not found.' });
        }

        return res.json({
            success: true,
            message: 'Authentication successful.',
            user: { username: matchedUser.username, phone: matchedUser.phone, plan: matchedUser.plan }
        });
    } catch (error) {
        console.error("Login verification endpoint error:", error);
        res.status(500).json({ success: false, message: 'Server auth process failure.' });
    }
});

// API endpoint for your user dashboard to request all current movies
app.get('/api/movies', (req, res) => {
    res.json(moviesDatabase);
});

// API Endpoint to fetch all registered users for the admin panel directory
app.get('/api/users', (req, res) => {
    try {
        const safeUserData = usersDatabase.map(user => ({
            username: user.username,
            phone: user.phone,
            plan: user.plan,
            password: user.password
        }));
        res.json(safeUserData);
    } catch (error) {
        console.error("Error reading users list:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// Film Entry Removal Pipeline Route
app.delete('/api/movies/:id', (req, res) => {
    try {
        const movieId = parseInt(req.params.id, 10);
        const movieIndex = moviesDatabase.findIndex(movie => movie.id === movieId);
        
        if (movieIndex === -1) {
            return res.status(404).json({ success: false, message: 'Movie item not found in server cache.' });
        }
        
        const [deletedMovie] = moviesDatabase.splice(movieIndex, 1);
        console.log(`🗑️ Movie Erased: ${deletedMovie.title}`);
        
        return res.json({ success: true, message: 'Movie deleted successfully.' });
    } catch (error) {
        console.error("Error processing item removal endpoint:", error);
        return res.status(500).json({ success: false, message: 'Server failed to remove object asset entries.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 UGA STREAM Engine running online at port ${PORT}`);
});
