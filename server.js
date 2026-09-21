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

const PESAPAL_BASE_URL = process.env.PESAPAL_BASE_URL || 'https://pesapal.com';

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
let usersDatabase = [];

// PASTE THE STORJ CODE DIRECTLY HERE UNDER LINE 31:
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const b2 = new S3Client({
    region: "auto", 
    endpoint: process.env.B2_ENDPOINT_URL, 
    credentials: {
        accessKeyId: process.env.B2_KEY_ID,
        secretAccessKey: process.env.B2_APPLICATION_KEY,
    },
});

app.post('/api/admin/get-b2-upload-link', async (req, res) => {
    try {
        const { filename, filetype, folder } = req.body;
        const targetFolder = folder === 'posters' ? 'posters/' : 'videos/';
        const uniqueFilename = `${targetFolder}${Date.now()}_${filename.replace(/\s+/g, '_')}`;

        const command = new PutObjectCommand({
            Bucket: process.env.B2_BUCKET_NAME,
            Key: uniqueFilename,
            ContentType: filetype,
        });

        const presignedUrl = await getSignedUrl(b2, command, { expiresIn: 3600 });
        // REPLACE YOUR CURRENT LINE 60 WITH THIS SAFE SPECIFIC STREAM PATH:
const permanentPublicUrl = `https://link.storjshare.io/raw/jus3vug6wfrqk7xxi35ujmrcruya/uga-stream-cinema/${uniqueFilename}`;


        return res.json({ success: true, uploadUrl: presignedUrl, publicUrl: permanentPublicUrl });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});


// API Endpoint to authenticate existing subscribers
// =========================================================================
// CROSS-DEVICE MULTI-DEVICE ACCOUNT AUTHENTICATION PORTAL
// =========================================================================
app.post('/api/login-user', (req, res) => {
    try {
        const { username, phone, password } = req.body;

        // Clean and prepare lookup inputs
        const searchInput = String(username || phone || "").trim().toLowerCase();
        const searchPassword = String(password || "").trim();

        if (!searchInput || !searchPassword) {
            return res.status(400).json({ success: false, message: "Missing login parameters." });
        }

        // Search the active server registry array for a match
        const userAccount = usersDatabase.find(user => {
            const dbUsername = String(user.username || "").toLowerCase().trim();
            const dbPhone = String(user.phone || "").trim();
            return (dbUsername === searchInput || dbPhone === searchInput);
        });

        // 2. Validate passcode matching parameters
        if (userAccount.password !== searchPassword) {
            return res.status(401).json({ success: false, message: "Incorrect password pass. Access denied." });
        }
              // 🔒 APPROVAL GATE: Restricts login if user skipped payment
        if (userAccount.isApproved !== true) {
            return res.status(403).json({ 
                success: false, 
                message: "⚠️ Account Pending Verification! Access will activate automatically once your Selar mobile money transfer is approved." 
            });
        }
        // 🚀 SECURITY CHECK: Verify if their subscription plan time has run out
        const userExpired = new Date() > new Date(userAccount.expiresAt);
        if (userExpired) {
            console.log(`⚠️ [ACCESS DENIED]: ${userAccount.username}'s plan has expired.`);
            return res.status(403).json({ 
                success: false, 
                message: "Your subscription plan tier has expired. Please purchase a new checkout plan link to unlock streaming." 
            });
        }

        // 3. Return full user token profile to authorize the requesting device
        console.log(`🔑 [AUTH SUCCESS]: ${userAccount.username} logged in successfully from a new device.`);
        return res.status(200).json({
                      success: true,
            user: {
                id: userAccount.id,
                username: userAccount.username,
                phone: userAccount.phone,
                plan: userAccount.plan || "DAILY"
            }
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: "Internal Authentication Processor Stalled." });
    }
});



// API Endpoint to process and save new user registrations
app.post('/api/register-user', (req, res) => {
    try {
        const { username, phone, plan, password } = req.body;

        // // IRONCLAD PROCESSING ENGINE: Auto-generates fallbacks if fields arrive empty
        const rawUser = String(username || "").trim();
        const rawPhone = String(phone || "").trim();

        const finalUsername = rawUser ? rawUser : "User_" + Math.floor(1000 + Math.random() * 9000);
        const finalPhone = rawPhone ? rawPhone : "07" + Math.floor(10000000 + Math.random() * 90000000);
        const finalPassword = String(password || "123456");

        // Validate duplicates using our clean variables to prevent empty string matches
        const userExists = usersDatabase.some(u => u.username && u.username.toLowerCase() === finalUsername.toLowerCase());
        if (userExists) {
            return res.status(400).json({ success: false, message: "Username is already taken." });
        }

        const phoneExists = usersDatabase.some(u => u.phone && u.phone.trim() === finalPhone);
        if (phoneExists) {
            return res.status(400).json({ success: false, message: "This phone number is already registered!" });
        }

               // 🚀 TIMEOUT CALCULATOR: Forces new users to start locked with zero duration
        const now = new Date();

        const newUser = {
            id: usersDatabase.length + 1,
            username: finalUsername,
            phone: finalPhone,
            plan: String(plan || "DAILY").toUpperCase().trim(), 
            password: finalPassword,
            subscribedAt: now.toISOString(),
            // Set expiresAt to the exact current time so they have 0 seconds left!
            expiresAt: now.toISOString(), 
            isApproved: false // 🔒 Locked until you click activate in your admin panel
        };

        usersDatabase.push(newUser);
        return res.status(200).json({ success: true, user: newUser });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.post('/api/upload-movie', (req, res) => {
    try {
        const { title, category, vj, posterUrl, videoUrl, image, source } = req.body;
        
        const finalPoster = posterUrl || image || "";
        const finalVideo = videoUrl || source || "";

        if (!finalVideo) {
            return res.status(400).json({ success: false, message: "Missing required video stream file link." });
        }

        const newMovie = {
            id: moviesDatabase.length + 1,
            title: title || "Untitled Movie",
            category: String(category || "trending").toLowerCase().trim(),
            vj: vj || "Unknown VJ",
            image: finalPoster || "https://placeholder.com", 
            source: finalVideo    
        };

        moviesDatabase.push(newMovie);
        console.log(`🎬 [STORJ SUCCESS]: Registered ${newMovie.title}`);
        return res.status(200).json({ success: true, movie: newMovie });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Internal Server Error" });
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
            consumer_key: "qk8/C/87b+uaKL3/TSd25/nbnMeVvVvG",
            consumer_secret: "gP96S9qn9A7U97+O4m9cEw=="
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
            console.log(`📌 YOUR SANDBOX IPN ID IS: ${cachedIpnId}`);
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

        // SMART PRICING ENGINE - Maps package names to raw currency numbers dynamically
        let cleanAmount = amount;
        let incomingPlan = String(plan || "").toLowerCase();

        if (!cleanAmount || isNaN(cleanAmount)) {
            if (incomingPlan.includes('week')) {
                cleanAmount = "5000"; // UGX 5,000 / week
            } else if (incomingPlan.includes('month')) {
                cleanAmount = "15000"; // UGX 15,000 / month
            } else {
                cleanAmount = "2000"; // Default: UGX 2,000 / daily
            }
        }

        const finalPhone = (phone || "0741009201").trim();
        const finalUsername = (username || "Subscriber").trim();

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
            amount: parseFloat(cleanamount),
            currency: "UGX",
            description: `Payment for UgaStream ${plan} Plan`,
            callback_url: `${LIVE_APP_URL}/index.html?payment=complete`,
            notification_id: cachedIpnId,
            billing_address: {
                email_address: "payment@ugastream.com",
                phone_number: finalPhone,
                first_name: finalusername,
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

// =========================================================================
// ADMIN MOVIE UPLOAD ROUTE (RESTORED 🎬)
// =========================================================================
app.post('/api/admin/upload', (req, res) => {
    try {
        const { title, category, videoUrl, imageUrl, description } = req.body;
        
        console.log(`🎬 [NEW MOVIE UPLOAD]: Adding ${title} to ${category}`);
        
        // This pushes your newly uploaded video straight into your platform list
        moviesDatabase.push({
            id: moviesDatabase.length + 1,
            title,
            category,
            videoUrl,
            imageUrl,
            description,
            uploadedAt: new Date()
        });

        return res.status(200).json({ success: true, message: "Movie published successfully!" });
    } catch (error) {
        console.error("❌ [UPLOAD ERROR]:", error.message);
        return res.status(500).send("Failed to save movie.");
    }
});

// =========================================================================
// SECURE AUTOMATED SELAR WEBHOOK CONTROLLER (PAYMENT FLOW 💰)
// =========================================================================
app.post('/api/selar-webhook', (req, res) => {
    try {
        const payload = req.body;
        console.log("🔔 [WEBHOOK INCOMING]: Received payment alert from Selar.");

        if (payload && payload.status === "SUCCESS") {
            const customerPhone = String(payload.customer.phone || "").trim();
            const customerName = payload.customer.name || "Premium Viewer";

            if (!customerPhone) {
                return res.status(400).send("Phone data missing in payload.");
            }

            let formattedPhone = customerPhone.replace(/\s+/g, '');
            if (formattedPhone.startsWith("0")) {
                formattedPhone = "256" + formattedPhone.substring(1);
            }

            console.log(`✅ [PAYMENT VERIFIED]: Activating premium access for line: ${formattedPhone}`);

            const userIndex = usersDatabase.findIndex(u => u.phone === formattedPhone);
            
            if (userIndex !== -1) {
                usersDatabase[userIndex].status = "premium";
            } else {
                usersDatabase.push({
                    id: usersDatabase.length + 1,
                    username: customerName,
                    phone: formattedPhone,
                    password: "DefaultPassword123", 
                    status: "premium"
                });
            }
        }
        return res.status(200).send("Webhook handled safely.");
    } catch (error) {
        console.error("❌ [SELAR WEBHOOK PROCESSING ERROR]:", error.message);
        return res.status(500).send("Internal processing drop.");
    }
});

// =========================================================================
// ADMIN LIVE DATABASE ANALYTICS ROUTE
// =========================================================================
app.get('/api/admin/users-metrics', (req, res) => {
    try {
        const now = new Date();
        
        // Map through active records and dynamically compute real-time expiration states
        const processedUsers = usersDatabase.map(user => {
            const expirationTime = new Date(user.expiresAt);
            const isExpired = now > expirationTime;
            
            return {
                username: user.username,
                phone: user.phone,
                plan: user.plan,
                accessKey: user.password,
                status: isExpired ? "EXPIRED" : "ACTIVE",
                timeLeft: isExpired ? "Expired" : Math.round((expirationTime - now) / (1000 * 60 * 60)) + " Hours Left"
            };
        });

        return res.json({ success: true, users: processedUsers });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Metrics Engine Stalled" });
    }
});
// =========================================================================
// ADMIN ACTION: ACTIVATE USER PLAN AFTER VERIFYING SELAR TRANSACTION
// =========================================================================
app.post('/api/admin/approve-user', (req, res) => {
    const { phone } = req.body;
    const user = usersDatabase.find(u => u.phone === String(phone).trim());
    
    if (!user) return res.status(404).json({ success: false, message: "User profile not found." });

    const now = new Date();
    let durationMs = 24 * 60 * 60 * 1000; // Daily default
    if (user.plan === "WEEKLY") durationMs = 7 * 24 * 60 * 60 * 1000;
    if (user.plan === "MONTHLY") durationMs = 30 * 24 * 60 * 60 * 1000;

    user.isApproved = true;
    user.subscribedAt = now.toISOString();
    user.expiresAt = new Date(now.getTime() + durationMs).toISOString();

    console.log(`✅ [ADMIN ACTION]: Activated ${user.username} (${user.plan})`);
    return res.json({ success: true, message: "User plan activated successfully!" });
});

// =========================================================================
// ADMIN ACTION: DELETE USER
// =========================================================================
app.delete('/api/admin/delete-user', (req, res) => {
    const { phone } = req.body;
    const initialLength = usersDatabase.length;
    
    // Filter out the user from the array database
    usersDatabase = usersDatabase.filter(u => u.phone !== String(phone).trim());

    if (usersDatabase.length === initialLength) {
        return res.status(404).json({ success: false, message: "User not found." });
    }
    return res.json({ success: true, message: "User deleted successfully." });
});

// INITIALIZE EXPRESS SERVER ENGINE
app.listen(PORT, () => {
    console.log(`🚀 UgaStream backend live on port ${PORT}`);
});
