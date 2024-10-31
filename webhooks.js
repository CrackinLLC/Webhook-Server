require("dotenv").config(); // Load environment variables

const express = require("express");
const crypto = require("crypto");
const { exec } = require("child_process");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const axios = require("axios");
const xss = require("xss");

const app = express();
const port = process.env.PORT || 5000;

// Configure CORS
const corsOptions = {
  origin: [
    "https://jrsupply.us.com",
    "https://missioncritical.us.com",
    "https://crackin.com",
    "https://my.rentalguru.ai",
    "https://rentalguru.ai",
  ],
  methods: ["POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Trust proxy settings
app.set("trust proxy", "loopback");

// Rate limiter middleware
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5-minute window
  max: 200, // Limit each IP to 200 requests per window
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// Parse JSON bodies and store raw body for signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; // Store raw body for signature verification
    },
  })
);

// Middleware to verify GitHub signatures
function verifyGitHubSignature(req, res, next) {
  const signature = req.headers["x-hub-signature-256"];
  const event = req.headers["x-github-event"];
  const rawBody = req.rawBody;

  if (!signature) {
    console.error("No signature provided");
    return res.status(401).send("No signature provided");
  }

  // Compute HMAC using SHA-256
  const hmac = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET);
  const digest = "sha256=" + hmac.update(rawBody).digest("hex");

  // Use timingSafeEqual to prevent timing attacks
  const bufferSignature = Buffer.from(signature);
  const bufferDigest = Buffer.from(digest);

  if (
    bufferSignature.length !== bufferDigest.length ||
    !crypto.timingSafeEqual(bufferSignature, bufferDigest)
  ) {
    console.error("Invalid signature");
    return res.status(401).send("Invalid signature");
  }

  req.githubEvent = event;
  next();
}

// Route handler
app.post("/:target/:process?", (req, res) => {
  const target = req.params.target;
  const processType = req.params.process || "rebuild"; // Default to 'rebuild' if not provided

  // Validate target
  const validTargets = ["crackin", "rentalguru", "missioncrit", "webhooks"];
  if (!validTargets.includes(target)) {
    console.error("Invalid target:", target);
    return res.status(400).json({ message: "Invalid target" });
  }

  // Process routing
  switch (processType) {
    case "rebuild":
      handleRebuild(req, res, target);
      break;

    case "slack-msg":
      handleSlackMessage(req, res, target);
      break;

    default:
      console.error("Invalid process:", processType);
      res.status(400).json({ message: "Invalid process" });
      break;
  }
});

function handleRebuild(req, res, target) {
  // Verify GitHub signature
  verifyGitHubSignature(req, res, () => {
    const event = req.githubEvent;
    const payload = req.body;

    if (event === "ping") {
      console.log(`Received ping event for ${target}`);
      return res.status(200).json({ message: "Ping event received" });
    }

    if (event !== "push") {
      console.log(`Received unsupported event type: ${event}`);
      return res
        .status(200)
        .json({ message: `Event type ${event} not handled` });
    }

    const { ref } = payload;

    if (!ref) {
      console.error("No ref found in payload");
      return res.status(400).json({ message: "No ref found in payload" });
    }

    console.log("Received ref:", ref);
    const branch = ref.split("/").pop();
    console.log("Extracted branch:", branch);

    // Only proceed if the branch is supported
    const validBranches = ["main" /*, "staging"*/];
    if (!validBranches.includes(branch)) {
      console.log(`Branch ${branch} is not configured`);
      return res.status(200).json({ message: `Branch ${branch} not deployed` });
    }

    exec(
      `/home/relic/web/webhooks/commands.sh ${target} ${branch}`,
      (err, stdout, stderr) => {
        if (err) {
          console.error(`Execution error: ${err}`);
          return res.status(500).json({ message: "Internal server error" });
        }

        if (stdout) console.log(`STDOUT: ${stdout}`);
        if (stderr) console.log(`STDERR: ${stderr}`);

        res.status(200).json({ message: "Rebuild initiated" });
      }
    );
  });
}

// Handle 'slack-msg' process
function handleSlackMessage(req, res, target) {
  // No signature verification needed
  const { name, email, message } = req.body;

  // Basic validation and sanitization
  if (!name || !email || !message) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const sanitizedData = {
    name: xss(name),
    email: xss(email),
    message: xss(message),
  };

  // Send the message to Slack
  sendToSlack(target, sanitizedData)
    .then(() => {
      res.status(200).json({ message: "Message received" });
    })
    .catch((error) => {
      console.error("Error sending message to Slack:", error);
      res.status(500).json({ message: "Internal server error" });
    });
}

// Function to send message to Slack based on target
function sendToSlack(target, data) {
  // Map targets to Slack URLs
  const slackUrls = {
    missioncrit: process.env.SLACK_ENDPOINT_MISSIONCRIT,
  };

  const slackUrl = slackUrls[target];

  if (!slackUrl) {
    return Promise.reject(
      new Error(`No Slack URL configured for target: ${target}`)
    );
  }

  const slackMessage = {
    text: `*New Contact Form Submission*\n*Origin:* ${target}\n*Name:* ${data.name}\n*Email:* ${data.email}\n*Message:* ${data.message}`,
  };

  return axios.post(slackUrl, slackMessage);
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
