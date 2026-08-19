const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 5000;

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Local database array to hold uploaded movie objects
let moviesDatabase = [];
// Local database array to hold registered users
let usersDatabase = [
    { id: 1, username: "Ivan_K", phone: "0772123456", plan: "monthly", password: "Password123", registeredAt: new Date() },
    { id: 2, username: "Mary_Namubiru", phone: "0701987654", plan: "weekly", password: "LugandaFan99", registeredAt: new Date() },
    { id: 3, username: "VJ_Meddy_Fan", phone: "0750434712", plan: "daily", password: "UgaStreamPass", registeredAt: new Date() }
];

// API Endpoint to process User Registration
app.post('/api/signup', (req, res) => {
    try {
        const { username, phone, plan, password } = req.body;

        // Basic validation
        if (!username || !phone || !plan || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        // Check if the phone number is already registered
        const userExists = usersDatabase.find(user => user.phone === phone);
        if (userExists) {
            return res.status(400).json({ success: false, message: 'This phone number is already registered.' });
        }

        // Save new user object to our local array
        const newUser = {
            id: usersDatabase.length + 1,
            username,
            phone,
            plan,
            password, // In a real production app, hash this password using bcrypt!
            registeredAt: new Date()
        };

        usersDatabase.push(newUser);
        console.log("👤 New user registered successfully:", { id: newUser.id, username: newUser.username, plan: newUser.plan });

        return res.status(201).json({ success: true, message: `Welcome ${username}! Account created.` });

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ success: false, message: 'Server error processing registration.' });
    }
});

// Configure Multer Storage for both Videos and Images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === "video") {
            cb(null, path.join(__dirname, 'videos')); // Saves movies here
        } else if (file.fieldname === "poster") {
            cb(null, path.join(__dirname, 'images')); // Saves posters here
        }
    },
    filename: function (req, file, cb) {
        // Keeps the original extension but adds a timestamp to avoid duplicates
        const uniqueSuffix = Date.now() + path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix);
    }
});

const upload = multer({ storage: storage });

// API Endpoint to process the upload form from Admin Panel
app.post('/api/upload-movie', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]), (req, res) => {
    try {
        const { title, category, vj } = req.body;
        
        // Ensure both files were sent
        if (!req.files['video'] || !req.files['poster']) {
            return res.status(400).send('Please upload both a video file and a poster image.');
        }

        const videoFile = req.files['video'][0].filename;
        const posterFile = req.files['poster'][0].filename;

        // Create a new movie entry
        const newMovie = {
            id: moviesDatabase.length + 1,
            title: title,
            category: category,
            vj: vj,
            image: `images/${posterFile}`, // Web-accessible path to image
            videoFile: videoFile
        };

        moviesDatabase.push(newMovie);
        console.log("⚡ New Movie Added Successfully:", newMovie);
        
        // Redirect back to admin panel after success
        res.send('<h1>Upload Successful!</h1><a href="/admin.html">Go Back to Admin Panel</a>');
    } catch (error) {
        res.status(500).send('Server Error during upload.');
    }
});
// API Endpoint to process User Login verification
app.post('/api/login', (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ success: false, message: 'Phone number and password are required.' });
        }

        // Search local memory database for matching credentials
        const matchedUser = usersDatabase.find(user => user.phone === phone);

        if (!matchedUser) {
            return res.status(401).json({ success: false, message: 'Account not found with this phone number.' });
        }

        // Validate password string matches directly
        if (matchedUser.password !== password) {
            return res.status(401).json({ success: false, message: 'Incorrect password details.' });
        }

        console.log(`🔑 User authenticated successfully: ${matchedUser.username}`);

        // Return user data back to client window safely
        return res.json({
            success: true,
            message: 'Authentication successful.',
            user: {
                username: matchedUser.username,
                phone: matchedUser.phone,
                plan: matchedUser.plan
            }
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

app.delete('/api/movies/:id', (req, res) => {

    try {
        const movieId = parseInt(req.params.id, 10);
        const movieIndex = moviesDatabase.findIndex(movie => movie.id === movieId);
        
        if (movieIndex === -1) {
            return res.status(404).json({ success: false, message: 'Movie item not found in server cache.' });
        }
        
        // FIX: Extract the first object element out of the spliced array array structure
        const [deletedMovie] = moviesDatabase.splice(movieIndex, 1);
        console.log(`🗑️ Movie removed from catalog storage registry: ${deletedMovie.title}`);
        
        return res.json({ success: true, message: `Successfully deleted "${deletedMovie.title}"` });
    } catch (error) {
        console.error("Movie deletion endpoint execution error:", error);
        res.status(500).json({ success: false, message: 'Server database failure.' });
    }
});


// API Endpoint to force direct attachment file downloads to the device hard drive
app.get('/download/:videoName', (req, res) => {
    try {
        const videoPath = path.join(__dirname, 'videos', req.params.videoName);
        
        // Safety check if the requested file exists
        if (!fs.existsSync(videoPath)) {
            return res.status(404).send('Requested movie file is missing from our server storage.');
        }

        // Force browser to download the file instead of playing it inside a tab
        res.download(videoPath, req.params.videoName, (err) => {
            if (err) {
                console.error("Error transmission during binary stream download:", err);
            }
        });
    } catch (error) {
        console.error("Download route execution crash:", error);
        res.status(500).send('Server Error processing your download file request.');
    }
});

// Streaming Engine Endpoint
app.get('/stream/:videoName', (req, res) => {
    const videoPath = path.join(__dirname, 'videos', req.params.videoName);
    if (!fs.existsSync(videoPath)) return res.status(404).send('Movie file missing');

    const stat = fs.statSync(videoPath);
    const range = req.headers.range;
    const fileSize = stat.size;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts, 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunk = fs.createReadStream(videoPath, { start, end });
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': (end - start) + 1,
            'Content-Type': 'video/mp4'
        });
        chunk.pipe(res);
    } else {
        res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
        fs.createReadStream(videoPath).pipe(res);
    }
});


app.listen(PORT, () => console.log(`Uga Stream running live on port ${PORT}`));
