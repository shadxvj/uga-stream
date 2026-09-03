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
// =========================================================================
// PASTE THE PROTECTED ROUTE CODE RIGHT HERE (ABOVE APP.LISTEN)
// =========================================================================

// 1. Secret Endpoint to handle admin validation token handshakes
app.post('/api/admin/auth', (req, res) => {
    const { secretKey } = req.body;
    if (secretKey === "UgaStream2026") {
        return res.json({ approved: true, token: "SECURE_UGA_VJS_ACCESS_2026" });
    }
    return res.status(403).json({ approved: false, message: "Access Denied." });
});



// =========================================================================
// PASTE THE FLUTTERWAVE CODE RIGHT HERE (BELOW ADMIN PORTAL, ABOVE LISTEN)
// =========================================================================
const axios = require('axios');

// API Endpoint to initiate Pesapal V3 Mobile Money Checkout session
app.post('/api/process-momo', async (req, res) => {
    try {
        const { phone, amount, plan } = req.body;

        if (!phone || !amount) {
            return res.status(400).json({ success: false, message: "Missing required checkout parameters." });
        }

        // 1. Authenticate with Pesapal to obtain an Access Token
        const authResponse = await axios.post('https://pay.pesapal.com/v3/api/Auth/RequestToken', {
            consumer_key: process.env.PESAPAL_CONSUMER_KEY,
            consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
        }, {
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });

        const accessToken = authResponse.data.token;

        // 2. Format variables and configure payload
        const cleanedPhone = phone.trim();
        const orderPayload = {
            id: `ugastream-${Date.now()}`,
            amount: parseFloat(amount),
            currency: "UGX",
            description: `Uga Stream ${plan} Subscription`,
            callback_url: "https://onrender.com",
            notification_id: "00000000-0000-0000-0000-000000000000", // Default operational tracking format
            billing_address: {
                email_address: "payments@ugastream.com",
                phone_number: cleanedPhone,
                country_code: "UG",
                first_name: "UgaStream",
                last_name: "Subscriber"
            }
        };

        // 3. Request a payment redirect URL from Pesapal SubmitOrderRequest API
        const orderResponse = await axios.post('https://pay.pesapal.com/v3/api/Transactions/SubmitOrderRequest', orderPayload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (orderResponse.data && orderResponse.data.redirect_url) {
            return res.status(200).json({ 
                success: true, 
                redirectUrl: orderResponse.data.redirect_url 
            });
        } else {
            return res.status(400).json({ success: false, message: "Failed to initialize Pesapal gateway session." });
        }

    } catch (error) {
        console.error("[PESAPAL ERROR]:", error.response ? error.response.data : error.message);
        return res.status(500).json({ success: false, message: "Payment gateway connection timeout." });
    }
});
// THIS MUST BE AT THE VERY BOTTOM OF YOUR SERVER.JS FILE
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server fully active and listening on port ${PORT}`);
});

