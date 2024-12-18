const { config } = require("dotenv");
const path = require("path");
const fs = require("fs");

const express = require("express");
const crypto = require("crypto");
const { exec, execFile, spawn } = require("child_process");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const axios = require("axios");
const xss = require("xss");

const app = express();
const port = process.env.PORT;

config({ path: path.join(__dirname, ".env") });

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

app.set("trust proxy", "loopback");

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5-minute window
  max: 200, // Limit each IP to 200 requests per window
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; // Store raw body for signature verification
    },
  })
);

app.post("/:target/:process?", (req, res) => {
  const target = req.params.target;
  const processType = req.params.process || "rebuild";

  console.log("route handler:", { target, processType });

  // Validate target
  const validTargets = ["crackin", "rentalguru", "missioncrit", "webhooks"];
  if (!validTargets.includes(target)) {
    console.error("Invalid target:", target);
    return res.status(400).json({ message: "Invalid target" });
  }

  // Process routing
  switch (processType) {
    case "rebuild":
      handleRebuildRequest(req, res, target);
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

async function handleRebuildRequest(req, res, target) {
  // Verify GitHub signature
  verifyGitHubSignature(req, res, async () => {
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

    // Validate target
    if (
      !["crackin", "rentalguru", "missioncrit", "webhooks"].includes(target)
    ) {
      console.error("Invalid target:", target);
      return res.status(400).json({ message: "Invalid target" });
    }

    // Validate branch
    if (!["main", "staging"].includes(branch)) {
      console.log(`Branch ${branch} is not configured for deployment`);
      return res.status(200).json({ message: `Branch ${branch} not deployed` });
    }

    // Send success back to Gihub and proceed with rest of the deployment
    res.status(200).json({ message: "Deployment started" });
    process.nextTick(() => {
      executeRebuild(target, branch);
    });
  });
}

async function executeRebuild(target, branch) {
  function runCLICommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`Executing command: ${command}`);
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          console.error(`Command failed: ${command}`);
          console.error(`Error: ${error.message}`);
          console.error(`Stderr: ${stderr}`);
          return reject(error);
        }
        console.log(`Command succeeded: ${command}`);
        console.log(`Stdout: ${stdout}`);
        resolve(stdout);
      });
    });
  }

  const BASE_DIR = "/home/relic/web";
  let APP_DIR;
  let PM2_APP_NAME;

  switch (target) {
    case "crackin":
      if (branch === "main") {
        APP_DIR = path.join(BASE_DIR, "crackin.com", "app");
        PM2_APP_NAME = "crackin";
      } else if (branch === "staging") {
        APP_DIR = path.join(BASE_DIR, "crackin-staging", "app");
        PM2_APP_NAME = "crackin-staging";
      } else {
        console.log(`Unsupported branch for crackin: ${branch}`);
        return res
          .status(200)
          .json({ message: `Branch ${branch} not deployed` });
      }
      break;
    case "rentalguru":
      if (branch === "main") {
        APP_DIR = path.join(BASE_DIR, "my.rentalguru.ai", "app");
        PM2_APP_NAME = "rentalguru";
      } else {
        console.log(`Unsupported branch for rentalguru: ${branch}`);
        return res
          .status(200)
          .json({ message: `Branch ${branch} not deployed` });
      }
      break;
    case "webhooks":
      if (branch === "main") {
        APP_DIR = path.join(BASE_DIR, "webhooks");
        PM2_APP_NAME = "webhooks";
      } else {
        console.log(`Unsupported branch for webhooks: ${branch}`);
        return res
          .status(200)
          .json({ message: `Branch ${branch} not deployed` });
      }
      break;
    case "missioncrit":
      APP_DIR = path.join(BASE_DIR, "missioncritical.us.com", "repo");
      PM2_APP_NAME = "missioncrit";
      break;
    default:
      console.error("Invalid target:", target);
      return res.status(400).json({ message: "Invalid target" });
  }

  try {
    // Begin running terminal commands
    const execOptions = { cwd: APP_DIR };

    // Confirm that the application directory exists
    if (!fs.existsSync(APP_DIR)) {
      console.error(`Application directory does not exist: ${APP_DIR}`);
      return res
        .status(500)
        .json({ message: "Application directory not found" });
    }

    // Stop the PM2 process
    if (["crackin", "rentalguru"].includes(PM2_APP_NAME)) {
      await runCLICommand(
        `sudo /home/relic/web/pm2_actions.sh stop ${PM2_APP_NAME}`
      );
    }

    // Ensure we're on the correct branch
    await runCLICommand(`git fetch origin ${branch}`, execOptions);
    await runCLICommand(`git reset --hard origin/${branch}`, execOptions);

    if (PM2_APP_NAME === "missioncrit") {
      const mcSource = path.join(APP_DIR, "missioncritical") + path.sep + ".";
      const jrSource = path.join(APP_DIR, "jrsupply") + path.sep + ".";
      const mcDestination = path.join(APP_DIR, "..", "public_html");
      const jrDestination = path.join(
        APP_DIR,
        "..",
        "..",
        "jrsupply.us.com",
        "public_html"
      );

      await runCLICommand(`rm -rf ${mcDestination}/*`, execOptions);
      await runCLICommand(`cp -R ${mcSource} ${mcDestination}`, execOptions);

      await runCLICommand(`rm -rf ${jrDestination}/*`, execOptions);
      await runCLICommand(`cp -R ${jrSource} ${jrDestination}`, execOptions);
    } else {
      // Remove existing node_modules
      await runCLICommand(`rm -rf node_modules`, execOptions);

      // Install dependencies
      await runCLICommand(`npm install`, execOptions);

      // Build the application
      try {
        await runCLICommand(`npm run build`, execOptions);
      } catch {
        console.log("App does not appear to have a build command.");
      }
    }

    // Start the PM2 process
    if (["crackin", "rentalguru", "webhooks"].includes(PM2_APP_NAME)) {
      await runCLICommand(
        `sudo /home/relic/web/pm2_actions.sh ${
          PM2_APP_NAME === "webhooks" ? "restart" : "start"
        } ${PM2_APP_NAME}`
      );
    }
    console.log("Deployment completed successfully for", target);
  } catch (error) {
    console.error("Deployment failed for", target, ":", error);
  }
}

function handleSlackMessage(req, res, target) {
  const { name, email, message } = req.body;

  // Basic validation
  if (!name || !email || !message) {
    return res.status(400).json({ message: "All fields are required." });
  }

  // Sanitize values
  const sanitizedData = {
    name: xss(name),
    email: xss(email),
    message: xss(message),
  };

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
  const slackUrls = {
    missioncrit: process.env.SLACK_MISSIONCRIT,
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
  const hmac = crypto.createHmac("sha256", process.env.SIGNATURE_SECRET);
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
