const express = require("express");
const crypto = require("crypto");
const { exec } = require("child_process");
const rateLimit = require("express-rate-limit");
const cors = require("cors");

const app = express();
const port = 5000;
const secret = process.env.WEBHOOK_SECRET;

app.set("trust proxy", "loopback");
app.use(
  rateLimit({
    windowMs: 5 * 60 * 1000, // 10-minute window
    max: 200, // Limit each IP to 200 requests per window
    message: "Too many requests from this IP, please try again later.",
  })
);

// Enable CORS for all owned routes
app.use(
  cors({
    origin: [
      "https://jrsupply.us.com",
      "https://missioncritical.us.com",
      "https://crackin.com",
      "https://my.rentalguru.com",
      "https://rentalguru.com",
    ],
    methods: ["POST"], // Allowed methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
  })
);
app.options("*", cors(corsOptions));

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; // Store raw body for signature verification
    },
  })
);

app.post("/:target", (req, res) => {
  const signature = req.headers["x-hub-signature-256"];
  const event = req.headers["x-github-event"];
  const target = req.params.target;
  const rawBody = req.rawBody;

  if (!signature) {
    console.error("No signature provided");
    return res.status(401).send("No signature provided");
  }

  // Compute HMAC using SHA-256
  const hmac = crypto.createHmac("sha256", secret);
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

  const payload = req.body;

  // Validate target
  const validTargets = ["crackin", "rentalguru", "missioncrit"];
  if (!validTargets.includes(target)) {
    console.error("Invalid project:", target);
    return res.status(400).json({ message: "Invalid project" });
  }

  if (event === "ping") {
    console.log(`Received ping event for ${target}`);
    return res.status(200).json({ message: "Ping event received" });
  }

  if (event !== "push") {
    console.log(`Received unsupported event type: ${event}`);
    return res.status(200).json({ message: `Event type ${event} not handled` });
  }

  const { ref } = payload;

  if (!ref) {
    console.error("No ref found in payload");
    return res.status(400).json({ message: "No ref found in payload" });
  }

  console.log("Received ref:", ref);
  const branch = ref.split("/").pop();
  console.log("Extracted branch:", branch);

  // Execute corresponding command
  exec(
    `/home/relic/web/webhooks/commands.sh ${target} ${branch}`,
    (err, stdout, stderr) => {
      if (err) {
        console.error(`Execution error: ${err}`);
        return res.status(500).json({ message: "Internal server error" });
      }

      if (stdout) console.log(`STDOUT: ${stdout}`);
      if (stderr) console.log(`STDERR: ${stderr}`); // Log stderr as regular output

      res.status(200).json({ message: "Webhook received and processed" });
    }
  );
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
