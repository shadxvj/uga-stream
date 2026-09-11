const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const http = require('http');       
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Dynamic application link from Render environment variables
const LIVE_APP_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Automatically switch routing bases depending on your Render keys
const PESAPAL_BASE_URL = (process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_KEY.includes('qk8/'))
    ? 'https://pesapal.com'
    : 'https://pesapal.com';

console.log(`ℹ️ [PESAPAL MODE DETECTED]: Using base endpoint: ${PESAPAL_BASE_URL}`);

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "alive" });
});

let moviesDatabase = [];
let usersDatabase = [
    { id: 1, username: "Ivan_K", phone: "0772123456", plan: "MONTHLY", password: "Password123" },
    { id: 2, username: "Mary_Namubiru", phone: "0701987654", plan: "WEEKLY", password: "LugandaFan99" },
    { id: 3, username: "VJ_Meddy_Fan", phone: "0750434712", plan: "DAILY", password: "UgaStreamPass" }
];

// API Endpoint to authenticate existing subscribers
app.post('/api/login-user', (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) {
            return res.status(400).json({ success: false, message: "Missing phone or password." });
        }
        const user = usersDatabase.find(u => u.phone === phone.trim() && u.password === password);
        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }
        return res.status(200).json({ 
            success: true, 
            user: { username: user.username, phone: user.phone, plan: user.plan } 
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server login error." });
    }
});

// API Endpoint to process and save new user registrations
app.post('/api/register-user', (req, res) => {
    try {
        const { username, phone, plan, password } = req.body;
        
                // Safe database fallback engines to prevent empty string rejections
        const finalUsername = (username || "Viewer").trim();
        const finalPhone = (phone || "").trim();
        const finalPassword = password || "123456";

        if (!finalPhone) {
            return res.status(400).json({ success: false, message: "A valid mobile money phone number is strictly required." });
        }


        const userExists = usersDatabase.some(u => u.username.toLowerCase() === username.toLowerCase());
        if (userExists) {
            return res.status(400).json({ success: false, message: "Username is already taken." });
        }

        const phoneExists = usersDatabase.some(u => u.phone === phone.trim());
        if (phoneExists) {
            return res.status(400).json({ success: false, message: "This phone number is already registered!" });
        }

        const newUser = {
            id: usersDatabase.length + 1,
            username: username,
            phone: phone.trim(),
            plan: plan || "DAILY", 
            password: password
        };

        usersDatabase.push(newUser);
        return res.status(200).json({ success: true, user: newUser });
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

cron.schedule('*/10 * * * *', () => {
    console.log('Sending keep-alive ping to Render server...');
    http.get(LIVE_APP_URL, (res) => {
        console.log(`Keep-alive successful. Status Code: ${res.statusCode}`);
    }).on('error', (err) => {
        console.error('Keep-alive ping failed:', err.message);
    });
});

app.get('/uga-admin-portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.html')); 
});

app.post('/api/admin/auth', (req, res) => {
    const { secretKey } = req.body;
    if (secretKey === "UgaStream2026") {
        return res.json({ approved: true, token: "SECURE_UGA_VJS_ACCESS_2026" });
    }
    return res.status(403).json({ approved: false, message: "Access Denied." });
});

// =========================================================================
// AUTOMATIC PESAPAL IPN REGISTRATION HELPER
// =========================================================================
let cachedIpnId = null; 

async function registerPesapalIPN() {
    try {
        console.log("⏳ [PESAPAL SETUP]: Authenticating to register IPN...");
        
        const authResponse = await axios.post(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
            consumer_key: process.env.PESAPAL_CONSUMER_KEY || "qk8/C/87b+uaKL3/TSd25/nbnMeVvVvG",
            consumer_secret: process.env.PESAPAL_CONSUMER_SECRET || "YOUR_ACTUAL_SECRET_HERE"
        }, {
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });

        const accessToken = authResponse.data.token;
        console.log("⏳ [PESAPAL SETUP]: Registering Webhook Route URL...");

        const ipnPayload = {
            url: `${LIVE_APP_URL}/api/pesapal-ipn`,
            ipn_notification_type: "GET"
        };

        const ipnResponse = await axios.post(`${PESAPAL_BASE_URL}/api/URLSetup/RegisterURL`, ipnPayload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (ipnResponse.data && ipnResponse.data.ipn_id) {
            cachedIpnId = ipnResponse.data.ipn_id;
            console.log("=========================================================================");
            console.log("🎉 [SUCCESS] PESAPAL IPN REGISTERED SUCCESSFULLY!");
            console.log(`📌 YOUR LIVE IPN ID IS: ${cachedIpnId}`);
            console.log("=========================================================================");
        } else {
            console.log("❌ [PESAPAL AUTO-SETUP]: Unexpected response format:", ipnResponse.data);
        }

    } catch (error) {
        console.error("❌ [IPN REGISTRATION ERROR]:", error.response ? error.response.data : error.message);
    }
}

setTimeout(registerPesapalIPN, 5000);

// =========================================================================
// PESAPAL PAYMENTS ENDPOINTS
// =========================================================================

app.post('/api/process-momo', async (req, res) => {
    try {
        const { phone, amount, plan, username } = req.body;

        if (!phone || !amount || !username) {
            return res.status(400).json({ success: false, message: "Missing required checkout parameters." });
        }

        const authResponse = await axios.post(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
            consumer_key: process.env.PESAPAL_CONSUMER_KEY || "qk8/C/87b+uaKL3/TSd25/nbnMeVvVvG",
            consumer_secret: process.env.PESAPAL_CONSUMER_SECRET || "YOUR_ACTUAL_SECRET_HERE"
        }, {
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });

        const accessToken = authResponse.data.token;
        const merchantReference = `ugastream-${Date.now()}`;

        const orderPayload = {
            id: merchantReference,
            amount: parseFloat(amount),
            currency: "UGX",
            description: `Payment for UgaStream ${plan} Plan`,
            callback_url: `${LIVE_APP_URL}/index.html?payment=complete`,
            notification_id: cachedIpnId,
            billing_address: {
                email_address: "payment@ugastream.com",
                phone_number: phone.trim(),
                first_name: username,
                last_name: "Subscriber",
                country_code: "UG"
            }
        };

        const orderResponse = await axios.post(`${PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`, orderPayload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        return res.status(200).json({
            success: true,
            redirect_url: orderResponse.data.redirect_url,
            order_tracking_id: orderResponse.data.order_tracking_id
        });

    } catch (error) {
        console.error("❌ [CHECKOUT ERROR]:", error.response ? error.response.data : error.message);
        return res.status(500).json({ success: false, message: "Pesapal payment setup failed." });
    }
});

app.get('/api/pesapal-ipn', async (req, res) => {
    const { OrderTrackingId, OrderMerchantReference } = req.query;
    console.log(`✉️ Received Pesapal IPN: ${OrderTrackingId} | Ref: ${OrderMerchantReference}`);

    try {
        const authResponse = await axios.post(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
            consumer_key: process.env.PESAPAL_CONSUMER_KEY || "qk8/C/87b+uaKL3/TSd25/nbnMeVvVvG",
            consumer_secret: process.env.PESAPAL_CONSUMER_SECRET || "YOUR_ACTUAL_SECRET_HERE"
        }, {
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });

        const accessToken = authResponse.data.token;

        const statusResponse = await axios.get(`${PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${OrderTrackingId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        if (statusResponse.data && statusResponse.data.status_code === 1) {
            console.log(`✅ Payment successful for Reference: ${OrderMerchantReference}!`);
        }

        return res.status(200).json({
            OrderTrackingId: OrderTrackingId,
            OrderMerchantReference: OrderMerchantReference,
            Status: "Success"
        });

       } catch (error) {
        console.error("❌ [IPN STATUS ERROR]:", error.message);
        return res.status(500).send("IPN Process Failed");
    }
});

app.listen(PORT, () => {
    console.log(`🚀 UgaStream backend live on port ${PORT}`);
});
